const { contextBridge, ipcRenderer } = require('electron');

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
  
  // 플랫폼 정보
  platform: process.platform
});
