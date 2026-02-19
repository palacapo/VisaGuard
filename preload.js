// VisaGuard – Preload Script
// Secure contextBridge API between the renderer and the main process.
// contextIsolation: true | nodeIntegration: false | sandbox: true

const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_RECEIVE_CHANNELS = [
  'check-expirations-now',
  'check-expirations-startup',
  'check-expirations-scheduled',
];

contextBridge.exposeInMainWorld('visaGuardAPI', {
  // ── Notifications ──────────────────────────────────────────────────────────
  sendNotification: ({ title, body }) => {
    if (typeof body !== 'string' || body.trim().length === 0) return;
    ipcRenderer.send('send-notification', {
      title: title || 'VisaGuard',
      body: body.trim(),
    });
  },

  // ── Persistent Store (electron-store via IPC) ───────────────────────────────
  /**
   * Get a value from the persistent store.
   * @param {string} key
   * @returns {Promise<any>}
   */
  storeGet: (key) => ipcRenderer.invoke('store-get', key),

  /**
   * Set a value in the persistent store.
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),

  /**
   * Delete a key from the persistent store.
   * @param {string} key
   * @returns {Promise<void>}
   */
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),

  // ── IPC Event Listeners ────────────────────────────────────────────────────
  on: (channel, callback) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) return;
    const wrapped = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  once: (channel, callback) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) return;
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
});
