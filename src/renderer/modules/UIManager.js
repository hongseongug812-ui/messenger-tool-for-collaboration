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
        this.bindAllModalCloseButtons();
    }

    bindAllModalCloseButtons() {
        // 모든 modal-close 버튼에 이벤트 리스너 추가
        const closeButtons = document.querySelectorAll('.modal-close');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // 이벤트 버블링 방지
                // 가장 가까운 modal-overlay 찾기
                const modalOverlay = btn.closest('.modal-overlay');
                if (modalOverlay) {
                    modalOverlay.style.display = 'none';
                }
            });
        });

        // 모달 오버레이 클릭시 닫기 (배경 클릭)
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.style.display = 'none';
                }
            });
        });
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

        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => this.toggleTheme());
        }

        // 채팅 헤더 버튼들
        this.bindChatHeaderButtons();

        // 네비게이션 버튼들
        this.bindNavigationButtons();
    }

    bindChatHeaderButtons() {
        // 참여자 보기
        const btnToggleMembers = document.getElementById('btn-toggle-members');
        btnToggleMembers?.addEventListener('click', () => {
            this.toggleMembersList();
        });

        const toggleMembersPanel = document.getElementById('toggle-members-panel');
        toggleMembersPanel?.addEventListener('click', () => {
            this.toggleMembersList();
        });

        // 화면 공유
        const btnScreenShare = document.getElementById('btn-screen-share');
        btnScreenShare?.addEventListener('click', () => {
            this.showModal('screen-share-modal');
        });

        // 화이트보드
        const btnWhiteboard = document.getElementById('btn-whiteboard');
        btnWhiteboard?.addEventListener('click', () => {
            this.showModal('whiteboard-modal');
            this.initWhiteboard();
        });

        // 메시지 다운로드
        const btnDownload = document.getElementById('btn-download-messages');
        btnDownload?.addEventListener('click', () => {
            this.downloadMessages();
        });

        // 화면 공유 모달 닫기
        const closeScreenShare = document.getElementById('close-screen-share');
        closeScreenShare?.addEventListener('click', () => {
            this.hideModal('screen-share-modal');
        });

        // 화이트보드 모달 닫기
        const closeWhiteboard = document.getElementById('close-whiteboard');
        closeWhiteboard?.addEventListener('click', () => {
            this.hideModal('whiteboard-modal');
        });
    }

    initWhiteboard() {
        if (this.whiteboardInitialized) return;

        const canvas = document.getElementById('whiteboard-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Set canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        let isDrawing = false;
        let currentTool = 'pen';
        let currentColor = '#000000';
        let lineWidth = 2;

        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTool = btn.id.replace('wb-', '');
            });
        });

        // Color picker
        const colorPicker = document.getElementById('wb-color');
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                currentColor = e.target.value;
            });
        }

        // Line width
        const widthSlider = document.getElementById('wb-width');
        if (widthSlider) {
            widthSlider.addEventListener('input', (e) => {
                lineWidth = parseInt(e.target.value);
            });
        }

        // Clear button
        const clearBtn = document.getElementById('wb-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            });
        }

        // Drawing
        let lastX = 0;
        let lastY = 0;

        canvas.addEventListener('mousedown', (e) => {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            lastX = e.clientX - rect.left;
            lastY = e.clientY - rect.top;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
            ctx.lineWidth = currentTool === 'eraser' ? lineWidth * 3 : lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();

            lastX = x;
            lastY = y;
        });

        canvas.addEventListener('mouseup', () => {
            isDrawing = false;
        });

        canvas.addEventListener('mouseleave', () => {
            isDrawing = false;
        });

        this.whiteboardInitialized = true;
    }

    bindNavigationButtons() {
        // 일정 관리
        const btnCalendar = document.getElementById('btn-calendar');
        btnCalendar?.addEventListener('click', () => {
            this.showModal('calendar-modal');
            this.initCalendar();
        });

        // 일정 모달 닫기
        const closeCalendar = document.getElementById('close-calendar');
        closeCalendar?.addEventListener('click', () => {
            this.hideModal('calendar-modal');
        });

        // 일정 추가
        const btnAddEvent = document.getElementById('btn-add-event');
        btnAddEvent?.addEventListener('click', () => {
            this.showModal('add-event-modal');
        });

        // 일정 추가 폼
        const addEventForm = document.getElementById('add-event-form');
        addEventForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createCalendarEvent(e);
        });

        // 일정 추가 모달 닫기
        const closeAddEvent = document.getElementById('close-add-event');
        closeAddEvent?.addEventListener('click', () => {
            this.hideModal('add-event-modal');
        });
    }

    initCalendar() {
        if (this.calendarInitialized) return;

        // Initialize calendar with current month
        this.currentCalendarDate = new Date();
        this.calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');

        this.renderCalendar();
        this.calendarInitialized = true;
    }

    renderCalendar() {
        const daysContainer = document.getElementById('calendar-days');
        if (!daysContainer) return;

        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();

        // Update month/year display
        const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
        const currentMonth = document.getElementById('current-month');
        if (currentMonth) {
            currentMonth.textContent = `${year}년 ${monthNames[month]}`;
        }

        // Get first day and last date
        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        // Clear and render days
        daysContainer.innerHTML = '';

        // Empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            daysContainer.appendChild(emptyDay);
        }

        // Render days
        for (let day = 1; day <= lastDate; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;

            // Highlight today
            const today = new Date();
            if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
                dayEl.classList.add('today');
            }

            // Check for events
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasEvent = this.calendarEvents.some(e => e.date === dateStr);
            if (hasEvent) {
                dayEl.classList.add('has-event');
            }

            daysContainer.appendChild(dayEl);
        }

        // Month navigation
        const prevMonth = document.getElementById('prev-month');
        const nextMonth = document.getElementById('next-month');

        if (prevMonth && !prevMonth.dataset.bound) {
            prevMonth.dataset.bound = 'true';
            prevMonth.addEventListener('click', () => {
                this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
                this.renderCalendar();
            });
        }

        if (nextMonth && !nextMonth.dataset.bound) {
            nextMonth.dataset.bound = 'true';
            nextMonth.addEventListener('click', () => {
                this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
                this.renderCalendar();
            });
        }

        this.renderEventsList();
    }

    renderEventsList() {
        const eventsListContainer = document.getElementById('events-list');
        if (!eventsListContainer) return;

        eventsListContainer.innerHTML = '';

        if (this.calendarEvents.length === 0) {
            eventsListContainer.innerHTML = '<div style="color: var(--text-secondary); padding: 16px; text-align: center;">등록된 일정이 없습니다.</div>';
            return;
        }

        this.calendarEvents.forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'event-item';
            eventEl.innerHTML = `
                <div class="event-date">${event.date}</div>
                <div class="event-title">${event.title}</div>
                <div class="event-time">${event.time || ''}</div>
            `;
            eventsListContainer.appendChild(eventEl);
        });
    }

    createCalendarEvent(e) {
        const titleInput = document.getElementById('event-title');
        const dateInput = document.getElementById('event-date');
        const timeInput = document.getElementById('event-time');

        if (!titleInput || !dateInput) return;

        const event = {
            id: Date.now().toString(),
            title: titleInput.value.trim(),
            date: dateInput.value,
            time: timeInput?.value || ''
        };

        if (!event.title || !event.date) {
            alert('제목과 날짜를 입력해주세요.');
            return;
        }

        this.calendarEvents.push(event);
        localStorage.setItem('calendarEvents', JSON.stringify(this.calendarEvents));

        // Reset form
        titleInput.value = '';
        dateInput.value = '';
        if (timeInput) timeInput.value = '';

        this.hideModal('add-event-modal');
        this.renderCalendar();
    }

    downloadMessages() {
        const channel = this.app.serverManager?.currentChannel;
        if (!channel) {
            alert('다운로드할 채널을 선택해주세요.');
            return;
        }

        const messages = this.app.chatManager?.messages[channel.id] || [];
        if (messages.length === 0) {
            alert('다운로드할 메시지가 없습니다.');
            return;
        }

        // Create CSV content
        let csv = 'Time,Sender,Content\n';
        messages.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleString('ko-KR');
            const sender = msg.sender?.name || 'Unknown';
            const content = (msg.content || '').replace(/"/g, '""'); // Escape quotes
            csv += `"${time}","${sender}","${content}"\n`;
        });

        // Download as file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${channel.name}_messages_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

    toggleMembersList() {
        const membersPanel = document.getElementById('members-panel');
        if (!membersPanel) return;

        const isVisible = membersPanel.style.display !== 'none';
        membersPanel.style.display = isVisible ? 'none' : 'flex';
    }

    toggleThreadPanel() {
        const threadPanel = document.getElementById('thread-panel');
        if (!threadPanel) return;

        const isVisible = threadPanel.style.display !== 'none';
        threadPanel.style.display = isVisible ? 'none' : 'flex';
    }

    showHelpModal() {
        this.showModal('help-modal');
    }

    showMemberProfileModal(memberId) {
        this.showModal('member-profile-modal');
        // Load member data if needed
    }

    showEditProfileModal() {
        this.showModal('edit-profile-modal');
        // Load current user data
        if (this.app.auth.currentUser) {
            this.app.updateUserInfo(this.app.auth.currentUser);
        }
    }

    showNotificationSettingsModal() {
        this.showModal('notification-settings-modal');
    }

    showMentionsModal() {
        this.showModal('mentions-modal');
    }
}
