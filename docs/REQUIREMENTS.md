# YTCD - Requirements Specification

## 1. Functional Requirements

### 1.1 URL Input
- Accept YouTube video URLs (`youtube.com/watch?v=`, `youtu.be/`)
- Accept YouTube Shorts URLs (`youtube.com/shorts/`)
- Accept YouTube Playlist URLs (`youtube.com/playlist?list=`)
- Validate URL format before processing
- Paste from clipboard button
- Auto-fetch video information (title, thumbnail, uploader, duration) when a valid URL is entered
- Playlist URLs show the playlist title, video count and total duration instead

### 1.2 Content Type Selection
- Toggle between **Video** and **Audio** download modes
- Video mode: downloads video + audio merged as MP4
- Audio mode: extracts and converts audio to MP3

### 1.2.1 Playlists
- Only a `youtube.com/playlist?list=...` URL downloads a whole playlist. A
  `watch?v=...&list=...` URL downloads just that one video.
- Playlist items are saved to `<save location>/<playlist title>/` and named
  `<index> - <title>.<ext>`
- The selected quality/format applies to every item
- A blocked, private or otherwise failing item is skipped and the rest continue;
  the number of skipped items is reported when the download finishes

### 1.3 Quality Selection
**Video qualities:**
| Option           | Resolution |
|------------------|------------|
| 2160p (4K)       | 3840x2160  |
| 1440p (2K)       | 2560x1440  |
| 1080p (Full HD)  | 1920x1080  |
| 720p (HD)        | 1280x720   |
| 480p             | 854x480    |
| 360p             | 640x360    |

**Audio qualities:**
| Option       | Bitrate  |
|--------------|----------|
| Best Quality | Variable |
| 320 kbps     | 320k     |
| 256 kbps     | 256k     |
| 192 kbps     | 192k     |
| 128 kbps     | 128k     |

### 1.4 Save Location
- File dialog to pick output folder
- Display current save path in the UI
- Remember last used folder across sessions
- Default to user's Downloads folder

### 1.5 Download Progress
- Real-time progress bar with percentage
- Download speed display
- ETA (estimated time remaining)
- Current filename display
- For playlists: current item badge (`3 / 12`); the bar tracks the whole playlist
- Cancel button to abort download

### 1.6 Download History
- List of all completed and failed downloads
- Each entry shows: title, date, quality, type, status
- Playlist entries are marked as such and show the item count
- A failed entry stores the yt-dlp error text and exposes it through a
  collapsible **Error details** panel; a playlist that finished with skipped
  items shows the same panel as **Skipped items**
- Open downloaded file directly (playlist entries open the playlist folder)
- Open containing folder
- Clear all history

### 1.7 Settings
- Default save location
- Default video quality
- Default format (video/audio)
- Auto-update toggle
- Desktop notifications toggle — a Windows toast on download completion or
  failure; clicking it reveals the file in Explorer
- Start minimized toggle — applies on the next app start

### 1.8 Auto-Update
- Check for updates on app startup (configurable)
- Display update banner when new version is available
- Download and install update on user confirmation

## 2. Non-Functional Requirements

### 2.1 Platform Support
- Windows 10 (1903+)
- Windows 11

### 2.2 Performance
- App startup: under 3 seconds
- URL validation: instant
- Video info fetch: under 5 seconds

### 2.3 Installation
- NSIS installer with custom install directory option
- Desktop shortcut creation
- Start Menu shortcut creation
- Clean uninstall via Windows Add/Remove Programs
- Installed size: under 200MB (including yt-dlp and ffmpeg)

### 2.4 Security
- Context isolation enabled in Electron
- Node integration disabled in renderer
- Secure IPC via preload script with contextBridge
- Content Security Policy headers

## 3. Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Electron App                       │
│                                                      │
│  ┌──────────────┐    IPC     ┌────────────────────┐  │
│  │   Renderer    │◄─────────►│   Main Process     │  │
│  │  (index.html  │  preload  │                    │  │
│  │   renderer.js)│  bridge   │  ├─ downloader.js  │  │
│  │               │           │  │  (yt-dlp spawn) │  │
│  │  UI Logic     │           │  ├─ updater.js     │  │
│  │  DOM Updates  │           │  │  (auto-update)  │  │
│  │  User Events  │           │  ├─ settings I/O   │  │
│  └──────────────┘           │  └─ history I/O    │  │
│                              └────────────────────┘  │
│                                       │              │
│                              ┌────────▼───────────┐  │
│                              │  External Binaries  │  │
│                              │  yt-dlp.exe         │  │
│                              │  ffmpeg.exe         │  │
│                              └────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## 4. IPC Channel Reference

| Channel              | Direction       | Purpose                            |
|----------------------|-----------------|------------------------------------|
| `titlebar:minimize`  | Renderer → Main | Minimize window                    |
| `titlebar:maximize`  | Renderer → Main | Toggle maximize                    |
| `titlebar:close`     | Renderer → Main | Close window                       |
| `dialog:open-folder` | Renderer → Main | Open folder picker dialog          |
| `download:start`     | Renderer → Main | Start a download                   |
| `download:cancel`    | Renderer → Main | Cancel current download            |
| `download:get-info`  | Renderer → Main | Fetch video metadata               |
| `download:progress`  | Main → Renderer | Real-time progress updates         |
| `download:complete`  | Main → Renderer | Download finished successfully     |
| `download:error`     | Main → Renderer | Download failed                    |
| `settings:get`       | Renderer → Main | Load settings                      |
| `settings:set`       | Renderer → Main | Save settings                      |
| `history:get`        | Renderer → Main | Load download history              |
| `history:add`        | Renderer → Main | Add entry to history               |
| `history:clear`      | Renderer → Main | Clear all history                  |
| `clipboard:read`     | Renderer → Main | Read clipboard text                |
| `shell:open-path`    | Renderer → Main | Open file/folder in explorer       |
| `app:get-version`    | Renderer → Main | Get app version                    |
| `update:available`   | Main → Renderer | New update available notification  |
| `update:downloaded`  | Main → Renderer | Update downloaded, ready to install |
| `update:install`     | Renderer → Main | Install update and restart         |

`update:install` is registered unconditionally and answers with
`{ success, error }`. In development, or when auto-update is switched off, it
returns `success: false` with an explanation rather than failing the call.
