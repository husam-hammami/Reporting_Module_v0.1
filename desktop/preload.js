/**
 * Preload script — exposes safe IPC bridge to renderer (setup wizard, etc.)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hercules', {
  initDatabase: () => ipcRenderer.invoke('init-database'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  onDbProgress: (callback) => ipcRenderer.on('db-progress', (_event, msg) => callback(msg)),
  restartForUpdate: () => ipcRenderer.invoke('restart-for-update'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
});
