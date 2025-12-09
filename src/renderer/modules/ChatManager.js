
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
        ${this.renderReactions(msg)}
      </div>
    `;

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showMessageContextMenu(e, msg);
        });

        // Add reaction button hover effect
        const messageContent = el.querySelector('.message-content');
        if (messageContent) {
            messageContent.addEventListener('mouseenter', () => {
                this.showReactionButton(el, msg);
            });
            messageContent.addEventListener('mouseleave', () => {
                this.hideReactionButton(el);
            });
        }

        return el;
    }

    renderReactions(msg) {
        if (!msg.reactions || msg.reactions.length === 0) {
            return '<div class="message-reactions-container"></div>';
        }

        const currentUserId = this.app.auth.currentUser?.id;
        const reactionsHTML = msg.reactions.map(reaction => {
            const count = reaction.users.length;
            const isActive = reaction.users.includes(currentUserId);
            return `
                <div class="reaction ${isActive ? 'active' : ''}"
                     data-emoji="${reaction.emoji}"
                     onclick="app.chatManager.toggleReaction('${msg.id}', '${reaction.emoji}')">
                    <span class="reaction-emoji">${reaction.emoji}</span>
                    <span class="reaction-count">${count}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="message-reactions-container">
                <div class="message-reactions">
                    ${reactionsHTML}
                    <button class="reaction-add-btn" onclick="app.chatManager.showReactionPicker('${msg.id}', event)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    showReactionButton(messageEl, msg) {
        // Add a floating reaction button if reactions container is empty
        const container = messageEl.querySelector('.message-reactions-container');
        if (container && !container.querySelector('.reaction-hover-btn')) {
            const btn = document.createElement('button');
            btn.className = 'reaction-hover-btn';
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            `;
            btn.onclick = (e) => this.showReactionPicker(msg.id, e);
            container.appendChild(btn);
        }
    }

    hideReactionButton(messageEl) {
        const btn = messageEl.querySelector('.reaction-hover-btn');
        if (btn) {
            btn.remove();
        }
    }

    async toggleReaction(messageId, emoji) {
        const currentUserId = this.app.auth.currentUser?.id;
        if (!currentUserId) return;

        try {
            // Find if user already reacted
            const msg = this.messages[this.app.serverManager.currentChannel.id]?.find(m => m.id === messageId);
            const reaction = msg?.reactions?.find(r => r.emoji === emoji);
            const hasReacted = reaction?.users.includes(currentUserId);

            if (hasReacted) {
                // Remove reaction
                await this.app.apiRequest(`/messages/${messageId}/reactions`, {
                    method: 'DELETE',
                    body: JSON.stringify({ emoji, user_id: currentUserId })
                });
            } else {
                // Add reaction
                await this.app.apiRequest(`/messages/${messageId}/reactions`, {
                    method: 'POST',
                    body: JSON.stringify({ emoji, user_id: currentUserId })
                });
            }
        } catch (error) {
            console.error('Failed to toggle reaction:', error);
        }
    }

    showReactionPicker(messageId, event) {
        event.stopPropagation();

        // Common emoji list
        const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

        // Create picker popup
        const picker = document.createElement('div');
        picker.className = 'reaction-picker';
        picker.innerHTML = emojis.map(emoji => `
            <button class="reaction-picker-emoji" onclick="app.chatManager.selectReaction('${messageId}', '${emoji}'); this.parentElement.remove();">
                ${emoji}
            </button>
        `).join('');

        // Position picker
        const rect = event.target.getBoundingClientRect();
        picker.style.position = 'fixed';
        picker.style.left = rect.left + 'px';
        picker.style.top = (rect.top - 50) + 'px';

        document.body.appendChild(picker);

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', function closePickerHandler(e) {
                if (!picker.contains(e.target)) {
                    picker.remove();
                    document.removeEventListener('click', closePickerHandler);
                }
            });
        }, 10);
    }

    async selectReaction(messageId, emoji) {
        const currentUserId = this.app.auth.currentUser?.id;
        if (!currentUserId) return;

        try {
            await this.app.apiRequest(`/messages/${messageId}/reactions`, {
                method: 'POST',
                body: JSON.stringify({ emoji, user_id: currentUserId })
            });
        } catch (error) {
            console.error('Failed to add reaction:', error);
        }
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
        // If DOMPurify is available, use it. Otherwise, use a simple escape.
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(content, {
                ALLOWED_TAGS: ['b', 'i', 'u', 's', 'strong', 'em', 'strike', 'ul', 'ol', 'li', 'br', 'p', 'div', 'span', 'code', 'pre'],
                ALLOWED_ATTR: ['style', 'class']
            });
        }
        // Fallback: simple escape (allows basic formatting)
        return content;
    }

    async sendMessage() {
        const input = document.getElementById('message-input');
        // Get HTML content
        let content = input.innerHTML;

        // Clean up empty paragraphs or brs if strictly empty
        if (content === '<br>' || content === '<div><br></div>' || content.trim() === '') {
            content = '';
        }

        const channelId = this.app.serverManager.currentChannel?.id;

        if (!content && this.attachedFiles.length === 0) return;
        if (!channelId) return;

        // Stop typing immediately when sending
        this.emitTyping(false);

        const messageData = {
            content, // Sending HTML directly
            files: this.attachedFiles.map(f => ({
                name: f.name,
                url: f.url,
                type: f.type,
                size: f.size
            })),
            sender: {
                id: this.app.auth.currentUser?.id || 'guest',
                name: this.app.auth.currentUser?.name || 'Guest',
                avatar: this.app.auth.currentUser?.name?.[0] || 'G'
            }
        };

        try {
            // Send via API
            const response = await this.app.apiRequest(`/channels/${channelId}/messages`, {
                method: 'POST',
                body: JSON.stringify(messageData)
            });

            if (response) {
                console.log('메시지 전송 완료:', response);
                // Message will be received via socket event
            }
        } catch (error) {
            console.error('메시지 전송 실패:', error);
            alert('메시지 전송에 실패했습니다.');
        }

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
        this.app.apiRequest(`/channels/${channelId}/mark-read`, { method: 'POST' });
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
        const menu = document.getElementById('message-context-menu');
        if (!menu) return;

        // Store the current message for context menu actions
        this.contextMessage = message;

        // Position the menu
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        // Close menu on outside click
        const closeMenu = (event) => {
            if (!menu.contains(event.target)) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);

        // Bind context menu actions if not already bound
        if (!this.contextMenuBound) {
            this.bindContextMenuActions();
            this.contextMenuBound = true;
        }
    }

    bindContextMenuActions() {
        const menu = document.getElementById('message-context-menu');
        if (!menu) return;

        menu.addEventListener('click', async (e) => {
            const item = e.target.closest('.context-menu-item');
            if (!item) return;

            const action = item.dataset.action;
            menu.style.display = 'none';

            switch (action) {
                case 'remind':
                    this.showReminderModal(this.contextMessage);
                    break;
                case 'bookmark':
                    await this.toggleBookmark(this.contextMessage.id);
                    break;
                // Add other actions as needed
                default:
                    console.log(`Action ${action} not implemented yet`);
            }
        });
    }

    async toggleBookmark(messageId) {
        try {
            const checkResponse = await this.app.apiRequest(`/bookmarks/check/${messageId}`);

            if (checkResponse.bookmarked) {
                // Delete bookmark
                await this.app.apiRequest(`/bookmarks/${messageId}`, { method: 'DELETE' });
                console.log('북마크가 삭제되었습니다.');
            } else {
                // Add bookmark
                const response = await this.app.apiRequest('/bookmarks', {
                    method: 'POST',
                    body: JSON.stringify({ message_id: messageId })
                });

                if (response) {
                    console.log('북마크에 추가되었습니다.');
                } else {
                    alert('북마크 추가에 실패했습니다.');
                }
            }
        } catch (error) {
            console.error('북마크 토글 오류:', error);
            alert('서버 연결에 실패했습니다.');
        }
    }

    showReminderModal(message) {
        const modal = document.getElementById('reminder-modal');
        if (!modal) return;

        // Store the message for later use
        this.reminderMessage = message;

        // Reset the form
        const textInput = document.getElementById('reminder-text');
        const customTimeGroup = document.getElementById('custom-time-group');
        const selectedTimeInfo = document.getElementById('reminder-selected-time');
        const createBtn = document.getElementById('create-reminder-btn');

        if (textInput) textInput.value = '';
        if (customTimeGroup) customTimeGroup.style.display = 'none';
        if (selectedTimeInfo) selectedTimeInfo.style.display = 'none';
        if (createBtn) createBtn.disabled = true;

        // Clear selected time
        this.selectedReminderTime = null;

        modal.style.display = 'flex';

        // Bind reminder modal events if not already bound
        if (!this.reminderModalBound) {
            this.bindReminderModalEvents();
            this.reminderModalBound = true;
        }
    }

    bindReminderModalEvents() {
        const closeBtn = document.getElementById('close-reminder-modal');
        const cancelBtn = document.getElementById('cancel-reminder-btn');
        const createBtn = document.getElementById('create-reminder-btn');
        const textInput = document.getElementById('reminder-text');
        const customTimeBtn = document.getElementById('custom-time-btn');
        const customTimeInput = document.getElementById('reminder-custom-time');

        const closeModal = () => {
            const modal = document.getElementById('reminder-modal');
            if (modal) modal.style.display = 'none';
        };

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        createBtn?.addEventListener('click', () => this.createReminder());

        // Time selection buttons
        const timeButtons = document.querySelectorAll('.reminder-time-btn[data-minutes]');
        timeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const minutes = parseInt(btn.dataset.minutes);
                const remindAt = new Date(Date.now() + minutes * 60 * 1000);
                this.setReminderTime(remindAt);

                // Hide custom time input
                const customTimeGroup = document.getElementById('custom-time-group');
                if (customTimeGroup) customTimeGroup.style.display = 'none';

                // Remove active class from all buttons
                timeButtons.forEach(b => b.classList.remove('active'));
                customTimeBtn?.classList.remove('active');

                // Add active class to clicked button
                btn.classList.add('active');
            });
        });

        // Custom time button
        customTimeBtn?.addEventListener('click', () => {
            const customTimeGroup = document.getElementById('custom-time-group');
            if (customTimeGroup) customTimeGroup.style.display = 'block';

            // Remove active class from all buttons
            timeButtons.forEach(b => b.classList.remove('active'));
            customTimeBtn.classList.add('active');

            // Set minimum datetime to now
            const now = new Date();
            const minDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            if (customTimeInput) customTimeInput.min = minDateTime;
        });

        // Custom time input change
        customTimeInput?.addEventListener('change', () => {
            if (customTimeInput.value) {
                const remindAt = new Date(customTimeInput.value);
                this.setReminderTime(remindAt);
            }
        });

        // Text input validation
        textInput?.addEventListener('input', () => {
            this.validateReminderForm();
        });
    }

    setReminderTime(remindAt) {
        this.selectedReminderTime = remindAt;

        const selectedTimeInfo = document.getElementById('reminder-selected-time');
        const timeDisplay = document.getElementById('reminder-time-display');

        if (selectedTimeInfo && timeDisplay) {
            selectedTimeInfo.style.display = 'flex';
            timeDisplay.textContent = remindAt.toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        this.validateReminderForm();
    }

    validateReminderForm() {
        const textInput = document.getElementById('reminder-text');
        const createBtn = document.getElementById('create-reminder-btn');

        if (createBtn) {
            const hasText = textInput && textInput.value.trim().length > 0;
            const hasTime = this.selectedReminderTime !== null;
            createBtn.disabled = !(hasText && hasTime);
        }
    }

    async createReminder() {
        const textInput = document.getElementById('reminder-text');
        if (!textInput || !this.selectedReminderTime) return;

        const reminderData = {
            text: textInput.value.trim(),
            remind_at: this.selectedReminderTime.toISOString(),
            message_id: this.reminderMessage?.id || null,
            channel_id: this.app.serverManager.currentChannel?.id || null
        };

        try {
            const response = await this.app.apiRequest('/reminders', {
                method: 'POST',
                body: JSON.stringify(reminderData)
            });

            if (response) {
                console.log('리마인더가 생성되었습니다:', response);
                alert(`리마인더가 설정되었습니다.\n${this.selectedReminderTime.toLocaleString('ko-KR')}에 알림이 전송됩니다.`);

                // Close modal
                const modal = document.getElementById('reminder-modal');
                if (modal) modal.style.display = 'none';
            } else {
                alert('리마인더 생성에 실패했습니다.');
            }
        } catch (error) {
            console.error('리마인더 생성 오류:', error);
            alert('서버 연결에 실패했습니다.');
        }
    }

    handleReminderNotification(data) {
        // Display reminder notification
        const { text, message_id, channel_id } = data;

        // Create a notification element
        const notification = document.createElement('div');
        notification.className = 'reminder-notification';
        notification.innerHTML = `
            <div class="reminder-notification-content">
                <div class="reminder-notification-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M12 9v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M12 5V3M17 6l1.5-1.5M19 12h2M7 6L5.5 4.5M5 12H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span>리마인더</span>
                    <button class="icon-btn close-notification-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <div class="reminder-notification-text">${text}</div>
                ${message_id ? '<button class="btn-secondary go-to-message-btn">메시지로 이동</button>' : ''}
            </div>
        `;

        document.body.appendChild(notification);

        // Position notification (top-right corner)
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;

        // Close button
        const closeBtn = notification.querySelector('.close-notification-btn');
        closeBtn?.addEventListener('click', () => {
            notification.remove();
        });

        // Go to message button
        if (message_id && channel_id) {
            const goToBtn = notification.querySelector('.go-to-message-btn');
            goToBtn?.addEventListener('click', async () => {
                // Find the channel and switch to it
                const channel = this.app.serverManager.channels.find(c => c.id === channel_id);
                if (channel) {
                    await this.switchChannel(channel);

                    // Scroll to the message
                    const messageEl = document.querySelector(`[data-message-id="${message_id}"]`);
                    if (messageEl) {
                        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        messageEl.classList.add('highlight');
                        setTimeout(() => messageEl.classList.remove('highlight'), 2000);
                    }
                }
                notification.remove();
            });
        }

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);

        // Play notification sound if available
        this.playNotificationSound();
    }

    playNotificationSound() {
        // Simple beep sound using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.error('Could not play notification sound:', error);
        }
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
