# YTCD - User Guide

## Getting Started

After installing YTCD, launch it from your desktop shortcut or Start Menu. The app opens with the Home page where you can start downloading immediately.

## Downloading a Video

1. Copy a YouTube URL from your browser
2. Click the **Paste** button (clipboard icon) or press **Ctrl+V** — the URL will be pasted and video info will load automatically
3. Select **Video** in the Format section (selected by default)
4. Choose your preferred quality from the dropdown (e.g., 1080p Full HD)
5. Check the **Save to** location — click the folder icon to change it
6. Click the **Download** button

The progress bar will show real-time download progress including speed and estimated time.

## Downloading Audio Only

1. Paste a YouTube URL as described above
2. Click **Audio** in the Format section
3. Select audio quality (e.g., 320 kbps for highest quality)
4. Click **Download**

The audio will be saved as an MP3 file.

## Choosing Quality

### Video Quality Options
| Quality | Resolution | Best For |
|---------|-----------|----------|
| 2160p (4K) | 3840x2160 | Large displays, archiving |
| 1440p (2K) | 2560x1440 | High-quality viewing |
| 1080p (Full HD) | 1920x1080 | Standard high quality |
| 720p (HD) | 1280x720 | Balanced size/quality |
| 480p | 854x480 | Smaller file size |
| 360p | 640x360 | Minimal storage use |

### Audio Quality Options
| Quality | Best For |
|---------|----------|
| Best Quality | Maximum fidelity |
| 320 kbps | High quality music |
| 256 kbps | Good quality |
| 192 kbps | Standard quality |
| 128 kbps | Smaller file size |

## Changing the Save Location

- On the Home page, click the **folder icon** next to the save path
- A folder picker dialog will open — navigate to your preferred folder and confirm
- The selected folder will be remembered for future downloads
- You can also set a permanent default in **Settings > Default Save Location**

## Download History

Navigate to the **History** page using the sidebar to see all past downloads:
- **Open file**: Click the external link icon to open the downloaded file
- **Open folder**: Click the folder icon to open the containing directory
- **Clear history**: Click "Clear All" to remove all history entries

## Settings

Access **Settings** from the sidebar to configure:
- **Default Save Location** — Where downloads are saved by default
- **Default Video Quality** — Pre-selected quality when the app opens
- **Default Format** — Start with Video or Audio mode
- **Auto-check for Updates** — Automatically check for new versions on startup
- **Desktop Notifications** — Show system notification when a download completes

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+V | Paste URL from clipboard |
| Ctrl+D | Start download |
| Escape | Cancel current download |

## Auto-Updates

When a new version is available, a banner appears at the top of the app. Click **Update Now** to download and install the update. The app will restart with the new version.

## Troubleshooting

### "Failed to run yt-dlp" error
Run `npm run setup` from the project folder to re-download the required binaries (yt-dlp and ffmpeg).

### Download stuck at 0%
- Check your internet connection
- The video may be restricted in your region
- Try a different quality setting

### No audio in downloaded video
This usually means ffmpeg is missing. Run `npm run setup` to download it.

### Download fails with error
- Verify the URL is a valid YouTube link
- Some videos may be private or age-restricted
- Try updating yt-dlp by deleting `bin/yt-dlp.exe` and running `npm run setup`
