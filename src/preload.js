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

  // Playlist
  getPlaylistInfo: (url) => ipcRenderer.invoke('download:get-playlist-info', url),
  startPlaylistDownload: (options) => ipcRenderer.invoke('download:start-playlist', options),
  onPlaylistVideoStart: (callback) => {
    ipcRenderer.removeAllListeners('playlist:video-start');
    ipcRenderer.on('playlist:video-start', (_, data) => callback(data));
  },
  onPlaylistVideoProgress: (callback) => {
    ipcRenderer.removeAllListeners('playlist:video-progress');
    ipcRenderer.on('playlist:video-progress', (_, data) => callback(data));
  },
  onPlaylistVideoComplete: (callback) => {
    ipcRenderer.removeAllListeners('playlist:video-complete');
    ipcRenderer.on('playlist:video-complete', (_, data) => callback(data));
  },
  onPlaylistVideoError: (callback) => {
    ipcRenderer.removeAllListeners('playlist:video-error');
    ipcRenderer.on('playlist:video-error', (_, data) => callback(data));
  },
  onPlaylistComplete: (callback) => {
    ipcRenderer.removeAllListeners('playlist:complete');
    ipcRenderer.on('playlist:complete', (_, data) => callback(data));
  },

  // File dialogs
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  addToHistory: (item) => ipcRenderer.invoke('history:add', item),
  deleteHistoryItem: (id) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Clipboard
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),

  // App
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.removeAllListeners('update:available');
    ipcRenderer.on('update:available', (_, data) => callback(data));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.removeAllListeners('update:not-available');
    ipcRenderer.on('update:not-available', () => callback());
  },
  onUpdateError: (callback) => {
    ipcRenderer.removeAllListeners('update:error');
    ipcRenderer.on('update:error', (_, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.removeAllListeners('update:downloaded');
    ipcRenderer.on('update:downloaded', (_, data) => callback(data));
  },
  installUpdate: () => ipcRenderer.invoke('update:install')
});
