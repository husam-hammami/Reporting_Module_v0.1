/**
 * Preload script — exposes safe IPC bridge to renderer processes.
 * Used by setup wizard and license screens.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hercules', {
  // Setup wizard
  runInitDb: (args) => ipcRenderer.invoke('run-init-db', args),
  saveConfig: (filename, data) => ipcRenderer.invoke('save-config', { filename, data }),
  getConfig: (filename) => ipcRenderer.invoke('get-config', filename),
  setupComplete: () => ipcRenderer.send('setup-complete'),

  // App control
  quitApp: () => ipcRenderer.invoke('quit-app'),
});
