// VisaGuard – Main Process
// Handles window creation, system notifications, system tray, and app lifecycle.

const { app, BrowserWindow, Menu, Notification, ipcMain, Tray, nativeImage } = require('electron');
const path = require('path');

// ============================================================================
// CRITICAL: Must be called BEFORE app 'ready' event on Windows
// This is required for toast notifications to work in both dev and production
// ============================================================================
app.setAppUserModelId('com.visaguard.app');

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
    show: false, // Don't show until ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // DevTools – uncomment to debug (disable for production)
  // mainWindow.webContents.openDevTools();

  // Show window gracefully once content is loaded
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  });

  // Intercept close → hide to tray instead of quitting
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
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
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
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
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
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

// Renderer → Main: send a Windows system notification
ipcMain.on('send-notification', (_event, data) => {
  // Support both { title, body } and { title, message } for compatibility
  const title = data.title || 'VisaGuard';
  const body = data.body || data.message || '';

  if (typeof body !== 'string' || body.trim().length === 0) return;

  // Check if notifications are supported on this platform
  if (!Notification.isSupported()) {
    console.warn('[VisaGuard] Notifications not supported on this platform.');
    return;
  }

  try {
    const notification = new Notification({
      title: title,
      body: body.trim(),
      silent: false,
      urgency: 'normal',
    });

    notification.on('show', () => {
      console.log(`[VisaGuard] Notification shown: "${title}"`);
    });

    notification.on('error', (err) => {
      console.error('[VisaGuard] Notification error:', err);
    });

    notification.show();
  } catch (err) {
    console.error('[VisaGuard] Failed to show notification:', err);
  }
});

// ============================================================================
// BACKGROUND SCHEDULER (24-hour interval)
// ============================================================================

function startScheduler() {
  if (checkExpirationInterval) {
    clearInterval(checkExpirationInterval);
    checkExpirationInterval = null;
  }

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  checkExpirationInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('check-expirations-scheduled');
    }
  }, TWENTY_FOUR_HOURS);
}

function stopScheduler() {
  if (checkExpirationInterval) {
    clearInterval(checkExpirationInterval);
    checkExpirationInterval = null;
  }
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.on('ready', () => {
  createWindow();
  createMenu();
  createTray();
  startScheduler();

  // Startup expiration check – wait for renderer to fully load
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('check-expirations-startup');
      }
    }, 1500);
  });
});

// Keep running in tray when all windows closed
app.on('window-all-closed', () => {
  // Intentionally empty – app lives in the system tray
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  stopScheduler();
});

app.on('will-quit', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
