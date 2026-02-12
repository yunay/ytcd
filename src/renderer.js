// ═══════════════════════════════════════════════════════════════════
// YTCD Renderer — UI Logic
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────
  let settings = {};
  let currentType = 'video';
  let isDownloading = false;
  let videoInfo = null;
  let fetchTimeout = null;

  const VIDEO_QUALITIES = [
    { value: '2160', label: '2160p (4K)' },
    { value: '1440', label: '1440p (2K)' },
    { value: '1080', label: '1080p (Full HD)' },
    { value: '720',  label: '720p (HD)' },
    { value: '480',  label: '480p' },
    { value: '360',  label: '360p' }
  ];

  const AUDIO_QUALITIES = [
    { value: 'best', label: 'Best Quality' },
    { value: '320',  label: '320 kbps' },
    { value: '256',  label: '256 kbps' },
    { value: '192',  label: '192 kbps' },
    { value: '128',  label: '128 kbps' }
  ];

  // ── DOM References ────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Initialization ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadVersion();
    setupTitlebar();
    setupNavigation();
    setupUrlInput();
    setupTypeSelector();
    setupQualitySelector();
    setupSaveLocation();
    setupDownload();
    setupHistory();
    setupSettingsPage();
    setupKeyboardShortcuts();
    setupUpdateListener();
  });

  // ── Load settings ─────────────────────────────────────────────────
  async function loadSettings() {
    settings = await window.api.getSettings();
    currentType = settings.defaultType || 'video';

    // Update save path display
    if (settings.savePath) {
      $('#save-path-display').textContent = settings.savePath;
      $('#save-path-display').title = settings.savePath;
    }

    // Set active type button
    $$('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === currentType);
    });

    // Update quality dropdown for current type
    populateQualities(currentType);

    // Set default quality if available
    if (settings.defaultQuality) {
      const qualitySelect = $('#quality-select');
      if (qualitySelect.querySelector(`option[value="${settings.defaultQuality}"]`)) {
        qualitySelect.value = settings.defaultQuality;
      }
    }
  }

  async function loadVersion() {
    const version = await window.api.getVersion();
    $('#version-number').textContent = version;
    $('#settings-version').textContent = version;
  }

  // ── Titlebar ──────────────────────────────────────────────────────
  function setupTitlebar() {
    $('#minimize-btn').addEventListener('click', () => window.api.minimizeWindow());
    $('#maximize-btn').addEventListener('click', () => window.api.maximizeWindow());
    $('#close-btn').addEventListener('click', () => window.api.closeWindow());
  }

  // ── Navigation ────────────────────────────────────────────────────
  function setupNavigation() {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;

        // Update nav active state
        $$('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Show target page
        $$('.page').forEach(p => p.classList.remove('active'));
        $(`#page-${page}`).classList.add('active');

        // Reload history when switching to history page
        if (page === 'history') {
          renderHistory();
        }
      });
    });
  }

  // ── URL Input ─────────────────────────────────────────────────────
  function setupUrlInput() {
    const urlInput = $('#url-input');
    const pasteBtn = $('#paste-btn');

    pasteBtn.addEventListener('click', async () => {
      const text = await window.api.readClipboard();
      if (text) {
        urlInput.value = text;
        urlInput.dispatchEvent(new Event('input'));
      }
    });

    urlInput.addEventListener('input', () => {
      clearTimeout(fetchTimeout);
      const url = urlInput.value.trim();

      if (isPlaylistUrl(url)) {
        hideVideoInfo();
        showToast('Playlists are not supported. Please paste a single video link.', 'warning');
        return;
      }

      if (isValidYouTubeUrl(url)) {
        fetchTimeout = setTimeout(() => fetchVideoInfo(url), 600);
      } else {
        hideVideoInfo();
      }
    });
  }

  function isPlaylistUrl(url) {
    return /[?&]list=/.test(url) || /youtube\.com\/playlist/.test(url);
  }

  function isValidYouTubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/.test(url);
  }

  async function fetchVideoInfo(url) {
    const infoEl = $('#url-info');
    const titleEl = $('#video-title');
    const uploaderEl = $('#video-uploader');
    const durationEl = $('#video-duration');
    const thumbEl = $('#video-thumbnail');
    const loaderEl = $('#thumb-loader');

    titleEl.textContent = 'Fetching video info...';
    uploaderEl.textContent = '';
    durationEl.textContent = '';
    thumbEl.src = '';
    thumbEl.style.opacity = '0';
    loaderEl.classList.remove('hidden');
    infoEl.classList.remove('hidden');

    const result = await window.api.getVideoInfo(url);

    if (result.success) {
      videoInfo = result.data;
      titleEl.textContent = videoInfo.title;
      uploaderEl.textContent = videoInfo.uploader;
      durationEl.textContent = formatDuration(videoInfo.duration);
      if (videoInfo.thumbnail) {
        thumbEl.onload = () => {
          thumbEl.style.opacity = '1';
          loaderEl.classList.add('hidden');
        };
        thumbEl.onerror = () => {
          loaderEl.classList.add('hidden');
        };
        thumbEl.src = videoInfo.thumbnail;
      } else {
        loaderEl.classList.add('hidden');
      }
    } else {
      titleEl.textContent = 'Could not fetch video info';
      uploaderEl.textContent = result.error || '';
      loaderEl.classList.add('hidden');
      videoInfo = null;
    }
  }

  function hideVideoInfo() {
    $('#url-info').classList.add('hidden');
    videoInfo = null;
  }

  function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Type Selector ─────────────────────────────────────────────────
  function setupTypeSelector() {
    $$('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentType = btn.dataset.type;
        $$('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        populateQualities(currentType);
      });
    });
  }

  // ── Quality Selector ──────────────────────────────────────────────
  function setupQualitySelector() {
    populateQualities(currentType);
  }

  function populateQualities(type) {
    const select = $('#quality-select');
    const qualities = type === 'audio' ? AUDIO_QUALITIES : VIDEO_QUALITIES;
    select.innerHTML = '';

    qualities.forEach(q => {
      const opt = document.createElement('option');
      opt.value = q.value;
      opt.textContent = q.label;
      select.appendChild(opt);
    });

    // Set default
    if (type === 'video' && settings.defaultQuality) {
      select.value = settings.defaultQuality;
    }
  }

  // ── Save Location ─────────────────────────────────────────────────
  function setupSaveLocation() {
    $('#browse-btn').addEventListener('click', async () => {
      const folder = await window.api.openFolderDialog();
      if (folder) {
        settings.savePath = folder;
        $('#save-path-display').textContent = folder;
        $('#save-path-display').title = folder;
        await window.api.setSettings(settings);
      }
    });
  }

  // ── Download ──────────────────────────────────────────────────────
  function setupDownload() {
    const downloadBtn = $('#download-btn');
    const cancelBtn = $('#cancel-btn');
    const progressContainer = $('#progress-container');

    downloadBtn.addEventListener('click', startDownload);
    cancelBtn.addEventListener('click', cancelDownload);

    // Listen for progress events
    window.api.onDownloadProgress((data) => {
      $('#progress-bar-fill').style.width = `${data.percent}%`;
      $('#progress-percent').textContent = `${Math.round(data.percent)}%`;
      $('#progress-speed').textContent = data.speed || '---';
      $('#progress-eta').textContent = data.eta || '---';
      if (data.filename) {
        $('#progress-title').textContent = data.filename;
      }
    });

    window.api.onDownloadComplete(async (data) => {
      isDownloading = false;
      resetDownloadUI();

      // Add to history
      await window.api.addToHistory({
        title: data.filename || videoInfo?.title || 'Unknown',
        type: currentType,
        quality: $('#quality-select').value,
        filePath: data.filePath,
        folderPath: data.savePath,
        status: 'success'
      });

      showToast('Download completed successfully!', 'success');
    });

    window.api.onDownloadError(async (data) => {
      isDownloading = false;
      resetDownloadUI();

      // Add failed entry to history
      await window.api.addToHistory({
        title: videoInfo?.title || 'Unknown',
        type: currentType,
        quality: $('#quality-select').value,
        filePath: '',
        folderPath: settings.savePath,
        status: 'failed'
      });

      showToast(data.message || 'Download failed', 'error');
    });
  }

  async function startDownload() {
    const url = $('#url-input').value.trim();

    if (!url) {
      showToast('Please enter a YouTube URL', 'warning');
      return;
    }
    if (isPlaylistUrl(url)) {
      showToast('Playlists are not supported. Please paste a single video link.', 'warning');
      return;
    }
    if (!isValidYouTubeUrl(url)) {
      showToast('Please enter a valid YouTube URL', 'warning');
      return;
    }
    if (isDownloading) return;

    isDownloading = true;
    const downloadBtn = $('#download-btn');
    downloadBtn.classList.add('downloading');

    // Show progress
    $('#progress-container').classList.remove('hidden');
    $('#progress-bar-fill').style.width = '0%';
    $('#progress-percent').textContent = '0%';
    $('#progress-speed').textContent = '---';
    $('#progress-eta').textContent = '---';
    $('#progress-title').textContent = 'Starting download...';

    const options = {
      url: url,
      type: currentType,
      quality: $('#quality-select').value,
      savePath: settings.savePath
    };

    const result = await window.api.startDownload(options);
    if (!result.success) {
      isDownloading = false;
      resetDownloadUI();
      showToast(result.error || 'Failed to start download', 'error');
    }
  }

  async function cancelDownload() {
    await window.api.cancelDownload();
    isDownloading = false;
    resetDownloadUI();
    showToast('Download cancelled', 'warning');
  }

  function resetDownloadUI() {
    $('#download-btn').classList.remove('downloading');
    $('#progress-container').classList.add('hidden');
  }

  // ── History ───────────────────────────────────────────────────────
  function setupHistory() {
    $('#clear-history-btn').addEventListener('click', async () => {
      await window.api.clearHistory();
      renderHistory();
      showToast('History cleared', 'success');
    });
  }

  async function renderHistory() {
    const list = $('#download-list');
    const history = await window.api.getHistory();
    const emptyState = $('#history-empty');

    // Clear existing items (keep empty state)
    list.querySelectorAll('.download-item').forEach(el => el.remove());

    if (!history || history.length === 0) {
      if (emptyState) emptyState.style.display = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    history.forEach(item => {
      const el = createHistoryItem(item);
      list.appendChild(el);
    });
  }

  function createHistoryItem(item) {
    const div = document.createElement('div');
    div.className = 'download-item';

    const isVideo = item.type === 'video';
    const date = new Date(item.date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    div.innerHTML = `
      <div class="download-item-icon ${isVideo ? 'video' : 'audio'}">
        ${isVideo
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
        }
      </div>
      <div class="download-item-info">
        <div class="download-item-title">${escapeHtml(item.title)}</div>
        <div class="download-item-meta">${date} &middot; ${item.quality || ''} &middot; ${isVideo ? 'Video' : 'Audio'}</div>
      </div>
      <span class="download-item-status ${item.status}">${item.status === 'success' ? 'Done' : 'Failed'}</span>
      <div class="download-item-actions">
        ${item.status === 'success' ? `
          <button class="open-folder-btn" title="Show in folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          </button>
        ` : ''}
        <button class="delete-item-btn" title="Delete from history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
    `;

    // Attach event listeners
    const openFileBtn = div.querySelector('.open-file-btn');
    if (openFileBtn) {
      openFileBtn.addEventListener('click', () => {
        window.api.openPath(item.filePath);
      });
    }

    const openFolderBtn = div.querySelector('.open-folder-btn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', () => {
        window.api.showInFolder(item.filePath);
      });
    }

    const deleteBtn = div.querySelector('.delete-item-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        await window.api.deleteHistoryItem(item.id);
        div.remove();
        // Check if list is now empty
        const remaining = $('#download-list').querySelectorAll('.download-item');
        if (remaining.length === 0) {
          const emptyState = $('#history-empty');
          if (emptyState) emptyState.style.display = '';
        }
        showToast('Item removed from history', 'success');
      });
    }

    return div;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return (text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Settings Page ─────────────────────────────────────────────────
  function setupSettingsPage() {
    // Default save path
    $('#default-save-path').textContent = settings.savePath || 'Downloads';

    $('#change-default-path').addEventListener('click', async () => {
      const folder = await window.api.openFolderDialog();
      if (folder) {
        settings.savePath = folder;
        $('#default-save-path').textContent = folder;
        $('#save-path-display').textContent = folder;
        $('#save-path-display').title = folder;
        await window.api.setSettings(settings);
      }
    });

    // Default quality
    const defaultQualitySelect = $('#default-quality-select');
    if (settings.defaultQuality) {
      defaultQualitySelect.value = settings.defaultQuality;
    }
    defaultQualitySelect.addEventListener('change', async () => {
      settings.defaultQuality = defaultQualitySelect.value;
      await window.api.setSettings(settings);
    });

    // Default type
    const defaultTypeSelect = $('#default-type-select');
    if (settings.defaultType) {
      defaultTypeSelect.value = settings.defaultType;
    }
    defaultTypeSelect.addEventListener('change', async () => {
      settings.defaultType = defaultTypeSelect.value;
      await window.api.setSettings(settings);
    });

    // Auto update toggle
    const autoUpdateToggle = $('#auto-update-toggle');
    autoUpdateToggle.checked = settings.autoUpdate !== false;
    autoUpdateToggle.addEventListener('change', async () => {
      settings.autoUpdate = autoUpdateToggle.checked;
      await window.api.setSettings(settings);
    });

    // Notifications toggle
    const notificationsToggle = $('#notifications-toggle');
    notificationsToggle.checked = settings.notifications !== false;
    notificationsToggle.addEventListener('change', async () => {
      settings.notifications = notificationsToggle.checked;
      await window.api.setSettings(settings);
    });
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+V — paste and trigger info fetch
      if (e.ctrlKey && e.key === 'v' && document.activeElement !== $('#url-input')) {
        e.preventDefault();
        $('#paste-btn').click();
      }

      // Ctrl+D — start download
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        if (!isDownloading) {
          startDownload();
        }
      }

      // Escape — cancel download
      if (e.key === 'Escape' && isDownloading) {
        cancelDownload();
      }
    });
  }

  // ── Update listener ───────────────────────────────────────────────
  function setupUpdateListener() {
    let updateReady = false;

    window.api.onUpdateAvailable((data) => {
      $('#update-banner').classList.remove('hidden');
      $('#update-btn').textContent = 'Update Now';
      $('#update-btn').disabled = false;
    });

    window.api.onUpdateNotAvailable(() => {
      showToast('You are on the latest version', 'success');
    });

    window.api.onUpdateError(() => {
      showToast('Failed to check for updates', 'error');
      $('#update-btn').textContent = 'Update Now';
      $('#update-btn').disabled = false;
    });

    window.api.onUpdateDownloaded(() => {
      updateReady = true;
      $('#update-btn').textContent = 'Restart & Update';
      $('#update-btn').disabled = false;
    });

    $('#update-btn').addEventListener('click', async () => {
      if (updateReady) {
        window.api.installUpdate();
      } else {
        $('#update-btn').textContent = 'Downloading...';
        $('#update-btn').disabled = true;
        await window.api.downloadUpdate();
      }
    });

    $('#dismiss-update').addEventListener('click', () => {
      $('#update-banner').classList.add('hidden');
    });

    // Check for updates button in settings
    $('#check-updates-btn').addEventListener('click', async () => {
      $('#check-updates-btn').disabled = true;
      $('#check-updates-btn').textContent = 'Checking...';
      await window.api.checkForUpdates();
      $('#check-updates-btn').disabled = false;
      $('#check-updates-btn').textContent = 'Check for Updates';
    });

    // Auto-check on load if enabled
    if (settings.autoUpdate) {
      setTimeout(() => {
        window.api.checkForUpdates();
      }, 5000);
    }
  }

  // ── Toast notifications ───────────────────────────────────────────
  let toastTimer = null;

  function showToast(message, type = 'info') {
    const toast = $('#status-message');
    const textEl = $('#toast-text');
    const iconEl = $('#toast-icon');

    clearTimeout(toastTimer);

    // Set icon
    const icons = {
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    iconEl.innerHTML = icons[type] || icons.info;
    textEl.textContent = message;

    // Reset classes
    toast.className = 'toast';
    toast.classList.add(type, 'show');

    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

})();
