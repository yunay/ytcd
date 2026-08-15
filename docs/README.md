# YTCD - YouTube Content Downloader

A modern desktop application for downloading videos and audio from YouTube with an intuitive dark-themed interface.

## Features

- **Video & Audio Downloads** — Download YouTube content as MP4 video or MP3 audio
- **Playlists** — Download a whole playlist into its own numbered folder
- **Quality Selection** — Choose from available resolutions (up to 4K) or audio bitrates
- **Custom Save Location** — Pick where to save your downloads with a folder browser
- **Download Progress** — Real-time progress bar with speed and ETA display
- **Download History** — Track all your past downloads with quick access to files
- **Desktop Notifications** — Windows toast when a download finishes or fails
- **Auto-Updates** — The app checks for updates and installs them seamlessly
- **Keyboard Shortcuts** — Ctrl+V to paste, Ctrl+D to download, Escape to cancel
- **Modern UI** — Clean dark theme with smooth animations

## Installation (End Users)

1. Download the latest installer from the [Releases](https://github.com/yunay/ytcd/releases) page
2. Run `YTCD-Setup-x.x.x.exe`
3. Follow the installation wizard
4. Launch YTCD from your desktop or Start Menu

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later
- Windows 10/11

### Getting Started

```bash
# Clone the repository
git clone https://github.com/yunay/ytcd.git
cd ytcd

# Install dependencies
npm install

# Download yt-dlp and ffmpeg binaries
npm run setup

# Start the app in development mode
npm start
```

### Building the Installer

```bash
# Build Windows NSIS installer
npm run build:win
```

The installer will be created in the `dist/` folder.

## Project Structure

```
ytcd/
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Secure IPC bridge
│   ├── renderer.js      # UI logic
│   ├── downloader.js    # yt-dlp wrapper module
│   ├── updater.js       # Auto-update module
│   ├── index.html       # Application UI
│   ├── styles/
│   │   ├── theme.css      # CSS custom properties
│   │   ├── main.css       # Global styles
│   │   ├── components.css # Component styles
│   │   └── animations.css # Keyframe animations
│   └── assets/
│       └── icon.ico       # App icon
├── scripts/
│   ├── setup.js         # Downloads yt-dlp & ffmpeg
│   ├── clean-dist.js    # Clears dist/ before a build
│   └── find-lock.ps1    # npm run find-lock — who is locking dist/?
├── bin/                  # yt-dlp & ffmpeg binaries (gitignored)
├── docs/
│   ├── README.md
│   ├── REQUIREMENTS.md
│   └── USER_GUIDE.md
├── package.json
└── .gitignore
```

## Tech Stack

| Component     | Technology                     |
|---------------|--------------------------------|
| Desktop Shell | Electron 28                    |
| UI            | Vanilla HTML/CSS/JS            |
| Downloader    | yt-dlp (bundled binary)        |
| Audio Convert | ffmpeg (bundled binary)        |
| Packaging     | electron-builder (NSIS)        |
| Auto-Update   | electron-updater               |

## License

MIT
