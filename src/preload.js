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

// Load marked for Markdown parsing
let marked = null;
try {
  marked = require('marked');
  console.log('[Preload] marked loaded successfully');
} catch (error) {
  console.error('[Preload] Failed to load marked:', error.message);

  if (pathModule) {
    const alternatePaths = [
      pathModule.join(__dirname, '..', 'node_modules', 'marked'),
      pathModule.join(process.cwd(), 'node_modules', 'marked')
    ];

    for (const altPath of alternatePaths) {
      try {
        console.log('[Preload] Trying alternate path for marked:', altPath);
        marked = require(altPath);
        console.log('[Preload] marked loaded from alternate path:', altPath);
        break;
      } catch (altError) {
        console.warn('[Preload] Failed to load marked from:', altPath, altError.message);
      }
    }
  }
}

let socket = null;

// 안전한 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 설정 가져오기
  getConfig: () => ipcRenderer.invoke('get-config'),
  getApiCredentials: () => ipcRenderer.invoke('get-api-credentials'),

  // Markdown 파싱
  parseMarkdown: (text) => {
    if (!marked || !text) return text || '';
    try {
      // Configure marked for safe inline parsing
      return marked.parse(text, { breaks: true, gfm: true });
    } catch (error) {
      console.error('[Preload] Markdown parsing error:', error);
      return text;
    }
  },

  // 창 컨트롤
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // 알림
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  updateBadge: (count) => ipcRenderer.invoke('update-badge', count),

  // 화면 캡처 소스 가져오기
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),

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

    // Electron 환경에 최적화된 설정
    const socketOptions = {
      path: '/socket.io',
      transports: ['polling', 'websocket'],  // Polling 우선 - namespace handshake 안정화
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,
      autoConnect: true,
      withCredentials: false,
      forceNew: true,
      upgrade: true,
      closeOnBeforeunload: false,
      // auth 제거하여 테스트 - python-socketio가 auth 처리 안할 수 있음
    };

    console.log('[Preload] Socket options:', socketOptions);

    try {
      socket = ioClient(url, socketOptions);

      console.log('[Preload] Socket.IO 클라이언트 생성됨:', !!socket);
      console.log('[Preload] Socket ID:', socket.id);
      console.log('[Preload] Socket connected:', socket.connected);

      // Engine.IO 레벨 이벤트 로그
      socket.io.on('open', () => {
        console.log('[Preload Engine] 🔓 Engine 열림');
      });

      socket.io.on('error', (err) => {
        console.error('[Preload Engine] ❌ Engine 오류:', err);
      });

      socket.io.on('close', (reason) => {
        console.log('[Preload Engine] 🔒 Engine 닫힘:', reason);
      });

      // 디버깅을 위한 추가 이벤트 리스너
      socket.on('connect', () => {
        console.log('[Preload Socket] ✅ 연결 성공! Socket ID:', socket.id);
        console.log('[Preload Socket] Transport:', socket.io?.engine?.transport?.name);
      });

      // Engine 패킷 모니터링 - 모든 패킷 로깅
      socket.io.engine.on('packet', (packet) => {
        console.log('[Preload Engine] 📦 패킷 수신:', packet.type, packet.data ? packet.data.substring(0, 100) : '');
      });

      socket.io.engine.on('packetCreate', (packet) => {
        console.log('[Preload Engine] 📤 패킷 전송:', packet.type, packet.data ? packet.data.substring(0, 100) : '');
      });

      // 메시지 수신 디버깅
      socket.on('message', (data) => {
        console.log('[Preload Socket] 📩 메시지 수신:', data);
      });

      // joined 이벤트 디버깅
      socket.on('joined', (data) => {
        console.log('[Preload Socket] 🚪 채널 join 성공:', data);
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
    console.log('[Preload Socket] 📤 emit 이벤트:', event, payload);
    if (!socket) {
      console.error('[Preload Socket] ❌ socket이 null입니다!');
      return;
    }
    // Engine이 열려있으면 emit 허용 (namespace handshake 전이어도)
    const engineConnected = socket.io?.engine?.readyState === 'open';
    console.log('[Preload Socket] socket.connected:', socket.connected, 'engine:', engineConnected);
    if (!socket.connected && !engineConnected) {
      console.error('[Preload Socket] ❌ socket과 engine 모두 연결되지 않았습니다!');
      return;
    }
    socket.emit(event, payload);
    console.log('[Preload Socket] ✅ emit 완료:', event);
  },
  disconnectSocket: () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  },
  isSocketConnected: () => {
    const connected = socket?.connected;
    const engineOpen = socket?.io?.engine?.readyState === 'open';
    return !!(connected || engineOpen);
  },

  // 플랫폼 정보
  platform: process.platform
});
