// Set once initUpdater has an electron-updater instance running. Stays null in
// development and when auto-update is switched off, which is what lets
// installUpdate() answer with a real message instead of throwing.
let updater = null;
let updateDownloaded = false;

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
      updateDownloaded = true;
      mainWindow?.webContents.send('update:downloaded', {
        version: info.version
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err.message);
    });

    updater = autoUpdater;

    // Check for updates after 5-second delay
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[Updater] Check failed:', err.message);
      });
    }, 5000);

  } catch (err) {
    console.error('[Updater] Failed to initialize:', err.message);
  }
}

// Always callable — main.js registers the `update:install` IPC handler
// unconditionally, so the renderer gets a result object rather than a
// "No handler registered" rejection in dev builds.
async function installUpdate() {
  if (!updater) {
    return {
      success: false,
      error: 'Updates are only available in the installed app with auto-update enabled.'
    };
  }

  try {
    if (!updateDownloaded) {
      await updater.downloadUpdate();
    }
    updater.quitAndInstall(false, true);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { initUpdater, installUpdate };
