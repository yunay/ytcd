const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

// Kill any lingering Electron/YTCD processes
try {
  execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' });
} catch {}
try {
  execSync('taskkill /F /IM "YTCD.exe" 2>nul', { stdio: 'ignore' });
} catch {}

// Wait a moment for processes to release file handles
function sleep(ms) {
  execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${ms}"`, { stdio: 'ignore' });
}

// Try to remove dist directory with retries
if (fs.existsSync(distDir)) {
  console.log('Cleaning dist directory...');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      fs.rmSync(distDir, { recursive: true, force: true });
      console.log('dist directory cleaned.');
      break;
    } catch (err) {
      if (attempt < 3) {
        console.log(`Attempt ${attempt} failed, retrying in 2s... (${err.message})`);
        sleep(2000);
      } else {
        console.error(`WARNING: Could not fully clean dist directory: ${err.message}`);
        console.error('Close VS Code or any app that might have files open in dist/, then retry.');
        process.exit(1);
      }
    }
  }
} else {
  console.log('dist directory does not exist, nothing to clean.');
}
