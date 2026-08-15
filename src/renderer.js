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

      if (isValidYouTubeUrl(url)) {
        fetchTimeout = setTimeout(() => fetchVideoInfo(url), 600);
      } else {
        hideVideoInfo();
      }
    });
  }

  function isValidYouTubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|playlist\?list=)|youtu\.be\/).+/.test(url);
  }

  // Must stay in sync with isPlaylistUrl() in downloader.js — a watch URL with
  // a &list= is a single video, only /playlist?list=... is a playlist.
  function isPlaylistUrl(url) {
    return /youtube\.com\/playlist\?/i.test(url);
  }

  async function fetchVideoInfo(url) {
    const infoEl = $('#url-info');
    const titleEl = $('#video-title');
    const uploaderEl = $('#video-uploader');
    const durationEl = $('#video-duration');
    const thumbEl = $('#video-thumbnail');
    const badgeEl = $('#video-badge');

    titleEl.textContent = isPlaylistUrl(url) ? 'Fetching playlist info...' : 'Fetching video info...';
    uploaderEl.textContent = '';
    durationEl.textContent = '';
    thumbEl.src = '';
    badgeEl.classList.add('hidden');
    infoEl.classList.remove('hidden');

    const result = await window.api.getVideoInfo(url);

    if (result.success) {
      videoInfo = result.data;
      titleEl.textContent = videoInfo.title;
      uploaderEl.textContent = videoInfo.uploader;
      durationEl.textContent = formatDuration(videoInfo.duration);
      if (videoInfo.thumbnail) {
        thumbEl.src = videoInfo.thumbnail;
      }
      if (videoInfo.isPlaylist) {
        badgeEl.textContent = `Playlist · ${videoInfo.playlistCount} videos`;
        badgeEl.classList.remove('hidden');
      }
    } else {
      titleEl.textContent = 'Could not fetch video info';
      uploaderEl.textContent = result.error || '';
      videoInfo = null;
    }
  }

  function hideVideoInfo() {
    $('#url-info').classList.add('hidden');
    $('#video-badge').classList.add('hidden');
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
      // For playlists the bar tracks the whole run, not the current item.
      const barPercent = data.overallPercent ?? data.percent;
      $('#progress-bar-fill').style.width = `${barPercent}%`;
      $('#progress-percent').textContent = `${Math.round(barPercent)}%`;
      $('#progress-speed').textContent = data.speed || '---';
      $('#progress-eta').textContent = data.eta || '---';
      if (data.filename) {
        $('#progress-title').textContent = data.filename;
      }

      const itemEl = $('#progress-item');
      if (data.playlistCount) {
        itemEl.textContent = `${data.playlistIndex} / ${data.playlistCount}`;
        itemEl.classList.remove('hidden');
      } else {
        itemEl.classList.add('hidden');
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
        status: 'success',
        isPlaylist: !!data.isPlaylist,
        itemCount: data.itemCount || 1,
        // A partly downloaded playlist keeps the reasons its items were skipped
        error: (data.errors || []).join('\n') || ''
      });

      if (data.isPlaylist && data.skippedCount) {
        showToast(`Downloaded ${data.itemCount} item(s), ${data.skippedCount} skipped`, 'warning');
      } else if (data.isPlaylist) {
        showToast(`Playlist downloaded — ${data.itemCount} item(s)`, 'success');
      } else {
        showToast('Download completed successfully!', 'success');
      }
    });

    window.api.onDownloadError(async (data) => {
      isDownloading = false;
      resetDownloadUI();

      const message = data.message || 'Download failed';

      // Add failed entry to history, keeping the reason — the toast is gone in
      // four seconds, the history entry is the only lasting record.
      await window.api.addToHistory({
        title: videoInfo?.title || 'Unknown',
        type: currentType,
        quality: $('#quality-select').value,
        filePath: '',
        folderPath: settings.savePath,
        status: 'failed',
        error: message
      });

      // Long yt-dlp errors stay readable: first line here, full text in history
      showToast(message.split('\n')[0], 'error');
    });
  }

  async function startDownload() {
    const url = $('#url-input').value.trim();

    if (!url) {
      showToast('Please enter a YouTube URL', 'warning');
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
    $('#progress-item').classList.add('hidden');

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

    const playlistIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
    const videoIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>';
    const audioIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

    const meta = [
      date,
      escapeHtml(item.quality || ''),
      isVideo ? 'Video' : 'Audio',
      item.isPlaylist ? `Playlist · ${Number(item.itemCount) || 0} items` : ''
    ].filter(Boolean).join(' &middot; ');

    const failed = item.status !== 'success';
    // Failures carry the reason; a successful playlist carries it only when
    // some of its items were skipped.
    const details = (item.error || '').trim();
    const detailsLabel = failed ? 'Error details' : 'Skipped items';

    div.innerHTML = `
      <div class="download-item-row">
        <div class="download-item-icon ${isVideo ? 'video' : 'audio'}">
          ${item.isPlaylist ? playlistIcon : (isVideo ? videoIcon : audioIcon)}
        </div>
        <div class="download-item-info">
          <div class="download-item-title">${escapeHtml(item.title)}</div>
          <div class="download-item-meta">${meta}</div>
        </div>
        <span class="download-item-status ${item.status}">${failed ? 'Failed' : 'Done'}</span>
        <div class="download-item-actions">
          ${details ? `
            <button class="details-btn" title="${escapeAttr(detailsLabel)}" aria-expanded="false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          ` : ''}
          ${!failed ? `
            <button class="open-file-btn" title="Open file" data-path="${escapeAttr(item.filePath)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
            <button class="open-folder-btn" title="Open folder" data-path="${escapeAttr(item.folderPath)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            </button>
          ` : ''}
        </div>
      </div>
      ${details ? `
        <div class="download-item-details ${failed ? '' : 'warning'} hidden">
          <span class="download-item-details-label">${escapeHtml(detailsLabel)}</span>
          <pre class="download-item-details-text">${escapeHtml(details)}</pre>
        </div>
      ` : ''}
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
        window.api.openPath(item.folderPath);
      });
    }

    const detailsBtn = div.querySelector('.details-btn');
    const detailsBox = div.querySelector('.download-item-details');
    if (detailsBtn && detailsBox) {
      detailsBtn.addEventListener('click', () => {
        const shown = !detailsBox.classList.toggle('hidden');
        detailsBtn.classList.toggle('expanded', shown);
        detailsBtn.setAttribute('aria-expanded', String(shown));
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

    // Start minimized toggle — applies on the next app start
    const startMinimizedToggle = $('#start-minimized-toggle');
    startMinimizedToggle.checked = settings.startMinimized === true;
    startMinimizedToggle.addEventListener('change', async () => {
      settings.startMinimized = startMinimizedToggle.checked;
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
    window.api.onUpdateAvailable((data) => {
      $('#update-banner').classList.remove('hidden');
    });

    window.api.onUpdateDownloaded(() => {
      // Only relabel — the click handler below is already attached.
      $('#update-btn').textContent = 'Restart & Update';
    });

    $('#update-btn').addEventListener('click', async () => {
      const result = await window.api.installUpdate();
      if (result && !result.success) {
        showToast(result.error || 'Update failed', 'error');
      }
    });

    $('#dismiss-update').addEventListener('click', () => {
      $('#update-banner').classList.add('hidden');
    });
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
