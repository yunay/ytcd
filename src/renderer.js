// ═══════════════════════════════════════════════════════════════════
// YTCD Renderer — UI Logic
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────
  let settings = {};
  let currentType = 'video';
  let isDownloading = false;
  let activeDownload = null;     // { url, type, quality, playlist } while running
  let videoInfo = null;
  let fetchTimeout = null;
  let fetchRequestId = 0;
  let playlistScope = 'single';
  let historyCache = [];
  let historyFilter = 'all';

  const VIDEO_QUALITIES = [
    { value: '2160', label: '2160p (4K)' },
    { value: '1440', label: '1440p (2K)' },
    { value: '1080', label: '1080p (Full HD)' },
    { value: '720',  label: '720p (HD)' },
    { value: '480',  label: '480p' },
    { value: '360',  label: '360p' }
  ];

  const AUDIO_QUALITIES = [
    { value: 'best', label: 'Best quality' },
    { value: '320',  label: '320 kbps' },
    { value: '256',  label: '256 kbps' },
    { value: '192',  label: '192 kbps' },
    { value: '128',  label: '128 kbps' }
  ];

  const MEDIA_EXT = /\.(mp3|mp4|m4a|webm|mkv|opus|ogg|wav|flac|aac)$/i;

  // ── DOM References ────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Icons (inline stroke SVG, 24px grid) ──────────────────────────
  const ICONS = {
    video: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h8M3 6h.01M3 12h.01M3 18h.01"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    external: '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    folder: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    cross: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    warning: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
  };

  function icon(paths, size = 16, stroke = 1.6) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  // ── Initialization ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadVersion();
    setupTitlebar();
    setupNavigation();
    setupUrlInput();
    setupPlaylistChoice();
    setupTypeSelector();
    setupSaveLocation();
    setupDownload();
    setupHistory();
    setupSettingsPage();
    setupYtdlpUpdate();
    setupKeyboardShortcuts();
    setupUpdateListener();
    setupToast();
  });

  // ── Load settings ─────────────────────────────────────────────────
  async function loadSettings() {
    settings = await window.api.getSettings();
    setSavePath(settings.savePath);
    setActiveType(settings.defaultType || 'video');
    // Applies the matching default quality as well
    populateQualities(currentType);
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

  function setTitlebarStatus(text) {
    $('#titlebar-status').textContent = text;
  }

  // ── Navigation ────────────────────────────────────────────────────
  function setupNavigation() {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => showPage(item.dataset.page));
    });
  }

  function showPage(page) {
    $$('.nav-item').forEach(item => {
      const active = item.dataset.page === page;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    // Leaving display:none restarts each block's entrance animation, which
    // is what makes the switch read as a page transition
    $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    // Lets the update banner line up with the page's own column
    $('#main-content').dataset.page = page;

    if (page === 'history') renderHistory();
  }

  // ── URL Input ─────────────────────────────────────────────────────
  function setupUrlInput() {
    const urlInput = $('#url-input');

    $('#paste-btn').addEventListener('click', async () => {
      const text = await window.api.readClipboard();
      if (text) {
        urlInput.value = text.trim();
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

    // A thumbnail that fails to load falls back to the placeholder glyph
    $('#video-thumbnail').addEventListener('error', () => setThumbnail(''));
  }

  // music.youtube.com and m.youtube.com are where songs are usually copied from
  function isValidYouTubeUrl(url) {
    return /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?v=|shorts\/|playlist\?list=)|youtu\.be\/).+/i.test(url);
  }

  // Must stay in sync with the helpers in downloader.js
  function isPlaylistPageUrl(url) {
    return /youtube\.com\/playlist\?/i.test(url);
  }

  function hasPlaylistId(url) {
    return /[?&]list=[^&#\s]+/.test(url);
  }

  async function fetchVideoInfo(url) {
    // A slow request must not overwrite the result of a newer one
    const requestId = ++fetchRequestId;

    videoInfo = null;
    setPlaylistScope('single');
    if (!isDownloading) showCard('loading');
    $('#media-loading').textContent = 'Fetching video details';

    const result = await window.api.getVideoInfo(url);
    if (requestId !== fetchRequestId) return;

    $('#media-loading').textContent = '';

    if (result.success) {
      videoInfo = result.data;
      renderVideoInfo(videoInfo);
      if (!videoInfo.isPlaylist && videoInfo.playlist) {
        $('#playlist-choice-title').textContent = videoInfo.playlist.title;
        $('#playlist-choice-count').textContent = `${videoInfo.playlist.count} items`;
      }
      // Ctrl+D can start a download before the details arrive
      if (isDownloading && activeDownload.playlist && videoInfo.playlist) {
        renderPlaylistHeader(videoInfo.playlist);
      }
    } else {
      renderInfoError(result.error);
    }

    showCard(isDownloading ? 'downloading' : 'ready');
  }

  function hideVideoInfo() {
    fetchRequestId++;
    videoInfo = null;
    setPlaylistScope('single');
    setThumbnail('');
    showCard('empty');
  }

  // ── Media card ────────────────────────────────────────────────────
  // One card moves through every state in place: empty → loading → ready →
  // downloading → ready again.
  function showCard(state) {
    const card = $('#media-card');
    const downloading = state === 'downloading';
    const offerPlaylist = state === 'ready' && videoInfo && !videoInfo.isPlaylist && videoInfo.playlist;

    $('#home-empty').classList.toggle('hidden', state !== 'empty');
    card.classList.toggle('hidden', state === 'empty');
    card.classList.toggle('is-loading', state === 'loading');

    $('#media-controls').classList.toggle('hidden', downloading);
    $('#media-actions').classList.toggle('hidden', downloading);
    $('#download-summary').classList.toggle('hidden', !downloading);
    $('#progress-container').classList.toggle('hidden', !downloading);
    $('#playlist-choice').classList.toggle('hidden', !offerPlaylist);

    $('#download-btn').disabled = state === 'loading';
  }

  function renderVideoInfo(info) {
    $('#media-card').classList.remove('media-error');
    $('#video-title').textContent = info.title;

    const meta = info.isPlaylist
      ? [info.uploader, `${info.playlistCount} items`, formatDuration(info.duration)]
      : [info.uploader, formatDuration(info.duration)];
    $('#video-meta').textContent = meta.filter(Boolean).join(' · ');

    setThumbnail(info.thumbnail);
    if (info.isPlaylist) setThumbBadge(`${info.playlistCount} items`, true);
    else setThumbBadge(formatDuration(info.duration));
  }

  // Downloading every item of a watch link's playlist: the card speaks for
  // the playlist, not for the one video the link pointed at
  function renderPlaylistHeader(playlist) {
    $('#video-title').textContent = playlist.title;
    $('#video-meta').textContent = `${playlist.count} items`;
    setThumbBadge(`${playlist.count} items`, true);
  }

  function renderInfoError(error) {
    $('#media-card').classList.add('media-error');
    $('#video-title').textContent = 'Could not fetch info for this link';
    $('#video-meta').textContent = (error || '').split('\n')[0];
    setThumbnail('');
    setThumbBadge('');
  }

  // An <img> with an empty src renders as a broken image, so the attribute is
  // removed instead of blanked.
  function setThumbnail(src) {
    const thumbEl = $('#video-thumbnail');
    if (src) {
      thumbEl.src = src;
      thumbEl.classList.remove('hidden');
    } else {
      thumbEl.removeAttribute('src');
      thumbEl.classList.add('hidden');
    }
  }

  function setThumbBadge(text, isList = false) {
    $('#thumb-badge').classList.toggle('hidden', !text);
    $('#thumb-badge-text').textContent = text || '';
    $('#thumb-badge-icon').classList.toggle('hidden', !isList);
  }

  // ── Playlist scope choice ─────────────────────────────────────────
  function setupPlaylistChoice() {
    $$('.scope-btn').forEach(btn => {
      btn.addEventListener('click', () => setPlaylistScope(btn.dataset.scope));
    });
  }

  function setPlaylistScope(scope) {
    playlistScope = scope;
    $$('.scope-btn').forEach(btn => setPressed(btn, btn.dataset.scope === scope));
  }

  function setPressed(btn, on) {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  function formatDuration(seconds) {
    if (!seconds) return '';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Type Selector ─────────────────────────────────────────────────
  function setupTypeSelector() {
    $$('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setActiveType(btn.dataset.type);
        populateQualities(currentType);
      });
    });
  }

  function setActiveType(type) {
    currentType = type;
    $$('.type-btn').forEach(btn => setPressed(btn, btn.dataset.type === type));
  }

  // ── Quality Selector ──────────────────────────────────────────────
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

    selectIfPresent(select, type === 'audio' ? settings.defaultAudioQuality : settings.defaultQuality);
  }

  // Assigning a value with no matching <option> leaves the select blank
  // (selectedIndex -1), so only assign what actually exists.
  function selectIfPresent(select, value) {
    if (!value) return;
    const match = [...select.options].some(o => o.value === String(value));
    if (match) select.value = value;
  }

  function qualityLabel(type, value) {
    if (!value) return '';
    if (type === 'audio') return value === 'best' ? 'Best quality' : `${value} kbps`;
    return /^\d+$/.test(String(value)) ? `${value}p` : String(value);
  }

  // ── Save Location ─────────────────────────────────────────────────
  function setupSaveLocation() {
    $('#browse-btn').addEventListener('click', chooseSaveFolder);
  }

  async function chooseSaveFolder() {
    const folder = await window.api.openFolderDialog();
    if (!folder) return;
    settings.savePath = folder;
    setSavePath(folder);
    await window.api.setSettings(settings);
  }

  function setSavePath(folder) {
    const display = $('#save-path-display');
    display.textContent = folder || 'Downloads';
    display.title = folder || '';
    $('#default-save-path').textContent = folder || 'Downloads';
  }

  // ── Download ──────────────────────────────────────────────────────
  function setupDownload() {
    $('#download-btn').addEventListener('click', startDownload);
    $('#cancel-btn').addEventListener('click', cancelDownload);

    window.api.onDownloadProgress((data) => {
      // For playlists the bar tracks the whole run, not the current item.
      const barPercent = Math.max(0, Math.min(100, data.overallPercent ?? data.percent ?? 0));
      const rounded = Math.round(barPercent);

      $('#progress-bar-fill').style.width = `${barPercent}%`;
      $('#progress-bar-track').setAttribute('aria-valuenow', String(rounded));
      $('#progress-percent').textContent = `${rounded}%`;
      $('#progress-speed').textContent = data.speed || '---';
      $('#progress-eta').textContent = data.eta && data.eta !== '---' ? `ETA ${data.eta}` : '---';
      if (data.filename) {
        $('#progress-title').textContent = itemTitle(data.filename);
      }

      const itemEl = $('#progress-item');
      const itemPercentEl = $('#progress-item-percent');
      if (data.playlistCount) {
        itemEl.textContent = `${data.playlistIndex} / ${data.playlistCount}`;
        itemPercentEl.textContent = `This item ${Math.round(data.percent || 0)}%`;
        itemEl.classList.remove('hidden');
        itemPercentEl.classList.remove('hidden');
      } else {
        itemEl.classList.add('hidden');
        itemPercentEl.classList.add('hidden');
      }

      setTitlebarStatus(`Downloading ${rounded}%`);
    });

    window.api.onDownloadComplete(async (data) => {
      const run = activeDownload || {};
      finishDownload();

      const skipped = data.skippedCount || 0;
      const title = data.isPlaylist
        ? (data.filename || videoInfo?.playlist?.title || videoInfo?.title || 'Playlist')
        : (videoInfo?.title || stripExtension(data.filename) || 'Unknown');

      await window.api.addToHistory({
        title,
        type: run.type || currentType,
        quality: run.quality || $('#quality-select').value,
        filePath: data.filePath,
        folderPath: data.savePath,
        status: 'success',
        isPlaylist: !!data.isPlaylist,
        itemCount: data.itemCount || 1,
        skippedCount: skipped,
        // A partly downloaded playlist keeps the reasons its items were skipped
        error: (data.errors || []).join('\n') || ''
      });

      if (data.isPlaylist && skipped) {
        showToast('Playlist downloaded', 'warning', `${data.itemCount} of ${data.itemCount + skipped} items saved · ${skipped} skipped`);
      } else if (data.isPlaylist) {
        showToast('Playlist downloaded', 'success', `${data.itemCount} items saved`);
      } else {
        showToast('Download complete', 'success', stripExtension(data.filename) || title);
      }
    });

    window.api.onDownloadError(async (data) => {
      const run = activeDownload || {};
      finishDownload();

      const message = data.message || 'Download failed';

      // Add failed entry to history, keeping the reason — the toast is gone in
      // a few seconds, the history entry is the only lasting record. Without
      // fetched details the link itself is the best title there is.
      await window.api.addToHistory({
        title: videoInfo?.title || displayUrl(run.url) || 'Unknown',
        type: run.type || currentType,
        quality: run.quality || $('#quality-select').value,
        filePath: '',
        folderPath: settings.savePath,
        status: 'failed',
        isPlaylist: !!run.playlist,
        error: message
      });

      // Long yt-dlp errors stay readable: first line here, full text in history
      showToast('Download failed', 'error', message.split('\n')[0]);
    });
  }

  async function startDownload() {
    const url = $('#url-input').value.trim();

    if (!url) {
      showToast('Paste a YouTube link first', 'warning');
      return;
    }
    if (!isValidYouTubeUrl(url)) {
      showToast('That is not a YouTube link', 'warning', 'Use a youtube.com, youtu.be or music.youtube.com address');
      return;
    }
    if (isDownloading) return;

    // A /playlist? URL is always the whole list; a watch URL follows the
    // choice the user made in the UI.
    const playlist = isPlaylistPageUrl(url) || (hasPlaylistId(url) && playlistScope === 'playlist');
    const quality = $('#quality-select').value;

    isDownloading = true;
    activeDownload = { url, type: currentType, quality, playlist };

    if (playlist && videoInfo && !videoInfo.isPlaylist && videoInfo.playlist) {
      renderPlaylistHeader(videoInfo.playlist);
    } else if (!videoInfo) {
      $('#video-title').textContent = displayUrl(url);
      $('#video-meta').textContent = '';
    }

    // Read-only summary in place of the controls
    const playlistTitle = playlist ? (videoInfo?.playlist?.title || (videoInfo?.isPlaylist && videoInfo.title)) : null;
    $('#summary-format').textContent = currentType === 'audio' ? 'Audio · MP3' : 'Video · MP4';
    $('#summary-quality').textContent = qualityLabel(currentType, quality);
    $('#summary-path').textContent = playlistTitle ? `${settings.savePath}\\${playlistTitle}` : settings.savePath;

    $('#progress-bar-fill').style.width = '0%';
    $('#progress-bar-track').setAttribute('aria-valuenow', '0');
    $('#progress-percent').textContent = '0%';
    $('#progress-speed').textContent = '---';
    $('#progress-eta').textContent = '---';
    $('#progress-title').textContent = 'Starting download…';
    $('#progress-item').classList.add('hidden');
    $('#progress-item-percent').classList.add('hidden');

    setInputLocked(true);
    showCard('downloading');
    setTitlebarStatus('Downloading 0%');

    const result = await window.api.startDownload({
      url,
      type: currentType,
      quality,
      savePath: settings.savePath,
      playlist
    });
    if (!result.success) {
      finishDownload();
      showToast('Could not start the download', 'error', result.error || '');
    }
  }

  async function cancelDownload() {
    if (!isDownloading) return;
    await window.api.cancelDownload();
    finishDownload();
    showToast('Download cancelled', 'info');
  }

  // Back to the ready card, with the video's own details if the header was
  // showing the playlist
  function finishDownload() {
    isDownloading = false;
    activeDownload = null;
    setInputLocked(false);
    setTitlebarStatus('');
    if (videoInfo) renderVideoInfo(videoInfo);
    showCard(isValidYouTubeUrl($('#url-input').value.trim()) ? 'ready' : 'empty');
  }

  function setInputLocked(locked) {
    $('#url-input').disabled = locked;
    $('#paste-btn').disabled = locked;
    $('#url-field').classList.toggle('is-disabled', locked);
  }

  function stripExtension(name) {
    return (name || '').replace(MEDIA_EXT, '');
  }

  // Playlist items are saved as "08 - Title.ext"; the badge already says 8 / 19
  function itemTitle(name) {
    return stripExtension(name).replace(/^\d{1,4} - /, '');
  }

  function displayUrl(url) {
    return (url || '').replace(/^https?:\/\/(www\.)?/i, '');
  }

  // ── History ───────────────────────────────────────────────────────
  function setupHistory() {
    $('#clear-history-btn').addEventListener('click', async () => {
      await window.api.clearHistory();
      await renderHistory();
      showToast('History cleared', 'success');
    });

    $$('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        historyFilter = chip.dataset.filter;
        $$('.chip').forEach(c => setPressed(c, c === chip));
        drawHistory();
      });
    });
  }

  async function renderHistory() {
    historyCache = (await window.api.getHistory()) || [];
    drawHistory();
  }

  function matchesFilter(item, filter) {
    if (filter === 'failed') return item.status !== 'success';
    if (filter === 'video') return item.type === 'video';
    if (filter === 'audio') return item.type !== 'video';
    return true;
  }

  function drawHistory() {
    const counts = { all: historyCache.length, video: 0, audio: 0, failed: 0 };
    historyCache.forEach(item => {
      counts[item.type === 'video' ? 'video' : 'audio']++;
      if (item.status !== 'success') counts.failed++;
    });
    $$('.chip-count').forEach(el => { el.textContent = counts[el.dataset.count]; });
    $('#clear-history-btn').disabled = historyCache.length === 0;

    const list = $('#download-list');
    const items = historyCache.filter(item => matchesFilter(item, historyFilter));
    list.innerHTML = '';

    const empty = $('#history-empty');
    if (items.length === 0) {
      const anything = historyCache.length > 0;
      $('#history-empty-title').textContent = anything ? 'Nothing here' : 'No downloads yet';
      $('#history-empty-text').textContent = anything
        ? 'No downloads match this filter'
        : 'Your download history will appear here';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const today = new Date().toDateString();
    const groups = [
      { label: 'Today', today: true, items: items.filter(i => new Date(i.date).toDateString() === today) },
      { label: 'Earlier', today: false, items: items.filter(i => new Date(i.date).toDateString() !== today) }
    ];

    groups.filter(g => g.items.length).forEach(group => {
      const section = document.createElement('section');
      section.className = 'history-group';
      const heading = document.createElement('h2');
      heading.textContent = group.label;
      section.appendChild(heading);
      group.items.forEach(item => section.appendChild(createHistoryItem(item, group.today)));
      list.appendChild(section);
    });
  }

  function createHistoryItem(item, isToday) {
    const div = document.createElement('div');
    div.className = 'download-item gloss';

    const isVideo = item.type === 'video';
    const failed = item.status !== 'success';
    const when = new Date(item.date);
    const time = isToday
      ? when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Older entries have no skippedCount; their skip reasons are one per line
    const skipped = item.isPlaylist && !failed
      ? (Number(item.skippedCount) || (item.error ? item.error.split('\n').filter(Boolean).length : 0))
      : 0;

    let tileClass = isVideo ? 'tile-video' : 'tile-audio';
    let tileIcon = isVideo ? ICONS.video : ICONS.audio;
    if (failed) tileClass = 'tile-failed';
    else if (item.isPlaylist) { tileClass = 'tile-playlist'; tileIcon = ICONS.list; }

    const meta = [
      time,
      item.isPlaylist ? 'Playlist' : '',
      isVideo ? 'Video' : 'Audio',
      qualityLabel(item.type, item.quality),
      item.isPlaylist && !failed ? `${Number(item.itemCount) || 0} items` : ''
    ].filter(Boolean).map(escapeHtml).join(' · ');

    const title = item.isPlaylist ? item.title : stripExtension(item.title);

    // Failures carry the reason; a successful playlist carries it only when
    // some of its items were skipped.
    const details = (item.error || '').trim();
    const detailsLabel = failed ? 'Error details' : 'Skipped items';

    div.innerHTML = `
      <div class="download-item-row">
        <div class="item-tile ${tileClass}">${icon(tileIcon, 18, 1.8)}</div>
        <div class="download-item-info">
          <div class="download-item-title">${escapeHtml(title)}</div>
          <div class="download-item-meta">${meta}</div>
        </div>
        ${skipped ? `<span class="skip-chip">${icon(ICONS.warning, 12, 2.2)}${skipped} skipped</span>` : ''}
        <span class="item-status ${failed ? 'failed' : 'success'}">${icon(failed ? ICONS.cross : ICONS.check, 16, 1.8)}${failed ? 'Failed' : 'Done'}</span>
        <div class="download-item-actions">
          ${details ? `<button class="btn btn-icon details-btn" aria-expanded="false" aria-label="Show ${escapeAttr(detailsLabel.toLowerCase())}">${icon(ICONS.chevron, 16, 1.8)}</button>` : ''}
          ${!failed && !item.isPlaylist ? `<button class="btn btn-icon open-file-btn" aria-label="Open file" title="Open file">${icon(ICONS.external)}</button>` : ''}
          ${!failed ? `<button class="btn btn-icon open-folder-btn" aria-label="Open folder" title="Open folder">${icon(ICONS.folder)}</button>` : ''}
        </div>
      </div>
      ${details ? `
        <div class="download-item-details ${failed ? '' : 'warning'} hidden">
          <span class="download-item-details-label">${escapeHtml(detailsLabel)}</span>
          <pre class="download-item-details-text">${escapeHtml(details)}</pre>
        </div>
      ` : ''}
    `;

    const openFileBtn = div.querySelector('.open-file-btn');
    if (openFileBtn) {
      openFileBtn.addEventListener('click', () => window.api.openPath(item.filePath));
    }

    const openFolderBtn = div.querySelector('.open-folder-btn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', () => window.api.openPath(item.folderPath));
    }

    const detailsBtn = div.querySelector('.details-btn');
    const detailsBox = div.querySelector('.download-item-details');
    if (detailsBtn && detailsBox) {
      detailsBtn.addEventListener('click', () => {
        const shown = !detailsBox.classList.toggle('hidden');
        detailsBtn.setAttribute('aria-expanded', String(shown));
        detailsBtn.setAttribute('aria-label', `${shown ? 'Hide' : 'Show'} ${detailsLabel.toLowerCase()}`);
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
    $('#change-default-path').addEventListener('click', chooseSaveFolder);

    bindSelect('#default-quality-select', 'defaultQuality', () => {
      if (currentType === 'video') populateQualities('video');
    });
    bindSelect('#default-audio-quality-select', 'defaultAudioQuality', () => {
      if (currentType === 'audio') populateQualities('audio');
    });

    const typeButtons = $$('.default-type-btn');
    const markDefaultType = (type) => typeButtons.forEach(btn => setPressed(btn, btn.dataset.type === type));
    markDefaultType(settings.defaultType || 'video');
    typeButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        settings.defaultType = btn.dataset.type;
        markDefaultType(settings.defaultType);
        await window.api.setSettings(settings);
      });
    });

    bindToggle('#auto-update-toggle', 'autoUpdate', settings.autoUpdate !== false);
    bindToggle('#notifications-toggle', 'notifications', settings.notifications !== false);
    // Start minimized applies on the next app start
    bindToggle('#start-minimized-toggle', 'startMinimized', settings.startMinimized === true);
  }

  function bindSelect(selector, key, afterChange) {
    const select = $(selector);
    selectIfPresent(select, settings[key]);
    select.addEventListener('change', async () => {
      settings[key] = select.value;
      await window.api.setSettings(settings);
      afterChange();
    });
  }

  // The On/Off label follows the checkbox in CSS; only the value is stored here
  function bindToggle(selector, key, initial) {
    const input = $(selector);
    input.checked = initial;
    input.addEventListener('change', async () => {
      settings[key] = input.checked;
      await window.api.setSettings(settings);
    });
  }

  // ── yt-dlp updater ────────────────────────────────────────────────
  function setupYtdlpUpdate() {
    const row = $('#setting-ytdlp');

    showYtdlpVersion();

    $('#update-ytdlp-btn').addEventListener('click', async () => {
      row.classList.remove('is-error');
      row.classList.add('is-busy');
      setEngineButton('busy');

      const result = await window.api.updateYtdlp();

      row.classList.remove('is-busy');
      if (result.success) {
        $('#ytdlp-version').textContent = result.version;
        setEngineButton('idle');
        showToast('Downloader updated', 'success', `yt-dlp ${result.version}`);
      } else {
        $('#ytdlp-error').textContent = result.error || 'Update failed';
        row.classList.add('is-error');
        setEngineButton('retry');
      }
    });
  }

  function setEngineButton(state) {
    const btn = $('#update-ytdlp-btn');
    btn.disabled = state === 'busy';
    $('#update-ytdlp-label').textContent =
      state === 'busy' ? 'Updating…' : state === 'retry' ? 'Try again' : 'Update';
    btn.querySelector('.engine-btn-idle').classList.toggle('hidden', state === 'busy');
    btn.querySelector('.engine-btn-busy').classList.toggle('hidden', state !== 'busy');
  }

  async function showYtdlpVersion() {
    const result = await window.api.getYtdlpVersion();
    $('#ytdlp-version').textContent = result.success ? result.version : 'unavailable';
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
    window.api.onUpdateAvailable(() => {
      $('#update-banner').classList.remove('hidden');
    });

    window.api.onUpdateDownloaded(() => {
      // Only relabel — the click handler below is already attached.
      $('#update-btn').textContent = 'Restart and update';
    });

    $('#update-btn').addEventListener('click', async () => {
      const result = await window.api.installUpdate();
      if (result && !result.success) {
        showToast('Update failed', 'error', result.error || '');
      }
    });

    $('#dismiss-update').addEventListener('click', () => {
      $('#update-banner').classList.add('hidden');
    });
  }

  // ── Toast notifications ───────────────────────────────────────────
  let toastTimer = null;

  const TOAST_ICONS = {
    success: ICONS.check,
    error: ICONS.cross,
    warning: ICONS.warning,
    info: ICONS.info
  };

  function setupToast() {
    $('#toast-dismiss').addEventListener('click', hideToast);
  }

  function showToast(title, type = 'info', text = '') {
    const toast = $('#status-message');
    clearTimeout(toastTimer);

    $('#toast-icon').innerHTML = icon(TOAST_ICONS[type] || TOAST_ICONS.info, 20, 1.8);
    $('#toast-title').textContent = title;
    $('#toast-text').textContent = text;
    $('#toast-text').classList.toggle('hidden', !text);

    toast.className = `toast gloss ${type}`;
    // Restart the slide-in when one toast replaces another
    void toast.offsetWidth;
    toast.classList.add('show');

    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('#status-message').classList.remove('show');
  }

})();
