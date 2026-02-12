function initUpdater(mainWindow) {
  const { app, ipcMain } = require('electron');

  if (!app.isPackaged) {
    console.log('[Updater] Skipping auto-update in development mode');
    ipcMain.handle('update:install', () => {});
    ipcMain.handle('update:download', () => {});
    ipcMain.handle('update:check', () => ({ update: false }));
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

    autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('update:not-available');
    });

    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update:downloaded', {
        version: info.version
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err.message);
      mainWindow?.webContents.send('update:error', { message: err.message });
    });

    // Start downloading the update
    ipcMain.handle('update:download', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Quit and install the already-downloaded update
    ipcMain.handle('update:install', () => {
      autoUpdater.quitAndInstall(false, true);
    });

    // Check for updates
    ipcMain.handle('update:check', async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        return { update: !!result?.updateInfo };
      } catch (err) {
        console.error('[Updater] Check failed:', err.message);
        return { update: false, error: err.message };
      }
    });

  } catch (err) {
    console.error('[Updater] Failed to initialize:', err.message);
  }
}

module.exports = { initUpdater };
