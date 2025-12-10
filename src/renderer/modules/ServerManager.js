export class ServerManager {
    constructor(app) {
        this.app = app;
        this.servers = [];
        this.currentServer = null;
        this.currentChannel = null;
        this.channelMembers = {};
        this.unreadCounts = {};
        this.draggedChannel = null;
        this.serverContextTarget = null;
        this.channelContextTarget = null;
        this.bindContextMenuEvents();
        this.bindSidebarButtons();
    }

    bindSidebarButtons() {
        // My Page button
        const btnMyPage = document.getElementById('btn-my-page');
        btnMyPage?.addEventListener('click', () => {
            this.app.uiManager.showModal('member-profile-modal');
            // Load current user data
            if (this.app.auth.currentUser) {
                this.app.updateUserInfo(this.app.auth.currentUser);
            }
        });

        // DM button
        const btnDM = document.getElementById('btn-dm');
        btnDM?.addEventListener('click', () => {
            this.showDMList();
        });

        // Saved Messages button
        const btnSavedMessages = document.getElementById('btn-saved-messages');
        btnSavedMessages?.addEventListener('click', () => {
            this.showSavedMessages();
        });

        // Add Server button
        const btnAddServer = document.getElementById('btn-add-server');
        btnAddServer?.addEventListener('click', () => {
            this.app.uiManager.showModal('create-server-modal');
        });

        // Server creation form
        const createServerForm = document.getElementById('create-server-form');
        createServerForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('server-name-input');
            if (nameInput && nameInput.value.trim()) {
                await this.createServer(nameInput.value.trim());
                this.app.uiManager.hideModal('create-server-modal');
                nameInput.value = '';
            }
        });

        // Category creation button
        const btnNewCategory = document.getElementById('btn-new-category');
        btnNewCategory?.addEventListener('click', () => {
            this.showCreateCategoryDialog();
        });

        // Channel creation button
        const btnNewChannel = document.getElementById('btn-new-channel');
        btnNewChannel?.addEventListener('click', () => {
            this.showCreateChannelDialog();
        });
    }

    async showCreateCategoryDialog() {
        if (!this.currentServer) {
            this.app.uiManager.showToast('서버를 먼저 선택해주세요.', 'warning');
            return;
        }

        const categoryName = await this.app.uiManager.showInputDialog('새 카테고리 이름을 입력하세요:');
        if (!categoryName || !categoryName.trim()) return;

        try {
            const response = await this.app.apiRequest(`/servers/${this.currentServer.id}/categories`, {
                method: 'POST',
                body: JSON.stringify({
                    name: categoryName.trim()
                })
            });

            if (response) {
                // Reload server data
                await this.loadServerData();
                this.app.uiManager.showToast('카테고리가 생성되었습니다.', 'success');
            }
        } catch (error) {
            console.error('카테고리 생성 실패:', error);
            this.app.uiManager.showToast('카테고리 생성에 실패했습니다.', 'error');
        }
    }

    async showCreateChannelDialog() {
        if (!this.currentServer) {
            this.app.uiManager.showToast('서버를 먼저 선택해주세요.', 'warning');
            return;
        }

        // Check if server has at least one category
        if (!this.currentServer.categories || this.currentServer.categories.length === 0) {
            this.app.uiManager.showToast('먼저 카테고리를 생성해주세요.', 'warning');
            return;
        }

        const channelName = await this.app.uiManager.showInputDialog('새 채널 이름을 입력하세요:');
        if (!channelName || !channelName.trim()) return;

        // Use the first category by default (or we could let user select)
        const categoryId = this.currentServer.categories[0].id;

        try {
            const response = await this.app.apiRequest(`/servers/${this.currentServer.id}/categories/${categoryId}/channels`, {
                method: 'POST',
                body: JSON.stringify({
                    name: channelName.trim(),
                    type: 'text'
                })
            });

            if (response) {
                const newChannelId = response.id;
                // Reload server data
                await this.loadServerData();

                // Find and select the newly created channel
                for (const category of this.currentServer.categories || []) {
                    const newChannel = category.channels?.find(ch => ch.id === newChannelId);
                    if (newChannel) {
                        await this.selectChannel(newChannel);
                        break;
                    }
                }

                this.app.uiManager.showToast('채널이 생성되었습니다.', 'success');
            }
        } catch (error) {
            console.error('채널 생성 실패:', error);
            this.app.uiManager.showToast('채널 생성에 실패했습니다.', 'error');
        }
    }

    async showDMList() {
        // Show DM list modal
        console.log('Opening DM list...');
        const modal = document.getElementById('dm-modal');
        if (modal) {
            modal.style.display = 'flex';
            await this.loadDMList();
        }
    }

    async loadDMList() {
        try {
            // TODO: API 엔드포인트가 있으면 실제 DM 목록을 가져옴
            // const response = await this.app.apiRequest('/dms');

            // 임시로 빈 목록 표시
            this.renderDMList([]);
        } catch (error) {
            console.error('DM 목록 로드 오류:', error);
        }
    }

    renderDMList(dms) {
        const list = document.getElementById('dm-list');
        const empty = document.getElementById('dm-empty');

        if (!list) return;

        if (dms.length === 0) {
            if (empty) empty.style.display = 'block';
            const existingDMs = list.querySelectorAll('.dm-item');
            existingDMs.forEach(dm => dm.remove());
            return;
        }

        if (empty) empty.style.display = 'none';

        const existingDMs = list.querySelectorAll('.dm-item');
        existingDMs.forEach(dm => dm.remove());

        dms.forEach(dm => {
            const dmEl = document.createElement('div');
            dmEl.className = 'dm-item';
            dmEl.style.cssText = 'display: flex; align-items: center; padding: 12px; cursor: pointer; border-radius: 6px; margin-bottom: 8px;';
            dmEl.innerHTML = `
                <div class="avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--accent-color); display: flex; align-items: center; justify-content: center; margin-right: 12px; color: white; font-weight: bold;">
                    ${dm.user?.name?.[0] || 'U'}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 500; color: var(--text-primary);">${dm.user?.name || 'Unknown'}</div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${dm.lastMessage || '메시지 없음'}</div>
                </div>
            `;

            dmEl.addEventListener('click', () => {
                // TODO: DM 채널로 전환
                console.log('DM 클릭:', dm.user?.name);
                const dmModal = document.getElementById('dm-modal');
                if (dmModal) dmModal.style.display = 'none';
            });

            list.appendChild(dmEl);
        });
    }

    showSavedMessages() {
        // Show saved messages modal
        const modal = document.getElementById('saved-messages-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.loadSavedMessagesData();
        }
    }

    async loadSavedMessagesData() {
        try {
            const response = await this.app.apiRequest('/bookmarks?limit=50&offset=0');
            if (response && response.bookmarks) {
                this.renderSavedMessages(response.bookmarks);
            }
        } catch (error) {
            console.error('저장한 메시지 로드 오류:', error);
        }
    }

    renderSavedMessages(bookmarks) {
        const list = document.getElementById('saved-messages-list');
        const empty = document.getElementById('saved-messages-empty');

        if (!list) return;

        if (bookmarks.length === 0) {
            if (empty) empty.style.display = 'block';
            const existingMessages = list.querySelectorAll('.saved-message-item');
            existingMessages.forEach(msg => msg.remove());
            return;
        }

        if (empty) empty.style.display = 'none';

        const existingMessages = list.querySelectorAll('.saved-message-item');
        existingMessages.forEach(msg => msg.remove());

        bookmarks.forEach(item => {
            const { bookmark, message } = item;
            const messageEl = document.createElement('div');
            messageEl.className = 'saved-message-item';
            messageEl.innerHTML = `
                <div class="saved-message-header">
                    <div class="saved-message-sender">
                        <div class="avatar">${message.sender?.avatar || 'U'}</div>
                        <span class="sender-name">${message.sender?.name || 'Unknown'}</span>
                        <span class="saved-message-time">${new Date(bookmark.created_at).toLocaleString('ko-KR')}</span>
                    </div>
                    <button class="icon-btn unsave-btn" data-message-id="${message.id}" title="저장 해제">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <div class="saved-message-content">
                    ${message.content || ''}
                </div>
                ${message.attachments && message.attachments.length > 0 ? `
                    <div class="saved-message-attachments">
                        ${message.attachments.map(att => `<span class="attachment-badge">${att.name}</span>`).join('')}
                    </div>
                ` : ''}
            `;

            const unsaveBtn = messageEl.querySelector('.unsave-btn');
            unsaveBtn?.addEventListener('click', async () => {
                await this.app.chatManager.toggleBookmark(message.id);
                await this.loadSavedMessagesData();
            });

            list.appendChild(messageEl);
        });

        // Bind close button
        const closeBtn = document.getElementById('close-saved-messages');
        closeBtn?.addEventListener('click', () => {
            const modal = document.getElementById('saved-messages-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    bindContextMenuEvents() {
        // Hide menus on global click
        document.addEventListener('click', (e) => {
            this.hideContextMenus();
        });

        // Server Menu
        document.getElementById('ctx-server-invite')?.addEventListener('click', () => {
            if (this.serverContextTarget) this.app.uiManager.showToast(`초대하기: ${this.serverContextTarget.name}`, 'info'); // Stub
        });
        document.getElementById('ctx-server-settings')?.addEventListener('click', () => {
            if (this.serverContextTarget) this.app.uiManager.showToast(`서버 설정: ${this.serverContextTarget.name}`, 'info'); // Stub
        });
        document.getElementById('ctx-server-leave')?.addEventListener('click', () => {
            if (this.serverContextTarget) {
                if (confirm(`${this.serverContextTarget.name} 서버를 나가시겠습니까?`)) {
                    // API call to leave
                    console.log('Leaving server', this.serverContextTarget.id);
                }
            }
        });

        // Channel Menu
        document.getElementById('ctx-channel-edit')?.addEventListener('click', () => {
            // Stub
        });
        document.getElementById('ctx-channel-mark-read')?.addEventListener('click', () => {
            if (this.channelContextTarget) {
                this.markChannelAsRead(this.channelContextTarget.id);
            }
        });
        document.getElementById('ctx-channel-delete')?.addEventListener('click', () => {
            if (this.channelContextTarget) {
                if (confirm(`${this.channelContextTarget.name} 채널을 삭제하시겠습니까?`)) {
                    // API call
                }
            }
        });

        // Add Server Button
        document.getElementById('btn-add-server')?.addEventListener('click', async () => {
            const name = await this.app.uiManager.showInputDialog('새 서버 이름 입력:');
            if (name) {
                await this.createServer(name);
            }
        });
    }

    hideContextMenus() {
        const serverMenu = document.getElementById('server-context-menu');
        const channelMenu = document.getElementById('channel-context-menu');
        if (serverMenu) serverMenu.style.display = 'none';
        if (channelMenu) channelMenu.style.display = 'none';
        this.serverContextTarget = null;
        this.channelContextTarget = null;
    }

    async createServer(name) {
        if (!name) return;
        try {
            const server = await this.app.apiRequest('/servers', {
                method: 'POST',
                body: JSON.stringify({ name, avatar: name[0] })
            });
            if (server) {
                this.servers.push({
                    ...server,
                    categories: (server.categories || []).map(cat => ({
                        ...cat,
                        channels: (cat.channels || []).map(ch => ({ ...ch, unread: 0 }))
                    }))
                });
                this.renderServerList();
                this.selectServer(server);
                return server;
            }
        } catch (error) {
            console.error('서버 생성 실패:', error);
            this.app.uiManager.showToast('서버 생성에 실패했습니다.', 'error');
        }
    }

    async loadServerData() {
        if (!this.app.apiBase) return false;

        try {
            const data = await this.app.apiRequest('/state');
            let servers = data?.servers || data || [];

            // 백엔드에 아무 서버도 없을 때 기본 서버/채널 자동 생성
            if (servers.length === 0) {
                try {
                    const defaultName = '워크스페이스';
                    const created = await this.app.apiRequest('/servers', {
                        method: 'POST',
                        body: JSON.stringify({ name: defaultName, avatar: defaultName[0] })
                    });
                    if (created) {
                        servers.push(created);
                    }
                } catch (error) {
                    console.error('기본 서버 자동 생성 실패:', error);
                    return false;
                }
            }

            // Remember current server ID before updating
            const currentServerId = this.currentServer?.id;

            this.servers = servers.map(server => ({
                ...server,
                categories: (server.categories || []).map(cat => ({
                    ...cat,
                    channels: (cat.channels || []).map(ch => ({ ...ch, unread: ch.unread || 0 }))
                }))
            }));

            if (this.servers.length === 0) {
                return false;
            }

            // Try to keep the current server selected, otherwise select first
            if (currentServerId) {
                const foundServer = this.servers.find(s => s.id === currentServerId);
                this.currentServer = foundServer || this.servers[0];
            } else {
                this.currentServer = this.servers[0];
            }

            this.renderServerList();
            this.renderChannelList();

            // Fetch unread counts
            await this.fetchUnreadCounts();

            // Only select first channel if no current channel
            if (!this.currentChannel) {
                const firstChannel = this.currentServer.categories?.[0]?.channels?.[0];
                if (firstChannel) {
                    await this.selectChannel(firstChannel);
                }
            }
            return true;
        } catch (error) {
            console.error('서버 데이터 로드 실패:', error);
            return false;
        }
    }

    async fetchUnreadCounts() {
        try {
            const response = await this.app.apiRequest('/unreads');
            if (response && response.unreads) {
                this.unreadCounts = {};
                response.unreads.forEach(item => {
                    this.unreadCounts[item.channel_id] = {
                        count: item.count,
                        has_mention: item.has_mention
                    };
                });
                this.renderChannelList();
                this.renderServerList();
            }
        } catch (error) {
            console.error('Failed to fetch unread counts:', error);
        }
    }

    renderServerList() {
        const list = document.getElementById('servers-list');
        if (!list) return;

        list.innerHTML = '';

        this.servers.forEach(server => {
            const serverEl = document.createElement('div');
            const hasUnread = this.checkServerUnread(server.id);

            serverEl.className = `server-item${this.currentServer?.id === server.id ? ' active' : ''}${hasUnread ? ' unread' : ''}`;
            serverEl.dataset.serverId = server.id;
            serverEl.title = server.name;
            serverEl.innerHTML = `<span>${server.avatar || server.name[0]}</span>`;

            serverEl.addEventListener('click', () => {
                this.selectServer(server);
            });

            serverEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showServerContextMenu(e, server);
            });

            list.appendChild(serverEl);
        });
    }

    checkServerUnread(serverId) {
        const server = this.servers.find(s => s.id === serverId);
        if (!server) return false;

        // Check all channels in server
        for (const cat of server.categories || []) {
            for (const ch of cat.channels || []) {
                if (this.unreadCounts[ch.id]?.count > 0) return true;
            }
        }
        return false;
    }

    selectServer(server) {
        this.currentServer = server;
        this.currentChannel = null;

        // UI Updates
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.toggle('active', item.dataset.serverId === server.id);
        });

        document.getElementById('server-name').textContent = server.name;
        document.getElementById('btn-new-category').style.display = 'flex';
        document.getElementById('btn-new-channel').style.display = 'flex';

        this.renderChannelList();

        const firstChannel = server.categories?.[0]?.channels?.[0];
        if (firstChannel) {
            this.selectChannel(firstChannel);
        } else {
            this.app.chatManager.clearChatArea();
        }

        this.renderMembers();
    }

    renderChannelList() {
        const container = document.getElementById('channels-container');
        if (!container || !this.currentServer) return;

        container.innerHTML = '';

        (this.currentServer.categories || []).forEach(category => {
            const categoryEl = document.createElement('div');
            categoryEl.className = 'category-item';
            categoryEl.dataset.categoryId = category.id;

            const header = document.createElement('div');
            header.className = 'category-header';
            header.innerHTML = `
        <span class="category-arrow">${category.collapsed ? '▶' : '▼'}</span>
        <span class="category-name">${category.name}</span>
      `;
            header.addEventListener('click', () => {
                category.collapsed = !category.collapsed;
                this.renderChannelList(); // Re-render to toggle
                // TODO: Save collapsed state to server/local storage
            });

            // Add drop zone to header for collapsed categories
            this.setupDropZoneOnElement(header, category);

            categoryEl.appendChild(header);

            // Always create channelsList (for drop zone)
            const channelsList = document.createElement('div');
            channelsList.className = 'category-channels';

            // Add drop zone functionality
            this.setupDropZone(channelsList, category);

            if (!category.collapsed) {
                (category.channels || []).forEach(channel => {
                    const channelEl = this.createChannelElement(channel, category);
                    channelsList.appendChild(channelEl);
                });
            }
            categoryEl.appendChild(channelsList);

            container.appendChild(categoryEl);
        });
    }

    createChannelElement(channel, category) {
        const div = document.createElement('div');
        const unreadData = this.unreadCounts[channel.id];
        const hasUnread = unreadData && unreadData.count > 0;

        div.className = `channel-item${this.currentChannel?.id === channel.id ? ' active' : ''}${hasUnread ? ' unread' : ''}`;
        div.dataset.channelId = channel.id;
        div.dataset.categoryId = category.id;
        div.draggable = true;

        div.innerHTML = `
        <svg class="channel-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
           ${channel.is_private ?
                '<path d="M12 15v2m0 0v2m0-2h2m-2 0H8m4-11a4 4 0 0 1 4 4v3H8V8a4 4 0 0 1 4-4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' :
                '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'}
        </svg>
        <span class="channel-name">${channel.name}</span>
        ${hasUnread ? `<span class="unread-badge">${unreadData.count}</span>` : ''}
      `;

        div.addEventListener('click', () => this.selectChannel(channel));
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showChannelContextMenu(e, channel);
        });

        // Drag events
        div.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            console.log('[Drag] Drag started for channel:', channel.name, 'from category:', category.name);
            this.draggedChannel = { channel, fromCategory: category };
            div.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', channel.id);
        });

        div.addEventListener('dragend', (e) => {
            console.log('[Drag] Drag ended for channel:', channel.name);
            div.classList.remove('dragging');
            this.draggedChannel = null;
        });

        return div;
    }

    async selectChannel(channel) {
        if (this.currentChannel?.id === channel.id) return;

        this.currentChannel = channel;

        // Update UI
        document.querySelectorAll('.channel-item').forEach(el => {
            el.classList.toggle('active', el.dataset.channelId === channel.id);
        });

        // Clear/Load Messages handled by ChatManager
        await this.app.chatManager.switchChannel(channel);

        this.renderMembers();

        // Mark as read after a short delay
        setTimeout(() => {
            this.markChannelAsRead(channel.id);
        }, 1000);
    }

    async markChannelAsRead(channelId) {
        try {
            await this.app.apiRequest(`/channels/${channelId}/mark-read`, { method: 'POST' });
            if (this.unreadCounts[channelId]) {
                delete this.unreadCounts[channelId];
            }
            this.renderChannelList();
            this.renderServerList();
        } catch (error) {
            console.error('Failed to mark channel as read:', error);
        }
    }

    async renderMembers() {
        console.log('[ServerManager] renderMembers 호출됨, 채널:', this.currentChannel?.id);
        const list = document.getElementById('members-list');
        if (!list) {
            console.error('[ServerManager] members-list 요소를 찾을 수 없음');
            return;
        }

        list.innerHTML = '';

        // Fetch members if not cached or always fetch?
        // app.js fetched members.
        await this.fetchMembers(this.currentChannel?.id);

        const members = this.channelMembers[this.currentChannel?.id] || [];
        console.log('[ServerManager] 렌더링할 멤버 수:', members.length, members);

        // Simple render (omitting roles categorization for brevity, can be added)
        members.forEach(member => {
            const item = document.createElement('div');
            item.className = 'member-item'; // Add status classes...
            item.innerHTML = `
           <div class="avatar">${member.avatar || member.name[0]}</div>
           <div class="member-info">
             <div class="member-name">${member.name}</div>
             <div class="member-status">${member.status || 'offline'}</div>
           </div>
        `;
            list.appendChild(item);
        });
    }

    async fetchMembers(channelId) {
        if (!channelId || !this.app.apiBase) return;
        try {
            const data = await this.app.apiRequest(`/channels/${channelId}/members`);
            if (Array.isArray(data)) {
                // Remove duplicates by ID
                const uniqueMembers = [];
                const seenIds = new Set();
                for (const member of data) {
                    if (!seenIds.has(member.id)) {
                        seenIds.add(member.id);
                        uniqueMembers.push(member);
                    }
                }
                this.channelMembers[channelId] = uniqueMembers;
            }
        } catch (e) {
            console.error('Failed to fetch members:', e);
            this.channelMembers[channelId] = [];
        }
    }

    setupDropZoneOnElement(element, category) {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedChannel && this.draggedChannel.fromCategory.id !== category.id) {
                element.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            }
        });

        element.addEventListener('dragleave', (e) => {
            element.classList.remove('drag-over');
        });

        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('drag-over');

            if (this.draggedChannel && this.draggedChannel.fromCategory.id !== category.id) {
                await this.moveChannelToCategory(
                    this.draggedChannel.channel,
                    this.draggedChannel.fromCategory,
                    category
                );
            }
        });
    }

    setupDropZone(channelsList, category) {
        channelsList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.draggedChannel && this.draggedChannel.fromCategory.id !== category.id) {
                console.log('[Drag] Dragging over category:', category.name);
                channelsList.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            }
        });

        channelsList.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            channelsList.classList.remove('drag-over');
        });

        channelsList.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Drag] Drop event triggered on category:', category.name);
            console.log('[Drag] draggedChannel:', this.draggedChannel);
            channelsList.classList.remove('drag-over');

            if (this.draggedChannel && this.draggedChannel.fromCategory.id !== category.id) {
                console.log('[Drag] Valid drop - moving channel');
                await this.moveChannelToCategory(
                    this.draggedChannel.channel,
                    this.draggedChannel.fromCategory,
                    category
                );
            } else {
                console.log('[Drag] Invalid drop - same category or no dragged channel');
            }
        });
    }

    async moveChannelToCategory(channel, fromCategory, toCategory) {
        try {
            console.log(`[Move] Starting move: channel ${channel.name} (${channel.id})`);
            console.log(`[Move] From category: ${fromCategory.name} (${fromCategory.id})`);
            console.log(`[Move] To category: ${toCategory.name} (${toCategory.id})`);
            console.log(`[Move] Server ID: ${this.currentServer.id}`);

            const url = `/servers/${this.currentServer.id}/categories/${fromCategory.id}/channels/${channel.id}/move`;
            const payload = { target_category_id: toCategory.id };

            console.log(`[Move] Request URL: ${url}`);
            console.log(`[Move] Request payload:`, payload);

            // Call backend API to move channel
            const response = await this.app.apiRequest(url, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            console.log('[Move] API response:', response);

            // Reload server data to reflect changes
            await this.loadServerData();

            console.log('[Move] Channel moved successfully');
            this.app.uiManager.showToast('채널이 이동되었습니다.', 'success');
        } catch (error) {
            console.error('[Move] Failed to move channel:', error);
            this.app.uiManager.showToast('채널 이동에 실패했습니다.', 'error');
        }
    }

    showServerContextMenu(e, server) {
        this.serverContextTarget = server;
        const menu = document.getElementById('server-context-menu');
        if (menu) {
            menu.style.display = 'block';
            menu.style.left = `${e.pageX}px`;
            menu.style.top = `${e.pageY}px`;
        }
    }

    showChannelContextMenu(e, channel) {
        this.channelContextTarget = channel;
        const menu = document.getElementById('channel-context-menu');
        if (menu) {
            menu.style.display = 'block';
            menu.style.left = `${e.pageX}px`;
            menu.style.top = `${e.pageY}px`;
        }
    }

    // Socket.IO 이벤트 핸들러들
    handleMemberJoined(data) {
        console.log('[ServerManager] 멤버 참여:', data);
        const { channelId, member } = data;
        if (this.currentChannel?.id === channelId) {
            // 멤버 목록에 추가
            if (!this.channelMembers[channelId]) {
                this.channelMembers[channelId] = [];
            }
            // 중복 체크
            const existingMember = this.channelMembers[channelId].find(m => m.id === member.id);
            if (!existingMember) {
                this.channelMembers[channelId].push(member);
                this.renderMembers();
            } else {
                console.log('[ServerManager] 중복 멤버 참여 이벤트 무시:', member.id);
            }
        }
    }

    handleMemberLeft(data) {
        console.log('[ServerManager] 멤버 나감:', data);
        const { channelId, userId } = data;
        if (this.currentChannel?.id === channelId && this.channelMembers[channelId]) {
            this.channelMembers[channelId] = this.channelMembers[channelId].filter(m => m.id !== userId);
            this.renderMembers();
        }
    }

    handleUserStatusChanged(data) {
        console.log('[ServerManager] 사용자 상태 변경:', data);
        const { userId, status } = data;
        // 현재 채널의 멤버 목록에서 해당 사용자 상태 업데이트
        if (this.currentChannel?.id && this.channelMembers[this.currentChannel.id]) {
            const member = this.channelMembers[this.currentChannel.id].find(m => m.id === userId);
            if (member) {
                member.status = status;
                this.renderMembers();
            }
        }
    }
}
