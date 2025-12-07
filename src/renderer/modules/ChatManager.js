
export class ChatManager {
    constructor(app) {
        this.app = app;
        this.messages = {};
        this.loadedMessages = new Set();
        this.pinnedMessages = {};
        this.threads = {};
        this.currentThread = null;
        this.attachedFiles = [];

        this.emojiCategories = {
            'smileys': {
                name: '😊 표정',
                emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳']
            },
            // ... other categories (truncated for brevity, can copy full list if needed)
            'gestures': { name: '👍 제스처', emojis: ['👍', '👎', '👏', '🙌', '👌'] } // simplified for now
        };

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const input = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');

        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            input.addEventListener('input', () => {
                if (sendBtn) {
                    sendBtn.disabled = input.value.trim() === '' && this.attachedFiles.length === 0;
                }
                // Auto-resize logic could go here
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
    }

    async switchChannel(channel) {
        // Leave previous channel if any
        if (this.app.serverManager.currentChannel && this.app.serverManager.currentChannel.id !== channel.id) {
            this.app.socketManager.emit('leave', { channelId: this.app.serverManager.currentChannel.id });
        }

        // Join new channel
        const currentUser = this.app.auth.currentUser;
        if (currentUser) {
            this.app.socketManager.emit('join', {
                channelId: channel.id,
                userId: currentUser.id
            });
        }

        // UI Update
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) chatTitle.textContent = channel.name;

        document.getElementById('messages-and-members').style.display = 'flex';
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('chat-header').style.display = 'flex';
        document.getElementById('messages-container').style.display = 'flex';
        document.getElementById('input-area').style.display = 'flex';

        // Clear messages
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) messagesContainer.innerHTML = '';

        // Reset Input
        this.resetInput();

        // Load Messages
        await this.loadMessages(channel.id);
    }

    clearChatArea() {
        document.getElementById('messages-and-members').style.display = 'none';
        document.getElementById('empty-state').style.display = 'flex';
    }

    async loadMessages(channelId) {
        // Fetch read states first or in parallel
        try {
            const readStates = await this.app.apiRequest(`/channels/${channelId}/read-states`);
            if (!this.memberReadTimes) this.memberReadTimes = {};
            // Convert strings timestamps to time numbers
            const processedStates = {};
            for (const [userId, timeStr] of Object.entries(readStates)) {
                processedStates[userId] = new Date(timeStr).getTime();
            }
            this.memberReadTimes[channelId] = processedStates;
        } catch (e) {
            console.error('읽음 상태 로드 실패:', e);
        }

        if (this.messages[channelId]) {
            this.renderMessages(channelId);
            this.updateReadReceipts(channelId);
            return;
        }

        try {
            const data = await this.app.apiRequest(`/channels/${channelId}/messages`);
            if (Array.isArray(data)) {
                this.messages[channelId] = data.map(msg => this.normalizeMessage(msg));
                this.renderMessages(channelId);
                this.updateReadReceipts(channelId);
            }
        } catch (error) {
            console.error('메시지 로드 실패:', error);
        }
    }

    renderMessages(channelId) {
        const list = document.getElementById('messages');
        if (!list) return;
        list.innerHTML = '';

        const messages = this.messages[channelId] || [];
        const fragment = document.createDocumentFragment();

        messages.forEach(msg => {
            fragment.appendChild(this.createMessageElement(msg));
        });

        list.appendChild(fragment);
        this.scrollToBottom();
    }

    createMessageElement(msg) {
        const el = document.createElement('div');
        el.className = `message${msg.sent ? ' sent' : ''}`;
        el.dataset.messageId = msg.id;

        el.innerHTML = `
      <div class="avatar">${msg.sender.avatar}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-sender">${msg.sender.name}</span>
          <span class="message-time">${msg.time}</span>
        </div>
        <div class="message-bubble">${this.formatMessage(msg.content)}</div>
        ${this.renderAttachments(msg.files || [])}
      </div>
    `;

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showMessageContextMenu(e, msg);
        });

        return el;
    }

    renderAttachments(files) {
        if (!files || files.length === 0) return '';
        return `<div class="message-attachments">
      ${files.map(f => `<div class="attachment-item" onclick="app.chatManager.openFilePreview('${f.url}', '${f.name}')">${f.name}</div>`).join('')}
    </div>`;
    }

    normalizeMessage(msg) {
        const sender = msg.sender || { name: 'Unknown', avatar: '?' };
        const isMine = sender.id === this.app.auth.currentUser?.id;
        return {
            ...msg,
            sender: typeof sender === 'string' ? { name: sender, avatar: sender[0] } : sender,
            sent: isMine,
            time: new Date(msg.timestamp).toLocaleTimeString()
        };
    }

    formatMessage(content) {
        if (!content) return '';
        // Sanitize raw HTML from RTE
        // ALLOWED_TAGS and ATTRs can be customized as needed.
        return DOMPurify.sanitize(content, {
            ALLOWED_TAGS: ['b', 'i', 'u', 's', 'strong', 'em', 'strike', 'ul', 'ol', 'li', 'br', 'p', 'div', 'span', 'code', 'pre'],
            ALLOWED_ATTR: ['style', 'class']
        });
    }

    async sendMessage() {
        const input = document.getElementById('message-input');
        // Get HTML content
        let content = input.innerHTML;

        // Clean up empty paragraphs or brs if strictly empty
        if (content === '<br>') content = '';

        const channelId = this.app.serverManager.currentChannel?.id;

        if (!content && this.attachedFiles.length === 0) return;
        if (!channelId) return;

        // Stop typing immediately when sending
        this.emitTyping(false);

        const messageData = {
            content, // Sending HTML directly
            channelId,
            files: this.attachedFiles,
            sender: this.app.auth.currentUser || { name: 'Guest', id: 'guest' }
        };

        // Optimistic UI update
        // ...

        // Emit socket event
        this.app.socketManager.emit('message', {
            channelId,
            message: messageData
        });

        this.resetInput();
    }

    resetInput() {
        const input = document.getElementById('message-input');
        if (input) input.innerHTML = '';
        this.attachedFiles = [];
        this.isTyping = false;

        const attachBtn = document.getElementById('attach-btn');
        if (attachBtn) attachBtn.innerHTML = `
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>`;
    }

    bindEvents() {
        const input = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');

        // Typing timeout ref
        this.typingTimeout = null;

        if (input) {
            // contenteditable keydown
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                } else {
                    this.emitTyping(true);
                }
            });

            input.addEventListener('input', () => {
                const content = input.innerHTML.trim();
                // Check if content is empty (sometimes <br> is left)
                const isEmpty = content === '' || content === '<br>';

                if (sendBtn) {
                    sendBtn.disabled = isEmpty && this.attachedFiles.length === 0;
                }
            });

            // Focus event to mark as read
            input.addEventListener('focus', () => {
                if (this.app.serverManager.currentChannel) {
                    this.markAsRead(this.app.serverManager.currentChannel.id);
                }
            });
        }

        // Mark as read when clicking on chat area
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.addEventListener('click', () => {
                if (this.app.serverManager.currentChannel) {
                    this.markAsRead(this.app.serverManager.currentChannel.id);
                }
            })
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
    }

    emitTyping(isTyping) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return;

        if (isTyping) {
            if (!this.isTyping) {
                this.isTyping = true;
                this.app.socketManager.emit('typing_start', { channelId });
            }

            // Debounce stop
            if (this.typingTimeout) clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.isTyping = false;
                this.app.socketManager.emit('typing_stop', { channelId });
            }, 3000);
        } else {
            if (this.typingTimeout) clearTimeout(this.typingTimeout);
            this.isTyping = false;
            this.app.socketManager.emit('typing_stop', { channelId });
        }
    }

    handleTypingStart(data) {
        if (this.app.serverManager.currentChannel?.id !== data.channelId) return;

        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
            indicator.innerHTML = `
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
                <span>${data.username}님이 입력 중...</span>
            `;
        }
    }

    handleTypingStop(data) {
        if (this.app.serverManager.currentChannel?.id !== data.channelId) return;

        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    markAsRead(channelId) {
        // Emit explicit socket event for real-time
        this.app.socketManager.emit('channel_read', { channelId });
        // Also call API to ensure persistence (though socket handler now does DB update too, redundancies can be removed often)
        this.app.apiRequest(`/channels/${channelId}/mark-read`, 'POST');
    }

    handleUserReadUpdate(data) {
        // Update local member read status?
        // Ideally we should track member read timestamps in ServerManager or ChatManager
        if (!this.memberReadTimes) this.memberReadTimes = {};
        if (!this.memberReadTimes[data.channelId]) this.memberReadTimes[data.channelId] = {};

        this.memberReadTimes[data.channelId][data.userId] = new Date(data.lastReadAt).getTime();

        if (this.app.serverManager.currentChannel?.id === data.channelId) {
            this.updateReadReceipts(data.channelId);
        }
    }

    updateReadReceipts(channelId) {
        // This is expensive to do on every update for all messages
        // Simplified: Just update the last message? Or latest messages.
        // For detailed receipts, we need to re-render or update status of recent messages

        const channelReadTimes = this.memberReadTimes?.[channelId] || {};
        const messages = this.messages[channelId] || [];
        if (messages.length === 0) return;

        // Clear all existing read receipts in DOM
        document.querySelectorAll('.read-receipts').forEach(el => el.innerHTML = '');

        // For each member (except me), find the latest message they've read
        const members = this.app.serverManager.currentChannel?.members || [];
        const myId = this.app.auth.currentUser?.id;

        members.forEach(member => {
            if (member.id === myId) return;

            const lastReadTime = channelReadTimes[member.id] || 0;
            if (!lastReadTime) return;

            // Find the last message that is <= lastReadTime
            let lastReadMessageId = null;
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                const msgTime = new Date(msg.timestamp).getTime();
                if (msgTime <= lastReadTime) {
                    lastReadMessageId = msg.id;
                    break;
                }
            }

            if (lastReadMessageId) {
                const msgEl = document.querySelector(`.message[data-message-id="${lastReadMessageId}"]`);
                if (msgEl) {
                    let statusContainer = msgEl.querySelector('.read-receipts');
                    if (!statusContainer) {
                        // Create if not exists in bubble? No, usually outside or bottom
                        const contentDiv = msgEl.querySelector('.message-content');
                        let statusDiv = contentDiv.querySelector('.message-status');
                        if (!statusDiv) {
                            statusDiv = document.createElement('div');
                            statusDiv.className = 'message-status';
                            contentDiv.appendChild(statusDiv);
                        }

                        statusContainer = statusDiv.querySelector('.read-receipts');
                        if (!statusContainer) {
                            statusContainer = document.createElement('div');
                            statusContainer.className = 'read-receipts';
                            statusDiv.appendChild(statusContainer);
                        }
                    }

                    // Add avatar
                    const avatar = document.createElement('div');
                    avatar.className = 'read-avatar';

                    if (member.avatar && member.avatar.length > 2) {
                        // Should be image but text for now based on current mock
                        avatar.textContent = member.name[0];
                    } else {
                        avatar.textContent = member.avatar || member.name[0];
                    }
                    avatar.title = `${member.name}님이 읽음`;
                    statusContainer.appendChild(avatar);
                }
            }
        });
    }

    scrollToBottom() {
        const container = document.getElementById('messages-container');
        if (container) container.scrollTop = container.scrollHeight;
    }

    showMessageContextMenu(e, message) {
        // implementation similar to ServerManager context menu
    }

    handleMessageReceived(data) {
        const { channelId, message } = data;
        if (!this.messages[channelId]) this.messages[channelId] = [];

        const normalized = this.normalizeMessage(message);
        this.messages[channelId].push(normalized);

        if (this.app.serverManager.currentChannel?.id === channelId) {
            const list = document.getElementById('messages');
            list.appendChild(this.createMessageElement(normalized));
            this.scrollToBottom();

            // If I am active in this channel, mark as read immediately
            if (document.hasFocus()) {
                this.markAsRead(channelId);
            }
        } else {
            // Increment unread count in ServerManager
            // this.app.serverManager.incrementUnread(channelId);
        }
    }

    openFilePreview(url, name) {
        // ... implementation
    }
}
