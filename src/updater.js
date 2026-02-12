function initUpdater(mainWindow) {
  // Only run updater in packaged builds
  const { app } = require('electron');
  if (!app.isPackaged) {
    console.log('[Updater] Skipping auto-update in development mode');
    return;
  }

  try {
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update:downloaded', {
        version: info.version
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err.message);
    });

    // Check for updates after 5-second delay
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[Updater] Check failed:', err.message);
      });
    }, 5000);

    // IPC handler for manual update install
    const { ipcMain } = require('electron');
    ipcMain.handle('update:install', () => {
      autoUpdater.downloadUpdate().then(() => {
        autoUpdater.quitAndInstall(false, true);
      });
    });

  } catch (err) {
    console.error('[Updater] Failed to initialize:', err.message);
  }
}

module.exports = { initUpdater };
