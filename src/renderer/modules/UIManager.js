export class UIManager {
    constructor(app) {
        this.app = app;
        this.currentTheme = 'dark';
    }

    init() {
        this.loadTheme();
        this.updateThemeButton();
        this.setupResizers();
        this.bindGlobalUIEvents();
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.currentTheme = savedTheme;
            this.applyTheme(savedTheme);
        } else {
            // 시스템 테마 감지
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                this.currentTheme = 'light';
                this.applyTheme('light');
            } else {
                this.currentTheme = 'dark';
                this.applyTheme('dark');
            }
        }
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        localStorage.setItem('theme', theme);
        this.updateThemeButton();
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
    }

    updateThemeButton() {
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            btn.textContent = this.currentTheme === 'dark' ? '🌙' : '☀';
            btn.title = this.currentTheme === 'dark' ? '다크 모드 (클릭하여 라이트 모드로)' : '라이트 모드 (클릭하여 다크 모드로)';
        }
    }

    setupResizers() {
        this.setupResizer('sidebar-resizer', 'sidebar', 'horizontal', 240, 180, 400);
        this.setupResizer('members-resizer', 'members-panel', 'horizontal-reverse', 240, 180, 400); // vertical direction logic might need adjustment if using flex
        this.setupResizer('thread-resizer', 'thread-panel', 'horizontal-reverse', 300, 250, 500);
        this.setupResizer('input-resizer', 'input-area', 'vertical-reverse', 120, 80, 400);
    }

    setupResizer(resizerId, targetId, direction, defaultSize, minSize, maxSize) {
        const resizer = document.getElementById(resizerId);
        const target = document.getElementById(targetId);

        if (!resizer || !target) return;

        let startX, startY, startWidth, startHeight;

        const onMouseDown = (e) => {
            startX = e.clientX;
            startY = e.clientY;
            const rect = target.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.classList.add('resizing');
        };

        const onMouseMove = (e) => {
            if (direction === 'horizontal') {
                const dx = e.clientX - startX;
                const newWidth = Math.min(Math.max(startWidth + dx, minSize), maxSize);
                target.style.width = `${newWidth}px`;
            } else if (direction === 'horizontal-reverse') {
                const dx = startX - e.clientX; // Reverse for right-side panels
                const newWidth = Math.min(Math.max(startWidth + dx, minSize), maxSize);
                target.style.width = `${newWidth}px`;
            } else if (direction === 'vertical') {
                const dy = e.clientY - startY;
                const newHeight = Math.min(Math.max(startHeight + dy, minSize), maxSize);
                target.style.height = `${newHeight}px`;
            } else if (direction === 'vertical-reverse') {
                const dy = startY - e.clientY;
                const newHeight = Math.min(Math.max(startHeight + dy, minSize), maxSize);
                target.style.height = `${newHeight}px`;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove('resizing');
        };

        resizer.addEventListener('mousedown', onMouseDown);
    }

    bindGlobalUIEvents() {
        // 타이틀바 버튼
        const btnMinimize = document.getElementById('btn-minimize');
        const btnMaximize = document.getElementById('btn-maximize');
        const btnClose = document.getElementById('btn-close');

        if (window.electronAPI) {
            btnMinimize?.addEventListener('click', () => window.electronAPI.minimizeWindow());
            btnMaximize?.addEventListener('click', () => window.electronAPI.maximizeWindow());
            btnClose?.addEventListener('click', () => window.electronAPI.closeWindow());
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    showInputDialog(message, defaultValue = '') {
        return new Promise((resolve) => {
            const overlay = document.getElementById('input-dialog-overlay');
            const messageEl = document.getElementById('input-dialog-message');
            const input = document.getElementById('input-dialog-input');

            // If elements don't exist (not in HTML yet), create them dynamically or assume they exist
            // For this refactor, we assume HTML has them or we skip if not found.
            // Based on app.js viewing, they seem to exist or logic expects them.

            if (!overlay) {
                // Fallback to prompt
                const result = prompt(message, defaultValue);
                resolve(result);
                return;
            }

            messageEl.textContent = message;
            input.value = defaultValue;
            overlay.style.display = 'flex';
            input.focus();
            input.select();

            this.inputDialogCallback = (result) => {
                overlay.style.display = 'none';
                this.inputDialogCallback = null;
                resolve(result);
            };
        });
    }

    confirmInputDialog() {
        const input = document.getElementById('input-dialog-input');
        if (this.inputDialogCallback) {
            this.inputDialogCallback(input.value);
        }
    }

    closeInputDialog() {
        if (this.inputDialogCallback) {
            this.inputDialogCallback(null);
        }
    }
}
