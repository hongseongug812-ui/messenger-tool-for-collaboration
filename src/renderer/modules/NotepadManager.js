/**
 * NotepadManager - Notion-style Block Editor
 * - "/" 명령어로 블록 타입 변경
 * - 블록 단위 편집
 * - 실시간 협업
 */
export class NotepadManager {
    constructor(app) {
        this.app = app;
        this.blocks = [];
        this.currentBlockId = null;
        this.syncTimeout = null;
        this.isRemoteUpdate = false;
        this.isInitialized = false;
        this.slashMenuVisible = false;
        this.slashMenuBlockId = null;
        this.isFullscreen = false;

        // 버튼 이벤트는 DOM 로드 후 바로 바인딩
        this.bindButtonEvents();
    }

    initialize() {
        if (this.isInitialized) return;

        this.blocksContainer = document.getElementById('notion-blocks');
        this.slashMenu = document.getElementById('slash-menu');
        this.addBlockBtn = document.getElementById('add-block-btn');

        if (!this.blocksContainer) {
            console.error('[NotepadManager] Blocks container not found');
            return;
        }

        this.bindEditorEvents();
        this.bindSocketEvents();

        // 첫 번째 빈 블록 추가
        if (this.blocks.length === 0) {
            this.addBlock('text');
        }

        this.isInitialized = true;
        console.log('[NotepadManager] Notion-style editor initialized');
    }

    bindButtonEvents() {
        setTimeout(() => {
            document.getElementById('btn-notepad')?.addEventListener('click', () => {
                this.open();
            });

            document.getElementById('close-notepad')?.addEventListener('click', () => {
                this.close();
            });

            document.getElementById('btn-notepad-fullscreen')?.addEventListener('click', () => {
                this.toggleFullscreen();
            });

            console.log('[NotepadManager] Button events bound');
        }, 100);
    }

    bindEditorEvents() {
        // 새 블록 추가 버튼
        this.addBlockBtn?.addEventListener('click', () => {
            this.addBlock('text');
        });

        // 슬래시 메뉴 아이템 클릭
        document.querySelectorAll('.slash-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                this.applyBlockType(type);
            });
        });

        // 전역 클릭으로 슬래시 메뉴 닫기
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.notion-slash-menu') && !e.target.closest('.notion-block')) {
                this.hideSlashMenu();
            }
        });

        // ESC 키로 슬래시 메뉴 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSlashMenu();
            }
        });
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

    generateId() {
        return 'block_' + Math.random().toString(36).substr(2, 9);
    }

    addBlock(type, afterBlockId = null, content = '') {
        const blockId = this.generateId();
        const block = {
            id: blockId,
            type: type,
            content: content,
            checked: false // for todo
        };

        // 삽입 위치 결정
        if (afterBlockId) {
            const index = this.blocks.findIndex(b => b.id === afterBlockId);
            this.blocks.splice(index + 1, 0, block);
        } else {
            this.blocks.push(block);
        }

        this.renderBlocks();
        this.focusBlock(blockId);
        this.hideSlashMenu();

        return blockId;
    }

    renderBlocks() {
        this.blocksContainer.innerHTML = '';

        this.blocks.forEach((block, index) => {
            const blockEl = this.createBlockElement(block, index);
            this.blocksContainer.appendChild(blockEl);
        });

        // 힌트 표시/숨김
        const hint = document.getElementById('notion-hint');
        if (hint) {
            hint.style.display = this.blocks.length <= 1 && !this.blocks[0]?.content ? 'block' : 'none';
        }
    }

    createBlockElement(block, index) {
        const wrapper = document.createElement('div');
        wrapper.className = `notion-block notion-block-${block.type}`;
        wrapper.dataset.blockId = block.id;

        // 드래그 핸들
        const handle = document.createElement('div');
        handle.className = 'block-handle';
        handle.innerHTML = '⋮⋮';
        handle.title = '드래그하여 이동';

        // 블록 콘텐츠
        let contentEl;

        switch (block.type) {
            case 'h1':
                contentEl = document.createElement('h1');
                contentEl.className = 'block-content';
                break;
            case 'h2':
                contentEl = document.createElement('h2');
                contentEl.className = 'block-content';
                break;
            case 'h3':
                contentEl = document.createElement('h3');
                contentEl.className = 'block-content';
                break;
            case 'bullet':
                contentEl = document.createElement('div');
                contentEl.className = 'block-content block-bullet';
                break;
            case 'numbered':
                contentEl = document.createElement('div');
                contentEl.className = 'block-content block-numbered';
                contentEl.dataset.number = this.getNumberedIndex(index);
                break;
            case 'todo':
                contentEl = this.createTodoBlock(block);
                break;
            case 'code':
                contentEl = document.createElement('pre');
                contentEl.className = 'block-content block-code';
                break;
            case 'quote':
                contentEl = document.createElement('blockquote');
                contentEl.className = 'block-content block-quote';
                break;
            case 'divider':
                contentEl = document.createElement('hr');
                contentEl.className = 'block-divider';
                wrapper.appendChild(handle);
                wrapper.appendChild(contentEl);
                return wrapper;
            case 'callout':
                contentEl = document.createElement('div');
                contentEl.className = 'block-content block-callout';
                break;
            default: // text
                contentEl = document.createElement('div');
                contentEl.className = 'block-content';
        }

        if (block.type !== 'todo') {
            contentEl.contentEditable = 'true';
            contentEl.innerHTML = block.content || '';
            contentEl.dataset.placeholder = this.getPlaceholder(block.type);
        }

        this.bindBlockEvents(contentEl, block);

        wrapper.appendChild(handle);
        wrapper.appendChild(contentEl);

        return wrapper;
    }

    createTodoBlock(block) {
        const container = document.createElement('div');
        container.className = 'block-content block-todo';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = block.checked;
        checkbox.addEventListener('change', () => {
            block.checked = checkbox.checked;
            textEl.classList.toggle('completed', block.checked);
            this.syncContent();
        });

        const textEl = document.createElement('span');
        textEl.contentEditable = 'true';
        textEl.className = 'todo-text' + (block.checked ? ' completed' : '');
        textEl.innerHTML = block.content || '';
        textEl.dataset.placeholder = '할 일 입력...';

        this.bindBlockEvents(textEl, block);

        container.appendChild(checkbox);
        container.appendChild(textEl);

        return container;
    }

    getPlaceholder(type) {
        const placeholders = {
            text: "'/'를 입력하여 명령어 사용...",
            h1: '제목 1',
            h2: '제목 2',
            h3: '제목 3',
            bullet: '목록 항목...',
            numbered: '목록 항목...',
            code: '코드 입력...',
            quote: '인용구...',
            callout: '콜아웃 내용...'
        };
        return placeholders[type] || '';
    }

    getNumberedIndex(index) {
        let count = 1;
        for (let i = 0; i < index; i++) {
            if (this.blocks[i].type === 'numbered') count++;
        }
        return count;
    }

    bindBlockEvents(contentEl, block) {
        // Input 이벤트
        contentEl.addEventListener('input', () => {
            if (this.isRemoteUpdate) return;

            const text = contentEl.innerText;
            block.content = contentEl.innerHTML;

            // "/" 입력 감지
            if (text.endsWith('/')) {
                this.showSlashMenu(block.id, contentEl);
            } else {
                this.hideSlashMenu();
            }

            // 디바운스 동기화
            if (this.syncTimeout) clearTimeout(this.syncTimeout);
            this.syncTimeout = setTimeout(() => this.syncContent(), 300);
        });

        // 키보드 이벤트
        contentEl.addEventListener('keydown', (e) => {
            this.handleKeyDown(e, block, contentEl);
        });

        // 포커스 이벤트
        contentEl.addEventListener('focus', () => {
            this.currentBlockId = block.id;
        });
    }

    handleKeyDown(e, block, contentEl) {
        // Enter: 새 블록 생성
        if (e.key === 'Enter' && !e.shiftKey) {
            if (this.slashMenuVisible) {
                e.preventDefault();
                // 선택된 메뉴 아이템 실행
                const selectedItem = this.slashMenu.querySelector('.slash-menu-item.selected') ||
                    this.slashMenu.querySelector('.slash-menu-item');
                if (selectedItem) {
                    this.applyBlockType(selectedItem.dataset.type);
                }
                return;
            }

            // 구분선은 Enter 무시
            if (block.type === 'divider') return;

            e.preventDefault();
            this.addBlock('text', block.id);
        }

        // Backspace: 빈 블록이면 삭제
        if (e.key === 'Backspace' && contentEl.innerText === '' && this.blocks.length > 1) {
            e.preventDefault();
            const index = this.blocks.findIndex(b => b.id === block.id);
            if (index > 0) {
                this.blocks.splice(index, 1);
                this.renderBlocks();
                this.focusBlock(this.blocks[index - 1].id, true);
                this.syncContent();
            }
        }

        // Arrow Up/Down: 슬래시 메뉴 네비게이션
        if (this.slashMenuVisible) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateSlashMenu(e.key === 'ArrowDown' ? 1 : -1);
            }
        }
    }

    showSlashMenu(blockId, contentEl) {
        this.slashMenuBlockId = blockId;
        this.slashMenuVisible = true;

        const rect = contentEl.getBoundingClientRect();
        const modal = document.querySelector('.notion-notepad-modal');
        const modalRect = modal.getBoundingClientRect();

        this.slashMenu.style.display = 'block';
        this.slashMenu.style.top = (rect.bottom - modalRect.top + 5) + 'px';
        this.slashMenu.style.left = (rect.left - modalRect.left) + 'px';

        // 첫 번째 아이템 선택
        this.slashMenu.querySelectorAll('.slash-menu-item').forEach((item, i) => {
            item.classList.toggle('selected', i === 0);
        });
    }

    hideSlashMenu() {
        this.slashMenuVisible = false;
        this.slashMenuBlockId = null;
        if (this.slashMenu) {
            this.slashMenu.style.display = 'none';
        }
    }

    navigateSlashMenu(direction) {
        const items = Array.from(this.slashMenu.querySelectorAll('.slash-menu-item'));
        const currentIndex = items.findIndex(item => item.classList.contains('selected'));
        let newIndex = currentIndex + direction;

        if (newIndex < 0) newIndex = items.length - 1;
        if (newIndex >= items.length) newIndex = 0;

        items.forEach((item, i) => {
            item.classList.toggle('selected', i === newIndex);
        });

        items[newIndex].scrollIntoView({ block: 'nearest' });
    }

    applyBlockType(type) {
        if (!this.slashMenuBlockId) return;

        const block = this.blocks.find(b => b.id === this.slashMenuBlockId);
        if (!block) return;

        // "/" 제거
        const blockEl = document.querySelector(`[data-block-id="${block.id}"] .block-content, [data-block-id="${block.id}"] .todo-text`);
        if (blockEl) {
            const text = blockEl.innerText;
            if (text.endsWith('/')) {
                block.content = text.slice(0, -1);
            }
        }

        block.type = type;

        this.hideSlashMenu();
        this.renderBlocks();
        this.focusBlock(block.id);
        this.syncContent();
    }

    focusBlock(blockId, atEnd = false) {
        setTimeout(() => {
            const blockEl = document.querySelector(`[data-block-id="${blockId}"] .block-content, [data-block-id="${blockId}"] .todo-text`);
            if (blockEl && blockEl.contentEditable === 'true') {
                blockEl.focus();

                if (atEnd && blockEl.innerText.length > 0) {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(blockEl);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }, 10);
    }

    syncContent() {
        const serverId = this.app.serverManager.currentServer?.id;
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!serverId || !channelId) return;

        const title = document.getElementById('notepad-title')?.value || '';

        this.app.socketManager.emit('notepad_update', {
            serverId: serverId,
            channelId: channelId,
            content: JSON.stringify({
                title: title,
                blocks: this.blocks
            })
        });
    }

    handleRemoteUpdate(data) {
        const serverId = this.app.serverManager.currentServer?.id;
        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.serverId !== serverId || data.channelId !== channelId) return;

        try {
            const content = JSON.parse(data.content);
            this.isRemoteUpdate = true;

            const titleEl = document.getElementById('notepad-title');
            if (titleEl && content.title) {
                titleEl.value = content.title;
            }

            if (content.blocks) {
                this.blocks = content.blocks;
                this.renderBlocks();
            }

            this.isRemoteUpdate = false;
        } catch (e) {
            console.error('[NotepadManager] Failed to parse remote update:', e);
        }
    }

    handleContentLoad(data) {
        const serverId = this.app.serverManager.currentServer?.id;
        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.serverId !== serverId || data.channelId !== channelId) return;

        try {
            this.isRemoteUpdate = true;

            if (data.content) {
                const content = JSON.parse(data.content);

                const titleEl = document.getElementById('notepad-title');
                if (titleEl && content.title) {
                    titleEl.value = content.title;
                }

                if (content.blocks && content.blocks.length > 0) {
                    this.blocks = content.blocks;
                } else {
                    this.blocks = [{ id: this.generateId(), type: 'text', content: '' }];
                }
            } else {
                this.blocks = [{ id: this.generateId(), type: 'text', content: '' }];
            }

            this.renderBlocks();
            this.isRemoteUpdate = false;
        } catch (e) {
            console.error('[NotepadManager] Failed to load content:', e);
            this.blocks = [{ id: this.generateId(), type: 'text', content: '' }];
            this.renderBlocks();
            this.isRemoteUpdate = false;
        }
    }

    open() {
        const modal = document.getElementById('notepad-modal');
        if (modal) {
            modal.style.display = 'flex';
            if (!this.isInitialized) {
                this.initialize();
            }

            // 콘텐츠 요청
            const serverId = this.app.serverManager.currentServer?.id;
            const channelId = this.app.serverManager.currentChannel?.id;
            if (serverId && channelId) {
                this.app.socketManager.emit('notepad_join', { serverId, channelId });
            }
        }
    }

    close() {
        const modal = document.getElementById('notepad-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.hideSlashMenu();
    }
}
