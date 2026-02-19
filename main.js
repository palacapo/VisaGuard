// VisaGuard – Main Process
// Handles window creation, system notifications, system tray, and app lifecycle.

const { app, BrowserWindow, Menu, Notification, ipcMain, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================================
// CRITICAL: Must be called BEFORE app 'ready' event on Windows
// ============================================================================
app.setAppUserModelId('com.visaguard.app');

// ============================================================================
// PERSISTENT STORE (JSON file in userData)
// Saves to: C:\Users\<user>\AppData\Roaming\VisaGuard\data.json
// ============================================================================

function getDataFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'data.json');
}

function readStore() {
  try {
    const filePath = getDataFilePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeStore(data) {
  try {
    const filePath = getDataFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[VisaGuard] Failed to write store:', err);
  }
}

let mainWindow = null;
let tray = null;
let checkExpirationInterval = null;

// ============================================================================
// AUTO-START WITH WINDOWS (production builds only)
// ============================================================================
if (process.platform === 'win32' && !process.defaultApp) {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: ['--hidden'],
  });
}

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 750,
    minHeight: 550,
    title: 'VisaGuard',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // DevTools – uncomment to debug
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// MENU
// ============================================================================

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit VisaGuard',
          accelerator: 'CmdOrCtrl+Q',
          click: () => { app.isQuitting = true; app.quit(); },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ============================================================================
// SYSTEM TRAY
// ============================================================================

function createTray() {
  const trayImagePath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayImage;
  try {
    trayImage = nativeImage.createFromPath(trayImagePath);
    if (trayImage.isEmpty()) throw new Error('Empty image');
  } catch {
    trayImage = nativeImage.createEmpty().resize({ width: 16, height: 16 });
  }

  tray = new Tray(trayImage);
  tray.setToolTip('VisaGuard – Visa & Permit Tracker');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open VisaGuard',
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } },
    },
    {
      label: 'Check Expirations Now',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('check-expirations-now');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) { mainWindow.hide(); }
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

// ============================================================================
// IPC HANDLERS – STORE (persistent JSON file)
// ============================================================================

// Get a value by key
ipcMain.handle('store-get', (_event, key) => {
  const data = readStore();
  return key in data ? data[key] : null;
});

// Set a value by key
ipcMain.handle('store-set', (_event, key, value) => {
  const data = readStore();
  data[key] = value;
  writeStore(data);
});

// Delete a key
ipcMain.handle('store-delete', (_event, key) => {
  const data = readStore();
  delete data[key];
  writeStore(data);
});

// ============================================================================
// IPC HANDLERS – NOTIFICATIONS
// ============================================================================

ipcMain.on('send-notification', (_event, data) => {
  const title = data.title || 'VisaGuard';
  const body = data.body || data.message || '';

  if (typeof body !== 'string' || body.trim().length === 0) return;
  if (!Notification.isSupported()) return;

  try {
    const notification = new Notification({ title, body: body.trim(), silent: false });
    notification.on('show', () => console.log(`[VisaGuard] Notification: "${title}"`));
    notification.on('error', (err) => console.error('[VisaGuard] Notification error:', err));
    notification.show();
  } catch (err) {
    console.error('[VisaGuard] Failed to show notification:', err);
  }
});

// ============================================================================
// BACKGROUND SCHEDULER (24-hour interval)
// ============================================================================

function startScheduler() {
  if (checkExpirationInterval) { clearInterval(checkExpirationInterval); }
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  checkExpirationInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('check-expirations-scheduled');
    }
  }, TWENTY_FOUR_HOURS);
}

function stopScheduler() {
  if (checkExpirationInterval) { clearInterval(checkExpirationInterval); checkExpirationInterval = null; }
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.on('ready', () => {
  createWindow();
  createMenu();
  createTray();
  startScheduler();

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('check-expirations-startup');
      }
    }, 1500);
  });
});

app.on('window-all-closed', () => { /* keep running in tray */ });

app.on('activate', () => {
  if (!mainWindow) { createWindow(); }
  else { mainWindow.show(); mainWindow.focus(); }
});

app.on('before-quit', () => stopScheduler());

app.on('will-quit', () => {
  if (tray) { tray.destroy(); tray = null; }
});
