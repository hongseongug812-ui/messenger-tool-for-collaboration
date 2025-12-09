
export class ChatManager {
    constructor(app) {
        this.app = app;
        this.messages = {};
        this.loadedMessages = new Set();
        this.pinnedMessages = {};
        this.threads = {};
        this.currentThread = null;
        this.attachedFiles = [];
        this.selectedCommandIndex = -1;

        // Slash commands definition
        this.slashCommands = [
            { name: '/help', description: '명령어 도움말 표시', usage: '/help' },
            { name: '/remind', description: '리마인더 설정', usage: '/remind me 10m "메시지"' },
            { name: '/clear', description: '메시지 화면 지우기', usage: '/clear' },
            { name: '/shrug', description: '어깨 으쓱 이모티콘', usage: '/shrug' },
            { name: '/tableflip', description: '테이블 뒤집기 이모티콘', usage: '/tableflip' },
            { name: '/unflip', description: '테이블 되돌리기', usage: '/unflip' },
            { name: '/disapprove', description: '불만족 표정', usage: '/disapprove' },
            { name: '/lenny', description: '레니 페이스', usage: '/lenny' },
            { name: '/away', description: '자리 비움 상태 설정', usage: '/away [메시지]' },
            { name: '/back', description: '자리 비움 해제', usage: '/back' },
            { name: '/status', description: '상태 메시지 설정', usage: '/status 상태메시지' },
            { name: '/giphy', description: 'GIF 검색 (준비중)', usage: '/giphy 검색어' }
        ];

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
        ${this.renderThreadInfo(msg)}
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

    renderThreadInfo(msg) {
        const replyCount = msg.reply_count || msg.replyCount || 0;

        if (replyCount === 0) {
            return `
                <div class="message-thread-actions">
                    <button class="thread-reply-btn" onclick="app.chatManager.openThread('${msg.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M7 8h10M7 12h7M7 16h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                            <path d="M3 12h0M21 12h0" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                        답글
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="message-thread-actions">
                    <button class="thread-reply-btn with-count" onclick="app.chatManager.openThread('${msg.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M7 8h10M7 12h7M7 16h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                            <path d="M3 12h0M21 12h0" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                        ${replyCount}개의 답글
                    </button>
                </div>
            `;
        }
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

        // Get plain text for slash command detection
        const plainText = input.textContent || input.innerText;

        // Check for slash commands
        if (plainText.trim().startsWith('/')) {
            const commandResult = await this.handleSlashCommand(plainText.trim(), channelId);
            if (commandResult) {
                this.resetInput();
                return;
            }
        }

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
                const tooltip = document.getElementById('slash-command-tooltip');
                const isTooltipVisible = tooltip && tooltip.style.display !== 'none';

                // Handle command tooltip navigation
                if (isTooltipVisible) {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.navigateCommandTooltip(1);
                        return;
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.navigateCommandTooltip(-1);
                        return;
                    } else if (e.key === 'Tab' || (e.key === 'Enter' && this.selectedCommandIndex >= 0)) {
                        e.preventDefault();
                        this.selectCommand();
                        return;
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this.hideCommandTooltip();
                        return;
                    }
                }

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

                // Show command tooltip if input starts with /
                const plainText = input.textContent || input.innerText;
                if (plainText.startsWith('/')) {
                    this.showCommandTooltip(plainText);
                } else {
                    this.hideCommandTooltip();
                }
            });

            // Focus event to mark as read
            input.addEventListener('focus', () => {
                if (this.app.serverManager.currentChannel) {
                    this.markAsRead(this.app.serverManager.currentChannel.id);
                }
            });

            // Blur event to hide tooltip
            input.addEventListener('blur', () => {
                // Delay to allow clicking on tooltip items
                setTimeout(() => this.hideCommandTooltip(), 200);
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

        // File attachment
        const attachBtn = document.getElementById('attach-btn');
        if (attachBtn) {
            // Create hidden file input
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            fileInput.id = 'file-input-hidden';
            document.body.appendChild(fileInput);

            attachBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    await this.uploadFiles(files);
                }
                // Reset file input
                fileInput.value = '';
            });
        }

        // Thread panel events
        const closeThreadBtn = document.getElementById('close-thread-panel');
        if (closeThreadBtn) {
            closeThreadBtn.addEventListener('click', () => this.closeThread());
        }

        const threadInput = document.getElementById('thread-input');
        const sendThreadReplyBtn = document.getElementById('send-thread-reply');

        if (threadInput) {
            threadInput.addEventListener('input', () => {
                if (sendThreadReplyBtn) {
                    sendThreadReplyBtn.disabled = !threadInput.value.trim();
                }
            });

            threadInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendThreadReply();
                }
            });
        }

        if (sendThreadReplyBtn) {
            sendThreadReplyBtn.addEventListener('click', () => this.sendThreadReply());
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

    handleReactionAdded(data) {
        const { channelId, messageId, emoji, userId, reactions } = data;

        // Update message in memory
        if (this.messages[channelId]) {
            const message = this.messages[channelId].find(m => m.id === messageId);
            if (message) {
                message.reactions = reactions;

                // Update UI if this channel is currently displayed
                if (this.app.serverManager.currentChannel?.id === channelId) {
                    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
                    if (messageEl) {
                        const reactionsContainer = messageEl.querySelector('.message-reactions-container');
                        if (reactionsContainer) {
                            reactionsContainer.outerHTML = this.renderReactions(message);
                        }
                    }
                }
            }
        }
    }

    handleReactionRemoved(data) {
        const { channelId, messageId, emoji, userId, reactions } = data;

        // Update message in memory
        if (this.messages[channelId]) {
            const message = this.messages[channelId].find(m => m.id === messageId);
            if (message) {
                message.reactions = reactions;

                // Update UI if this channel is currently displayed
                if (this.app.serverManager.currentChannel?.id === channelId) {
                    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
                    if (messageEl) {
                        const reactionsContainer = messageEl.querySelector('.message-reactions-container');
                        if (reactionsContainer) {
                            reactionsContainer.outerHTML = this.renderReactions(message);
                        }
                    }
                }
            }
        }
    }

    async uploadFiles(files) {
        for (const file of files) {
            try {
                // Show uploading indicator
                this.app.uiManager.showToast(`${file.name} 업로드 중...`, 'info', 0);

                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(`${this.app.apiBase}/files/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.app.auth.authToken}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.statusText}`);
                }

                const fileData = await response.json();

                // Add to attached files
                this.attachedFiles.push(fileData);

                // Update UI
                this.updateAttachedFilesUI();

                // Remove uploading toast and show success
                this.app.uiManager.showToast(`${file.name} 업로드 완료`, 'success');
            } catch (error) {
                console.error('File upload error:', error);
                this.app.uiManager.showToast(`${file.name} 업로드 실패`, 'error');
            }
        }
    }

    updateAttachedFilesUI() {
        const attachBtn = document.getElementById('attach-btn');
        if (!attachBtn) return;

        if (this.attachedFiles.length > 0) {
            attachBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="var(--accent)" fill-opacity="0.2"/>
                    <text x="12" y="16" text-anchor="middle" fill="var(--accent)" font-size="12" font-weight="bold">${this.attachedFiles.length}</text>
                </svg>
            `;

            // Show attached files preview
            this.showAttachedFilesPreview();
        } else {
            attachBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            `;

            // Hide preview
            const preview = document.getElementById('attached-files-preview');
            if (preview) preview.remove();
        }

        // Enable/disable send button
        const sendBtn = document.getElementById('send-btn');
        const input = document.getElementById('message-input');
        const isEmpty = !input || input.innerHTML.trim() === '' || input.innerHTML.trim() === '<br>';
        if (sendBtn) {
            sendBtn.disabled = isEmpty && this.attachedFiles.length === 0;
        }
    }

    showAttachedFilesPreview() {
        // Remove existing preview
        let preview = document.getElementById('attached-files-preview');
        if (preview) preview.remove();

        // Create new preview
        preview = document.createElement('div');
        preview.id = 'attached-files-preview';
        preview.className = 'attached-files-preview';

        preview.innerHTML = this.attachedFiles.map((file, index) => `
            <div class="attached-file-item">
                <span class="attached-file-name">${file.name}</span>
                <button class="attached-file-remove" onclick="app.chatManager.removeAttachedFile(${index})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `).join('');

        // Insert before input area
        const inputArea = document.getElementById('input-area');
        if (inputArea) {
            inputArea.parentElement.insertBefore(preview, inputArea);
        }
    }

    removeAttachedFile(index) {
        this.attachedFiles.splice(index, 1);
        this.updateAttachedFilesUI();
    }

    showCommandTooltip(inputText) {
        const input = document.getElementById('message-input');
        if (!input) return;

        // Filter commands based on input
        const query = inputText.toLowerCase();
        const filteredCommands = this.slashCommands.filter(cmd =>
            cmd.name.toLowerCase().startsWith(query)
        );

        if (filteredCommands.length === 0) {
            this.hideCommandTooltip();
            return;
        }

        // Create or get tooltip
        let tooltip = document.getElementById('slash-command-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'slash-command-tooltip';
            tooltip.className = 'slash-command-tooltip';
            document.body.appendChild(tooltip);
        }

        // Populate tooltip
        tooltip.innerHTML = filteredCommands.map((cmd, index) => `
            <div class="command-item ${index === 0 ? 'selected' : ''}" data-index="${index}" data-command="${cmd.name}">
                <div class="command-name">${cmd.name}</div>
                <div class="command-description">${cmd.description}</div>
                <div class="command-usage">${cmd.usage}</div>
            </div>
        `).join('');

        // Add click handlers
        tooltip.querySelectorAll('.command-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const commandName = item.dataset.command;
                this.applyCommand(commandName);
            });
        });

        // Position tooltip above input
        const inputRect = input.getBoundingClientRect();
        tooltip.style.left = inputRect.left + 'px';
        tooltip.style.bottom = (window.innerHeight - inputRect.top + 8) + 'px';
        tooltip.style.display = 'block';

        this.selectedCommandIndex = 0;
        this.filteredCommands = filteredCommands;
    }

    hideCommandTooltip() {
        const tooltip = document.getElementById('slash-command-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
        this.selectedCommandIndex = -1;
        this.filteredCommands = [];
    }

    navigateCommandTooltip(direction) {
        if (!this.filteredCommands || this.filteredCommands.length === 0) return;

        const tooltip = document.getElementById('slash-command-tooltip');
        if (!tooltip) return;

        // Remove previous selection
        const prevSelected = tooltip.querySelector('.command-item.selected');
        if (prevSelected) prevSelected.classList.remove('selected');

        // Update index
        this.selectedCommandIndex += direction;
        if (this.selectedCommandIndex < 0) {
            this.selectedCommandIndex = this.filteredCommands.length - 1;
        } else if (this.selectedCommandIndex >= this.filteredCommands.length) {
            this.selectedCommandIndex = 0;
        }

        // Add new selection
        const items = tooltip.querySelectorAll('.command-item');
        if (items[this.selectedCommandIndex]) {
            items[this.selectedCommandIndex].classList.add('selected');
            items[this.selectedCommandIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    selectCommand() {
        if (!this.filteredCommands || this.selectedCommandIndex < 0) return;

        const selectedCommand = this.filteredCommands[this.selectedCommandIndex];
        if (selectedCommand) {
            this.applyCommand(selectedCommand.name);
        }
    }

    applyCommand(commandName) {
        const input = document.getElementById('message-input');
        if (!input) return;

        // Find the command to get its usage
        const command = this.slashCommands.find(cmd => cmd.name === commandName);
        if (!command) return;

        // Set input to command usage
        input.textContent = command.usage;

        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(input);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);

        this.hideCommandTooltip();
        input.focus();
    }

    async handleSlashCommand(command, channelId) {
        const parts = command.split(' ');
        const commandName = parts[0].toLowerCase();

        try {
            switch (commandName) {
                case '/help':
                    this.showCommandHelp();
                    return true;

                case '/remind':
                    return await this.handleRemindCommand(command, channelId);

                case '/clear':
                    this.clearMessages();
                    return true;

                case '/shrug':
                    await this.sendTextMessage('¯\\_(ツ)_/¯', channelId);
                    return true;

                case '/tableflip':
                    await this.sendTextMessage('(╯°□°)╯︵ ┻━┻', channelId);
                    return true;

                case '/unflip':
                    await this.sendTextMessage('┬─┬ノ( º _ ºノ)', channelId);
                    return true;

                case '/disapprove':
                    await this.sendTextMessage('ಠ_ಠ', channelId);
                    return true;

                case '/lenny':
                    await this.sendTextMessage('( ͡° ͜ʖ ͡°)', channelId);
                    return true;

                case '/away':
                    return await this.handleAwayCommand(parts.slice(1).join(' '), channelId);

                case '/back':
                    return await this.handleBackCommand(channelId);

                case '/status':
                    return await this.handleStatusCommand(parts.slice(1).join(' '), channelId);

                case '/giphy':
                    this.app.uiManager.showToast('GIF 검색 기능은 준비 중입니다.', 'info');
                    return true;

                default:
                    this.app.uiManager.showToast(`알 수 없는 명령어: ${commandName}. /help를 입력하여 도움말을 확인하세요.`, 'warning');
                    return false;
            }
        } catch (error) {
            console.error('Command execution error:', error);
            this.app.uiManager.showToast('명령어 실행에 실패했습니다.', 'error');
            return false;
        }
    }

    async handleRemindCommand(command, channelId) {
        // Parse: /remind me 10m "message"
        const pattern = /^\/remind\s+me\s+(\d+m|\d+h|\d+d|tomorrow)\s+"([^"]+)"/i;
        const match = command.match(pattern);

        if (!match) {
            this.app.uiManager.showToast('잘못된 형식입니다. 예: /remind me 10m "메시지"', 'warning');
            return false;
        }

        const timeStr = match[1].toLowerCase();
        const text = match[2];

        // Calculate remind time
        const now = new Date();
        let remindAt = new Date(now);

        if (timeStr === 'tomorrow') {
            remindAt.setDate(remindAt.getDate() + 1);
            remindAt.setHours(9, 0, 0, 0);
        } else {
            const value = parseInt(timeStr);
            const unit = timeStr[timeStr.length - 1];

            switch (unit) {
                case 'm':
                    remindAt.setMinutes(remindAt.getMinutes() + value);
                    break;
                case 'h':
                    remindAt.setHours(remindAt.getHours() + value);
                    break;
                case 'd':
                    remindAt.setDate(remindAt.getDate() + value);
                    break;
            }
        }

        try {
            const response = await this.app.apiRequest('/reminders', {
                method: 'POST',
                body: JSON.stringify({
                    text,
                    remind_at: remindAt.toISOString(),
                    channel_id: channelId
                })
            });

            if (response) {
                const timeString = remindAt.toLocaleString('ko-KR');
                this.app.uiManager.showToast(`리마인더가 설정되었습니다: ${timeString}`, 'success');
                return true;
            }
        } catch (error) {
            console.error('Failed to create reminder:', error);
            this.app.uiManager.showToast('리마인더 생성에 실패했습니다.', 'error');
        }

        return false;
    }

    async handleAwayCommand(message, channelId) {
        const statusMessage = message || '자리 비움';

        // Update user status (you would call an API here)
        this.app.uiManager.showToast(`자리 비움 상태로 설정되었습니다: ${statusMessage}`, 'info');

        // Optionally send a message to the channel
        if (message) {
            await this.sendTextMessage(`🚶 ${statusMessage}`, channelId);
        }

        return true;
    }

    async handleBackCommand(channelId) {
        // Update user status back to online (you would call an API here)
        this.app.uiManager.showToast('자리 비움이 해제되었습니다.', 'success');

        await this.sendTextMessage('🟢 돌아왔습니다', channelId);
        return true;
    }

    async handleStatusCommand(status, channelId) {
        if (!status) {
            this.app.uiManager.showToast('상태 메시지를 입력해주세요. 예: /status 회의 중', 'warning');
            return false;
        }

        this.app.uiManager.showToast(`상태가 설정되었습니다: ${status}`, 'success');
        await this.sendTextMessage(`💬 상태: ${status}`, channelId);
        return true;
    }

    showCommandHelp() {
        const helpText = `
<strong>사용 가능한 명령어:</strong><br><br>
<strong>/help</strong> - 명령어 도움말 표시<br><br>

<strong>리마인더:</strong><br>
<strong>/remind me {시간} "{메시지}"</strong> - 리마인더 설정<br>
  예: /remind me 10m "회의 준비"<br>
  시간 형식: 10m (분), 1h (시간), 2d (일), tomorrow<br><br>

<strong>유틸리티:</strong><br>
<strong>/clear</strong> - 현재 채널의 메시지 화면 지우기<br><br>

<strong>상태 관리:</strong><br>
<strong>/away [메시지]</strong> - 자리 비움 상태 설정<br>
<strong>/back</strong> - 자리 비움 해제<br>
<strong>/status {메시지}</strong> - 상태 메시지 설정<br><br>

<strong>이모티콘:</strong><br>
<strong>/shrug</strong> - ¯\\_(ツ)_/¯<br>
<strong>/tableflip</strong> - (╯°□°)╯︵ ┻━┻<br>
<strong>/unflip</strong> - ┬─┬ノ( º _ ºノ)<br>
<strong>/disapprove</strong> - ಠ_ಠ<br>
<strong>/lenny</strong> - ( ͡° ͜ʖ ͡°)
        `;

        // Create help message element
        const messageEl = document.createElement('div');
        messageEl.className = 'message system-message';
        messageEl.innerHTML = `
            <div class="message-content">
                <div class="message-bubble system">${helpText}</div>
            </div>
        `;

        const messagesList = document.getElementById('messages');
        if (messagesList) {
            messagesList.appendChild(messageEl);
            this.scrollToBottom();
        }
    }

    clearMessages() {
        const messagesList = document.getElementById('messages');
        if (messagesList) {
            messagesList.innerHTML = '';
            this.app.uiManager.showToast('메시지 화면이 지워졌습니다.', 'info');
        }
    }

    async sendTextMessage(text, channelId) {
        const messageData = {
            content: text,
            files: [],
            sender: {
                id: this.app.auth.currentUser?.id || 'guest',
                name: this.app.auth.currentUser?.name || 'Guest',
                avatar: this.app.auth.currentUser?.name?.[0] || 'G'
            }
        };

        try {
            await this.app.apiRequest(`/channels/${channelId}/messages`, {
                method: 'POST',
                body: JSON.stringify(messageData)
            });
        } catch (error) {
            console.error('Failed to send message:', error);
            this.app.uiManager.showToast('메시지 전송에 실패했습니다.', 'error');
        }
    }

    openFilePreview(url, name) {
        // Open file in browser or download
        const fullUrl = `${this.app.apiBase}${url}`;

        // Try to open in new window
        const newWindow = window.open(fullUrl, '_blank');

        // If popup blocked, offer download
        if (!newWindow) {
            const link = document.createElement('a');
            link.href = fullUrl;
            link.download = name;
            link.click();
        }
    }

    async openThread(messageId) {
        try {
            // Find the original message
            const channelId = this.app.serverManager.currentChannel?.id;
            if (!channelId) return;

            const messages = this.messages[channelId] || [];
            const originalMessage = messages.find(m => m.id === messageId);

            if (!originalMessage) {
                console.error('Original message not found');
                return;
            }

            // Store current thread
            this.currentThreadMessage = originalMessage;

            // Show thread panel
            const threadPanel = document.getElementById('thread-panel');
            const threadResizer = document.getElementById('thread-resizer');

            if (threadPanel) {
                threadPanel.style.display = 'flex';
                if (threadResizer) threadResizer.style.display = 'block';

                // Render original message
                this.renderThreadOriginalMessage(originalMessage);

                // Load and render replies
                await this.loadThreadReplies(messageId);
            }
        } catch (error) {
            console.error('Failed to open thread:', error);
            this.app.uiManager.showToast('스레드를 열 수 없습니다.', 'error');
        }
    }

    renderThreadOriginalMessage(msg) {
        const container = document.getElementById('thread-original-message');
        if (!container) return;

        container.innerHTML = `
            <div class="message">
                <div class="avatar">${msg.sender.avatar}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">${msg.sender.name}</span>
                        <span class="message-time">${msg.time}</span>
                    </div>
                    <div class="message-bubble">${this.formatMessage(msg.content)}</div>
                    ${this.renderAttachments(msg.files || [])}
                </div>
            </div>
        `;
    }

    async loadThreadReplies(messageId) {
        try {
            const response = await this.app.apiRequest(`/messages/${messageId}/replies`);

            if (response && Array.isArray(response)) {
                const normalizedReplies = response.map(msg => this.normalizeMessage(msg));

                // Update reply count display
                const replyCountEl = document.getElementById('thread-reply-count');
                if (replyCountEl) {
                    replyCountEl.textContent = `${normalizedReplies.length}개의 답글`;
                }

                // Render replies
                this.renderThreadReplies(normalizedReplies);
            }
        } catch (error) {
            console.error('Failed to load thread replies:', error);
            this.app.uiManager.showToast('답글을 불러올 수 없습니다.', 'error');
        }
    }

    renderThreadReplies(replies) {
        const container = document.getElementById('thread-messages');
        if (!container) return;

        container.innerHTML = '';

        replies.forEach(reply => {
            const el = document.createElement('div');
            el.className = `message${reply.sent ? ' sent' : ''}`;
            el.dataset.messageId = reply.id;

            el.innerHTML = `
                <div class="avatar">${reply.sender.avatar}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">${reply.sender.name}</span>
                        <span class="message-time">${reply.time}</span>
                    </div>
                    <div class="message-bubble">${this.formatMessage(reply.content)}</div>
                    ${this.renderAttachments(reply.files || [])}
                    ${this.renderReactions(reply)}
                </div>
            `;

            // Add reaction hover effect
            const messageContent = el.querySelector('.message-content');
            if (messageContent) {
                messageContent.addEventListener('mouseenter', () => {
                    this.showReactionButton(el, reply);
                });
                messageContent.addEventListener('mouseleave', () => {
                    this.hideReactionButton(el);
                });
            }

            container.appendChild(el);
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    async sendThreadReply() {
        const input = document.getElementById('thread-input');
        if (!input || !input.value.trim()) return;

        if (!this.currentThreadMessage) {
            console.error('No thread message set');
            return;
        }

        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return;

        const messageData = {
            content: input.value.trim(),
            files: [],
            thread_id: this.currentThreadMessage.id,
            sender: {
                id: this.app.auth.currentUser?.id || 'guest',
                name: this.app.auth.currentUser?.name || 'Guest',
                avatar: this.app.auth.currentUser?.name?.[0] || 'G'
            }
        };

        try {
            const response = await this.app.apiRequest(`/channels/${channelId}/messages`, {
                method: 'POST',
                body: JSON.stringify(messageData)
            });

            if (response) {
                input.value = '';

                // Reload thread replies
                await this.loadThreadReplies(this.currentThreadMessage.id);

                // Update reply count in main message
                const mainMessage = this.messages[channelId]?.find(m => m.id === this.currentThreadMessage.id);
                if (mainMessage) {
                    mainMessage.reply_count = (mainMessage.reply_count || 0) + 1;
                    mainMessage.replyCount = mainMessage.reply_count;

                    // Update UI
                    const messageEl = document.querySelector(`[data-message-id="${this.currentThreadMessage.id}"]`);
                    if (messageEl) {
                        const threadActions = messageEl.querySelector('.message-thread-actions');
                        if (threadActions) {
                            threadActions.outerHTML = this.renderThreadInfo(mainMessage);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to send thread reply:', error);
            this.app.uiManager.showToast('답글 전송에 실패했습니다.', 'error');
        }
    }

    closeThread() {
        const threadPanel = document.getElementById('thread-panel');
        const threadResizer = document.getElementById('thread-resizer');

        if (threadPanel) threadPanel.style.display = 'none';
        if (threadResizer) threadResizer.style.display = 'none';

        this.currentThreadMessage = null;

        // Clear thread content
        const container = document.getElementById('thread-messages');
        if (container) container.innerHTML = '';

        const originalMsgContainer = document.getElementById('thread-original-message');
        if (originalMsgContainer) originalMsgContainer.innerHTML = '';
    }
}
