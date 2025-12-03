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
    if (!ioClient) return false;
    if (socket) {
      socket.disconnect();
    }
    socket = ioClient(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 500,
      autoConnect: true,
      withCredentials: false
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
