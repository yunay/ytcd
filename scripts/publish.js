const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env file into process.env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      process.env[key] = value;
    }
  });
  console.log('.env loaded.');
} else {
  console.error('ERROR: .env file not found. Create one with GH_TOKEN=your_token');
  process.exit(1);
}

if (!process.env.GH_TOKEN) {
  console.error('ERROR: GH_TOKEN not set in .env file.');
  process.exit(1);
}

// Clean dist
require('./clean-dist.js');

// Run electron-builder
console.log('Building and publishing...');
execSync('electron-builder --win --publish always', {
  stdio: 'inherit',
  env: process.env
});
