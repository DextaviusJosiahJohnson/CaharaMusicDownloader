'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cmd', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Config
  configGet: (key)       => ipcRenderer.invoke('config-get', key),
  configSet: (key, val)  => ipcRenderer.invoke('config-set', key, val),

  // Directory
  pickDirectory:  ()       => ipcRenderer.invoke('pick-directory'),
  openDirectory:  (p)      => ipcRenderer.invoke('open-directory', p),

  // Dependency check
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),

  // URL detection
  detectUrl: (url) => ipcRenderer.invoke('detect-url', url),

  // Downloads
  startDownload: (opts)  => ipcRenderer.invoke('start-download', opts),
  cancelDownload: ()     => ipcRenderer.send('cancel-download'),

  // Download events
  onDownloadEvent: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('download-event', handler);
    return () => ipcRenderer.removeListener('download-event', handler);
  },
});
