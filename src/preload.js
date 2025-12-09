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

  // 맥 환경을 위한 추가 경로들
  const additionalPaths = [
    pathModule.join(__dirname, 'node_modules'),
    pathModule.join(process.cwd(), 'node_modules'),
    pathModule.join(__dirname, '..', '..', 'node_modules')
  ];

  additionalPaths.forEach(p => {
    if (!Module.globalPaths.includes(p)) {
      Module.globalPaths.push(p);
    }
  });

  console.log('[Preload] Module paths configured:', Module.globalPaths);
}

let ioClient = null;
try {
  ({ io: ioClient } = require('socket.io-client'));
  console.log('[Preload] socket.io-client loaded successfully');
} catch (error) {
  console.error('[Preload] Failed to load socket.io-client:', error.message);
  console.error('[Preload] Stack:', error.stack);

  // 맥 환경에서 대체 경로로 시도
  if (pathModule) {
    const alternatePaths = [
      pathModule.join(__dirname, '..', 'node_modules', 'socket.io-client'),
      pathModule.join(process.cwd(), 'node_modules', 'socket.io-client')
    ];

    for (const altPath of alternatePaths) {
      try {
        console.log('[Preload] Trying alternate path:', altPath);
        ({ io: ioClient } = require(altPath));
        console.log('[Preload] socket.io-client loaded from alternate path:', altPath);
        break;
      } catch (altError) {
        console.warn('[Preload] Failed to load from alternate path:', altPath, altError.message);
      }
    }
  }

  if (!ioClient) {
    console.error('[Preload] socket.io-client not available, socket features disabled');
  }
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
  connectSocket: (url, token) => {
    console.log('[Preload] connectSocket 호출됨, URL:', url);
    console.log('[Preload] Token 제공됨:', !!token);
    console.log('[Preload] Platform:', process.platform);
    console.log('[Preload] ioClient 사용 가능:', !!ioClient);

    if (!ioClient) {
      console.error('[Preload] ioClient가 없습니다!');
      console.error('[Preload] Socket.IO 모듈이 로드되지 않았습니다. npm install을 실행하세요.');
      return false;
    }

    if (socket) {
      console.log('[Preload] 기존 소켓 연결 해제 중...');
      socket.disconnect();
      socket.removeAllListeners();
      socket = null;
    }

    console.log('[Preload] 새로운 Socket.IO 클라이언트 생성 중...');

    // 맥 환경에 최적화된 설정
    const socketOptions = {
      path: '/socket.io',
      transports: ['websocket', 'polling'],  // 맥에서는 websocket을 먼저 시도
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      withCredentials: false,
      forceNew: true,
      upgrade: true,
      rememberUpgrade: true,
      // 맥 환경 추가 옵션
      closeOnBeforeunload: false,
      secure: url.startsWith('https'),
      rejectUnauthorized: false,
      // 인증 토큰 추가
      auth: token ? { token: token } : undefined
    };

    console.log('[Preload] Socket options:', socketOptions);

    try {
      socket = ioClient(url, socketOptions);

      console.log('[Preload] Socket.IO 클라이언트 생성됨:', !!socket);
      console.log('[Preload] Socket ID:', socket.id);
      console.log('[Preload] Socket connected:', socket.connected);

      // 디버깅을 위한 추가 이벤트 리스너
      socket.on('connect', () => {
        console.log('[Preload Socket] ✅ 연결 성공! Socket ID:', socket.id);
        console.log('[Preload Socket] Transport:', socket.io?.engine?.transport?.name);
      });

      socket.on('connect_error', (error) => {
        console.error('[Preload Socket] ❌ 연결 오류:', error.message);
        console.error('[Preload Socket] 오류 타입:', error.type);
        console.error('[Preload Socket] 오류 상세:', error);
        console.error('[Preload Socket] URL:', url);
      });

      socket.on('disconnect', (reason) => {
        console.log('[Preload Socket] 🔌 연결 끊김:', reason);
        if (reason === 'io server disconnect') {
          console.log('[Preload Socket] 서버가 연결을 끊었습니다. 재연결 시도...');
          socket.connect();
        }
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log('[Preload Socket] 🔄 재연결 성공, 시도 횟수:', attemptNumber);
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('[Preload Socket] 🔄 재연결 시도 중...', attemptNumber);
      });

      socket.on('reconnect_error', (error) => {
        console.error('[Preload Socket] 재연결 오류:', error.message);
      });

      socket.on('reconnect_failed', () => {
        console.error('[Preload Socket] 재연결 실패 (최대 시도 횟수 초과)');
      });

      return true;
    } catch (error) {
      console.error('[Preload] Socket.IO 클라이언트 생성 실패:', error);
      return false;
    }
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
