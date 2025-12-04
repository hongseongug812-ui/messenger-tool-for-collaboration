const { contextBridge, ipcRenderer } = require('electron');
let pathModule = null;
let Module = null;

try {
  pathModule = require('path');
  Module = require('module');
} catch (error) {
  console.warn('[Preload] path/module unavailable in this environment, skipping module path tweaks:', error.message);
}

// Ensure node_modules resolution works even when Electron is started from an elevated/system shell
if (pathModule && Module) {
  const rootNodeModules = pathModule.join(__dirname, '..', 'node_modules');
  if (!Module.globalPaths.includes(rootNodeModules)) {
    Module.globalPaths.push(rootNodeModules);
  }
}

let ioClient = null;
try {
  ({ io: ioClient } = require('socket.io-client'));
} catch (error) {
  console.warn('[Preload] socket.io-client not available, socket features disabled:', error.message);
}

let socket = null;

// 안전한 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 설정 가져오기
  getConfig: () => ipcRenderer.invoke('get-config'),
  getApiCredentials: () => ipcRenderer.invoke('get-api-credentials'),
  
  // 창 컨트롤
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  
  // 알림
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  updateBadge: (count) => ipcRenderer.invoke('update-badge', count),
  
  // 이벤트 리스너
  onDndModeChanged: (callback) => {
    ipcRenderer.on('dnd-mode-changed', (event, enabled) => callback(enabled));
  },

  // Socket.IO
  connectSocket: (url) => {
    console.log('[Preload] connectSocket 호출됨, URL:', url);
    console.log('[Preload] ioClient 사용 가능:', !!ioClient);

    if (!ioClient) {
      console.error('[Preload] ioClient가 없습니다!');
      return false;
    }

    if (socket) {
      console.log('[Preload] 기존 소켓 연결 해제 중...');
      socket.disconnect();
    }

    console.log('[Preload] 새로운 Socket.IO 클라이언트 생성 중...');
    socket = ioClient(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],  // polling을 먼저 시도
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 500,
      autoConnect: true,
      withCredentials: false,
      forceNew: true,
      upgrade: true,
      rememberUpgrade: true
    });

    console.log('[Preload] Socket.IO 클라이언트 생성됨:', !!socket);
    console.log('[Preload] Socket ID:', socket.id);
    console.log('[Preload] Socket connected:', socket.connected);

    // 디버깅을 위한 추가 이벤트 리스너
    socket.on('connect', () => {
      console.log('[Preload Socket] 연결 성공! Socket ID:', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.error('[Preload Socket] 연결 오류:', error.message);
      console.error('[Preload Socket] 오류 상세:', error);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Preload Socket] 연결 끊김:', reason);
    });

    return true;
  },
  onSocketEvent: (event, callback) => {
    if (!socket) return;
    socket.on(event, (...args) => callback(...args));
  },
  emitSocketEvent: (event, payload) => {
    if (!socket) return;
    socket.emit(event, payload);
  },
  disconnectSocket: () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  },
  isSocketConnected: () => !!(socket && socket.connected),
  
  // 플랫폼 정보
  platform: process.platform
});
