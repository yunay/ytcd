const { spawn } = require('child_process');
const path = require('path');

function createDownloader(getBinPath) {
  let childProcess = null;

  function getYtdlpPath() {
    return getBinPath('yt-dlp.exe');
  }

  function getFfmpegPath() {
    return path.dirname(getBinPath('ffmpeg.exe'));
  }

  async function getInfo(url) {
    return new Promise((resolve, reject) => {
      const ytdlp = getYtdlpPath();
      const args = [
        '--dump-json',
        '--no-download',
        '--no-warnings',
        url
      ];

      const proc = spawn(ytdlp, args, {
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
          reject(new Error(stderr || `yt-dlp exited with code ${code}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);
          const formats = info.formats || [];

          // Extract available video resolutions
          const videoQualities = new Set();
          formats.forEach(f => {
            if (f.height && f.vcodec !== 'none') {
              videoQualities.add(f.height);
            }
          });

          const sortedQualities = [...videoQualities].sort((a, b) => b - a);

          resolve({
            title: info.title || 'Unknown Title',
            thumbnail: info.thumbnail || '',
            duration: info.duration || 0,
            uploader: info.uploader || 'Unknown',
            videoQualities: sortedQualities,
            id: info.id
          });
        } catch (e) {
          reject(new Error('Failed to parse video information'));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run yt-dlp: ${err.message}`));
      });
    });
  }

  function download(options, callbacks) {
    const { url, type, quality, savePath } = options;
    const ytdlp = getYtdlpPath();

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
        '-o', path.join(savePath, '%(title)s.%(ext)s'),
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
        '-o', path.join(savePath, '%(title)s.%(ext)s'),
        '--newline',
        '--no-warnings',
        url
      ];
    }

    // Add ffmpeg location
    args.push('--ffmpeg-location', getFfmpegPath());

    childProcess = spawn(ytdlp, args, {
      windowsHide: true,
      env: { ...process.env, PATH: getFfmpegPath() + ';' + process.env.PATH }
    });

    let lastTitle = '';

    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n');

      for (const line of lines) {
        // Match destination filename
        const destMatch = line.match(/\[(?:download|Merger)\].*?Destination:\s*(.+)/);
        if (destMatch) {
          lastTitle = path.basename(destMatch[1]).trim();
        }

        // Match merge line
        const mergeMatch = line.match(/\[Merger\]\s*Merging formats into "(.+)"/);
        if (mergeMatch) {
          lastTitle = path.basename(mergeMatch[1]).trim();
        }

        // Match download progress
        const progressMatch = line.match(
          /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*\S+)\s+at\s+([\d.]+\s*\S+\/s|Unknown speed)\s+ETA\s+([\d:]+|Unknown)/
        );
        if (progressMatch) {
          callbacks.onProgress({
            percent: parseFloat(progressMatch[1]),
            totalSize: progressMatch[2].trim(),
            speed: progressMatch[3].trim(),
            eta: progressMatch[4].trim(),
            filename: lastTitle
          });
        }

        // Alternative progress format (already downloaded)
        const altMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*\S+)/);
        if (!progressMatch && altMatch) {
          callbacks.onProgress({
            percent: parseFloat(altMatch[1]),
            totalSize: altMatch[2].trim(),
            speed: '---',
            eta: '---',
            filename: lastTitle
          });
        }

        // 100% complete line
        if (line.includes('100%')) {
          callbacks.onProgress({
            percent: 100,
            totalSize: '',
            speed: '',
            eta: '00:00',
            filename: lastTitle
          });
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
      if (errOutput.includes('ERROR')) {
        callbacks.onError(errOutput.trim());
      }
    });

    childProcess.on('close', (code) => {
      childProcess = null;
      if (code === 0) {
        callbacks.onComplete({
          filename: lastTitle,
          savePath: savePath,
          filePath: path.join(savePath, lastTitle),
          type: type,
          quality: quality
        });
      } else if (code !== null) {
        // code is null when killed (cancel)
        callbacks.onError(`Download failed with exit code ${code}`);
      }
    });

    childProcess.on('error', (err) => {
      childProcess = null;
      callbacks.onError(`Failed to start download: ${err.message}`);
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

  return { getInfo, download, cancel };
}

module.exports = { createDownloader };
