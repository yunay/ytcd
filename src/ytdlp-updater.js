// ═══════════════════════════════════════════════════════════════════
// yt-dlp binary updater
//
// YouTube breaks older yt-dlp builds every few weeks (HTTP 403), and the
// binary is bundled inside the installed app — so without this the only fix
// is a whole new YTCD release. Downloads the current release straight from
// the yt-dlp project and verifies it against the published checksum before
// putting it in place.
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const BINARY_NAME = 'yt-dlp.exe';
const CHECKSUM_NAME = 'SHA2-256SUMS';
const MAX_REDIRECTS = 5;

function fetchBuffer(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'YTCD' } }, (res) => {
      // GitHub release assets always redirect to a CDN host
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        fetchBuffer(res.headers.location, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// The SUMS file is "<sha256>  <filename>" per line.
function findChecksum(sumsText, filename) {
  for (const line of sumsText.split('\n')) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === filename && /^[0-9a-f]{64}$/i.test(hash || '')) {
      return hash.toLowerCase();
    }
  }
  return null;
}

// Writes next to the target and renames, so a failed download can never leave
// a half-written binary in place.
function installBinary(buffer, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.new`;
  fs.writeFileSync(tempPath, buffer);

  try {
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    // Windows refuses to replace a file that is in use
    try {
      fs.rmSync(targetPath, { force: true });
      fs.renameSync(tempPath, targetPath);
    } catch (retryErr) {
      fs.rmSync(tempPath, { force: true });
      throw new Error(
        `Could not replace ${path.basename(targetPath)}: ${retryErr.message}. ` +
        'Close any running download and try again.'
      );
    }
  }
}

async function updateYtdlp(targetPath) {
  const sums = await fetchBuffer(`${RELEASE_BASE}/${CHECKSUM_NAME}`);
  const expected = findChecksum(sums.toString('utf8'), BINARY_NAME);
  if (!expected) {
    throw new Error('Could not read the published checksum for yt-dlp.exe');
  }

  const binary = await fetchBuffer(`${RELEASE_BASE}/${BINARY_NAME}`);
  const actual = crypto.createHash('sha256').update(binary).digest('hex');
  if (actual !== expected) {
    // Never install something that does not match what the project published
    throw new Error('Checksum mismatch — the download was not installed');
  }

  installBinary(binary, targetPath);
  return { bytes: binary.length };
}

module.exports = { updateYtdlp };
