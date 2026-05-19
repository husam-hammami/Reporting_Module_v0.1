/**
 * Preload for restart intro video window only.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('herculesIntro', {
  complete: () => ipcRenderer.send('intro-complete'),
});
