const { spawn } = require('child_process');
const path = require('path');

// ── URL helpers ─────────────────────────────────────────────────────
// A /playlist?list=... URL is nothing but a playlist. A watch URL that carries
// a &list=... could go either way, so the renderer asks the user and sends an
// explicit flag — these helpers only describe the URL, they don't decide.
function isPlaylistPageUrl(url) {
  return /youtube\.com\/playlist\?/i.test(url);
}

function getPlaylistId(url) {
  const match = String(url).match(/[?&]list=([^&#\s]+)/);
  return match ? match[1] : null;
}

// yt-dlp errors arrive as raw stderr chunks that also carry progress noise and,
// on some terminals, ANSI colour codes. Keep only the meaningful lines so the
// text is worth storing in history and showing to the user.
function cleanError(chunk) {
  const lines = chunk
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const errorLines = lines.filter(l => l.includes('ERROR'));
  return (errorLines.length ? errorLines : lines)
    .map(l => l.replace(/^ERROR:\s*/i, ''))
    .join('\n');
}

// Without this yt-dlp encodes its output in the Windows ANSI codepage and any
// non-Latin title comes back mangled — the parsed filename then points at a
// file that does not exist, so "Open file" in history silently does nothing.
const UTF8_ARGS = ['--encoding', 'utf-8'];

function pickThumbnail(entry) {
  if (!entry) return '';
  if (entry.thumbnail) return entry.thumbnail;
  const thumbs = entry.thumbnails || [];
  return thumbs.length ? thumbs[thumbs.length - 1].url || '' : '';
}

function createDownloader(getBinPath) {
  let childProcess = null;

  function getYtdlpPath() {
    return getBinPath('yt-dlp.exe');
  }

  function getFfmpegPath() {
    return path.dirname(getBinPath('ffmpeg.exe'));
  }

  // Reports the bundled yt-dlp's own version, so the UI can show what it is
  // running and confirm an update landed.
  function getVersion() {
    return new Promise((resolve, reject) => {
      const proc = spawn(getYtdlpPath(), ['--version'], { windowsHide: true });
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && out.trim()) resolve(out.trim());
        else reject(new Error('Could not read the yt-dlp version'));
      });
      proc.on('error', (err) => reject(new Error(`Failed to run yt-dlp: ${err.message}`)));
    });
  }

  // Runs yt-dlp for its JSON output. Rejects with a cleaned message so the
  // renderer never shows a raw stderr dump.
  function runJson(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(getYtdlpPath(), args, {
        windowsHide: true,
        env: { ...process.env, PATH: getFfmpegPath() + ';' + process.env.PATH }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(cleanError(stderr) || `yt-dlp exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error('Failed to parse video information'));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run yt-dlp: ${err.message}`));
      });
    });
  }

  // --flat-playlist keeps this fast: entry metadata only, no per-video fetch.
  // --yes-playlist is required for watch?v=…&list=… to resolve to the list.
  async function fetchPlaylistInfo(url) {
    const info = await runJson([
      '--dump-single-json', '--flat-playlist', '--yes-playlist', '--no-warnings',
      ...UTF8_ARGS, url
    ]);
    const entries = (info.entries || []).filter(Boolean);
    return {
      isPlaylist: true,
      title: info.title || 'Untitled Playlist',
      thumbnail: pickThumbnail(entries[0]),
      duration: entries.reduce((sum, e) => sum + (e.duration || 0), 0),
      uploader: info.uploader || info.channel || 'Unknown',
      videoQualities: [],
      playlistCount: entries.length,
      id: info.id
    };
  }

  async function fetchVideoInfo(url) {
    const info = await runJson([
      '--dump-json', '--no-download', '--no-warnings', '--no-playlist',
      ...UTF8_ARGS, url
    ]);

    // Extract available video resolutions
    const videoQualities = new Set();
    (info.formats || []).forEach(f => {
      if (f.height && f.vcodec !== 'none') {
        videoQualities.add(f.height);
      }
    });

    return {
      isPlaylist: false,
      title: info.title || 'Unknown Title',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      uploader: info.uploader || 'Unknown',
      videoQualities: [...videoQualities].sort((a, b) => b - a),
      playlistCount: 1,
      playlist: null,
      id: info.id
    };
  }

  async function getInfo(url) {
    if (isPlaylistPageUrl(url)) {
      return fetchPlaylistInfo(url);
    }

    // A watch URL may still belong to a playlist. Probe both at once so the UI
    // can offer "this one" vs "all of them" without a second round trip.
    const listId = getPlaylistId(url);
    const [video, playlist] = await Promise.all([
      fetchVideoInfo(url),
      listId ? fetchPlaylistInfo(url).catch(() => null) : Promise.resolve(null)
    ]);

    if (playlist && playlist.playlistCount > 0) {
      video.playlist = { title: playlist.title, count: playlist.playlistCount };
    }
    return video;
  }

  function download(options, callbacks) {
    const { url, type, quality, savePath } = options;
    const ytdlp = getYtdlpPath();
    // The renderer decides for watch URLs that carry a &list=; a bare
    // /playlist? URL has nothing else it could mean.
    const playlist = typeof options.playlist === 'boolean'
      ? options.playlist
      : isPlaylistPageUrl(url);

    // Playlists go into their own folder, numbered in playlist order.
    const outputTemplate = playlist
      ? path.join(savePath, '%(playlist_title)s', '%(playlist_index)s - %(title)s.%(ext)s')
      : path.join(savePath, '%(title)s.%(ext)s');

    let args = [];

    if (type === 'audio') {
      const bitrateMap = {
        'best': '0',
        '320': '0',
        '256': '3',
        '192': '5',
        '128': '7'
      };
      const aq = bitrateMap[quality] || '0';

      args = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', aq,
        '-o', outputTemplate,
        '--newline',
        '--no-warnings',
        url
      ];
    } else {
      // Video mode
      const heightNum = parseInt(quality) || 1080;
      args = [
        '-f', `bestvideo[height<=${heightNum}]+bestaudio/best[height<=${heightNum}]/best`,
        '--merge-output-format', 'mp4',
        '-o', outputTemplate,
        '--newline',
        '--no-warnings',
        url
      ];
    }

    args.push(playlist ? '--yes-playlist' : '--no-playlist');
    // One blocked or private item must not abort the rest of a playlist.
    if (playlist) args.push('--ignore-errors');

    args.push(...UTF8_ARGS);

    // Add ffmpeg location
    args.push('--ffmpeg-location', getFfmpegPath());

    childProcess = spawn(ytdlp, args, {
      windowsHide: true,
      env: { ...process.env, PATH: getFfmpegPath() + ';' + process.env.PATH }
    });

    let lastTitle = '';
    let lastDestPath = '';
    let playlistIndex = 0;
    let playlistCount = 0;
    const errors = [];
    let settled = false;

    // yt-dlp can report a failure on stderr *and* exit non-zero for the same
    // problem — the renderer must only ever see one terminal event.
    function reportComplete(result) {
      if (settled) return;
      settled = true;
      callbacks.onComplete(result);
    }

    function reportError(message) {
      if (settled) return;
      settled = true;
      callbacks.onError(message);
    }

    function emitProgress(percent, totalSize, speed, eta) {
      const progress = {
        percent,
        totalSize,
        speed,
        eta,
        filename: lastTitle,
        isPlaylist: playlist
      };

      if (playlist && playlistCount > 0) {
        progress.playlistIndex = playlistIndex;
        progress.playlistCount = playlistCount;
        // Bar tracks the whole playlist, not just the current item.
        progress.overallPercent =
          ((playlistIndex - 1) + percent / 100) / playlistCount * 100;
      }

      callbacks.onProgress(progress);
    }

    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n');

      for (const line of lines) {
        // Playlist position — "item" on current yt-dlp, "video" on older builds
        const itemMatch = line.match(/\[download\]\s+Downloading (?:item|video)\s+(\d+)\s+of\s+(\d+)/);
        if (itemMatch) {
          playlistIndex = parseInt(itemMatch[1], 10);
          playlistCount = parseInt(itemMatch[2], 10);
        }

        // Match destination filename. ExtractAudio must be included, otherwise
        // audio downloads keep the pre-conversion name (.webm instead of .mp3).
        const destMatch = line.match(/\[(?:download|Merger|ExtractAudio)\].*?Destination:\s*(.+)/);
        if (destMatch) {
          lastDestPath = destMatch[1].trim();
          lastTitle = path.basename(lastDestPath);
        }

        // Match merge line
        const mergeMatch = line.match(/\[Merger\]\s*Merging formats into "(.+)"/);
        if (mergeMatch) {
          lastDestPath = mergeMatch[1].trim();
          lastTitle = path.basename(lastDestPath);
        }

        // Match download progress
        const progressMatch = line.match(
          /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*\S+)\s+at\s+([\d.]+\s*\S+\/s|Unknown speed)\s+ETA\s+([\d:]+|Unknown)/
        );
        if (progressMatch) {
          emitProgress(
            parseFloat(progressMatch[1]),
            progressMatch[2].trim(),
            progressMatch[3].trim(),
            progressMatch[4].trim()
          );
        }

        // Alternative progress format (already downloaded)
        const altMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*\S+)/);
        if (!progressMatch && altMatch) {
          emitProgress(parseFloat(altMatch[1]), altMatch[2].trim(), '---', '---');
        }

        // 100% complete line
        if (line.includes('100%')) {
          emitProgress(100, '', '', '00:00');
        }

        // Already downloaded
        if (line.includes('has already been downloaded')) {
          lastTitle = line.match(/\[download\]\s*(.+?)\s*has already/)?.[1] || lastTitle;
        }
      }
    });

    childProcess.stderr.on('data', (data) => {
      const errOutput = data.toString();
      // Not all stderr is fatal — yt-dlp prints warnings there
      if (!errOutput.includes('ERROR')) return;

      const message = cleanError(errOutput);
      if (!message) return;
      // The same failure can arrive split across chunks
      if (!errors.includes(message)) errors.push(message);
      // A playlist keeps running past an error (--ignore-errors), so the
      // outcome is only known at close.
      if (!playlist) reportError(message);
    });

    childProcess.on('close', (code) => {
      childProcess = null;
      // code is null when killed (cancel)
      if (code === null) return;

      const targetPath = playlist
        ? (lastDestPath ? path.dirname(lastDestPath) : savePath)
        : (lastDestPath || path.join(savePath, lastTitle));

      const result = {
        filename: playlist ? path.basename(targetPath) : lastTitle,
        savePath: playlist ? targetPath : savePath,
        filePath: targetPath,
        type: type,
        quality: quality,
        isPlaylist: playlist
      };

      // With --ignore-errors yt-dlp still exits non-zero when any item failed,
      // so a partly downloaded playlist is judged on the item count instead.
      if (playlist && playlistCount > 0) {
        const succeeded = Math.max(0, playlistCount - errors.length);
        if (succeeded === 0) {
          reportError(errors.join('\n') || `Download failed with exit code ${code}`);
          return;
        }
        result.itemCount = succeeded;
        result.skippedCount = errors.length;
        // Why the skipped items were skipped — surfaced in history.
        result.errors = errors.slice();
        reportComplete(result);
        return;
      }

      if (code === 0) {
        reportComplete(result);
      } else {
        reportError(errors.join('\n') || `Download failed with exit code ${code}`);
      }
    });

    childProcess.on('error', (err) => {
      childProcess = null;
      reportError(`Failed to start download: ${err.message}`);
    });

    return childProcess;
  }

  function cancel() {
    if (childProcess) {
      childProcess.kill('SIGTERM');
      // Force kill after 3 seconds if still alive
      setTimeout(() => {
        if (childProcess) {
          try { childProcess.kill('SIGKILL'); } catch (e) { /* ignore */ }
        }
      }, 3000);
      childProcess = null;
    }
  }

  return { getInfo, download, cancel, getVersion, isPlaylistPageUrl, getPlaylistId };
}

module.exports = { createDownloader, isPlaylistPageUrl, getPlaylistId };
