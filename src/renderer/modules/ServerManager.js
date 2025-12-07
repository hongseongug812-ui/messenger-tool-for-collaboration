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
    }

    bindContextMenuEvents() {
        // Hide menus on global click
        document.addEventListener('click', (e) => {
            this.hideContextMenus();
        });

        // Server Menu
        document.getElementById('ctx-server-invite')?.addEventListener('click', () => {
            if (this.serverContextTarget) alert(`초대하기: ${this.serverContextTarget.name}`); // Stub
        });
        document.getElementById('ctx-server-settings')?.addEventListener('click', () => {
            if (this.serverContextTarget) alert(`서버 설정: ${this.serverContextTarget.name}`); // Stub
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
    }

    hideContextMenus() {
        const serverMenu = document.getElementById('server-context-menu');
        const channelMenu = document.getElementById('channel-context-menu');
        if (serverMenu) serverMenu.style.display = 'none';
        if (channelMenu) channelMenu.style.display = 'none';
        this.serverContextTarget = null;
        this.channelContextTarget = null;
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

            this.currentServer = this.servers[0];
            this.renderServerList();
            this.renderChannelList();

            // Fetch unread counts
            await this.fetchUnreadCounts();

            const firstChannel = this.currentServer.categories?.[0]?.channels?.[0];
            if (firstChannel) {
                await this.selectChannel(firstChannel);
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

            categoryEl.appendChild(header);

            if (!category.collapsed) {
                const channelsList = document.createElement('div');
                channelsList.className = 'category-channels';

                (category.channels || []).forEach(channel => {
                    const channelEl = this.createChannelElement(channel, category);
                    channelsList.appendChild(channelEl);
                });
                categoryEl.appendChild(channelsList);
            }

            container.appendChild(categoryEl);
        });
    }

    createChannelElement(channel, category) {
        const div = document.createElement('div');
        const unreadData = this.unreadCounts[channel.id];
        const hasUnread = unreadData && unreadData.count > 0;

        div.className = `channel-item${this.currentChannel?.id === channel.id ? ' active' : ''}${hasUnread ? ' unread' : ''}`;
        div.dataset.channelId = channel.id;

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
        const list = document.getElementById('members-list');
        if (!list) return;

        list.innerHTML = '';

        // Fetch members if not cached or always fetch?
        // app.js fetched members.
        await this.fetchMembers(this.currentChannel?.id);

        const members = this.channelMembers[this.currentChannel?.id] || [];

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
                this.channelMembers[channelId] = data;
            }
        } catch (e) {
            console.error('Failed to fetch members:', e);
            this.channelMembers[channelId] = [];
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
}
