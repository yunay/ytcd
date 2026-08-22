const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Titlebar
  minimizeWindow: () => ipcRenderer.invoke('titlebar:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('titlebar:maximize'),
  closeWindow: () => ipcRenderer.invoke('titlebar:close'),

  // Download
  startDownload: (options) => ipcRenderer.invoke('download:start', options),
  cancelDownload: () => ipcRenderer.invoke('download:cancel'),
  getVideoInfo: (url) => ipcRenderer.invoke('download:get-info', url),
  onDownloadProgress: (callback) => {
    ipcRenderer.removeAllListeners('download:progress');
    ipcRenderer.on('download:progress', (_, data) => callback(data));
  },
  onDownloadComplete: (callback) => {
    ipcRenderer.removeAllListeners('download:complete');
    ipcRenderer.on('download:complete', (_, data) => callback(data));
  },
  onDownloadError: (callback) => {
    ipcRenderer.removeAllListeners('download:error');
    ipcRenderer.on('download:error', (_, data) => callback(data));
  },

  // File dialogs
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  addToHistory: (item) => ipcRenderer.invoke('history:add', item),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Clipboard
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),

  // App
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // yt-dlp maintenance
  getYtdlpVersion: () => ipcRenderer.invoke('ytdlp:get-version'),
  updateYtdlp: () => ipcRenderer.invoke('ytdlp:update'),

  // Updater
  onUpdateAvailable: (callback) => {
    ipcRenderer.removeAllListeners('update:available');
    ipcRenderer.on('update:available', (_, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.removeAllListeners('update:downloaded');
    ipcRenderer.on('update:downloaded', (_, data) => callback(data));
  },
  installUpdate: () => ipcRenderer.invoke('update:install')
});
