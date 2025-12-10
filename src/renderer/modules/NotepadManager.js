/**
 * NotepadManager - Real-time collaborative notepad (Notion-like)
 */
export class NotepadManager {
    constructor(app) {
        this.app = app;
        this.editor = null;
        this.currentContent = '';
        this.syncTimeout = null;
        this.lastSyncedContent = '';
        this.isRemoteUpdate = false;
        this.isInitialized = false;

        // 버튼 이벤트는 DOM 로드 후 바로 바인딩
        this.bindButtonEvents();
    }

    initialize() {
        if (this.isInitialized) return;

        this.editor = document.getElementById('notepad-editor');
        if (!this.editor) {
            console.error('[NotepadManager] Editor not found');
            return;
        }

        this.bindEditorEvents();
        this.bindSocketEvents();
        this.isInitialized = true;
        console.log('[NotepadManager] Initialized');
    }

    bindButtonEvents() {
        // 생성자에서 호출됨 - DOM 로드 후 버튼 이벤트 바인딩
        setTimeout(() => {
            // Open button
            document.getElementById('btn-notepad')?.addEventListener('click', () => {
                this.open();
            });

            // Close button
            document.getElementById('close-notepad')?.addEventListener('click', () => {
                this.close();
            });

            console.log('[NotepadManager] Button events bound');
        }, 100);
    }

    bindEditorEvents() {
        // Editor input
        this.editor.addEventListener('input', () => {
            if (this.isRemoteUpdate) return;

            this.currentContent = this.editor.innerHTML;

            // Debounce sync
            if (this.syncTimeout) clearTimeout(this.syncTimeout);
            this.syncTimeout = setTimeout(() => {
                this.syncContent();
            }, 300);
        });

        // Formatting buttons
        document.getElementById('np-bold')?.addEventListener('click', () => this.format('bold'));
        document.getElementById('np-italic')?.addEventListener('click', () => this.format('italic'));
        document.getElementById('np-underline')?.addEventListener('click', () => this.format('underline'));
        document.getElementById('np-strike')?.addEventListener('click', () => this.format('strikeThrough'));
        document.getElementById('np-h1')?.addEventListener('click', () => this.formatBlock('h1'));
        document.getElementById('np-h2')?.addEventListener('click', () => this.formatBlock('h2'));
        document.getElementById('np-ul')?.addEventListener('click', () => this.format('insertUnorderedList'));
        document.getElementById('np-ol')?.addEventListener('click', () => this.format('insertOrderedList'));
        document.getElementById('np-code')?.addEventListener('click', () => this.insertCode());
        document.getElementById('np-link')?.addEventListener('click', () => this.insertLink());
        document.getElementById('np-clear')?.addEventListener('click', () => this.clearContent());
    }

    bindSocketEvents() {
        if (window.electronAPI && window.electronAPI.onSocketEvent) {
            window.electronAPI.onSocketEvent('notepad_update', (data) => {
                this.handleRemoteUpdate(data);
            });

            window.electronAPI.onSocketEvent('notepad_content', (data) => {
                this.handleContentLoad(data);
            });
        } else {
            setTimeout(() => this.bindSocketEvents(), 1000);
        }
    }

    format(command) {
        document.execCommand(command, false, null);
        this.editor.focus();
    }

    formatBlock(tag) {
        document.execCommand('formatBlock', false, tag);
        this.editor.focus();
    }

    insertCode() {
        const selection = window.getSelection();
        const text = selection.toString() || 'code';
        document.execCommand('insertHTML', false, `<code class="inline-code">${text}</code>`);
    }

    insertLink() {
        const url = prompt('링크 URL을 입력하세요:', 'https://');
        if (url) {
            document.execCommand('createLink', false, url);
        }
    }

    clearContent() {
        if (confirm('메모장 내용을 모두 지우시겠습니까?')) {
            this.editor.innerHTML = '';
            this.syncContent();
        }
    }

    syncContent() {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return;

        const content = this.editor.innerHTML;
        if (content === this.lastSyncedContent) return;

        this.lastSyncedContent = content;

        this.app.socketManager.emit('notepad_update', {
            channelId: channelId,
            content: content,
            cursor: this.getCursorPosition()
        });
    }

    handleRemoteUpdate(data) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.channelId !== channelId) return;

        if (data.content === this.editor.innerHTML) return;

        this.isRemoteUpdate = true;

        // Save cursor position
        const cursorPos = this.getCursorPosition();

        // Update content
        this.editor.innerHTML = data.content;
        this.lastSyncedContent = data.content;

        // Restore cursor
        this.setCursorPosition(cursorPos);

        this.isRemoteUpdate = false;
    }

    handleContentLoad(data) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.channelId !== channelId) return;

        this.isRemoteUpdate = true;
        this.editor.innerHTML = data.content || '';
        this.lastSyncedContent = data.content || '';
        this.isRemoteUpdate = false;
    }

    getCursorPosition() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return 0;

        const range = selection.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(this.editor);
        preRange.setEnd(range.startContainer, range.startOffset);
        return preRange.toString().length;
    }

    setCursorPosition(pos) {
        try {
            const selection = window.getSelection();
            const range = document.createRange();

            let currentPos = 0;
            let found = false;

            const walk = (node) => {
                if (found) return;

                if (node.nodeType === Node.TEXT_NODE) {
                    if (currentPos + node.length >= pos) {
                        range.setStart(node, pos - currentPos);
                        range.collapse(true);
                        found = true;
                    } else {
                        currentPos += node.length;
                    }
                } else {
                    for (const child of node.childNodes) {
                        walk(child);
                        if (found) break;
                    }
                }
            };

            walk(this.editor);

            if (found) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } catch (e) {
            // Ignore cursor restoration errors
        }
    }

    open() {
        const modal = document.getElementById('notepad-modal');
        if (modal) {
            modal.style.display = 'flex';
            if (!this.isInitialized) {
                this.initialize();
            }

            // Request current content
            const channelId = this.app.serverManager.currentChannel?.id;
            if (channelId) {
                this.app.socketManager.emit('notepad_join', { channelId });
            }
        }
    }

    close() {
        const modal = document.getElementById('notepad-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}
