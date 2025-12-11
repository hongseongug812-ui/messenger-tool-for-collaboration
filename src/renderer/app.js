import { AuthManager } from './modules/AuthManager.js';
import { SocketManager } from './modules/SocketManager.js';
import { UIManager } from './modules/UIManager.js';
import { ChatManager } from './modules/ChatManager.js';
import { ServerManager } from './modules/ServerManager.js';
import { WebRTCManager } from './modules/WebRTCManager.js';
import { WhiteboardManager } from './modules/WhiteboardManager.js';
import { NotepadManager } from './modules/NotepadManager.js';

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
    this.whiteboardManager = new WhiteboardManager(this);
    this.notepadManager = new NotepadManager(this);

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

    // 글로벌 이벤트 바인딩
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
      const user = this.auth.currentUser;
      const nameInput = document.getElementById('edit-profile-name');
      const emailInput = document.getElementById('edit-profile-email');
      const nicknameInput = document.getElementById('edit-profile-nickname');
      const statusInput = document.getElementById('edit-profile-status-msg');
      const deptInput = document.getElementById('edit-profile-department');
      const titleInput = document.getElementById('edit-profile-job-title');
      const extInput = document.getElementById('edit-profile-extension');
      const phoneInput = document.getElementById('edit-profile-phone');
      const locationInput = document.getElementById('edit-profile-location');

      if (nameInput) nameInput.value = user.name || '';
      if (emailInput) emailInput.value = user.email || '';
      if (nicknameInput) nicknameInput.value = user.nickname || '';
      if (statusInput) statusInput.value = user.status_message || '';
      if (deptInput) deptInput.value = user.department || '';
      if (titleInput) titleInput.value = user.job_title || '';
      if (extInput) extInput.value = user.extension || '';
      if (phoneInput) phoneInput.value = user.phone || '';
      if (locationInput) locationInput.value = user.location || '';
    }
  }

  async saveProfileEdits() {
    const nameInput = document.getElementById('edit-profile-name');
    const emailInput = document.getElementById('edit-profile-email');
    const nicknameInput = document.getElementById('edit-profile-nickname');
    const statusInput = document.getElementById('edit-profile-status-msg');
    const deptInput = document.getElementById('edit-profile-department');
    const titleInput = document.getElementById('edit-profile-job-title');
    const extInput = document.getElementById('edit-profile-extension');
    const phoneInput = document.getElementById('edit-profile-phone');
    const locationInput = document.getElementById('edit-profile-location');

    const profileData = {};

    if (nameInput?.value.trim()) profileData.name = nameInput.value.trim();
    if (emailInput?.value.trim()) profileData.email = emailInput.value.trim();
    if (nicknameInput?.value.trim()) profileData.nickname = nicknameInput.value.trim();
    if (statusInput?.value.trim()) profileData.status_message = statusInput.value.trim();
    if (deptInput?.value.trim()) profileData.department = deptInput.value.trim();
    if (titleInput?.value.trim()) profileData.job_title = titleInput.value.trim();
    if (extInput?.value.trim()) profileData.extension = extInput.value.trim();
    if (phoneInput?.value.trim()) profileData.phone = phoneInput.value.trim();
    if (locationInput?.value.trim()) profileData.location = locationInput.value.trim();

    try {
      const response = await this.apiRequest('/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData)
      });

      if (response && response.id) {
        // Update local user data
        this.auth.currentUser = { ...this.auth.currentUser, ...profileData };
        this.updateUserInfo(this.auth.currentUser);

        // Update profile view modal fields immediately
        this.updateProfileViewModal(this.auth.currentUser);

        this.uiManager.showToast('프로필이 저장되었습니다.', 'success');
      } else {
        this.uiManager.showToast('프로필 저장에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('프로필 저장 오류:', error);
      this.uiManager.showToast('프로필 저장에 실패했습니다.', 'error');
    }

    this.uiManager.hideModal('edit-profile-modal');
  }

  updateProfileViewModal(user) {
    // Update the profile view modal fields
    const profileName = document.getElementById('profile-name');
    const profileNickname = document.getElementById('profile-nickname');
    const profileStatus = document.getElementById('profile-status');
    const profileDept = document.getElementById('profile-department');
    const profileTitle = document.getElementById('profile-job-title');
    const profileExt = document.getElementById('profile-extension');
    const profilePhone = document.getElementById('profile-phone');
    const profileLocation = document.getElementById('profile-location');
    const profileAvatar = document.getElementById('profile-avatar');

    if (profileName) profileName.textContent = user.name || '설정되지 않음';
    if (profileNickname) profileNickname.textContent = user.nickname || '설정되지 않음';
    if (profileStatus) profileStatus.textContent = user.status_message || '설정되지 않음';
    if (profileDept) profileDept.textContent = user.department || '-';
    if (profileTitle) profileTitle.textContent = user.job_title || '-';
    if (profileExt) profileExt.textContent = user.extension || '-';
    if (profilePhone) profilePhone.textContent = user.phone || '-';
    if (profileLocation) profileLocation.textContent = user.location || '-';
    if (profileAvatar && user.name) {
      profileAvatar.textContent = user.name[0] || '';
      profileAvatar.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
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
      console.log('[API] Request:', options.method || 'GET', url);
      if (options.body) {
        console.log('[API] Request body:', options.body);
      }

      const response = await fetch(url, { ...options, headers });
      console.log('[API] Response status:', response.status);

      if (response.status === 401) {
        this.auth.handleLogout('세션이 만료되었습니다. 다시 로그인해주세요.');
        return null; // Stop processing
      }

      const text = await response.text();
      const result = text ? JSON.parse(text) : {};
      console.log('[API] Response data:', result);
      return result;

    } catch (error) {
      console.error(`API Request Error [${endpoint}]:`, error);
      throw error;
    }
  }

  bindGlobalEvents() {
    if (this.globalEventsBound) return;
    this.globalEventsBound = true;

    // Window Controls
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const btnMinimize = document.getElementById('btn-minimize');
    const btnMaximize = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');

    if (btnFullscreen) btnFullscreen.addEventListener('click', () => window.electronAPI.toggleFullscreen());
    if (btnMinimize) btnMinimize.addEventListener('click', () => window.electronAPI.minimizeWindow());
    // 최대화 버튼을 전체화면 토글로 변경
    if (btnMaximize) btnMaximize.addEventListener('click', () => window.electronAPI.toggleFullscreen());
    if (btnClose) btnClose.addEventListener('click', () => window.electronAPI.closeWindow());

    // Keyboard Shortcuts
    document.addEventListener('keydown', async (e) => {
      // ESC: 전체화면 해제 또는 모달 닫기
      if (e.key === 'Escape') {
        // 먼저 전체화면인지 확인
        const isFullscreen = await window.electronAPI.isFullscreen();
        if (isFullscreen) {
          window.electronAPI.toggleFullscreen();
        } else {
          // 전체화면이 아니면 모달 닫기
          const modals = document.querySelectorAll('.modal-overlay');
          modals.forEach(modal => modal.style.display = 'none');
        }
      }

      // F11 for fullscreen toggle
      if (e.key === 'F11') {
        e.preventDefault();
        window.electronAPI.toggleFullscreen();
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

  // Debug helper function for testing channel move
  window.testChannelMove = async (channelId, fromCategoryId, toCategoryId) => {
    console.log('[Test] Testing channel move...');
    console.log('[Test] Channel ID:', channelId);
    console.log('[Test] From Category ID:', fromCategoryId);
    console.log('[Test] To Category ID:', toCategoryId);

    const server = window.app.serverManager.currentServer;
    if (!server) {
      console.error('[Test] No server selected');
      return;
    }

    console.log('[Test] Server ID:', server.id);

    try {
      const url = `/servers/${server.id}/categories/${fromCategoryId}/channels/${channelId}/move`;
      const payload = { target_category_id: toCategoryId };

      console.log('[Test] Request URL:', url);
      console.log('[Test] Payload:', payload);

      const response = await window.app.apiRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      console.log('[Test] Response:', response);
      console.log('[Test] Channel moved successfully!');

      // Reload server data
      await window.app.serverManager.loadServerData();
    } catch (error) {
      console.error('[Test] Failed to move channel:', error);
    }
  };

  // Helper function to print current server structure
  window.printServerStructure = () => {
    const server = window.app.serverManager.currentServer;
    if (!server) {
      console.log('No server selected');
      return;
    }

    console.log('=== Current Server Structure ===');
    console.log('Server ID:', server.id);
    console.log('Server Name:', server.name);
    console.log('\nCategories:');

    server.categories?.forEach(cat => {
      console.log(`\n  Category: ${cat.name} (${cat.id})`);
      console.log('  Channels:');
      cat.channels?.forEach(ch => {
        console.log(`    - ${ch.name} (${ch.id})`);
      });
    });
  };

  console.log('[Debug] Helper functions loaded:');
  console.log('  - window.printServerStructure() : 현재 서버 구조 출력');
  console.log('  - window.testChannelMove(channelId, fromCategoryId, toCategoryId) : 채널 이동 테스트');
});
