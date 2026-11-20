// ═══════════════════════════════════════════════════════════════════
// YTCD Setup Script — Downloads yt-dlp, ffmpeg and deno binaries
// Run with: npm run setup
//
// Existing binaries are kept. Pass --force to re-download everything, or
// --only=yt-dlp / --only=ffmpeg / --only=deno to refresh just one. YouTube
// regularly breaks older yt-dlp builds (HTTP 403), so `npm run update-ytdlp`
// exists for that.
//
// Deno is the JavaScript runtime yt-dlp uses to solve YouTube's player
// challenges. Without one, many videos fail as "unavailable" even though
// they play fine in a browser.
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');

const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;

function wanted(name) {
  return !ONLY || ONLY === name;
}

function ensureBinDir() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url}`);

    const makeRequest = (requestUrl) => {
      const client = requestUrl.startsWith('https') ? https : http;
      client.get(requestUrl, { headers: { 'User-Agent': 'YTCD-Setup' } }, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`  Redirecting to: ${res.headers.location}`);
          makeRequest(res.headers.location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${requestUrl}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;

        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes) {
            const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r  Progress: ${pct}% (${(downloadedBytes / 1048576).toFixed(1)} MB)`);
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('  Done!');
          resolve();
        });
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl) => {
      https.get(requestUrl, { headers: { 'User-Agent': 'YTCD-Setup' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          makeRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${requestUrl}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function extractZip(zipPath, extractTo) {
  console.log(`  Extracting ${path.basename(zipPath)}...`);
  // Use PowerShell to extract on Windows
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractTo}' -Force"`,
    { stdio: 'inherit' }
  );
}

async function setupYtdlp() {
  const dest = path.join(BIN_DIR, 'yt-dlp.exe');
  if (fs.existsSync(dest)) {
    if (!FORCE) {
      console.log('[yt-dlp] Already exists, skipping. (npm run update-ytdlp to refresh)');
      return;
    }
    console.log('[yt-dlp] Replacing existing binary...');
    fs.rmSync(dest, { force: true });
  }

  console.log('[yt-dlp] Downloading latest release...');
  await download(
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    dest
  );
  console.log('[yt-dlp] Installed successfully.');
}

async function setupFfmpeg() {
  const dest = path.join(BIN_DIR, 'ffmpeg.exe');
  if (fs.existsSync(dest)) {
    if (!FORCE) {
      console.log('[ffmpeg] Already exists, skipping.');
      return;
    }
    console.log('[ffmpeg] Replacing existing binary...');
    fs.rmSync(dest, { force: true });
  }

  console.log('[ffmpeg] Downloading latest build...');
  const zipDest = path.join(BIN_DIR, 'ffmpeg.zip');
  const extractDir = path.join(BIN_DIR, '_ffmpeg_temp');

  await download(
    'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    zipDest
  );

  extractZip(zipDest, extractDir);

  // Find ffmpeg.exe and ffprobe.exe in the extracted folder
  const ffmpegDir = fs.readdirSync(extractDir).find(d =>
    fs.statSync(path.join(extractDir, d)).isDirectory()
  );

  if (ffmpegDir) {
    const binSrc = path.join(extractDir, ffmpegDir, 'bin');
    for (const file of ['ffmpeg.exe', 'ffprobe.exe']) {
      const src = path.join(binSrc, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(BIN_DIR, file));
        console.log(`  Copied ${file}`);
      }
    }
  }

  // Cleanup temp files
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.unlinkSync(zipDest);
  console.log('[ffmpeg] Installed successfully.');
}

async function setupDeno() {
  const dest = path.join(BIN_DIR, 'deno.exe');
  if (fs.existsSync(dest)) {
    if (!FORCE) {
      console.log('[deno] Already exists, skipping.');
      return;
    }
    console.log('[deno] Replacing existing binary...');
    fs.rmSync(dest, { force: true });
  }

  // The official deno build, not "denort" (the slimmer runtime for compiled
  // apps cannot run the scripts yt-dlp hands it).
  const base = 'https://github.com/denoland/deno/releases/latest/download';
  const asset = 'deno-x86_64-pc-windows-msvc.zip';
  const zipDest = path.join(BIN_DIR, asset);
  const extractDir = path.join(BIN_DIR, '_deno_temp');

  console.log('[deno] Downloading latest release...');
  // Published as PowerShell Get-FileHash output ("Hash      : ABC..."), so
  // take the first 64-hex token rather than assume "<hash>  <file>".
  const sums = await fetchText(`${base}/${asset}.sha256sum`);
  const match = sums.match(/\b[0-9a-f]{64}\b/i);
  if (!match) throw new Error('Could not read the published checksum for deno');

  await download(`${base}/${asset}`, zipDest);

  if (sha256File(zipDest) !== match[0].toLowerCase()) {
    fs.rmSync(zipDest, { force: true });
    throw new Error('deno checksum mismatch, the download was not installed');
  }

  extractZip(zipDest, extractDir);
  fs.copyFileSync(path.join(extractDir, 'deno.exe'), dest);

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.unlinkSync(zipDest);
  console.log('[deno] Installed successfully.');
}

async function main() {
  console.log('========================================');
  console.log(' YTCD Setup - Binary Dependencies');
  console.log('========================================\n');

  ensureBinDir();

  try {
    if (wanted('yt-dlp')) await setupYtdlp();
    console.log('');
    if (wanted('ffmpeg')) await setupFfmpeg();
    console.log('');
    if (wanted('deno')) await setupDeno();
  } catch (err) {
    console.error(`\nSetup error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n========================================');
  console.log(' Setup complete! Run: npm start');
  console.log('========================================');
}

main();
