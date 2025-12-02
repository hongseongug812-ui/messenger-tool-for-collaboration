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
    this.reactions = {}; // 메시지 리액션 저장: { channelId: { messageId: { emoji: [userId, ...] } } }
    this.apiBase = '';
    this.loadedMessages = new Set();
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

    // 서버별 멤버 데이터
    this.serverMembers = {
      // 각 서버 ID를 키로 사용하여 멤버 목록 저장
      // 'server_id': [{ id, name, avatar, role }, ...]
    };

    // 기본 멤버 데이터 (새 서버 생성 시 사용)
    this.defaultMembers = [
      { id: 'user_1', name: '박지민', avatar: '박', role: '팀장' },
      { id: 'user_2', name: '최민준', avatar: '최', role: '개발자' },
      { id: 'user_3', name: '김서연', avatar: '김', role: '디자이너' },
      { id: 'user_4', name: '이준호', avatar: '이', role: '기획자' },
      { id: 'user_5', name: '정수아', avatar: '정', role: 'QA' },
      { id: 'user_6', name: '강민수', avatar: '강', role: '개발자' },
      { id: 'user_7', name: '윤지우', avatar: '윤', role: '마케터' }
    ];

    // 음성채팅 상태
    this.voiceChat = {
      isActive: false,
      isMuted: false,
      isSpeakerOn: true,
      startTime: null,
      participants: []
    };

    // 화면 공유 상태
    this.screenShare = {
      isSharing: false,
      stream: null
    };

    // 달력 데이터
    this.calendar = {
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth(),
      selectedDate: null,
      events: []
    };

    // 프로필 데이터
    this.profile = {
      name: '사용자',
      statusMessage: '',
      email: '',
      phone: '',
      status: 'online' // 'online', 'away', 'busy', 'offline'
    };

    // 화이트보드 상태
    this.whiteboard = {
      canvas: null,
      ctx: null,
      isDrawing: false,
      currentTool: 'pen',
      currentColor: '#6366f1',
      currentWidth: 3,
      currentBgColor: '#ffffff',
      isFillMode: false,
      showGrid: false,
      startX: 0,
      startY: 0,
      history: [],
      historyStep: -1,
      tempCanvas: null,
      tempCtx: null,
      textInput: null
    };

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
    this.apiBase = this.config?.serverUrl || '';

    // UI 이벤트 바인딩
    this.bindEvents();

    // 테마 버튼 초기화
    this.updateThemeButton();

    // 서버 데이터 로드 (백엔드 우선, 실패 시 데모 데이터)
    const loaded = await this.loadServerData();
    if (!loaded) {
      this.loadDemoData();
    }

    // 소켓 연결 (서버가 있을 경우)
    this.connectSocket();

    // 로딩 화면 숨기기 (부드러운 페이드아웃)
    requestAnimationFrame(() => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        // 애니메이션 완료 후 DOM에서 제거
        setTimeout(() => {
          loadingScreen.remove();
        }, 300);
      }
    });

    console.log('Work Messenger 초기화 완료');
  }

  async loadConfig() {
    if (window.electronAPI) {
      this.config = await window.electronAPI.getConfig();
    } else {
      this.config = {
        serverUrl: 'http://localhost:8000',
        pushEnabled: true
      };
    }
  }

  async apiRequest(path, options = {}) {
    if (!this.apiBase) throw new Error('API base URL not configured');

    const url = `${this.apiBase}${path}`;
    const headers = options.headers || {};
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return null;
  }

  normalizeMessage(msg) {
    const sender =
      msg.sender && typeof msg.sender === 'object'
        ? {
            id: msg.sender.id || null,
            name: msg.sender.name || '사용자',
            avatar: msg.sender.avatar || (msg.sender.name ? msg.sender.name[0] : 'U')
          }
        : {
            id: null,
            name: typeof msg.sender === 'string' ? msg.sender : '사용자',
            avatar: typeof msg.sender === 'string' ? msg.sender[0] : 'U'
          };

    const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const timeStr = timestamp.toLocaleTimeString('ko-KR', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return {
      ...msg,
      sender,
      time: msg.time || timeStr
    };
  }

  async loadServerData() {
    if (!this.apiBase) return false;

    try {
      this.messages = {};
      this.loadedMessages = new Set();

      const data = await this.apiRequest('/state');
      const servers = data?.servers || data || [];

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

  async fetchMessages(channelId) {
    if (!this.apiBase || this.loadedMessages.has(channelId)) return;

    try {
      const data = await this.apiRequest(`/channels/${channelId}/messages`);
      if (Array.isArray(data)) {
        this.messages[channelId] = data.map(msg => this.normalizeMessage(msg));
        this.loadedMessages.add(channelId);
      }
    } catch (error) {
      console.error('메시지 로드 실패:', error);
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

    // 이모티콘 리액션 피커
    const reactionPicker = document.getElementById('emoji-picker');
    document.addEventListener('click', (e) => {
      if (!reactionPicker.contains(e.target) && !contextMenu.contains(e.target)) {
        reactionPicker.style.display = 'none';
      }
    });

    reactionPicker?.addEventListener('click', (e) => {
      e.stopPropagation();
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

    // 입력 다이얼로그
    const inputDialogOverlay = document.getElementById('input-dialog-overlay');
    const inputDialogClose = document.getElementById('input-dialog-close');
    const inputDialogCancel = document.getElementById('input-dialog-cancel');
    const inputDialogOk = document.getElementById('input-dialog-ok');
    const inputDialogInput = document.getElementById('input-dialog-input');

    inputDialogClose?.addEventListener('click', () => {
      this.closeInputDialog();
    });

    inputDialogCancel?.addEventListener('click', () => {
      this.closeInputDialog();
    });

    inputDialogOk?.addEventListener('click', () => {
      this.confirmInputDialog();
    });

    inputDialogInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmInputDialog();
      } else if (e.key === 'Escape') {
        this.closeInputDialog();
      }
    });

    inputDialogOverlay?.addEventListener('click', (e) => {
      if (e.target === inputDialogOverlay) {
        this.closeInputDialog();
      }
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

    // 음성채팅 버튼
    const btnVoiceChat = document.getElementById('btn-voice-chat');
    btnVoiceChat?.addEventListener('click', () => {
      this.openVoiceChatModal();
    });

    // 화면 공유 버튼
    const btnScreenShare = document.getElementById('btn-screen-share');
    btnScreenShare?.addEventListener('click', () => {
      this.openScreenShareModal();
    });

    // 일정관리 버튼
    const btnCalendar = document.getElementById('btn-calendar');
    btnCalendar?.addEventListener('click', () => {
      this.openCalendarModal();
    });

    // 마이페이지 버튼
    const btnMyPage = document.getElementById('btn-my-page');
    btnMyPage?.addEventListener('click', () => {
      this.openMyPageModal();
    });

    // 화이트보드 버튼
    const btnWhiteboard = document.getElementById('btn-whiteboard');
    btnWhiteboard?.addEventListener('click', () => {
      this.openWhiteboardModal();
    });

    // 음성채팅 모달 이벤트
    this.setupVoiceChatEvents();

    // 화면 공유 모달 이벤트
    this.setupScreenShareEvents();

    // 일정관리 모달 이벤트
    this.setupCalendarEvents();

    // 마이페이지 모달 이벤트
    this.setupMyPageEvents();

    // 화이트보드 모달 이벤트
    this.setupWhiteboardEvents();
  }

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // 입력 다이얼로그 관련 메서드
  inputDialogCallback = null;

  showInputDialog(title, defaultValue = '') {
    return new Promise((resolve) => {
      const overlay = document.getElementById('input-dialog-overlay');
      const titleElement = document.getElementById('input-dialog-title');
      const input = document.getElementById('input-dialog-input');

      titleElement.textContent = title;
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

  closeInputDialog() {
    if (this.inputDialogCallback) {
      this.inputDialogCallback(null);
    }
    const overlay = document.getElementById('input-dialog-overlay');
    overlay.style.display = 'none';
  }

  confirmInputDialog() {
    const input = document.getElementById('input-dialog-input');
    const value = input.value.trim();

    if (this.inputDialogCallback) {
      this.inputDialogCallback(value || null);
    }
    const overlay = document.getElementById('input-dialog-overlay');
    overlay.style.display = 'none';
  }

  loadDemoData() {
    this.loadedMessages = new Set();
    this.messages = {};

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

    // 멤버 패널 토글 버튼
    const btnToggleMembers = document.getElementById('btn-toggle-members');
    const closeMembersBtn = document.getElementById('toggle-members-panel');

    btnToggleMembers?.addEventListener('click', () => {
      const panel = document.getElementById('members-panel');
      if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
      } else {
        panel.style.display = 'none';
      }
    });

    closeMembersBtn?.addEventListener('click', () => {
      const panel = document.getElementById('members-panel');
      panel.style.display = 'none';
    });

    // 리사이저 초기화
    this.initResizers();

    // 서버별 멤버 초기화 (각 서버에 다른 멤버 설정)
    this.serverMembers['server_1'] = [
      { id: 'user_1', name: '박지민', avatar: '박', role: '팀장' },
      { id: 'user_2', name: '최민준', avatar: '최', role: '개발자' },
      { id: 'user_3', name: '김서연', avatar: '김', role: '디자이너' },
      { id: 'user_4', name: '이준호', avatar: '이', role: '기획자' },
      { id: 'user_5', name: '정수아', avatar: '정', role: 'QA' }
    ];

    this.serverMembers['server_2'] = [
      { id: 'user_6', name: '강민수', avatar: '강', role: '개발자' },
      { id: 'user_7', name: '윤지우', avatar: '윤', role: '마케터' },
      { id: 'user_8', name: '송하늘', avatar: '송', role: '디자이너' }
    ];

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
    document.getElementById('messages-and-members').style.display = 'flex';
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('chat-header').style.display = 'none';
    document.getElementById('messages-container').style.display = 'none';
    document.getElementById('input-area').style.display = 'none';

    // 멤버 패널 표시
    this.renderMembers();
  }

  async createNewServer() {
    const name = await this.showInputDialog('새 서버 이름:');
    if (!name) return;

    let newServer = null;

    if (this.apiBase) {
      try {
        newServer = await this.apiRequest('/servers', {
          method: 'POST',
          body: JSON.stringify({ name, avatar: name.charAt(0) })
        });
      } catch (error) {
        console.error('서버 생성 실패, 로컬로 진행합니다:', error);
      }
    }

    if (!newServer) {
      newServer = {
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
    }

    this.servers.push(newServer);

    // 새 서버에 기본 멤버 할당
    this.serverMembers[newServer.id] = [...this.defaultMembers];

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

  async selectChannel(channel) {
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
    document.getElementById('messages-and-members').style.display = 'flex';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('chat-header').style.display = 'flex';
    document.getElementById('messages-container').style.display = 'flex';
    document.getElementById('input-area').style.display = 'flex';

    // 헤더 업데이트
    document.getElementById('chat-avatar-text').textContent = '#';
    document.getElementById('chat-title').textContent = channel.name;
    document.getElementById('chat-status').textContent = this.currentServer.name;

    // 메시지 렌더링 (서버에서 동기화)
    await this.fetchMessages(channel.id);
    this.renderMessages(channel.id);

    // 소켓 룸 참가
    if (window.electronAPI?.emitSocketEvent) {
      window.electronAPI.emitSocketEvent('join', { channelId: channel.id });
    }

    // 멤버 패널 표시
    this.renderMembers();
  }

  renderMembers() {
    const panel = document.getElementById('members-panel');
    const list = document.getElementById('members-list');

    if (!panel || !list || !this.currentServer) return;

    // 패널 표시
    panel.style.display = 'flex';

    // 현재 서버의 멤버 가져오기 (없으면 기본 멤버 사용)
    const members = this.serverMembers[this.currentServer.id] || this.defaultMembers;

    // 멤버 목록 렌더링
    list.innerHTML = members.map(member => `
      <div class="member-item" title="${member.name}">
        <div class="member-item-avatar">${member.avatar}</div>
        <div class="member-item-info">
          <div class="member-item-name">${member.name}</div>
          <div class="member-item-role">${member.role}</div>
        </div>
      </div>
    `).join('');

    // 멤버 검색
    const searchInput = document.getElementById('members-search-input');
    searchInput?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const items = list.querySelectorAll('.member-item');

      items.forEach(item => {
        const name = item.querySelector('.member-item-name').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
      });
    });

    // 멤버 패널 닫기 버튼
    const closeBtn = document.getElementById('toggle-members-panel');
    closeBtn?.removeEventListener('click', this.closeMembersPanel);
    closeBtn?.addEventListener('click', () => {
      panel.style.display = 'none';
    });
  }

  async createNewCategory() {
    if (!this.currentServer) return;

    const name = await this.showInputDialog('새 카테고리 이름:');
    if (!name) return;

    let newCategory = {
      id: 'cat_' + Date.now(),
      name: name,
      collapsed: false,
      channels: []
    };

    if (this.apiBase) {
      try {
        const created = await this.apiRequest(`/servers/${this.currentServer.id}/categories`, {
          method: 'POST',
          body: JSON.stringify({ name, collapsed: false })
        });
        newCategory = created || newCategory;
      } catch (error) {
        console.error('카테고리 생성 실패, 로컬로 진행합니다:', error);
      }
    }

    this.currentServer.categories.push(newCategory);
    this.renderChannelList();
  }

  async editCategory(category) {
    const name = await this.showInputDialog('카테고리 이름 변경:', category.name);
    if (!name || name === category.name) return;

    if (this.apiBase) {
      try {
        await this.apiRequest(`/servers/${this.currentServer.id}/categories/${category.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name })
        });
      } catch (error) {
        console.error('카테고리 수정 실패, 로컬로 진행합니다:', error);
      }
    }

    category.name = name;
    this.renderChannelList();
  }

  deleteCategory(category) {
    if (category.channels.length > 0) {
      if (!confirm(`"${category.name}" 카테고리에 ${category.channels.length}개의 채널이 있습니다. 삭제하시겠습니까?`)) {
        return;
      }
    }

    if (this.apiBase) {
      this.apiRequest(`/servers/${this.currentServer.id}/categories/${category.id}`, {
        method: 'DELETE'
      }).catch((error) => console.error('카테고리 삭제 실패 (계속 진행):', error));
    }

    const index = this.currentServer.categories.findIndex(c => c.id === category.id);
    if (index !== -1) {
      // 로컬 메시지 클리어
      category.channels.forEach(ch => {
        delete this.messages[ch.id];
        this.loadedMessages.delete(ch.id);
      });

      this.currentServer.categories.splice(index, 1);
      this.renderChannelList();
    }
  }

  async createNewChannel() {
    if (!this.currentServer) return;

    const name = await this.showInputDialog('새 채널 이름:');
    if (!name) return;

    // 카테고리 선택 (첫 번째 카테고리에 추가)
    if (this.currentServer.categories.length === 0) {
      await this.createNewCategory();
    }

    const category = this.currentServer.categories[0];
    let newChannel = {
      id: 'channel_' + Date.now(),
      name: name,
      type: 'text',
      unread: 0
    };

    if (this.apiBase) {
      try {
        const created = await this.apiRequest(`/servers/${this.currentServer.id}/categories/${category.id}/channels`, {
          method: 'POST',
          body: JSON.stringify({ name, type: 'text' })
        });
        newChannel = created || newChannel;
      } catch (error) {
        console.error('채널 생성 실패, 로컬로 진행합니다:', error);
      }
    }

    category.channels.push(newChannel);
    this.messages[newChannel.id] = [];
    this.renderChannelList();
    await this.selectChannel(newChannel);
  }

  async editChannel(channel) {
    const name = await this.showInputDialog('채널 이름 변경:', channel.name);
    if (!name || name === channel.name) return;

    const foundCategory = this.currentServer?.categories?.find(cat =>
      cat.channels.some(c => c.id === channel.id)
    );
    const categoryId = foundCategory?.id || this.currentServer?.categories?.[0]?.id;

    if (this.apiBase) {
      try {
        await this.apiRequest(`/servers/${this.currentServer.id}/categories/${categoryId}/channels/${channel.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name })
        });
      } catch (error) {
        console.error('채널 수정 실패, 로컬로 진행합니다:', error);
      }
    }

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

    if (this.apiBase) {
      this.apiRequest(`/servers/${this.currentServer.id}/categories/${category.id}/channels/${channel.id}`, {
        method: 'DELETE'
      }).catch((error) => console.error('채널 삭제 실패 (계속 진행):', error));
    }

    const index = category.channels.findIndex(c => c.id === channel.id);
    if (index !== -1) {
      category.channels.splice(index, 1);
      delete this.messages[channel.id];
      this.loadedMessages.delete(channel.id);

      if (this.currentChannel?.id === channel.id) {
        this.currentChannel = null;
        document.getElementById('messages-and-members').style.display = 'flex';
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
          ${this.renderMessageReactions(msg.id, channelId)}
        </div>
      `;

      // 우클릭 메뉴
      msgEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, msg, channelId);
      });

      // 리액션 클릭 이벤트
      const reactionItems = msgEl.querySelectorAll('.reaction-item');
      reactionItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const messageId = parseInt(item.dataset.messageId);
          const emoji = item.dataset.emoji;
          this.toggleReaction(messageId, channelId, emoji);
        });
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

  async applyMarkdownFormat(format) {
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
        const type = await this.showInputDialog('콜아웃 타입을 선택하세요:\ninfo / warning / error / success', 'info');
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

  async sendMessage() {
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

    let finalMessage = message;

    // 서버 저장 (실패 시 로컬 메시지 유지)
    if (this.apiBase) {
      try {
        const payload = {
          sender: {
            id: this.user.id,
            name: this.user.name,
            avatar: this.user.avatar
          },
          content: content,
          files: message.files
        };

        const saved = await this.apiRequest(`/channels/${this.currentChannel.id}/messages`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (saved) {
          finalMessage = this.normalizeMessage(saved);
          finalMessage.sent = true;
        }
      } catch (error) {
        console.error('메시지 서버 전송 실패, 로컬에만 표시합니다:', error);
      }
    }

    // 메시지 추가
    if (!this.messages[this.currentChannel.id]) {
      this.messages[this.currentChannel.id] = [];
    }
    this.messages[this.currentChannel.id].push(finalMessage);

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
    if (!window.electronAPI || !this.apiBase) return;

    try {
      window.electronAPI.connectSocket(this.apiBase);

      window.electronAPI.onSocketEvent('connect', () => {
        console.log('서버 연결됨');
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('connection-status');
        statusDot?.classList.add('connected');
        statusDot?.classList.remove('disconnected');
        if (statusText) {
          statusText.innerHTML = '<span class="status-dot connected"></span> 연결됨';
        }
        if (this.currentChannel) {
          window.electronAPI.emitSocketEvent('join', { channelId: this.currentChannel.id });
        }
      });

      window.electronAPI.onSocketEvent('disconnect', () => {
        console.log('서버 연결 끊김');
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('connection-status');
        statusDot?.classList.remove('connected');
        statusDot?.classList.add('disconnected');
        if (statusText) {
          statusText.innerHTML = '<span class="status-dot disconnected"></span> 연결 안됨';
        }
      });

      window.electronAPI.onSocketEvent('message', (data) => {
        this.handleIncomingMessage(data);
      });
    } catch (error) {
      console.error('소켓 연결 실패:', error);
    }
  }

  handleIncomingMessage(data) {
    const { channelId, message } = data;

    if (!this.messages[channelId]) {
      this.messages[channelId] = [];
    }
    const normalized = this.normalizeMessage(message);
    const exists = this.messages[channelId].some(m => m.id === normalized.id);
    if (!exists) {
      this.messages[channelId].push(normalized);
    }

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
      this.showNotification(normalized.sender.name, normalized.content);
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

  async handleMessageAction(action, target) {
    const { message, channelId } = target;

    switch (action) {
      case 'reaction':
        this.showEmojiPicker(message, channelId);
        break;
      case 'pin':
        this.togglePinMessage(message.id, channelId);
        break;
      case 'move':
        await this.moveMessageToChannel(message, channelId);
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

  async moveMessageToChannel(message, fromChannelId) {
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
    const input = await this.showInputDialog(`메시지를 이동할 채널 번호를 입력하세요:\n\n${channelNames}`);

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

      // 리액션도 제거
      if (this.reactions[channelId] && this.reactions[channelId][messageId]) {
        delete this.reactions[channelId][messageId];
      }

      this.renderMessages(channelId);
    }
  }

  // 이모티콘 선택 팝업 표시
  showEmojiPicker(message, channelId) {
    const picker = document.getElementById('emoji-picker');
    const contextMenu = document.getElementById('message-context-menu');

    // 컨텍스트 메뉴 위치 가져오기
    const rect = contextMenu.getBoundingClientRect();

    // 팝업 표시
    picker.style.display = 'block';
    picker.style.left = rect.left + 'px';
    picker.style.top = (rect.top + rect.height + 5) + 'px';

    // 화면 밖으로 나가지 않도록 조정
    setTimeout(() => {
      const pickerRect = picker.getBoundingClientRect();
      if (pickerRect.right > window.innerWidth) {
        picker.style.left = (window.innerWidth - pickerRect.width - 10) + 'px';
      }
      if (pickerRect.bottom > window.innerHeight) {
        picker.style.top = (rect.top - pickerRect.height - 5) + 'px';
      }
    }, 0);

    // 이모지 버튼에 이벤트 리스너 추가
    const emojiButtons = picker.querySelectorAll('.emoji-btn');
    const handleEmojiClick = (e) => {
      const emoji = e.currentTarget.dataset.emoji;
      this.toggleReaction(message.id, channelId, emoji);
      picker.style.display = 'none';

      // 이벤트 리스너 제거
      emojiButtons.forEach(btn => btn.removeEventListener('click', handleEmojiClick));
    };

    emojiButtons.forEach(btn => {
      btn.addEventListener('click', handleEmojiClick);
    });

    // 컨텍스트 메뉴 숨김
    contextMenu.style.display = 'none';
  }

  // 리액션 토글 (추가/제거)
  toggleReaction(messageId, channelId, emoji) {
    if (!this.reactions[channelId]) {
      this.reactions[channelId] = {};
    }
    if (!this.reactions[channelId][messageId]) {
      this.reactions[channelId][messageId] = {};
    }

    const messageReactions = this.reactions[channelId][messageId];
    const userId = this.user.id;

    if (!messageReactions[emoji]) {
      messageReactions[emoji] = [];
    }

    const userIndex = messageReactions[emoji].indexOf(userId);
    if (userIndex !== -1) {
      // 리액션 제거
      messageReactions[emoji].splice(userIndex, 1);
      // 아무도 이 이모지를 사용하지 않으면 삭제
      if (messageReactions[emoji].length === 0) {
        delete messageReactions[emoji];
      }
    } else {
      // 리액션 추가
      messageReactions[emoji].push(userId);
    }

    this.renderMessages(channelId);
  }

  // 메시지의 리액션 HTML 생성
  renderMessageReactions(messageId, channelId) {
    if (!this.reactions[channelId] || !this.reactions[channelId][messageId]) {
      return '';
    }

    const messageReactions = this.reactions[channelId][messageId];
    const emojis = Object.keys(messageReactions);

    if (emojis.length === 0) {
      return '';
    }

    const userId = this.user.id;
    const reactionsHtml = emojis.map(emoji => {
      const users = messageReactions[emoji];
      const count = users.length;
      const hasReacted = users.includes(userId);
      const reactedClass = hasReacted ? 'reacted' : '';

      return `
        <button class="reaction-item ${reactedClass}" data-message-id="${messageId}" data-emoji="${emoji}">
          <span class="emoji">${emoji}</span>
          <span class="count">${count}</span>
        </button>
      `;
    }).join('');

    return `<div class="message-reactions">${reactionsHtml}</div>`;
  }

  // ========================================
  // 메시지 다운로드
  // ========================================

  async downloadMessages() {
    if (!this.currentChannel) return;

    const messages = this.messages[this.currentChannel.id] || [];

    if (messages.length === 0) {
      alert('다운로드할 메시지가 없습니다.');
      return;
    }

    const format = await this.showInputDialog('다운로드 형식을 선택하세요:\n1. JSON\n2. TXT', '1');

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

  // ========================================
  // 리사이저 시스템 (조절 가능한 패널)
  // ========================================

  initResizers() {
    // 사이드바 리사이저 (좌우 조절)
    this.setupResizer('sidebar-resizer', 'horizontal', (delta) => {
      const chatList = document.getElementById('chat-list');
      const currentWidth = chatList.offsetWidth;
      const newWidth = Math.max(240, Math.min(600, currentWidth + delta));
      chatList.style.width = newWidth + 'px';
    });

    // 멤버 패널 리사이저 (좌우 조절)
    this.setupResizer('members-resizer', 'vertical', (delta) => {
      const messagesContainer = document.getElementById('messages-container');
      const currentHeight = messagesContainer.offsetHeight;
      const newHeight = Math.max(200, currentHeight - delta);
      messagesContainer.style.height = newHeight + 'px';
    });

    // 입력 영역 리사이저 (상하 조절)
    this.setupResizer('input-resizer', 'horizontal', (delta) => {
      const inputArea = document.getElementById('input-area');
      const currentHeight = inputArea.offsetHeight;
      const newHeight = Math.max(60, currentHeight + delta);
      inputArea.style.height = newHeight + 'px';

      // 텍스트 영역 높이도 조정
      const textarea = document.getElementById('message-input');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight - 16) + 'px';
      }
    });
  }

  setupResizer(resizerId, direction, onDrag) {
    const resizer = document.getElementById(resizerId);
    if (!resizer) return;

    let isResizing = false;
    let startPos = 0;

    const handleMouseDown = (e) => {
      isResizing = true;
      startPos = direction === 'horizontal' ? e.clientX : e.clientY;
      resizer.classList.add('active');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    };

    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos;

      if (Math.abs(delta) > 1) {
        onDrag(delta);
        startPos = currentPos;
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('active');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };

    resizer.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // ========================================
  // 음성채팅 기능
  // ========================================
  openVoiceChatModal() {
    const modal = document.getElementById('voice-chat-modal');
    modal.style.display = 'flex';
    this.startVoiceChat();
  }

  setupVoiceChatEvents() {
    const modal = document.getElementById('voice-chat-modal');
    const closeBtn = document.getElementById('close-voice-chat');
    const minimizeBtn = document.getElementById('minimize-voice-chat');
    const toggleMic = document.getElementById('btn-toggle-mic');
    const toggleSpeaker = document.getElementById('btn-toggle-speaker');
    const leaveVoice = document.getElementById('btn-leave-voice');

    closeBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
      this.stopVoiceChat();
    });

    minimizeBtn?.addEventListener('click', () => {
      this.minimizeVoiceChat();
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
        this.stopVoiceChat();
      }
    });

    toggleMic?.addEventListener('click', () => {
      this.toggleMicrophone();
    });

    toggleSpeaker?.addEventListener('click', () => {
      this.toggleSpeaker();
    });

    leaveVoice?.addEventListener('click', () => {
      modal.style.display = 'none';
      this.stopVoiceChat();
    });

    // 축소된 창 복원 버튼
    const restoreBtns = document.querySelectorAll('[data-restore="voice-chat"]');
    restoreBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.restoreVoiceChat();
      });
    });
  }

  startVoiceChat() {
    this.voiceChat.isActive = true;
    this.voiceChat.startTime = Date.now();
    this.voiceChat.participants = [
      { id: this.user.id, name: this.user.name, avatar: this.user.avatar, isMuted: false }
    ];

    // 타이머 시작
    this.updateVoiceTimer();
    this.voiceTimerInterval = setInterval(() => {
      this.updateVoiceTimer();
    }, 1000);

    // 참여자 렌더링
    this.renderVoiceParticipants();

    // 상태 업데이트
    const statusText = document.getElementById('voice-status-text');
    if (statusText) {
      statusText.textContent = '음성채팅에 연결되었습니다';
    }
  }

  stopVoiceChat() {
    this.voiceChat.isActive = false;
    this.voiceChat.startTime = null;
    this.voiceChat.participants = [];

    if (this.voiceTimerInterval) {
      clearInterval(this.voiceTimerInterval);
      this.voiceTimerInterval = null;
    }

    // 타이머 리셋
    const timer = document.getElementById('voice-timer');
    if (timer) {
      timer.textContent = '00:00';
    }

    // 축소된 창도 숨기기
    const minimizedWindow = document.getElementById('minimized-voice-chat');
    if (minimizedWindow) minimizedWindow.style.display = 'none';
  }

  updateVoiceTimer() {
    if (!this.voiceChat.startTime) return;

    const elapsed = Math.floor((Date.now() - this.voiceChat.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const timer = document.getElementById('voice-timer');
    if (timer) {
      timer.textContent = timeString;
    }

    // 축소된 창의 타이머도 업데이트
    const minimizedTimer = document.getElementById('minimized-voice-timer');
    if (minimizedTimer) {
      minimizedTimer.textContent = timeString;
    }
  }

  renderVoiceParticipants() {
    const container = document.getElementById('voice-participants');
    if (!container) return;

    container.innerHTML = this.voiceChat.participants.map(p => `
      <div class="voice-participant">
        <div class="voice-participant-avatar">${p.avatar}</div>
        <div class="voice-participant-info">
          <div class="voice-participant-name">${p.name}</div>
          <div class="voice-participant-status">${p.isMuted ? '음소거됨' : '말하는 중...'}</div>
        </div>
      </div>
    `).join('');
  }

  toggleMicrophone() {
    this.voiceChat.isMuted = !this.voiceChat.isMuted;
    const btn = document.getElementById('btn-toggle-mic');
    if (btn) {
      btn.classList.toggle('active', this.voiceChat.isMuted);
      const span = btn.querySelector('span');
      if (span) {
        span.textContent = this.voiceChat.isMuted ? '음소거 해제' : '음소거';
      }
    }
  }

  toggleSpeaker() {
    this.voiceChat.isSpeakerOn = !this.voiceChat.isSpeakerOn;
    const btn = document.getElementById('btn-toggle-speaker');
    if (btn) {
      btn.classList.toggle('active', !this.voiceChat.isSpeakerOn);
    }
  }

  minimizeVoiceChat() {
    const modal = document.getElementById('voice-chat-modal');
    const minimizedWindow = document.getElementById('minimized-voice-chat');

    modal.style.display = 'none';
    minimizedWindow.style.display = 'block';
  }

  restoreVoiceChat() {
    const modal = document.getElementById('voice-chat-modal');
    const minimizedWindow = document.getElementById('minimized-voice-chat');

    modal.style.display = 'flex';
    minimizedWindow.style.display = 'none';
  }

  // ========================================
  // 화면 공유 기능
  // ========================================
  openScreenShareModal() {
    const modal = document.getElementById('screen-share-modal');
    modal.style.display = 'flex';
  }

  setupScreenShareEvents() {
    const modal = document.getElementById('screen-share-modal');
    const closeBtn = document.getElementById('close-screen-share');
    const minimizeBtn = document.getElementById('minimize-screen-share');
    const shareEntireScreen = document.getElementById('share-entire-screen');
    const shareWindow = document.getElementById('share-window');
    const shareTab = document.getElementById('share-tab');
    const stopShare = document.getElementById('btn-stop-share');

    closeBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
      this.stopScreenShare();
    });

    minimizeBtn?.addEventListener('click', () => {
      this.minimizeScreenShare();
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
        this.stopScreenShare();
      }
    });

    shareEntireScreen?.addEventListener('click', () => {
      this.startScreenShare('screen');
    });

    shareWindow?.addEventListener('click', () => {
      this.startScreenShare('window');
    });

    shareTab?.addEventListener('click', () => {
      this.startScreenShare('tab');
    });

    stopShare?.addEventListener('click', () => {
      this.stopScreenShare();
    });

    // 축소된 창 복원 버튼
    const restoreBtns = document.querySelectorAll('[data-restore="screen-share"]');
    restoreBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.restoreScreenShare();
      });
    });
  }

  async startScreenShare(type) {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      this.screenShare.isSharing = true;
      this.screenShare.stream = stream;

      // 옵션 숨기고 프리뷰 표시
      const options = document.querySelector('.screen-share-options');
      const preview = document.getElementById('screen-preview');
      const video = document.getElementById('screen-video');

      if (options) options.style.display = 'none';
      if (preview) preview.style.display = 'block';
      if (video) video.srcObject = stream;

      // 스트림이 종료되면 자동으로 정리
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopScreenShare();
      });

    } catch (err) {
      console.error('화면 공유 시작 실패:', err);
      alert('화면 공유를 시작할 수 없습니다.');
    }
  }

  stopScreenShare() {
    if (this.screenShare.stream) {
      this.screenShare.stream.getTracks().forEach(track => track.stop());
      this.screenShare.stream = null;
    }

    this.screenShare.isSharing = false;

    // UI 리셋
    const options = document.querySelector('.screen-share-options');
    const preview = document.getElementById('screen-preview');
    const video = document.getElementById('screen-video');

    if (options) options.style.display = 'grid';
    if (preview) preview.style.display = 'none';
    if (video) video.srcObject = null;

    // 축소된 창도 숨기기
    const minimizedWindow = document.getElementById('minimized-screen-share');
    if (minimizedWindow) minimizedWindow.style.display = 'none';
  }

  minimizeScreenShare() {
    const modal = document.getElementById('screen-share-modal');
    const minimizedWindow = document.getElementById('minimized-screen-share');

    modal.style.display = 'none';
    minimizedWindow.style.display = 'block';
  }

  restoreScreenShare() {
    const modal = document.getElementById('screen-share-modal');
    const minimizedWindow = document.getElementById('minimized-screen-share');

    modal.style.display = 'flex';
    minimizedWindow.style.display = 'none';
  }

  // ========================================
  // 일정관리 달력 기능
  // ========================================
  openCalendarModal() {
    const modal = document.getElementById('calendar-modal');
    modal.style.display = 'flex';
    this.renderCalendar();
    this.renderEvents();
  }

  setupCalendarEvents() {
    const modal = document.getElementById('calendar-modal');
    const closeBtn = document.getElementById('close-calendar');
    const prevMonth = document.getElementById('prev-month');
    const nextMonth = document.getElementById('next-month');
    const addEventBtn = document.getElementById('btn-add-event');

    closeBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    prevMonth?.addEventListener('click', () => {
      this.calendar.currentMonth--;
      if (this.calendar.currentMonth < 0) {
        this.calendar.currentMonth = 11;
        this.calendar.currentYear--;
      }
      this.renderCalendar();
    });

    nextMonth?.addEventListener('click', () => {
      this.calendar.currentMonth++;
      if (this.calendar.currentMonth > 11) {
        this.calendar.currentMonth = 0;
        this.calendar.currentYear++;
      }
      this.renderCalendar();
    });

    addEventBtn?.addEventListener('click', () => {
      this.openAddEventModal();
    });

    // 일정 추가 모달 이벤트
    this.setupAddEventEvents();
  }

  setupAddEventEvents() {
    const modal = document.getElementById('add-event-modal');
    const closeBtn = document.getElementById('close-add-event');
    const cancelBtn = document.getElementById('cancel-event');
    const saveBtn = document.getElementById('save-event');

    closeBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    cancelBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    saveBtn?.addEventListener('click', () => {
      this.saveEvent();
    });
  }

  renderCalendar() {
    const year = this.calendar.currentYear;
    const month = this.calendar.currentMonth;

    // 월 표시 업데이트
    const monthElement = document.getElementById('current-month');
    if (monthElement) {
      monthElement.textContent = `${year}년 ${month + 1}월`;
    }

    // 달력 날짜 생성
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const daysContainer = document.getElementById('calendar-days');
    if (!daysContainer) return;

    let html = '';

    // 이전 달 날짜
    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month">${daysInPrevMonth - i}</div>`;
    }

    // 현재 달 날짜
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = year === today.getFullYear() &&
                      month === today.getMonth() &&
                      day === today.getDate();
      const hasEvent = this.calendar.events.some(e => {
        const eventDate = new Date(e.date);
        return eventDate.getFullYear() === year &&
               eventDate.getMonth() === month &&
               eventDate.getDate() === day;
      });

      const classes = ['calendar-day'];
      if (isToday) classes.push('today');
      if (hasEvent) classes.push('has-event');

      html += `<div class="${classes.join(' ')}" data-date="${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}">${day}</div>`;
    }

    // 다음 달 날짜
    const remainingDays = 42 - (firstDay + daysInMonth);
    for (let day = 1; day <= remainingDays; day++) {
      html += `<div class="calendar-day other-month">${day}</div>`;
    }

    daysContainer.innerHTML = html;

    // 날짜 클릭 이벤트
    daysContainer.querySelectorAll('.calendar-day:not(.other-month)').forEach(dayEl => {
      dayEl.addEventListener('click', () => {
        daysContainer.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        dayEl.classList.add('selected');
        this.calendar.selectedDate = dayEl.dataset.date;
        this.renderEvents();
      });
    });
  }

  renderEvents() {
    const container = document.getElementById('events-list');
    if (!container) return;

    let events = this.calendar.events;

    // 선택된 날짜가 있으면 필터링
    if (this.calendar.selectedDate) {
      events = events.filter(e => e.date === this.calendar.selectedDate);
    }

    if (events.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">일정이 없습니다</p>';
      return;
    }

    container.innerHTML = events.map(event => `
      <div class="event-item">
        <div class="event-time">${event.time || '종일'}</div>
        <div class="event-details">
          <div class="event-title">${event.title}</div>
          ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  openAddEventModal() {
    const modal = document.getElementById('add-event-modal');
    modal.style.display = 'flex';

    // 선택된 날짜가 있으면 자동 입력
    if (this.calendar.selectedDate) {
      const dateInput = document.getElementById('event-date');
      if (dateInput) {
        dateInput.value = this.calendar.selectedDate;
      }
    }
  }

  saveEvent() {
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const time = document.getElementById('event-time').value;
    const description = document.getElementById('event-description').value.trim();

    if (!title || !date) {
      alert('제목과 날짜를 입력해주세요.');
      return;
    }

    const event = {
      id: 'event_' + Date.now(),
      title,
      date,
      time,
      description
    };

    this.calendar.events.push(event);

    // 모달 닫기
    const modal = document.getElementById('add-event-modal');
    modal.style.display = 'none';

    // 입력 필드 초기화
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    document.getElementById('event-time').value = '';
    document.getElementById('event-description').value = '';

    // 달력과 일정 목록 업데이트
    this.renderCalendar();
    this.renderEvents();
  }

  // ========================================
  // 마이페이지 기능
  // ========================================
  openMyPageModal() {
    const modal = document.getElementById('mypage-modal');
    modal.style.display = 'flex';

    // 현재 프로필 정보 로드
    this.loadProfileData();
  }

  setupMyPageEvents() {
    const modal = document.getElementById('mypage-modal');
    const closeBtn = document.getElementById('close-mypage');
    const cancelBtn = document.getElementById('cancel-profile');
    const saveBtn = document.getElementById('save-profile');
    const statusBtns = document.querySelectorAll('.status-btn');

    closeBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    cancelBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    saveBtn?.addEventListener('click', () => {
      this.saveProfile();
    });

    statusBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        statusBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const status = btn.dataset.status;
        this.updateUserStatus(status);
      });
    });
  }

  loadProfileData() {
    const nameElement = document.getElementById('profile-name');
    const avatarText = document.getElementById('profile-avatar-text');
    const nameInput = document.getElementById('profile-name-input');
    const statusMsg = document.getElementById('profile-status-msg');
    const email = document.getElementById('profile-email');
    const phone = document.getElementById('profile-phone');

    if (nameElement) nameElement.textContent = this.profile.name;
    if (avatarText) avatarText.textContent = this.profile.name[0] || 'U';
    if (nameInput) nameInput.value = this.profile.name;
    if (statusMsg) statusMsg.value = this.profile.statusMessage;
    if (email) email.value = this.profile.email;
    if (phone) phone.value = this.profile.phone;

    // 현재 상태 버튼 활성화
    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === this.profile.status);
    });
  }

  saveProfile() {
    const nameInput = document.getElementById('profile-name-input').value.trim();
    const statusMsg = document.getElementById('profile-status-msg').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();

    if (!nameInput) {
      alert('이름을 입력해주세요.');
      return;
    }

    this.profile.name = nameInput;
    this.profile.statusMessage = statusMsg;
    this.profile.email = email;
    this.profile.phone = phone;

    // 사용자 정보 업데이트
    this.user.name = nameInput;
    this.user.avatar = nameInput[0] || 'U';

    // UI 업데이트
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) {
      const span = userAvatar.querySelector('span');
      if (span) span.textContent = this.user.avatar;
    }

    // 모달 닫기
    const modal = document.getElementById('mypage-modal');
    modal.style.display = 'none';

    alert('프로필이 저장되었습니다.');
  }

  updateUserStatus(status) {
    this.profile.status = status;
    this.user.status = status;

    // 상태 표시 업데이트
    const statusIndicator = document.getElementById('user-status-indicator');
    if (statusIndicator) {
      statusIndicator.className = 'user-status ' + status;
    }
  }

  // ========================================
  // 화이트보드 기능
  // ========================================
  openWhiteboardModal() {
    const modal = document.getElementById('whiteboard-modal');
    modal.style.display = 'flex';

    // 캔버스 초기화
    setTimeout(() => {
      this.initWhiteboardCanvas();
    }, 100);
  }

  setupWhiteboardEvents() {
    const modal = document.getElementById('whiteboard-modal');
    const closeBtn = document.getElementById('close-whiteboard');

    closeBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    // 도구 버튼들
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.whiteboard.currentTool = btn.dataset.tool;

        // 도구에 따라 커서 변경
        const canvas = this.whiteboard.canvas;
        if (canvas) {
          if (this.whiteboard.currentTool === 'eraser') {
            canvas.style.cursor = 'pointer';
          } else {
            canvas.style.cursor = 'crosshair';
          }
        }
      });
    });

    // 색상 선택
    const colorPicker = document.getElementById('wb-color');
    colorPicker?.addEventListener('input', (e) => {
      this.whiteboard.currentColor = e.target.value;
    });

    // 굵기 조절
    const widthSlider = document.getElementById('wb-width');
    const widthValue = document.getElementById('wb-width-value');
    widthSlider?.addEventListener('input', (e) => {
      this.whiteboard.currentWidth = parseInt(e.target.value);
      if (widthValue) {
        widthValue.textContent = e.target.value;
      }
    });

    // 채우기 모드
    const fillCheckbox = document.getElementById('wb-fill');
    fillCheckbox?.addEventListener('change', (e) => {
      this.whiteboard.isFillMode = e.target.checked;
    });

    // 배경 색상
    const bgColorPicker = document.getElementById('wb-bg-color');
    bgColorPicker?.addEventListener('input', (e) => {
      this.whiteboard.currentBgColor = e.target.value;
      this.updateWhiteboardBackground();
    });

    // 그리드 표시
    const gridCheckbox = document.getElementById('wb-grid');
    gridCheckbox?.addEventListener('change', (e) => {
      this.whiteboard.showGrid = e.target.checked;
      this.redrawWhiteboard();
    });

    // 이미지 업로드
    const uploadBtn = document.getElementById('wb-upload-image');
    const imageInput = document.getElementById('wb-image-input');
    uploadBtn?.addEventListener('click', () => {
      imageInput?.click();
    });
    imageInput?.addEventListener('change', (e) => {
      this.uploadImageToWhiteboard(e);
    });

    // 전체 지우기
    document.getElementById('wb-clear')?.addEventListener('click', () => {
      if (confirm('모든 내용을 지우시겠습니까?')) {
        this.clearWhiteboard();
      }
    });

    // 실행 취소
    document.getElementById('wb-undo')?.addEventListener('click', () => {
      this.undoWhiteboard();
    });

    // 다시 실행
    document.getElementById('wb-redo')?.addEventListener('click', () => {
      this.redoWhiteboard();
    });

    // 다운로드
    document.getElementById('wb-download')?.addEventListener('click', () => {
      this.downloadWhiteboard();
    });
  }

  initWhiteboardCanvas() {
    const canvas = document.getElementById('whiteboard-canvas');
    if (!canvas) return;

    // 캔버스 크기 설정
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    canvas.width = Math.min(containerWidth - 40, 1200);
    canvas.height = Math.min(containerHeight - 40, 800);

    this.whiteboard.canvas = canvas;
    this.whiteboard.ctx = canvas.getContext('2d');

    // 임시 캔버스 생성 (도형 그리기용)
    this.whiteboard.tempCanvas = document.createElement('canvas');
    this.whiteboard.tempCanvas.width = canvas.width;
    this.whiteboard.tempCanvas.height = canvas.height;
    this.whiteboard.tempCtx = this.whiteboard.tempCanvas.getContext('2d');

    // 초기 배경 설정
    this.whiteboard.ctx.fillStyle = 'white';
    this.whiteboard.ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 초기 히스토리 저장
    this.saveWhiteboardState();

    // 이벤트 리스너
    canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    canvas.addEventListener('mousemove', (e) => this.draw(e));
    canvas.addEventListener('mouseup', () => this.stopDrawing());
    canvas.addEventListener('mouseout', () => this.stopDrawing());
  }

  getCanvasCoords(e) {
    const canvas = this.whiteboard.canvas;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  startDrawing(e) {
    const coords = this.getCanvasCoords(e);
    this.whiteboard.startX = coords.x;
    this.whiteboard.startY = coords.y;

    // 텍스트 도구는 클릭 시 입력창 표시
    if (this.whiteboard.currentTool === 'text') {
      this.addTextToWhiteboard(coords.x, coords.y);
      return;
    }

    this.whiteboard.isDrawing = true;
    const ctx = this.whiteboard.ctx;
    ctx.strokeStyle = this.whiteboard.currentColor;
    ctx.fillStyle = this.whiteboard.currentColor;
    ctx.lineWidth = this.whiteboard.currentWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.whiteboard.currentTool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    } else if (this.whiteboard.currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  }

  draw(e) {
    if (!this.whiteboard.isDrawing) return;

    const coords = this.getCanvasCoords(e);
    const ctx = this.whiteboard.ctx;
    const tempCtx = this.whiteboard.tempCtx;

    if (this.whiteboard.currentTool === 'pen') {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    } else if (this.whiteboard.currentTool === 'eraser') {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    } else if (['line', 'rectangle', 'circle'].includes(this.whiteboard.currentTool)) {
      // 도형은 임시 캔버스에 그리기
      const canvas = this.whiteboard.canvas;
      tempCtx.clearRect(0, 0, canvas.width, canvas.height);
      tempCtx.strokeStyle = this.whiteboard.currentColor;
      tempCtx.fillStyle = this.whiteboard.currentColor;
      tempCtx.lineWidth = this.whiteboard.currentWidth;
      tempCtx.lineCap = 'round';

      if (this.whiteboard.currentTool === 'line') {
        tempCtx.beginPath();
        tempCtx.moveTo(this.whiteboard.startX, this.whiteboard.startY);
        tempCtx.lineTo(coords.x, coords.y);
        tempCtx.stroke();
      } else if (this.whiteboard.currentTool === 'rectangle') {
        const width = coords.x - this.whiteboard.startX;
        const height = coords.y - this.whiteboard.startY;
        if (this.whiteboard.isFillMode) {
          tempCtx.fillRect(this.whiteboard.startX, this.whiteboard.startY, width, height);
        } else {
          tempCtx.strokeRect(this.whiteboard.startX, this.whiteboard.startY, width, height);
        }
      } else if (this.whiteboard.currentTool === 'circle') {
        const radius = Math.sqrt(
          Math.pow(coords.x - this.whiteboard.startX, 2) +
          Math.pow(coords.y - this.whiteboard.startY, 2)
        );
        tempCtx.beginPath();
        tempCtx.arc(this.whiteboard.startX, this.whiteboard.startY, radius, 0, 2 * Math.PI);
        if (this.whiteboard.isFillMode) {
          tempCtx.fill();
        } else {
          tempCtx.stroke();
        }
      }

      // 메인 캔버스에 임시 캔버스 합성
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.putImageData(imageData, 0, 0);
      ctx.drawImage(this.whiteboard.tempCanvas, 0, 0);
    }
  }

  stopDrawing() {
    if (!this.whiteboard.isDrawing) return;
    this.whiteboard.isDrawing = false;

    const ctx = this.whiteboard.ctx;

    // 지우개 모드 해제
    if (this.whiteboard.currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
    }

    // 도형 그리기 완료
    if (['line', 'rectangle', 'circle'].includes(this.whiteboard.currentTool)) {
      const canvas = this.whiteboard.canvas;
      ctx.drawImage(this.whiteboard.tempCanvas, 0, 0);
      this.whiteboard.tempCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // 히스토리 저장
    this.saveWhiteboardState();
  }

  saveWhiteboardState() {
    const canvas = this.whiteboard.canvas;
    if (!canvas) return;

    // 현재 상태 이후의 히스토리 제거
    this.whiteboard.history = this.whiteboard.history.slice(0, this.whiteboard.historyStep + 1);

    // 현재 상태 저장
    this.whiteboard.history.push(canvas.toDataURL());
    this.whiteboard.historyStep++;

    // 히스토리 최대 50개로 제한
    if (this.whiteboard.history.length > 50) {
      this.whiteboard.history.shift();
      this.whiteboard.historyStep--;
    }
  }

  clearWhiteboard() {
    const ctx = this.whiteboard.ctx;
    const canvas = this.whiteboard.canvas;
    if (!ctx || !canvas) return;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.saveWhiteboardState();
  }

  undoWhiteboard() {
    if (this.whiteboard.historyStep > 0) {
      this.whiteboard.historyStep--;
      this.restoreWhiteboardState();
    }
  }

  redoWhiteboard() {
    if (this.whiteboard.historyStep < this.whiteboard.history.length - 1) {
      this.whiteboard.historyStep++;
      this.restoreWhiteboardState();
    }
  }

  restoreWhiteboardState() {
    const canvas = this.whiteboard.canvas;
    const ctx = this.whiteboard.ctx;
    const state = this.whiteboard.history[this.whiteboard.historyStep];

    if (!canvas || !ctx || !state) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = state;
  }

  downloadWhiteboard() {
    const canvas = this.whiteboard.canvas;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }

  // 텍스트 추가
  addTextToWhiteboard(x, y) {
    // 기존 텍스트 입력창이 있으면 제거
    if (this.whiteboard.textInput) {
      this.whiteboard.textInput.remove();
      this.whiteboard.textInput = null;
    }

    const canvas = this.whiteboard.canvas;
    const canvasContainer = canvas.parentElement;

    // 텍스트 입력창 생성
    const input = document.createElement('input');
    input.type = 'text';
    input.style.position = 'absolute';
    input.style.left = `${canvas.offsetLeft + x}px`;
    input.style.top = `${canvas.offsetTop + y}px`;
    input.style.fontSize = '16px';
    input.style.padding = '4px 8px';
    input.style.border = '2px solid ' + this.whiteboard.currentColor;
    input.style.borderRadius = '4px';
    input.style.backgroundColor = 'white';
    input.style.color = this.whiteboard.currentColor;
    input.style.outline = 'none';
    input.style.fontFamily = 'Arial, sans-serif';
    input.style.zIndex = '1000';

    this.whiteboard.textInput = input;
    canvasContainer.appendChild(input);
    input.focus();

    // 엔터 키 또는 포커스 아웃 시 텍스트를 캔버스에 그리기
    const drawText = () => {
      const text = input.value.trim();
      if (text) {
        const ctx = this.whiteboard.ctx;
        ctx.font = '16px Arial, sans-serif';
        ctx.fillStyle = this.whiteboard.currentColor;
        ctx.textBaseline = 'top';
        ctx.fillText(text, x, y);
        this.saveWhiteboardState();
      }
      input.remove();
      this.whiteboard.textInput = null;
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        drawText();
      } else if (e.key === 'Escape') {
        input.remove();
        this.whiteboard.textInput = null;
      }
    });

    input.addEventListener('blur', drawText);
  }

  // 배경 색상 업데이트
  updateWhiteboardBackground() {
    const canvas = this.whiteboard.canvas;
    const ctx = this.whiteboard.ctx;
    if (!canvas || !ctx) return;

    // 현재 내용 저장
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 배경 색상 변경
    ctx.fillStyle = this.whiteboard.currentBgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 이전 내용 복원
    ctx.putImageData(imageData, 0, 0);

    this.redrawWhiteboard();
    this.saveWhiteboardState();
  }

  // 캔버스 다시 그리기 (그리드 포함)
  redrawWhiteboard() {
    const canvas = this.whiteboard.canvas;
    const ctx = this.whiteboard.ctx;
    if (!canvas || !ctx) return;

    // 현재 상태의 이미지 데이터 저장
    const currentState = this.whiteboard.history[this.whiteboard.historyStep];
    if (!currentState) return;

    const img = new Image();
    img.onload = () => {
      // 배경 색상
      ctx.fillStyle = this.whiteboard.currentBgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 그리드 그리기
      if (this.whiteboard.showGrid) {
        this.drawGrid();
      }

      // 원본 이미지 복원
      ctx.drawImage(img, 0, 0);
    };
    img.src = currentState;
  }

  // 그리드 그리기
  drawGrid() {
    const canvas = this.whiteboard.canvas;
    const ctx = this.whiteboard.ctx;
    if (!canvas || !ctx) return;

    const gridSize = 20;
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;

    // 세로선
    for (let x = 0; x <= canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // 가로선
    for (let y = 0; y <= canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  // 이미지 업로드
  uploadImageToWhiteboard(e) {
    const file = e.target.files[0];
    if (!file || !file.type.match('image.*')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = this.whiteboard.canvas;
        const ctx = this.whiteboard.ctx;
        if (!canvas || !ctx) return;

        // 이미지 크기 조정 (캔버스에 맞게)
        const maxWidth = canvas.width * 0.5;
        const maxHeight = canvas.height * 0.5;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        // 중앙에 배치
        const x = (canvas.width - width) / 2;
        const y = (canvas.height - height) / 2;

        ctx.drawImage(img, x, y, width, height);
        this.saveWhiteboardState();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);

    // 입력 초기화
    e.target.value = '';
  }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  window.app = new WorkMessenger();
});
