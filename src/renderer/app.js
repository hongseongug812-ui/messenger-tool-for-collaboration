/**
 * Work Messenger - 렌더러 프로세스
 * 업무용 메신저 클라이언트 로직
 */

class WorkMessenger {
  constructor() {
    this.currentServer = null;
    this.currentChannel = null;
    this.servers = [];
    this.messages = {};
    this.pinnedMessages = {};
    this.user = {
      id: 'user_' + Math.random().toString(36).substr(2, 9),
      name: '사용자',
      avatar: 'U',
      status: 'online'
    };
    this.socket = null;
    this.config = null;
    this.dndMode = false;
    this.draggedChannel = null;
    this.contextMenuTarget = null;

    // 자동완성 상태
    this.autocomplete = {
      isOpen: false,
      type: null, // 'mention' or 'command'
      items: [],
      selectedIndex: 0,
      triggerPos: 0,
      query: ''
    };

    // 파일 첨부 상태
    this.attachedFiles = [];

    // 이모지 데이터
    this.emojiCategories = {
      'smileys': {
        name: '😊 표정',
        emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳']
      },
      'gestures': {
        name: '👍 제스처',
        emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏']
      },
      'animals': {
        name: '🐶 동물',
        emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌']
      },
      'food': {
        name: '🍕 음식',
        emojis: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖']
      },
      'activities': {
        name: '⚽ 활동',
        emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸', '🥌']
      },
      'travel': {
        name: '✈ 여행',
        emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍', '🛺', '🚁', '🛶', '⛵', '🚤', '🛳', '⛴', '🛥', '🚢', '✈']
      },
      'objects': {
        name: '💼 사물',
        emojis: ['⌚', '📱', '📲', '💻', '⌨', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛']
      },
      'symbols': {
        name: '❤ 기호',
        emojis: ['❤', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮', '✝', '☪', '🕉', '☸', '✡', '🔯', '🕎', '☯', '☦', '🛐', '⛎']
      }
    };

    this.emojiSearchCache = [];

    // 테마 설정
    this.currentTheme = 'dark'; // 'dark', 'light', 'system'

    // 데모 멤버 데이터
    this.members = [
      { id: 'user_1', name: '박지민', avatar: '박', role: '팀장' },
      { id: 'user_2', name: '최민준', avatar: '최', role: '개발자' },
      { id: 'user_3', name: '김서연', avatar: '김', role: '디자이너' },
      { id: 'user_4', name: '이준호', avatar: '이', role: '기획자' },
      { id: 'user_5', name: '정수아', avatar: '정', role: 'QA' },
      { id: 'user_6', name: '강민수', avatar: '강', role: '개발자' },
      { id: 'user_7', name: '윤지우', avatar: '윤', role: '마케터' }
    ];

    // 슬래시 커맨드 데이터
    this.slashCommands = [
      { name: '/help', description: '도움말 표시' },
      { name: '/clear', description: '화면 지우기' },
      { name: '/status', description: '상태 메시지 설정' },
      { name: '/away', description: '자리비움 상태로 변경' },
      { name: '/dnd', description: '방해금지 모드 토글' },
      { name: '/mute', description: '채널 알림 음소거' },
      { name: '/unmute', description: '채널 알림 음소거 해제' },
      { name: '/invite', description: '사용자 초대' },
      { name: '/kick', description: '사용자 추방' },
      { name: '/nick', description: '닉네임 변경' }
    ];

    this.init();
  }

  async init() {
    // 플랫폼 감지
    if (window.electronAPI) {
      document.body.classList.add(`platform-${window.electronAPI.platform}`);
    }

    // 테마 로드 및 적용
    this.loadTheme();

    // 설정 로드
    await this.loadConfig();

    // UI 이벤트 바인딩
    this.bindEvents();

    // 테마 버튼 초기화
    this.updateThemeButton();

    // 데모 데이터 로드
    this.loadDemoData();

    // 소켓 연결 (서버가 있을 경우)
    // this.connectSocket();

    console.log('Work Messenger 초기화 완료');
  }

  async loadConfig() {
    if (window.electronAPI) {
      this.config = await window.electronAPI.getConfig();
    } else {
      this.config = {
        serverUrl: 'http://localhost:3000',
        pushEnabled: true
      };
    }
  }

  bindEvents() {
    // 타이틀바 버튼
    const btnMinimize = document.getElementById('btn-minimize');
    const btnMaximize = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');

    if (window.electronAPI) {
      btnMinimize?.addEventListener('click', () => window.electronAPI.minimizeWindow());
      btnMaximize?.addEventListener('click', () => window.electronAPI.maximizeWindow());
      btnClose?.addEventListener('click', () => window.electronAPI.closeWindow());
    }

    // 설정 모달
    const btnSettings = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');

    btnSettings?.addEventListener('click', () => {
      settingsModal.style.display = 'flex';
    });

    closeSettings?.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    settingsModal?.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
      }
    });

    // 서버 추가
    const btnAddServer = document.getElementById('btn-add-server');
    btnAddServer?.addEventListener('click', () => {
      this.createNewServer();
    });

    // 카테고리 추가
    const btnNewCategory = document.getElementById('btn-new-category');
    btnNewCategory?.addEventListener('click', () => {
      this.createNewCategory();
    });

    // 채널 추가
    const btnNewChannel = document.getElementById('btn-new-channel');
    btnNewChannel?.addEventListener('click', () => {
      this.createNewChannel();
    });

    // 검색
    const searchInput = document.getElementById('search-input');
    searchInput?.addEventListener('input', (e) => {
      this.filterChannels(e.target.value);
    });

    // 메시지 입력
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    messageInput?.addEventListener('input', (e) => {
      this.autoResizeTextarea(e.target);
      sendBtn.disabled = !e.target.value.trim();
      this.handleAutocompleteInput(e.target);
    });

    messageInput?.addEventListener('keydown', (e) => {
      // 자동완성이 열려있을 때 키보드 네비게이션
      if (this.autocomplete.isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveAutocompleteSelection(1);
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveAutocompleteSelection(-1);
          return;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (this.autocomplete.items.length > 0) {
            e.preventDefault();
            this.selectAutocompleteItem();
            return;
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeAutocomplete();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    // 파일 첨부 버튼
    const attachBtn = document.querySelector('.attach-btn');
    attachBtn?.addEventListener('click', () => {
      this.openFilePicker();
    });

    // 이모지 버튼
    const emojiBtn = document.getElementById('emoji-btn');
    emojiBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleEmojiPicker();
    });

    // 이모지 검색
    const emojiSearch = document.getElementById('emoji-search');
    emojiSearch?.addEventListener('input', (e) => {
      this.filterEmojis(e.target.value);
    });

    // 이모지 피커 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
      const emojiPicker = document.getElementById('emoji-picker');
      if (emojiPicker && emojiPicker.style.display !== 'none' && !emojiPicker.contains(e.target)) {
        emojiPicker.style.display = 'none';
      }
    });

    // 테마 토글 버튼
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    themeToggleBtn?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // 고정된 메시지 버튼
    const btnPinnedMessages = document.getElementById('btn-pinned-messages');
    btnPinnedMessages?.addEventListener('click', () => {
      this.togglePinnedPanel();
    });

    const closePinnedPanel = document.getElementById('close-pinned-panel');
    closePinnedPanel?.addEventListener('click', () => {
      document.getElementById('pinned-panel').style.display = 'none';
    });

    // 메시지 다운로드 버튼
    const btnDownloadMessages = document.getElementById('btn-download-messages');
    btnDownloadMessages?.addEventListener('click', () => {
      this.downloadMessages();
    });

    // 컨텍스트 메뉴
    const contextMenu = document.getElementById('message-context-menu');
    document.addEventListener('click', (e) => {
      contextMenu.style.display = 'none';
    });

    contextMenu?.addEventListener('click', (e) => {
      e.stopPropagation();
      const button = e.target.closest('.context-menu-item');
      if (!button) return;

      const action = button.dataset.action;
      if (this.contextMenuTarget) {
        this.handleMessageAction(action, this.contextMenuTarget);
      }
      contextMenu.style.display = 'none';
    });

    // DND 모드 변경 리스너
    if (window.electronAPI) {
      window.electronAPI.onDndModeChanged((enabled) => {
        this.dndMode = enabled;
        console.log('DND 모드:', enabled ? '활성화' : '비활성화');
      });
    }

    // 마크다운 툴바 버튼
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.dataset.format;
        if (format) {
          this.applyMarkdownFormat(format);
        }
      });
    });

    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K: 검색
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput?.focus();
      }
      // Escape: 모달 닫기
      if (e.key === 'Escape') {
        settingsModal.style.display = 'none';
        contextMenu.style.display = 'none';
      }

      // 마크다운 단축키
      if (messageInput && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'b') {
          e.preventDefault();
          this.applyMarkdownFormat('bold');
        } else if (e.key === 'i') {
          e.preventDefault();
          this.applyMarkdownFormat('italic');
        } else if (e.key === 'e') {
          e.preventDefault();
          this.applyMarkdownFormat('code');
        }
      }
    });
  }

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  loadDemoData() {
    // 데모 서버 데이터
    this.servers = [
      {
        id: 'server_1',
        name: '회사 워크스페이스',
        avatar: '회',
        categories: [
          {
            id: 'cat_1',
            name: '텍스트 채널',
            collapsed: false,
            channels: [
              {
                id: 'channel_1',
                name: '일반',
                type: 'text',
                unread: 3
              },
              {
                id: 'channel_2',
                name: '공지사항',
                type: 'text',
                unread: 0
              },
              {
                id: 'channel_3',
                name: '자유게시판',
                type: 'text',
                unread: 1
              }
            ]
          },
          {
            id: 'cat_2',
            name: '프로젝트',
            collapsed: false,
            channels: [
              {
                id: 'channel_4',
                name: '프로젝트-알파',
                type: 'text',
                unread: 0
              },
              {
                id: 'channel_5',
                name: '프로젝트-베타',
                type: 'text',
                unread: 2
              }
            ]
          }
        ]
      },
      {
        id: 'server_2',
        name: '개인 프로젝트',
        avatar: '개',
        categories: [
          {
            id: 'cat_3',
            name: '일반',
            collapsed: false,
            channels: [
              {
                id: 'channel_6',
                name: '메모',
                type: 'text',
                unread: 0
              },
              {
                id: 'channel_7',
                name: '아이디어',
                type: 'text',
                unread: 0
              }
            ]
          }
        ]
      }
    ];

    // 데모 메시지 데이터
    this.messages = {
      'channel_1': [
        {
          id: 1,
          sender: { name: '박지민', avatar: '박' },
          content: '안녕하세요! 오늘 스프린트 회고 미팅 있는 거 다들 아시죠?',
          time: '오후 2:00',
          sent: false
        },
        {
          id: 2,
          sender: { name: '최민준', avatar: '최' },
          content: '네, 3시에 회의실 B에서 맞나요?',
          time: '오후 2:15',
          sent: false
        },
        {
          id: 3,
          sender: this.user,
          content: '네 맞습니다. 자료 미리 공유해주시면 좋을 것 같아요.',
          time: '오후 2:20',
          sent: true
        }
      ],
      'channel_4': [
        {
          id: 1,
          sender: { name: '개발팀', avatar: '개' },
          content: 'v2.0.0 배포 준비 완료되었습니다.',
          time: '오전 10:00',
          sent: false
        },
        {
          id: 2,
          sender: this.user,
          content: 'QA 테스트 통과했나요?',
          time: '오전 10:30',
          sent: true
        },
        {
          id: 3,
          sender: { name: 'QA팀', avatar: 'Q' },
          content: '네, 모든 테스트 케이스 통과했습니다.',
          time: '오전 11:00',
          sent: false
        }
      ]
    };

    this.renderServerList();
  }

  // ========================================
  // 서버 관리
  // ========================================

  renderServerList() {
    const container = document.getElementById('servers-list');
    container.innerHTML = '';

    this.servers.forEach(server => {
      const item = document.createElement('div');
      item.className = `server-item${this.currentServer?.id === server.id ? ' active' : ''}`;
      item.dataset.serverId = server.id;
      item.title = server.name;

      const unreadCount = this.getServerUnreadCount(server);

      item.innerHTML = `
        ${server.avatar}
        ${unreadCount > 0 ? `<div class="badge">${unreadCount > 99 ? '99+' : unreadCount}</div>` : ''}
      `;

      item.addEventListener('click', () => this.selectServer(server));
      item.addEventListener('contextmenu', (e) => this.showServerContextMenu(e, server));

      container.appendChild(item);
    });
  }

  getServerUnreadCount(server) {
    let total = 0;
    server.categories.forEach(category => {
      category.channels.forEach(channel => {
        total += channel.unread || 0;
      });
    });
    return total;
  }

  selectServer(server) {
    this.currentServer = server;
    this.currentChannel = null;

    // 서버 목록 업데이트
    document.querySelectorAll('.server-item').forEach(item => {
      item.classList.toggle('active', item.dataset.serverId === server.id);
    });

    // 서버 이름 표시
    document.getElementById('server-name').textContent = server.name;

    // 버튼 표시
    document.getElementById('btn-new-category').style.display = 'flex';
    document.getElementById('btn-new-channel').style.display = 'flex';

    // 채널 목록 렌더링
    this.renderChannelList();

    // 채팅 영역 빈 상태로
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('chat-header').style.display = 'none';
    document.getElementById('messages-container').style.display = 'none';
    document.getElementById('input-area').style.display = 'none';
  }

  createNewServer() {
    const name = prompt('새 서버 이름:');
    if (!name) return;

    const newServer = {
      id: 'server_' + Date.now(),
      name: name,
      avatar: name.charAt(0),
      categories: [
        {
          id: 'cat_' + Date.now(),
          name: '일반',
          collapsed: false,
          channels: [
            {
              id: 'channel_' + Date.now(),
              name: '일반',
              type: 'text',
              unread: 0
            }
          ]
        }
      ]
    };

    this.servers.push(newServer);
    this.renderServerList();
    this.selectServer(newServer);
  }

  showServerContextMenu(e, server) {
    e.preventDefault();

    const result = confirm(`"${server.name}" 서버를 삭제하시겠습니까?`);
    if (result) {
      this.deleteServer(server);
    }
  }

  deleteServer(server) {
    const index = this.servers.findIndex(s => s.id === server.id);
    if (index !== -1) {
      this.servers.splice(index, 1);

      if (this.currentServer?.id === server.id) {
        this.currentServer = null;
        this.currentChannel = null;
        document.getElementById('server-name').textContent = '서버 선택';
        document.getElementById('btn-new-category').style.display = 'none';
        document.getElementById('btn-new-channel').style.display = 'none';
        document.getElementById('channels-container').innerHTML = '';
      }

      this.renderServerList();
    }
  }

  // ========================================
  // 채널 관리
  // ========================================

  renderChannelList() {
    const container = document.getElementById('channels-container');
    container.innerHTML = '';

    if (!this.currentServer) return;

    this.currentServer.categories.forEach(category => {
      const categoryEl = this.createCategoryElement(category);
      container.appendChild(categoryEl);
    });
  }

  createCategoryElement(category) {
    const div = document.createElement('div');
    div.className = `category${category.collapsed ? ' collapsed' : ''}`;
    div.dataset.categoryId = category.id;

    div.innerHTML = `
      <div class="category-header">
        <div class="category-toggle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="category-name">${category.name}</span>
        <div class="category-actions">
          <button class="category-btn" title="카테고리 편집">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="category-btn" title="카테고리 삭제">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="category-channels"></div>
    `;

    // 카테고리 토글
    const header = div.querySelector('.category-header');
    const toggle = div.querySelector('.category-toggle');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      category.collapsed = !category.collapsed;
      div.classList.toggle('collapsed', category.collapsed);
    });

    // 카테고리 편집
    const editBtn = div.querySelectorAll('.category-btn')[0];
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editCategory(category);
    });

    // 카테고리 삭제
    const deleteBtn = div.querySelectorAll('.category-btn')[1];
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteCategory(category);
    });

    // 채널 렌더링
    const channelsContainer = div.querySelector('.category-channels');
    category.channels.forEach(channel => {
      const channelEl = this.createChannelElement(channel, category);
      channelsContainer.appendChild(channelEl);
    });

    return div;
  }

  createChannelElement(channel, category) {
    const div = document.createElement('div');
    div.className = `channel-item${this.currentChannel?.id === channel.id ? ' active' : ''}${channel.unread > 0 ? ' unread' : ''}`;
    div.dataset.channelId = channel.id;
    div.draggable = true;

    div.innerHTML = `
      <svg class="channel-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="channel-name">${channel.name}</span>
      ${channel.unread > 0 ? `<div class="channel-badge">${channel.unread}</div>` : ''}
      <div class="channel-actions">
        <button class="channel-action-btn" title="채널 편집">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="channel-action-btn" title="채널 삭제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;

    // 채널 선택
    div.addEventListener('click', () => this.selectChannel(channel));

    // 채널 편집
    const editBtn = div.querySelectorAll('.channel-action-btn')[0];
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editChannel(channel);
    });

    // 채널 삭제
    const deleteBtn = div.querySelectorAll('.channel-action-btn')[1];
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteChannel(channel, category);
    });

    // 드래그 앤 드롭 이벤트
    div.addEventListener('dragstart', (e) => {
      this.draggedChannel = { channel, category };
      div.classList.add('dragging');
    });

    div.addEventListener('dragend', (e) => {
      div.classList.remove('dragging');
      this.draggedChannel = null;
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.draggedChannel && this.draggedChannel.channel.id !== channel.id) {
        div.classList.add('drag-over');
      }
    });

    div.addEventListener('dragleave', (e) => {
      div.classList.remove('drag-over');
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');

      if (this.draggedChannel && this.draggedChannel.channel.id !== channel.id) {
        this.reorderChannels(this.draggedChannel, channel, category);
      }
    });

    return div;
  }

  selectChannel(channel) {
    this.currentChannel = channel;

    // 채널 목록 업데이트
    document.querySelectorAll('.channel-item').forEach(item => {
      item.classList.toggle('active', item.dataset.channelId === channel.id);
    });

    // 읽지 않은 메시지 초기화
    channel.unread = 0;
    this.renderChannelList();
    this.renderServerList();

    // 빈 상태 숨기기
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('chat-header').style.display = 'flex';
    document.getElementById('messages-container').style.display = 'flex';
    document.getElementById('input-area').style.display = 'block';

    // 헤더 업데이트
    document.getElementById('chat-avatar-text').textContent = '#';
    document.getElementById('chat-title').textContent = channel.name;
    document.getElementById('chat-status').textContent = this.currentServer.name;

    // 메시지 렌더링
    this.renderMessages(channel.id);
  }

  createNewCategory() {
    if (!this.currentServer) return;

    const name = prompt('새 카테고리 이름:');
    if (!name) return;

    const newCategory = {
      id: 'cat_' + Date.now(),
      name: name,
      collapsed: false,
      channels: []
    };

    this.currentServer.categories.push(newCategory);
    this.renderChannelList();
  }

  editCategory(category) {
    const name = prompt('카테고리 이름 변경:', category.name);
    if (!name || name === category.name) return;

    category.name = name;
    this.renderChannelList();
  }

  deleteCategory(category) {
    if (category.channels.length > 0) {
      if (!confirm(`"${category.name}" 카테고리에 ${category.channels.length}개의 채널이 있습니다. 삭제하시겠습니까?`)) {
        return;
      }
    }

    const index = this.currentServer.categories.findIndex(c => c.id === category.id);
    if (index !== -1) {
      this.currentServer.categories.splice(index, 1);
      this.renderChannelList();
    }
  }

  createNewChannel() {
    if (!this.currentServer) return;

    const name = prompt('새 채널 이름:');
    if (!name) return;

    // 카테고리 선택 (첫 번째 카테고리에 추가)
    if (this.currentServer.categories.length === 0) {
      this.createNewCategory();
    }

    const category = this.currentServer.categories[0];
    const newChannel = {
      id: 'channel_' + Date.now(),
      name: name,
      type: 'text',
      unread: 0
    };

    category.channels.push(newChannel);
    this.messages[newChannel.id] = [];
    this.renderChannelList();
    this.selectChannel(newChannel);
  }

  editChannel(channel) {
    const name = prompt('채널 이름 변경:', channel.name);
    if (!name || name === channel.name) return;

    channel.name = name;
    this.renderChannelList();

    if (this.currentChannel?.id === channel.id) {
      document.getElementById('chat-title').textContent = channel.name;
    }
  }

  deleteChannel(channel, category) {
    if (!confirm(`"${channel.name}" 채널을 삭제하시겠습니까?`)) {
      return;
    }

    const index = category.channels.findIndex(c => c.id === channel.id);
    if (index !== -1) {
      category.channels.splice(index, 1);

      if (this.currentChannel?.id === channel.id) {
        this.currentChannel = null;
        document.getElementById('empty-state').style.display = 'flex';
        document.getElementById('chat-header').style.display = 'none';
        document.getElementById('messages-container').style.display = 'none';
        document.getElementById('input-area').style.display = 'none';
      }

      this.renderChannelList();
    }
  }

  reorderChannels(draggedItem, targetChannel, targetCategory) {
    const { channel: draggedChannel, category: draggedCategory } = draggedItem;

    // 같은 카테고리 내에서 순서 변경
    if (draggedCategory.id === targetCategory.id) {
      const draggedIndex = draggedCategory.channels.findIndex(c => c.id === draggedChannel.id);
      const targetIndex = draggedCategory.channels.findIndex(c => c.id === targetChannel.id);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        draggedCategory.channels.splice(draggedIndex, 1);
        draggedCategory.channels.splice(targetIndex, 0, draggedChannel);
      }
    } else {
      // 다른 카테고리로 이동
      const draggedIndex = draggedCategory.channels.findIndex(c => c.id === draggedChannel.id);
      if (draggedIndex !== -1) {
        draggedCategory.channels.splice(draggedIndex, 1);
        const targetIndex = targetCategory.channels.findIndex(c => c.id === targetChannel.id);
        targetCategory.channels.splice(targetIndex, 0, draggedChannel);
      }
    }

    this.renderChannelList();
  }

  moveChannel(channel, fromCategory, toCategory) {
    const index = fromCategory.channels.findIndex(c => c.id === channel.id);
    if (index !== -1) {
      fromCategory.channels.splice(index, 1);
      toCategory.channels.push(channel);
      this.renderChannelList();
    }
  }

  filterChannels(query) {
    const items = document.querySelectorAll('.channel-item');
    const lowerQuery = query.toLowerCase();

    items.forEach(item => {
      const name = item.querySelector('.channel-name').textContent.toLowerCase();
      const visible = name.includes(lowerQuery);
      item.style.display = visible ? 'flex' : 'none';
    });

    // 카테고리 표시/숨김 처리
    document.querySelectorAll('.category').forEach(category => {
      const visibleChannels = category.querySelectorAll('.channel-item[style="display: flex;"], .channel-item:not([style*="display"])');
      category.style.display = visibleChannels.length > 0 || !query ? 'block' : 'none';
    });
  }

  // ========================================
  // 메시지 관리
  // ========================================

  renderMessages(channelId) {
    const container = document.getElementById('messages');
    container.innerHTML = '';

    const messages = this.messages[channelId] || [];
    const pinnedIds = this.pinnedMessages[channelId] || [];

    messages.forEach(msg => {
      const msgEl = document.createElement('div');
      const isPinned = pinnedIds.includes(msg.id);
      msgEl.className = `message${msg.sent ? ' sent' : ''}${isPinned ? ' pinned' : ''}`;
      msgEl.dataset.messageId = msg.id;
      msgEl.dataset.channelId = channelId;

      // 파일 첨부 HTML 생성
      let filesHTML = '';
      if (msg.files && msg.files.length > 0) {
        filesHTML = '<div class="message-files">';
        msg.files.forEach(file => {
          const isImage = file.type.startsWith('image/');
          if (isImage) {
            filesHTML += `
              <div class="message-file-item image-file">
                <img src="${file.url}" alt="${file.name}" onclick="window.app.openFilePreview('${file.url}', '${file.name}', '${file.type}')">
                <div class="file-overlay">
                  <button class="file-download-btn" onclick="window.app.downloadFile('${file.url}', '${file.name}')" title="다운로드">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            `;
          } else {
            const icon = this.getFileIcon(file.type);
            filesHTML += `
              <div class="message-file-item document-file">
                <div class="file-icon-large">${icon}</div>
                <div class="file-details">
                  <div class="file-name">${file.name}</div>
                  <div class="file-size">${this.formatFileSize(file.size)}</div>
                </div>
                <button class="file-download-btn" onclick="window.app.downloadFile('${file.url}', '${file.name}')" title="다운로드">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            `;
          }
        });
        filesHTML += '</div>';
      }

      msgEl.innerHTML = `
        <div class="avatar">${msg.sender.avatar}</div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">${msg.sender.name}</span>
            <span class="message-time">${msg.time}</span>
          </div>
          ${msg.content ? `<div class="message-bubble">${this.formatMessage(msg.content)}</div>` : ''}
          ${filesHTML}
        </div>
      `;

      // 우클릭 메뉴
      msgEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, msg, channelId);
      });

      container.appendChild(msgEl);
    });

    // 고정된 메시지 패널 업데이트
    this.updatePinnedPanel();

    // 스크롤 맨 아래로
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  formatMessage(content) {
    // XSS 방지를 위한 HTML 이스케이프
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 코드블록 처리 (가장 먼저)
    formatted = formatted.replace(/```([a-z]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // 인라인 코드
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 굵게
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 기울임
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');

    // 취소선
    formatted = formatted.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 헤더
    formatted = formatted.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 인용구
    formatted = formatted.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // 구분선
    formatted = formatted.replace(/^---$/gm, '<hr>');
    formatted = formatted.replace(/^\*\*\*$/gm, '<hr>');

    // 순서 없는 목록
    formatted = formatted.replace(/^- (.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/^\\* (.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // 순서 있는 목록
    formatted = formatted.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // 링크
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // URL 자동 링크
    formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');

    // 이미지
    formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // 스포일러 ||텍스트||
    formatted = formatted.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

    // 콜아웃 ::: type 내용 :::
    formatted = formatted.replace(/:::(\w+)\n([\s\S]*?):::/g, '<div class="callout $1">$2</div>');

    // 표 처리 (간단한 버전)
    formatted = formatted.replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      const isHeader = match.includes('---');
      if (isHeader) return '';

      const tag = cells[0] && cells[0].trim() === cells[0] ? 'td' : 'th';
      return '<tr>' + cells.map(cell => `<${tag}>${cell.trim()}</${tag}>`).join('') + '</tr>';
    });
    formatted = formatted.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');

    // 줄바꿈
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  // ========================================
  // 마크다운 에디터
  // ========================================

  applyMarkdownFormat(format) {
    const textarea = document.getElementById('message-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const beforeText = textarea.value.substring(0, start);
    const afterText = textarea.value.substring(end);

    let formattedText = '';
    let cursorOffset = 0;

    switch (format) {
      case 'bold':
        formattedText = `**${selectedText || '굵은 텍스트'}**`;
        cursorOffset = selectedText ? 2 : 2;
        break;

      case 'italic':
        formattedText = `*${selectedText || '기울임 텍스트'}*`;
        cursorOffset = selectedText ? 1 : 1;
        break;

      case 'code':
        formattedText = `\`${selectedText || '코드'}\``;
        cursorOffset = selectedText ? 1 : 1;
        break;

      case 'codeblock':
        formattedText = `\`\`\`\n${selectedText || '코드를 입력하세요'}\n\`\`\``;
        cursorOffset = selectedText ? 4 : 4;
        break;

      case 'h1':
        formattedText = `# ${selectedText || '제목 1'}`;
        cursorOffset = selectedText ? 2 : 2;
        break;

      case 'h2':
        formattedText = `## ${selectedText || '제목 2'}`;
        cursorOffset = selectedText ? 3 : 3;
        break;

      case 'h3':
        formattedText = `### ${selectedText || '제목 3'}`;
        cursorOffset = selectedText ? 4 : 4;
        break;

      case 'ul':
        formattedText = `- ${selectedText || '목록 항목'}`;
        cursorOffset = selectedText ? 2 : 2;
        break;

      case 'ol':
        formattedText = `1. ${selectedText || '목록 항목'}`;
        cursorOffset = selectedText ? 3 : 3;
        break;

      case 'quote':
        formattedText = `> ${selectedText || '인용구'}`;
        cursorOffset = selectedText ? 2 : 2;
        break;

      case 'hr':
        formattedText = '---';
        cursorOffset = 3;
        break;

      case 'spoiler':
        formattedText = `||${selectedText || '스포일러'}||`;
        cursorOffset = selectedText ? 2 : 2;
        break;

      case 'table':
        formattedText = `| 헤더1 | 헤더2 |\n| --- | --- |\n| 셀1 | 셀2 |`;
        cursorOffset = 0;
        break;

      case 'image':
        formattedText = `![이미지 설명](${selectedText || 'URL'})`;
        cursorOffset = 2;
        break;

      case 'link':
        formattedText = `[${selectedText || '링크 텍스트'}](URL)`;
        cursorOffset = selectedText ? selectedText.length + 3 : 8;
        break;

      case 'callout':
        const type = prompt('콜아웃 타입을 선택하세요:\ninfo / warning / error / success', 'info');
        if (type) {
          formattedText = `:::${type}\n${selectedText || '콜아웃 내용'}\n:::`;
          cursorOffset = type.length + 4;
        }
        break;
    }

    // 텍스트 적용
    textarea.value = beforeText + formattedText + afterText;

    // 커서 위치 조정
    const newPos = start + (selectedText ? formattedText.length : cursorOffset);
    textarea.setSelectionRange(newPos, newPos);

    // 포커스 및 높이 조정
    textarea.focus();
    this.autoResizeTextarea(textarea);

    // 전송 버튼 활성화
    document.getElementById('send-btn').disabled = !textarea.value.trim();
  }

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if ((!content && this.attachedFiles.length === 0) || !this.currentChannel) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const message = {
      id: Date.now(),
      sender: this.user,
      content: content,
      time: timeStr,
      sent: true,
      files: this.attachedFiles.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        url: f.url
      }))
    };

    // 메시지 추가
    if (!this.messages[this.currentChannel.id]) {
      this.messages[this.currentChannel.id] = [];
    }
    this.messages[this.currentChannel.id].push(message);

    // UI 업데이트
    this.renderMessages(this.currentChannel.id);

    // 입력창 및 첨부파일 초기화
    input.value = '';
    input.style.height = 'auto';
    this.attachedFiles = [];
    this.renderAttachedFiles();
    document.getElementById('send-btn').disabled = true;

    // 소켓으로 전송 (서버 연결 시)
    // this.socket?.emit('message', { channelId: this.currentChannel.id, message });
  }

  showNotification(title, body) {
    if (this.dndMode) return;

    if (window.electronAPI) {
      window.electronAPI.showNotification({ title, body });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  connectSocket() {
    // Socket.IO 연결 (실제 서버 연결 시 활성화)
    /*
    this.socket = io(this.config.serverUrl, {
      auth: {
        token: this.user.id
      }
    });

    this.socket.on('connect', () => {
      console.log('서버 연결됨');
      document.querySelector('.status-dot').classList.add('connected');
      document.querySelector('.status-dot').classList.remove('disconnected');
    });

    this.socket.on('disconnect', () => {
      console.log('서버 연결 끊김');
      document.querySelector('.status-dot').classList.remove('connected');
      document.querySelector('.status-dot').classList.add('disconnected');
    });

    this.socket.on('message', (data) => {
      this.handleIncomingMessage(data);
    });
    */
  }

  handleIncomingMessage(data) {
    const { channelId, message } = data;

    if (!this.messages[channelId]) {
      this.messages[channelId] = [];
    }
    this.messages[channelId].push(message);

    // 채널 업데이트
    let channel = null;
    this.currentServer?.categories.forEach(category => {
      const found = category.channels.find(c => c.id === channelId);
      if (found) channel = found;
    });

    if (channel && this.currentChannel?.id !== channelId) {
      channel.unread++;
    }

    // UI 업데이트
    this.renderChannelList();
    this.renderServerList();

    if (this.currentChannel?.id === channelId) {
      this.renderMessages(channelId);
    }

    // 알림 표시
    if (this.currentChannel?.id !== channelId) {
      this.showNotification(message.sender.name, message.content);
    }
  }

  // ========================================
  // 고정 메시지 관리
  // ========================================

  showContextMenu(e, message, channelId) {
    const contextMenu = document.getElementById('message-context-menu');
    this.contextMenuTarget = { message, channelId };

    // 고정/고정 해제 버튼 텍스트 변경
    const pinnedIds = this.pinnedMessages[channelId] || [];
    const isPinned = pinnedIds.includes(message.id);
    const pinButton = contextMenu.querySelector('[data-action="pin"]');
    const pinText = pinButton.querySelector('span');
    pinText.textContent = isPinned ? '메시지 고정 해제' : '메시지 고정';

    // 위치 설정
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';

    // 화면 밖으로 나가지 않도록 조정
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = (e.clientY - rect.height) + 'px';
    }
  }

  handleMessageAction(action, target) {
    const { message, channelId } = target;

    switch (action) {
      case 'pin':
        this.togglePinMessage(message.id, channelId);
        break;
      case 'move':
        this.moveMessageToChannel(message, channelId);
        break;
      case 'copy':
        this.copyMessageText(message);
        break;
      case 'delete':
        this.deleteMessage(message.id, channelId);
        break;
    }
  }

  togglePinMessage(messageId, channelId) {
    if (!this.pinnedMessages[channelId]) {
      this.pinnedMessages[channelId] = [];
    }

    const pinnedIds = this.pinnedMessages[channelId];
    const index = pinnedIds.indexOf(messageId);

    if (index !== -1) {
      // 고정 해제
      pinnedIds.splice(index, 1);
    } else {
      // 고정
      pinnedIds.push(messageId);
    }

    this.renderMessages(channelId);
  }

  updatePinnedPanel() {
    if (!this.currentChannel) return;

    const pinnedIds = this.pinnedMessages[this.currentChannel.id] || [];
    const messages = this.messages[this.currentChannel.id] || [];
    const pinnedMessages = messages.filter(m => pinnedIds.includes(m.id));

    const btnPinnedMessages = document.getElementById('btn-pinned-messages');
    const pinnedCount = document.getElementById('pinned-count');

    if (pinnedMessages.length > 0) {
      btnPinnedMessages.style.display = 'flex';
      pinnedCount.textContent = pinnedMessages.length;
      pinnedCount.style.display = 'flex';
    } else {
      btnPinnedMessages.style.display = 'none';
      pinnedCount.style.display = 'none';
    }

    // 패널 업데이트
    const container = document.getElementById('pinned-messages');
    container.innerHTML = '';

    pinnedMessages.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'pinned-message-item';
      item.innerHTML = `
        <div class="avatar">${msg.sender.avatar}</div>
        <div class="pinned-message-content">
          <div class="pinned-message-header">
            <span class="pinned-message-sender">${msg.sender.name}</span>
            <span class="pinned-message-time">${msg.time}</span>
          </div>
          <div class="pinned-message-text">${msg.content}</div>
        </div>
        <button class="icon-btn unpin-btn" title="고정 해제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      `;

      // 클릭 시 해당 메시지로 스크롤
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.unpin-btn')) {
          this.scrollToMessage(msg.id);
        }
      });

      // 고정 해제 버튼
      const unpinBtn = item.querySelector('.unpin-btn');
      unpinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePinMessage(msg.id, this.currentChannel.id);
      });

      container.appendChild(item);
    });
  }

  togglePinnedPanel() {
    const panel = document.getElementById('pinned-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  scrollToMessage(messageId) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
      msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      msgEl.style.background = 'var(--accent-subtle)';
      setTimeout(() => {
        msgEl.style.background = '';
      }, 2000);
    }
  }

  // ========================================
  // 메시지 이동
  // ========================================

  moveMessageToChannel(message, fromChannelId) {
    if (!this.currentServer) return;

    // 모든 채널 목록 수집
    const channels = [];
    this.currentServer.categories.forEach(category => {
      category.channels.forEach(channel => {
        if (channel.id !== fromChannelId) {
          channels.push({ category: category.name, channel });
        }
      });
    });

    if (channels.length === 0) {
      alert('이동할 수 있는 다른 채널이 없습니다.');
      return;
    }

    // 채널 선택
    const channelNames = channels.map((c, i) => `${i + 1}. [${c.category}] ${c.channel.name}`).join('\n');
    const input = prompt(`메시지를 이동할 채널 번호를 입력하세요:\n\n${channelNames}`);

    if (!input) return;

    const index = parseInt(input) - 1;
    if (index < 0 || index >= channels.length) {
      alert('잘못된 번호입니다.');
      return;
    }

    const toChannelId = channels[index].channel.id;

    // 메시지 이동
    if (!this.messages[toChannelId]) {
      this.messages[toChannelId] = [];
    }

    // 새 채널에 메시지 추가
    this.messages[toChannelId].push({ ...message, id: Date.now() });

    // 기존 채널에서 메시지 삭제
    const fromMessages = this.messages[fromChannelId];
    const messageIndex = fromMessages.findIndex(m => m.id === message.id);
    if (messageIndex !== -1) {
      fromMessages.splice(messageIndex, 1);
    }

    // 고정된 메시지도 제거
    if (this.pinnedMessages[fromChannelId]) {
      const pinnedIndex = this.pinnedMessages[fromChannelId].indexOf(message.id);
      if (pinnedIndex !== -1) {
        this.pinnedMessages[fromChannelId].splice(pinnedIndex, 1);
      }
    }

    this.renderMessages(fromChannelId);
    alert(`메시지가 "${channels[index].channel.name}" 채널로 이동되었습니다.`);
  }

  copyMessageText(message) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message.content).then(() => {
        alert('메시지가 클립보드에 복사되었습니다.');
      }).catch(() => {
        alert('복사 실패');
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = message.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('메시지가 클립보드에 복사되었습니다.');
    }
  }

  deleteMessage(messageId, channelId) {
    if (!confirm('이 메시지를 삭제하시겠습니까?')) {
      return;
    }

    const messages = this.messages[channelId];
    const index = messages.findIndex(m => m.id === messageId);

    if (index !== -1) {
      messages.splice(index, 1);

      // 고정된 메시지도 제거
      if (this.pinnedMessages[channelId]) {
        const pinnedIndex = this.pinnedMessages[channelId].indexOf(messageId);
        if (pinnedIndex !== -1) {
          this.pinnedMessages[channelId].splice(pinnedIndex, 1);
        }
      }

      this.renderMessages(channelId);
    }
  }

  // ========================================
  // 메시지 다운로드
  // ========================================

  downloadMessages() {
    if (!this.currentChannel) return;

    const messages = this.messages[this.currentChannel.id] || [];

    if (messages.length === 0) {
      alert('다운로드할 메시지가 없습니다.');
      return;
    }

    const format = prompt('다운로드 형식을 선택하세요:\n1. JSON\n2. TXT', '1');

    if (format === '1') {
      this.downloadAsJSON(messages);
    } else if (format === '2') {
      this.downloadAsTXT(messages);
    }
  }

  downloadAsJSON(messages) {
    const data = {
      server: this.currentServer.name,
      channel: this.currentChannel.name,
      exportDate: new Date().toISOString(),
      messages: messages.map(m => ({
        id: m.id,
        sender: m.sender.name,
        content: m.content,
        time: m.time,
        sent: m.sent
      }))
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentChannel.name}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadAsTXT(messages) {
    let text = `서버: ${this.currentServer.name}\n`;
    text += `채널: ${this.currentChannel.name}\n`;
    text += `내보내기 날짜: ${new Date().toLocaleString('ko-KR')}\n`;
    text += `${'='.repeat(50)}\n\n`;

    messages.forEach(m => {
      text += `[${m.time}] ${m.sender.name}\n`;
      text += `${m.content}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentChannel.name}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ========================================
  // 자동완성
  // ========================================

  handleAutocompleteInput(textarea) {
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;

    // 커서 이전 텍스트 분석
    const textBeforeCursor = value.substring(0, cursorPos);

    // @ 멘션 감지
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const query = mentionMatch[1];
      this.openAutocomplete('mention', query, cursorPos - query.length - 1);
      return;
    }

    // / 슬래시 커맨드 감지 (줄의 시작에서만)
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const commandMatch = currentLine.match(/^\/(\w*)$/);
    if (commandMatch) {
      const query = commandMatch[1];
      this.openAutocomplete('command', query, cursorPos - query.length - 1);
      return;
    }

    // 트리거가 없으면 닫기
    if (this.autocomplete.isOpen) {
      this.closeAutocomplete();
    }
  }

  openAutocomplete(type, query, triggerPos) {
    this.autocomplete.type = type;
    this.autocomplete.query = query;
    this.autocomplete.triggerPos = triggerPos;
    this.autocomplete.selectedIndex = 0;

    // 항목 필터링
    let items = [];
    if (type === 'mention') {
      items = this.members.filter(member =>
        member.name.toLowerCase().includes(query.toLowerCase())
      );
    } else if (type === 'command') {
      items = this.slashCommands.filter(cmd =>
        cmd.name.toLowerCase().includes('/' + query.toLowerCase())
      );
    }

    this.autocomplete.items = items;
    this.autocomplete.isOpen = items.length > 0;

    if (this.autocomplete.isOpen) {
      this.renderAutocomplete();
    } else {
      this.closeAutocomplete();
    }
  }

  closeAutocomplete() {
    this.autocomplete.isOpen = false;
    this.autocomplete.items = [];
    this.autocomplete.selectedIndex = 0;

    const dropdown = document.getElementById('autocomplete-dropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  renderAutocomplete() {
    const dropdown = document.getElementById('autocomplete-dropdown');
    const container = document.getElementById('autocomplete-items');

    if (!dropdown || !container) return;

    container.innerHTML = '';

    if (this.autocomplete.items.length === 0) {
      container.innerHTML = '<div class="autocomplete-empty">일치하는 항목이 없습니다.</div>';
      dropdown.style.display = 'block';
      return;
    }

    // 헤더 추가
    const header = document.createElement('div');
    header.className = 'autocomplete-header';
    header.textContent = this.autocomplete.type === 'mention' ? '멤버' : '명령어';
    container.appendChild(header);

    // 항목 렌더링
    this.autocomplete.items.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = `autocomplete-item${index === this.autocomplete.selectedIndex ? ' selected' : ''}`;
      itemEl.dataset.index = index;

      if (this.autocomplete.type === 'mention') {
        itemEl.innerHTML = `
          <div class="avatar">${item.avatar}</div>
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-description">${item.role}</div>
          </div>
        `;
      } else if (this.autocomplete.type === 'command') {
        itemEl.innerHTML = `
          <div class="item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-description">${item.description}</div>
          </div>
        `;
      }

      // 클릭 이벤트
      itemEl.addEventListener('click', () => {
        this.autocomplete.selectedIndex = index;
        this.selectAutocompleteItem();
      });

      // 마우스 오버 이벤트
      itemEl.addEventListener('mouseenter', () => {
        this.autocomplete.selectedIndex = index;
        this.renderAutocomplete();
      });

      container.appendChild(itemEl);
    });

    dropdown.style.display = 'block';
  }

  moveAutocompleteSelection(direction) {
    const maxIndex = this.autocomplete.items.length - 1;
    this.autocomplete.selectedIndex += direction;

    if (this.autocomplete.selectedIndex < 0) {
      this.autocomplete.selectedIndex = maxIndex;
    } else if (this.autocomplete.selectedIndex > maxIndex) {
      this.autocomplete.selectedIndex = 0;
    }

    this.renderAutocomplete();

    // 스크롤 조정
    const container = document.getElementById('autocomplete-items');
    const selectedItem = container?.querySelector('.autocomplete-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  selectAutocompleteItem() {
    const item = this.autocomplete.items[this.autocomplete.selectedIndex];
    if (!item) return;

    const textarea = document.getElementById('message-input');
    if (!textarea) return;

    const value = textarea.value;
    const cursorPos = textarea.selectionStart;

    // 삽입할 텍스트
    let insertText = '';
    if (this.autocomplete.type === 'mention') {
      insertText = '@' + item.name + ' ';
    } else if (this.autocomplete.type === 'command') {
      insertText = item.name + ' ';
    }

    // 텍스트 교체
    const beforeTrigger = value.substring(0, this.autocomplete.triggerPos);
    const afterCursor = value.substring(cursorPos);
    const newValue = beforeTrigger + insertText + afterCursor;

    textarea.value = newValue;

    // 커서 위치 조정
    const newCursorPos = this.autocomplete.triggerPos + insertText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);

    // 자동완성 닫기
    this.closeAutocomplete();

    // 포커스 및 높이 조정
    textarea.focus();
    this.autoResizeTextarea(textarea);

    // 전송 버튼 활성화
    document.getElementById('send-btn').disabled = !textarea.value.trim();
  }

  // ========================================
  // 파일 첨부
  // ========================================

  openFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar';

    input.addEventListener('change', (e) => {
      this.handleFileSelect(e.target.files);
    });

    input.click();
  }

  handleFileSelect(files) {
    if (!files || files.length === 0) return;

    // 파일 크기 제한 체크 (50MB)
    const maxSize = 50 * 1024 * 1024;

    Array.from(files).forEach(file => {
      if (file.size > maxSize) {
        alert(`파일 "${file.name}"의 크기가 너무 큽니다. (최대 50MB)`);
        return;
      }

      // 파일 정보 저장
      const fileObj = {
        id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        file: file,
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file)
      };

      this.attachedFiles.push(fileObj);
    });

    this.renderAttachedFiles();
  }

  renderAttachedFiles() {
    const inputArea = document.getElementById('input-area');
    let container = document.getElementById('attached-files-container');

    // 컨테이너가 없으면 생성
    if (!container) {
      container = document.createElement('div');
      container.id = 'attached-files-container';
      container.className = 'attached-files-container';
      inputArea.insertBefore(container, inputArea.firstChild);
    }

    container.innerHTML = '';

    if (this.attachedFiles.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    this.attachedFiles.forEach(fileObj => {
      const item = document.createElement('div');
      item.className = 'attached-file-item';

      const isImage = fileObj.type.startsWith('image/');

      if (isImage) {
        item.innerHTML = `
          <div class="file-preview">
            <img src="${fileObj.url}" alt="${fileObj.name}">
          </div>
          <div class="file-info">
            <div class="file-name">${fileObj.name}</div>
            <div class="file-size">${this.formatFileSize(fileObj.size)}</div>
          </div>
          <button class="file-remove-btn" data-file-id="${fileObj.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        `;
      } else {
        const icon = this.getFileIcon(fileObj.type);
        item.innerHTML = `
          <div class="file-icon">${icon}</div>
          <div class="file-info">
            <div class="file-name">${fileObj.name}</div>
            <div class="file-size">${this.formatFileSize(fileObj.size)}</div>
          </div>
          <button class="file-remove-btn" data-file-id="${fileObj.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        `;
      }

      // 삭제 버튼 이벤트
      const removeBtn = item.querySelector('.file-remove-btn');
      removeBtn.addEventListener('click', () => {
        this.removeAttachedFile(fileObj.id);
      });

      container.appendChild(item);
    });
  }

  removeAttachedFile(fileId) {
    const index = this.attachedFiles.findIndex(f => f.id === fileId);
    if (index !== -1) {
      URL.revokeObjectURL(this.attachedFiles[index].url);
      this.attachedFiles.splice(index, 1);
      this.renderAttachedFiles();
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  getFileIcon(type) {
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('presentation') || type.includes('powerpoint')) return '📽️';
    if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return '📦';
    if (type.includes('text')) return '📃';
    return '📎';
  }

  openFilePreview(url, name, type) {
    // 파일 미리보기 모달 생성
    const modal = document.createElement('div');
    modal.className = 'file-preview-modal';
    modal.innerHTML = `
      <div class="file-preview-overlay" onclick="this.parentElement.remove()"></div>
      <div class="file-preview-content">
        <div class="file-preview-header">
          <span class="file-preview-title">${name}</span>
          <button class="file-preview-close" onclick="this.closest('.file-preview-modal').remove()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="file-preview-body">
          <img src="${url}" alt="${name}">
        </div>
        <div class="file-preview-footer">
          <button class="btn-secondary" onclick="window.app.downloadFile('${url}', '${name}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            다운로드
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // ESC 키로 닫기
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  downloadFile(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ========================================
  // 이모지 피커
  // ========================================

  toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    const isVisible = picker.style.display !== 'none';

    if (isVisible) {
      picker.style.display = 'none';
    } else {
      this.renderEmojiPicker();
      picker.style.display = 'block';
      document.getElementById('emoji-search').value = '';
    }
  }

  renderEmojiPicker() {
    const categoriesContainer = document.getElementById('emoji-categories');
    const gridContainer = document.getElementById('emoji-grid');

    // 카테고리 탭 렌더링
    categoriesContainer.innerHTML = '';
    Object.keys(this.emojiCategories).forEach((key, index) => {
      const category = this.emojiCategories[key];
      const tab = document.createElement('button');
      tab.className = `emoji-category-tab${index === 0 ? ' active' : ''}`;
      tab.dataset.category = key;
      tab.title = category.name;
      tab.textContent = category.emojis[0];

      tab.addEventListener('click', () => {
        // 탭 활성화
        document.querySelectorAll('.emoji-category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 해당 카테고리 이모지 표시
        this.renderEmojiGrid(key);
      });

      categoriesContainer.appendChild(tab);
    });

    // 첫 번째 카테고리 이모지 표시
    this.renderEmojiGrid(Object.keys(this.emojiCategories)[0]);
  }

  renderEmojiGrid(categoryKey) {
    const gridContainer = document.getElementById('emoji-grid');
    gridContainer.innerHTML = '';

    const category = this.emojiCategories[categoryKey];
    if (!category) return;

    category.emojis.forEach(emoji => {
      const button = document.createElement('button');
      button.className = 'emoji-item';
      button.textContent = emoji;
      button.title = emoji;

      button.addEventListener('click', () => {
        this.insertEmoji(emoji);
      });

      gridContainer.appendChild(button);
    });
  }

  filterEmojis(query) {
    const gridContainer = document.getElementById('emoji-grid');

    if (!query.trim()) {
      // 검색어가 없으면 첫 번째 카테고리 표시
      const firstCategory = Object.keys(this.emojiCategories)[0];
      this.renderEmojiGrid(firstCategory);
      return;
    }

    // 모든 이모지에서 검색 (여기서는 간단하게 이모지 자체로 검색)
    gridContainer.innerHTML = '';

    Object.values(this.emojiCategories).forEach(category => {
      category.emojis.forEach(emoji => {
        const button = document.createElement('button');
        button.className = 'emoji-item';
        button.textContent = emoji;
        button.title = emoji;

        button.addEventListener('click', () => {
          this.insertEmoji(emoji);
        });

        gridContainer.appendChild(button);
      });
    });
  }

  insertEmoji(emoji) {
    const textarea = document.getElementById('message-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // 이모지 삽입
    textarea.value = text.substring(0, start) + emoji + text.substring(end);

    // 커서 위치 조정
    const newPos = start + emoji.length;
    textarea.setSelectionRange(newPos, newPos);

    // 포커스
    textarea.focus();

    // 높이 조정 및 전송 버튼 활성화
    this.autoResizeTextarea(textarea);
    document.getElementById('send-btn').disabled = !textarea.value.trim();

    // 이모지 피커 닫기 (선택사항 - 계속 선택하려면 주석 처리)
    // document.getElementById('emoji-picker').style.display = 'none';
  }

  // ========================================
  // 테마 시스템
  // ========================================

  loadTheme() {
    // localStorage에서 테마 로드
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.currentTheme = savedTheme;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this.currentTheme = 'system';
    }

    this.applyTheme(this.currentTheme);

    // 시스템 테마 변경 감지
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (this.currentTheme === 'system') {
          this.applyTheme('system');
        }
      });
    }
  }

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme(theme);
  }

  applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'system') {
      // 시스템 테마 사용
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        root.setAttribute('data-theme', 'light');
      } else {
        root.setAttribute('data-theme', 'dark');
      }
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  toggleTheme() {
    const themes = ['dark', 'light', 'system'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.setTheme(themes[nextIndex]);

    // UI 업데이트
    this.updateThemeButton();
  }

  updateThemeButton() {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (!themeBtn) return;

    const icons = {
      'dark': '🌙',
      'light': '☀️',
      'system': '💻'
    };

    const labels = {
      'dark': '다크 모드',
      'light': '라이트 모드',
      'system': '시스템 테마'
    };

    themeBtn.textContent = icons[this.currentTheme];
    themeBtn.title = labels[this.currentTheme];
  }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  window.app = new WorkMessenger();
});
