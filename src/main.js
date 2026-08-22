const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { createDownloader } = require('./downloader');
const { initUpdater, installUpdate } = require('./updater');
const { updateYtdlp } = require('./ytdlp-updater');

let mainWindow;
let currentDownloadProcess = null;

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const HISTORY_FILE = path.join(app.getPath('userData'), 'history.json');

// ── Paths to binaries ──────────────────────────────────────────────
// A yt-dlp updated from inside the app is kept in userData rather than next
// to the bundled one: that location is always writable (no admin rights) and
// it survives an app update, which would otherwise restore the older build.
const USER_BIN_DIR = path.join(app.getPath('userData'), 'bin');

function getBundledBinPath(binary) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', binary);
  }
  return path.join(__dirname, '..', 'bin', binary);
}

function getBinPath(binary) {
  if (binary === 'yt-dlp.exe') {
    const updated = path.join(USER_BIN_DIR, binary);
    if (fs.existsSync(updated)) return updated;
  }
  return getBundledBinPath(binary);
}

// ── Settings management ─────────────────────────────────────────────
function defaultSettings() {
  return {
    savePath: app.getPath('downloads'),
    defaultQuality: '1080',
    defaultAudioQuality: 'best',
    defaultType: 'video',
    autoUpdate: true,
    notifications: true,
    startMinimized: false
  };
}

function loadSettings() {
  let stored = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
    }
  } catch (e) { /* ignore */ }

  // Merge over the defaults so a settings file written by an older version
  // still gets keys added later.
  const settings = { ...defaultSettings(), ...stored };

  // Older builds stored '1080p' while the <option> values are bare numbers;
  // an unmatched value leaves the dropdown blank.
  if (typeof settings.defaultQuality === 'string') {
    settings.defaultQuality = settings.defaultQuality.replace(/p$/i, '');
  }

  return settings;
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// ── History management ──────────────────────────────────────────────
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

// ── Desktop notifications ───────────────────────────────────────────
// Windows only shows toasts for an app with a registered AppUserModelID —
// it must match the `appId` in package.json > build.
function notify(title, body, filePath) {
  if (loadSettings().notifications === false) return;
  if (!Notification.isSupported()) return;

  const notification = new Notification({ title, body, silent: false });

  if (filePath) {
    notification.on('click', () => {
      if (fs.existsSync(filePath)) shell.showItemInFolder(filePath);
    });
  }

  notification.show();
}

// ── Window creation ─────────────────────────────────────────────────
function createWindow(settings) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    backgroundColor: '#0d0d0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (settings?.startMinimized) {
      // showInactive() first: minimize() alone on a never-shown window does not
      // reliably put it in the taskbar.
      mainWindow.showInactive();
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ────────────────────────────────────────────────────

// Titlebar controls
ipcMain.handle('titlebar:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('titlebar:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('titlebar:close', () => {
  mainWindow?.close();
});

// File dialog
ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose Save Location'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Clipboard
ipcMain.handle('clipboard:read', () => {
  return clipboard.readText();
});

// Shell
ipcMain.handle('shell:open-path', async (_, filePath) => {
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      shell.openPath(filePath);
    } else {
      shell.showItemInFolder(filePath);
    }
  }
});

// App version
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// Settings
ipcMain.handle('settings:get', () => {
  return loadSettings();
});

ipcMain.handle('settings:set', (_, settings) => {
  saveSettings(settings);
  return true;
});

// History
ipcMain.handle('history:get', () => {
  return loadHistory();
});

ipcMain.handle('history:add', (_, item) => {
  const history = loadHistory();
  history.unshift({
    ...item,
    id: Date.now().toString(),
    date: new Date().toISOString()
  });
  // Keep last 100 entries
  if (history.length > 100) history.length = 100;
  saveHistory(history);
  return history;
});

ipcMain.handle('history:clear', () => {
  saveHistory([]);
  return [];
});

// ── Download operations ─────────────────────────────────────────────
const downloader = createDownloader(getBinPath);

ipcMain.handle('download:get-info', async (_, url) => {
  try {
    const info = await downloader.getInfo(url);
    return { success: true, data: info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:start', async (_, options) => {
  try {
    currentDownloadProcess = downloader.download(options, {
      onProgress: (progress) => {
        mainWindow?.webContents.send('download:progress', progress);
      },
      onComplete: (result) => {
        currentDownloadProcess = null;
        mainWindow?.webContents.send('download:complete', result);

        const body = result.isPlaylist
          ? `${result.filename} — ${result.itemCount} item(s)` +
            (result.skippedCount ? `, ${result.skippedCount} skipped` : '')
          : result.filename;
        notify('Download complete', body, result.filePath);
      },
      onError: (error) => {
        currentDownloadProcess = null;
        mainWindow?.webContents.send('download:error', { message: error });
        notify('Download failed', String(error).split('\n')[0]);
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ── yt-dlp maintenance ──────────────────────────────────────────────
ipcMain.handle('ytdlp:get-version', async () => {
  try {
    return { success: true, version: await downloader.getVersion() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ytdlp:update', async () => {
  // Replacing the binary mid-download would kill the running process
  if (currentDownloadProcess) {
    return { success: false, error: 'A download is in progress. Try again when it finishes.' };
  }
  try {
    await updateYtdlp(path.join(USER_BIN_DIR, 'yt-dlp.exe'));
    return { success: true, version: await downloader.getVersion() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:cancel', () => {
  if (currentDownloadProcess) {
    downloader.cancel();
    currentDownloadProcess = null;
    return true;
  }
  return false;
});

// ── Updater ─────────────────────────────────────────────────────────
// Registered unconditionally: initUpdater() no-ops in dev and when auto-update
// is off, and installUpdate() reports that instead of leaving the channel
// missing.
ipcMain.handle('update:install', () => installUpdate());

// ── App lifecycle ───────────────────────────────────────────────────
app.whenReady().then(() => {
  // Required for Windows notifications; must match build.appId.
  app.setAppUserModelId('com.ytcd.app');

  const settings = loadSettings();
  createWindow(settings);

  if (settings.autoUpdate) {
    initUpdater(mainWindow);
  }
});

app.on('window-all-closed', () => {
  downloader.cancel();
  app.quit();
});

app.on('before-quit', () => {
  downloader.cancel();
});
