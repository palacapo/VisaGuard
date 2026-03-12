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
  } catch (err) {
    console.error('[VisaGuard] readStore error:', err);
    return {};
  }
}

function writeStore(data) {
  try {
    const filePath = getDataFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[VisaGuard] writeStore error:', err);
    return false;
  }
}

// Self-test: verify the store can actually write and read back
function selfTestStore() {
  try {
    const testKey = '__vg_selftest__';
    const testVal = 'ok_' + Date.now();
    const data = readStore();
    data[testKey] = testVal;
    const writeOk = writeStore(data);
    if (!writeOk) return { ok: false, reason: 'Write failed (fs error)' };
    const data2 = readStore();
    if (data2[testKey] !== testVal) return { ok: false, reason: 'Read-back mismatch' };
    // Clean up test key
    delete data2[testKey];
    writeStore(data2);
    console.log('[VisaGuard] Store self-test PASSED. Path:', getDataFilePath());
    return { ok: true, path: getDataFilePath() };
  } catch (err) {
    return { ok: false, reason: String(err) };
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
      sandbox: false,
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
  const val = key in data ? data[key] : null;
  console.log(`[VisaGuard] store-get "${key}" =>`, JSON.stringify(val)?.slice(0, 80));
  return val;
});

// Set a value by key
ipcMain.handle('store-set', (_event, key, value) => {
  console.log(`[VisaGuard] store-set "${key}" (${Array.isArray(value) ? value.length + ' items' : typeof value})`);
  const data = readStore();
  data[key] = value;
  writeStore(data);
  console.log(`[VisaGuard] store-set done, file: ${getDataFilePath()}`);
});

// Delete a key
ipcMain.handle('store-delete', (_event, key) => {
  console.log(`[VisaGuard] store-delete "${key}"`);
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

// Store status IPC – renderer can query this
ipcMain.handle('store-get-status', () => {
  return selfTestStore();
});

app.on('ready', () => {
  createWindow();
  createMenu();
  createTray();
  startScheduler();

  mainWindow.webContents.once('did-finish-load', () => {
    // Run self-test and send result to renderer
    const testResult = selfTestStore();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('store-status', testResult);
        mainWindow.webContents.send('check-expirations-startup');
      }
    }, 1000);
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
