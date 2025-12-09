import { AuthManager } from './modules/AuthManager.js';
import { SocketManager } from './modules/SocketManager.js';
import { UIManager } from './modules/UIManager.js';
import { ChatManager } from './modules/ChatManager.js';
import { ServerManager } from './modules/ServerManager.js';
import { WebRTCManager } from './modules/WebRTCManager.js';

class WorkMessenger {
  constructor() {
    this.apiBase = 'http://localhost:8000';

    // Initialize Managers
    this.auth = new AuthManager(this);
    this.socketManager = new SocketManager(this);
    this.uiManager = new UIManager(this);
    this.chatManager = new ChatManager(this);
    this.serverManager = new ServerManager(this);
    this.webRTCManager = new WebRTCManager(this);

    this.init();
  }

  // Alias for AuthManager calling after login
  async initializeApp() {
    return this.init();
  }

  async init() {
    // UI 초기화
    this.uiManager.init();

    // 인증 상태 및 초기 데이터 로드
    // If we call initializeApp from login, checkAuth might return true quickly or we just skip it if already done?
    // In AuthManager, it sets isAuthenticated before calling initializeApp.
    // checkAuth checks storage.

    if (!this.auth.isAuthenticated) {
      await this.auth.checkAuth();
    }

    if (this.auth.isAuthenticated) {
      // 먼저 소켓 연결 시작
      this.socketManager.connect();

      // 소켓 연결 완료 대기 (최대 5초)
      await this.waitForSocketConnection(5000);

      // 그 다음 서버 데이터 로드 (채널 선택 시 join 이벤트 발생)
      await this.serverManager.loadServerData();

      // Update UI with user info
      if (this.auth.currentUser) {
        this.updateUserInfo(this.auth.currentUser);
      }
    } else {
      this.auth.showAuthScreen();
    }

    // 글로벌 이벤트 바인딩 (필요한 경우)
    this.bindGlobalEvents();

    // Hide Initial Loading Screen
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }
  }

  updateUserInfo(user) {
    const nameElement = document.getElementById('profile-name');
    const avatarText = document.getElementById('profile-avatar-text');
    const nameInput = document.getElementById('profile-name-input');
    const statusMsg = document.getElementById('profile-status-msg');
    const email = document.getElementById('profile-email');
    const phone = document.getElementById('profile-phone');

    if (nameElement) nameElement.textContent = user.name;
    if (avatarText) avatarText.textContent = (user.name && user.name[0]) ? user.name[0] : 'U';
    if (nameInput) nameInput.value = user.name;
    if (statusMsg) statusMsg.value = user.status_message || '';
    if (email) email.value = user.email || '';
    if (phone) phone.value = user.phone || '';

    // Status buttons
    // Status buttons
    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === (user.status || 'online'));
    });
  }

  // Proxy methods for index.html onclicks
  updateMemberRole() {
    // Logic for updating member role (likely in ServerManager or specialized modal logic)
    // Since specific logic wasn't extracted, we'll log for now or delegate if implemented
    console.log('updateMemberRole called');
    // this.serverManager.updateMemberRole(); // If implemented
  }

  showEditProfileModal() {
    this.uiManager.showModal('edit-profile-modal');
    // Load current profile data into inputs
    if (this.auth.currentUser) {
      // logic similar to loadProfileData
      this.updateUserInfo(this.auth.currentUser);
      // Note: updateUserInfo updates PREVIEW. Inputs might need separate setters if not already covered.
      // For now, rely on what we have.
    }
  }

  saveProfileEdits() {
    // Logic to save profile
    // this.auth.updateProfile(...);
    console.log('saveProfileEdits called');
    this.uiManager.hideModal('edit-profile-modal');
  }

  closeMentionsModal() {
    this.uiManager.hideModal('mentions-modal');
  }

  closeNotificationSettingsModal() {
    this.uiManager.hideModal('notification-settings-modal');
  }

  // 소켓 연결 완료 대기
  waitForSocketConnection(timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkConnection = () => {
        if (window.electronAPI?.isSocketConnected?.()) {
          console.log('[WorkMessenger] 소켓 연결 완료!');
          resolve(true);
        } else if (Date.now() - startTime >= timeout) {
          console.warn('[WorkMessenger] 소켓 연결 타임아웃 - 계속 진행합니다');
          resolve(false);
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  // Central API Request Method
  async apiRequest(endpoint, options = {}) {
    const url = `${this.apiBase}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.auth.authToken) {
      headers['Authorization'] = `Bearer ${this.auth.authToken}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        this.auth.handleLogout('세션이 만료되었습니다. 다시 로그인해주세요.');
        return null; // Stop processing
      }

      const text = await response.text();
      return text ? JSON.parse(text) : {};

    } catch (error) {
      console.error(`API Request Error [${endpoint}]:`, error);
      throw error;
    }
  }

  bindGlobalEvents() {
    if (this.globalEventsBound) return;
    this.globalEventsBound = true;

    // Window Controls
    const btnMinimize = document.getElementById('btn-minimize');
    const btnMaximize = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');

    if (btnMinimize) btnMinimize.addEventListener('click', () => window.electronAPI.minimizeWindow());
    if (btnMaximize) btnMaximize.addEventListener('click', () => window.electronAPI.maximizeWindow());
    if (btnClose) btnClose.addEventListener('click', () => window.electronAPI.closeWindow());

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // ESC to close modals
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => modal.style.display = 'none');
      }

      // Ctrl+T or Cmd+T for Theme Toggle
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault(); // Prevent new tab/window
        this.uiManager.toggleTheme();
      }
    });
  }

}

// Make app accessible globally for inline event handlers and debugging
window.WorkMessenger = WorkMessenger;

// App Start
document.addEventListener('DOMContentLoaded', () => {
  window.app = new WorkMessenger();
});
