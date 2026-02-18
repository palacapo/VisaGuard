// VisaGuard – Preload Script
// Secure contextBridge API between the renderer and the main process.
// contextIsolation: true | nodeIntegration: false | sandbox: true

const { contextBridge, ipcRenderer } = require('electron');

// Allowed IPC channels the renderer may listen on
const ALLOWED_RECEIVE_CHANNELS = [
  'check-expirations-now',
  'check-expirations-startup',
  'check-expirations-scheduled',
];

contextBridge.exposeInMainWorld('visaGuardAPI', {
  /**
   * Send a system notification via the main process.
   * @param {{ title: string, body: string }} options
   */
  sendNotification: ({ title, body }) => {
    if (typeof body !== 'string' || body.trim().length === 0) return;
    ipcRenderer.send('send-notification', {
      title: title || 'VisaGuard',
      body: body.trim(),
    });
  },

  /**
   * Register a listener on an allowed IPC channel.
   * @param {string} channel
   * @param {Function} callback  receives (...args) from ipcRenderer.on
   */
  on: (channel, callback) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) return;
    // Wrap to avoid exposing the raw event object to the renderer
    const wrapped = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrapped);
    // Return a cleanup function
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  /**
   * Register a one-time listener on an allowed IPC channel.
   * @param {string} channel
   * @param {Function} callback
   */
  once: (channel, callback) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) return;
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
});
