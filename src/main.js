console.log('[Main Process] Loading...');
const electron = require('electron');
const { spawn } = require('child_process');
const path = require('path');

// ELECTRON_RUN_AS_NODE 가 설정되어 있으면 Electron이 Node 모드로 올라가 app 이 undefined가 되어 UI가 나오지 않는다.
// 감지해서 환경변수를 지운 뒤 정상 모드로 다시 실행한다.
if (process.env.ELECTRON_RUN_AS_NODE === '1' && !process.env.WM_ELECTRON_RERUN) {
  const electronBinary = typeof electron === 'string' ? electron : require('electron');
  const child = spawn(electronBinary, ['.'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', WM_ELECTRON_RERUN: '1' },
    stdio: 'inherit'
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  return;
}

console.log('[Main Process] Electron loaded:', !!electron);
console.log('[Main Process] Electron keys:', typeof electron === 'object' ? Object.keys(electron).slice(0, 20) : typeof electron);
const { app, BrowserWindow, Tray, Menu, nativeImage, Notification } = electron || {};
const { ipcMain } = electron || {};
console.log('[Main Process] app available:', !!app);
console.log('[Main Process] electron.app:', !!electron.app);

// Windows에서 sandbox 파이프 생성이 차단될 때 발생하는 Access Denied(FATAL:platform_channel) 회피용.
// 보안상 sandbox가 비활성화되므로 신뢰된 PC에서만 사용하세요.
if (app) {
  app.commandLine.appendSwitch('no-sandbox');
}

// 환경변수 로드
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not found, continue anyway
}

let mainWindow;
let tray;

// 환경변수 가져오기
const config = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:8000',
  socketPort: process.env.SOCKET_PORT || 8000,
  apiKey: process.env.API_KEY || '',
  apiSecret: process.env.API_SECRET || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  appEnv: process.env.APP_ENV || 'development',
  debugMode: process.env.DEBUG_MODE === 'true',
  pushEnabled: process.env.PUSH_ENABLED !== 'false',
  pushSound: process.env.PUSH_SOUND !== 'false'
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false, // 커스텀 타이틀바 사용
    transparent: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false // 준비되면 표시
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // 준비되면 표시 (깜빡임 방지)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 개발 모드에서 DevTools 열기
  if (config.debugMode) {
    mainWindow.webContents.openDevTools();
  }

  // 창 닫기 시 트레이로 최소화
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// 트레이 아이콘 생성
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  
  // 트레이 아이콘이 없으면 기본 아이콘 생성
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = createDefaultTrayIcon();
    }
  } catch (e) {
    trayIcon = createDefaultTrayIcon();
  }
  
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '열기', 
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    { 
      label: '방해금지 모드',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        mainWindow.webContents.send('dnd-mode-changed', menuItem.checked);
      }
    },
    { type: 'separator' },
    { 
      label: '종료', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Work Messenger');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 기본 트레이 아이콘 생성
function createDefaultTrayIcon() {
  const size = 16;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="3" fill="#6366f1"/><path d="M4 5h8v1H4zM4 7.5h6v1H4zM4 10h8v1H4z" fill="white"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

// IPC 핸들러들 등록
function registerIpcHandlers() {
  ipcMain.handle('get-config', () => {
    return {
      serverUrl: config.serverUrl,
      socketPort: config.socketPort,
      pushEnabled: config.pushEnabled
    };
  });

  ipcMain.handle('get-api-credentials', () => {
    return {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret
    };
  });

  ipcMain.handle('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window-close', () => {
    mainWindow.hide();
  });

  // 알림 보내기
  ipcMain.handle('show-notification', (event, { title, body, icon }) => {
    if (config.pushEnabled && Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        icon: icon || path.join(__dirname, '../assets/icon.png'),
        silent: !config.pushSound
      });

      notification.on('click', () => {
        mainWindow.show();
        mainWindow.focus();
      });

      notification.show();
    }
  });

  // 읽지 않은 메시지 배지 업데이트
  ipcMain.handle('update-badge', (event, count) => {
    if (process.platform === 'darwin') {
      app.dock.setBadge(count > 0 ? count.toString() : '');
    }
    // Windows에서는 오버레이 아이콘 사용 가능
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
