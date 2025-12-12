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
        // 음성 채널 참가자 캐시 (채널 리렌더링 후에도 유지)
        this.voiceParticipantsCache = {};  // channelId -> participants[]
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

        // 채널 타입 선택 다이얼로그
        const channelType = await this.showChannelTypeDialog();
        if (!channelType) return;

        const placeholder = channelType === 'voice' ? '음성 채널 이름' : '텍스트 채널 이름';
        const channelName = await this.app.uiManager.showInputDialog(`${placeholder}을 입력하세요:`);
        if (!channelName || !channelName.trim()) return;

        // Use the first category by default (or we could let user select)
        const categoryId = this.currentServer.categories[0].id;

        try {
            const response = await this.app.apiRequest(`/servers/${this.currentServer.id}/categories/${categoryId}/channels`, {
                method: 'POST',
                body: JSON.stringify({
                    name: channelName.trim(),
                    type: channelType
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
                        if (channelType === 'text') {
                            await this.selectChannel(newChannel);
                        }
                        break;
                    }
                }

                this.app.uiManager.showToast(`${channelType === 'voice' ? '음성' : '텍스트'} 채널이 생성되었습니다.`, 'success');
            }
        } catch (error) {
            console.error('채널 생성 실패:', error);
            this.app.uiManager.showToast('채널 생성에 실패했습니다.', 'error');
        }
    }

    // 채널 타입 선택 다이얼로그
    showChannelTypeDialog() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.display = 'flex';

            overlay.innerHTML = `
                <div class="modal" style="width: 400px;">
                    <div class="modal-header">
                        <h3>채널 타입 선택</h3>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div class="channel-type-options">
                            <button class="channel-type-btn" data-type="text">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                                <div class="type-info">
                                    <span class="type-name">텍스트 채널</span>
                                    <span class="type-desc">메시지, 이미지, GIF, 이모지 공유</span>
                                </div>
                            </button>
                            <button class="channel-type-btn" data-type="voice">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" stroke-width="1.5"/>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M12 19v4M8 23h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                                <div class="type-info">
                                    <span class="type-name">음성 채널</span>
                                    <span class="type-desc">음성, 영상, 화면 공유</span>
                                </div>
                            </button>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-cancel" id="cancel-type">취소</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            overlay.querySelectorAll('.channel-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    overlay.remove();
                    resolve(btn.dataset.type);
                });
            });

            overlay.querySelector('#cancel-type').addEventListener('click', () => {
                overlay.remove();
                resolve(null);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve(null);
                }
            });
        });
    }

    // 특정 카테고리에 채널 추가
    async showCreateChannelInCategory(category) {
        if (!this.currentServer) return;

        // 채널 타입 선택
        const channelType = await this.showChannelTypeDialog();
        if (!channelType) return;

        const placeholder = channelType === 'voice' ? '음성 채널 이름' : '텍스트 채널 이름';
        const channelName = await this.app.uiManager.showInputDialog(`${placeholder}을 입력하세요:`);
        if (!channelName || !channelName.trim()) return;

        try {
            const response = await this.app.apiRequest(`/servers/${this.currentServer.id}/categories/${category.id}/channels`, {
                method: 'POST',
                body: JSON.stringify({
                    name: channelName.trim(),
                    type: channelType
                })
            });

            if (response) {
                await this.loadServerData();
                this.app.uiManager.showToast(`${channelType === 'voice' ? '음성' : '텍스트'} 채널이 생성되었습니다.`, 'success');
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

            // 서버 룸에 참가 (음성 채널 상태를 받기 위함)
            const userId = this.app.auth?.currentUser?.id;
            if (this.currentServer && this.app.socketManager) {
                this.app.socketManager.emit('join_server', {
                    serverId: this.currentServer.id,
                    userId: userId
                });
                console.log('[ServerManager] Joined server room:', this.currentServer.id);
            }

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
        // 화이트보드에 서버 변경 알림 (현재 상태 저장)
        this.app.whiteboardManager?.onChannelChange();

        // 이전 서버에서 나가기
        if (this.currentServer && this.currentServer.id !== server.id) {
            this.app.socketManager?.emit('leave_server', {
                serverId: this.currentServer.id
            });
        }

        this.currentServer = server;
        this.currentChannel = null;

        // 새 서버 룸에 참가 (모든 음성 채널 상태를 받기 위함)
        const userId = this.app.auth?.currentUser?.id;
        this.app.socketManager?.emit('join_server', {
            serverId: server.id,
            userId: userId
        });

        // UI Updates
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.toggle('active', item.dataset.serverId === server.id);
        });

        document.getElementById('server-name').textContent = server.name;

        this.renderChannelList();

        const firstChannel = server.categories?.[0]?.channels?.[0];
        if (firstChannel) {
            this.selectChannel(firstChannel);
        } else {
            this.app.chatManager.clearChatArea();
        }

        this.renderMembers();
    }

    // 음성 상태 업데이트 핸들러 (서버 전체에서 받음)
    handleVoiceStateUpdate(data) {
        console.log('[ServerManager] handleVoiceStateUpdate:', data);
        const { serverId, channelId, participants, voiceStates } = data;

        // 현재 서버가 아닌 경우 무시
        if (serverId && serverId !== this.currentServer?.id) {
            console.log('[ServerManager] Ignoring voice_state_update for different server:', serverId, 'current:', this.currentServer?.id);
            return;
        }

        // 단일 채널 업데이트인 경우
        if (channelId && participants) {
            console.log('[ServerManager] Updating single channel:', channelId, 'with', participants.length, 'participants');
            this.updateVoiceParticipants(channelId, participants);

            // 화면 공유 중인 참가자가 있으면 P2P 연결 요청
            participants.forEach(p => {
                if (p.isScreenSharing && this.app.webRTCManager) {
                    console.log('[ServerManager] Screen sharer detected:', p.id);
                    // remoteStreams에 이미 있으면 스킵
                    if (!Object.values(this.app.webRTCManager.remoteStreams).some(s => s.getVideoTracks().length > 0)) {
                        // P2P 연결이 없으면 자동으로 화면 공유 보기 시도 (스트림 수신 대기)
                    }
                }
            });
        }

        // 서버 접속 시 모든 채널 상태 업데이트인 경우
        if (voiceStates && Object.keys(voiceStates).length > 0) {
            console.log('[ServerManager] Updating all voice states:', voiceStates);
            for (const [chId, pList] of Object.entries(voiceStates)) {
                this.updateVoiceParticipants(chId, pList);
            }
        }
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
                <div class="category-left">
                    <span class="category-arrow">${category.collapsed ? '▶' : '▼'}</span>
                    <span class="category-name">${category.name}</span>
                </div>
                <button class="category-add-btn" title="채널 추가">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            `;

            // 카테고리 접기/펼치기
            header.querySelector('.category-left').addEventListener('click', () => {
                category.collapsed = !category.collapsed;
                this.renderChannelList();
            });

            // 채널 추가 버튼
            header.querySelector('.category-add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showCreateChannelInCategory(category);
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

        // 채널 영역 우클릭 시 카테고리 생성 메뉴
        container.addEventListener('contextmenu', (e) => {
            // 채널이나 카테고리 위에서 우클릭한 경우 무시
            if (e.target.closest('.channel-item') || e.target.closest('.category-header')) {
                return;
            }
            e.preventDefault();
            this.showChannelAreaContextMenu(e);
        });

        // 캐시된 음성 참가자 복원
        this.restoreVoiceParticipantsFromCache();
    }

    // 캐시에서 음성 참가자 복원
    restoreVoiceParticipantsFromCache() {
        for (const [channelId, participants] of Object.entries(this.voiceParticipantsCache)) {
            if (participants && participants.length > 0) {
                const container = document.getElementById(`voice-participants-${channelId}`);
                if (container) {
                    console.log('[ServerManager] Restoring voice participants from cache:', channelId, participants);
                    container.innerHTML = '';
                    participants.forEach(p => {
                        const participantEl = document.createElement('div');
                        participantEl.className = 'voice-participant';
                        participantEl.dataset.userId = p.id || 'unknown';
                        participantEl.innerHTML = `
                            <div class="participant-avatar">${p.name ? p.name[0] : 'U'}</div>
                            <span class="participant-name">${p.name || 'User'}</span>
                            ${p.isScreenSharing ? '<span class="screen-share-icon" title="화면 공유 중">🖥️</span>' : ''}
                        `;
                        container.appendChild(participantEl);
                    });
                }
            }
        }
    }

    // 채널 영역 컨텍스트 메뉴 (카테고리 생성)
    showChannelAreaContextMenu(e) {
        // 기존 메뉴 제거
        document.querySelectorAll('.channel-area-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'context-menu channel-area-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${e.clientY}px;
            left: ${e.clientX}px;
            display: block;
            z-index: 1000;
        `;

        menu.innerHTML = `
            <button class="context-menu-item" data-action="create-category">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <span>카테고리 만들기</span>
            </button>
        `;

        document.body.appendChild(menu);

        menu.querySelector('[data-action="create-category"]').addEventListener('click', () => {
            menu.remove();
            this.showCreateCategoryDialog();
        });

        // 외부 클릭 시 닫기
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    createChannelElement(channel, category) {
        const div = document.createElement('div');
        const unreadData = this.unreadCounts[channel.id];
        const hasUnread = unreadData && unreadData.count > 0;
        const isVoice = channel.type === 'voice';

        div.className = `channel-item${this.currentChannel?.id === channel.id ? ' active' : ''}${hasUnread ? ' unread' : ''}${isVoice ? ' voice-channel' : ''}`;
        div.dataset.channelId = channel.id;
        div.dataset.categoryId = category.id;
        div.dataset.channelType = channel.type || 'text';
        div.draggable = true;

        // 채널 타입에 따른 아이콘
        let channelIcon;
        if (isVoice) {
            channelIcon = `<svg class="channel-icon voice" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" stroke-width="1.5"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M12 19v4M8 23h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`;
        } else if (channel.is_private) {
            channelIcon = `<svg class="channel-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 15v2m0 0v2m0-2h2m-2 0H8m4-11a4 4 0 0 1 4 4v3H8V8a4 4 0 0 1 4-4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
        } else {
            channelIcon = `<svg class="channel-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`;
        }

        div.innerHTML = `
            <div class="channel-header-row">
                ${channelIcon}
                <span class="channel-name">${channel.name}</span>
                ${hasUnread ? `<span class="unread-badge">${unreadData.count}</span>` : ''}
            </div>
            ${isVoice ? `<div class="voice-participants-list" id="voice-participants-${channel.id}"></div>` : ''}
        `;

        div.addEventListener('click', () => {
            if (isVoice) {
                // 음성 채널: 자동으로 통화 참여
                this.joinVoiceChannel(channel);
            } else {
                // 텍스트 채널: 일반 선택
                this.selectChannel(channel);
            }
        });

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

    // 음성 채널 참여
    async joinVoiceChannel(channel) {
        console.log('[ServerManager] Joining voice channel:', channel.name);

        // 현재 채널 선택
        this.currentChannel = channel;

        // 기존 활성 상태 제거
        document.querySelectorAll('.channel-item.voice-channel').forEach(el => {
            el.classList.remove('active', 'connected');
        });

        // 새 채널 활성화
        const channelEl = document.querySelector(`[data-channel-id="${channel.id}"]`);
        if (channelEl) {
            channelEl.classList.add('active', 'connected');
        }

        // WebRTC로 통화 시작
        // 참가자 목록은 서버에서 voice_state_update 이벤트로 관리됨
        if (this.app.webRTCManager) {
            await this.app.webRTCManager.startCall();
        }
    }

    // 음성 채널 참가자 추가
    addVoiceParticipant(channelId, user) {
        const container = document.getElementById(`voice-participants-${channelId}`);
        if (!container) return;

        // 이미 있는지 확인
        if (container.querySelector(`[data-user-id="${user.id}"]`)) return;

        const participantEl = document.createElement('div');
        participantEl.className = 'voice-participant';
        participantEl.dataset.userId = user.id;

        participantEl.innerHTML = `
            <div class="participant-avatar">${user.name ? user.name[0] : 'U'}</div>
            <span class="participant-name">${user.name || 'User'}</span>
            ${user.isScreenSharing ? '<span class="screen-share-icon" title="화면 공유 중">🖥️</span>' : ''}
        `;

        container.appendChild(participantEl);
    }

    // 음성 채널 참가자 제거
    removeVoiceParticipant(channelId, userId) {
        const container = document.getElementById(`voice-participants-${channelId}`);
        if (!container) return;

        const participantEl = container.querySelector(`[data-user-id="${userId}"]`);
        if (participantEl) {
            participantEl.remove();
        }
    }

    // 참가자 화면 공유 상태 업데이트
    updateParticipantScreenShare(channelId, userId, isSharing) {
        console.log('[ServerManager] updateParticipantScreenShare called:', channelId, userId, isSharing);

        const container = document.getElementById(`voice-participants-${channelId}`);
        console.log('[ServerManager] container:', container);
        if (!container) return;

        const participantEl = container.querySelector(`[data-user-id="${userId}"]`);
        console.log('[ServerManager] participantEl:', participantEl);

        if (participantEl) {
            const existingBadge = participantEl.querySelector('.screen-share-badge');
            if (isSharing && !existingBadge) {
                const badge = document.createElement('span');
                badge.className = 'screen-share-badge';
                badge.textContent = '공유중';
                participantEl.appendChild(badge);
                console.log('[ServerManager] Added screen share badge');
            } else if (!isSharing && existingBadge) {
                existingBadge.remove();
                console.log('[ServerManager] Removed screen share badge');
            }
        }
    }

    // 음성 채널 참가자 업데이트 (전체)
    updateVoiceParticipants(channelId, participants) {
        console.log('[ServerManager] updateVoiceParticipants called:', channelId, 'participants:', participants);

        // 캐시에 저장 (나중에 복원 가능)
        this.voiceParticipantsCache[channelId] = participants;

        const container = document.getElementById(`voice-participants-${channelId}`);
        console.log('[ServerManager] Container found:', container);
        if (!container) {
            console.log('[ServerManager] Container not found for channel:', channelId);
            return;
        }

        container.innerHTML = '';

        if (participants.length === 0) return;

        participants.forEach(p => {
            const participantEl = document.createElement('div');
            participantEl.className = 'voice-participant';
            participantEl.dataset.userId = p.id || 'unknown';

            participantEl.innerHTML = `
                <div class="participant-avatar">${p.name ? p.name[0] : 'U'}</div>
                <span class="participant-name">${p.name || 'User'}</span>
                ${p.isScreenSharing ? '<button class="screen-share-view-btn" title="화면 공유 보기">🖥️ 공유중</button>' : ''}
            `;

            // 화면 공유 보기 버튼 클릭 이벤트
            if (p.isScreenSharing) {
                const viewBtn = participantEl.querySelector('.screen-share-view-btn');
                viewBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.app.webRTCManager?.showRemoteScreenShare(p.id, null);
                });
            }

            container.appendChild(participantEl);
        });
    }

    async selectChannel(channel) {
        if (this.currentChannel?.id === channel.id) return;

        // 화이트보드에 채널 변경 알림 (현재 상태 저장)
        this.app.whiteboardManager?.onChannelChange();

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
