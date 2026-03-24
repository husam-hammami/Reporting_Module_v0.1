/**
 * Preload script — exposes safe IPC bridge to renderer (setup wizard, etc.)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hercules', {
  setupComplete: (config) => ipcRenderer.send('setup-complete', config),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
