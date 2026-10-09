# YTCD - User Guide

## Getting Started

After installing YTCD, launch it from your desktop shortcut or Start Menu. The app opens with the Home page where you can start downloading immediately.

## Downloading a Video

1. Copy a YouTube URL from your browser
2. Click **Paste** or press **Ctrl+V** — the link is pasted and a card with the video's thumbnail, title, channel and length appears under it
3. In the card, pick **Video** under Format
4. Choose your preferred quality (e.g., 1080p Full HD)
5. Check **Save to** at the bottom of the card — click **Change** to pick another folder
6. Click **Download** or press **Ctrl+D**

Progress takes over the same card: percentage, speed and time left, with **Cancel**
(or **Esc**) next to them. The top of the window also shows how far along it is,
so you can follow it while working in another tab of the app.

## Downloading Audio Only

1. Paste a YouTube URL as described above
2. Click **Audio** under Format in the card
3. Select audio quality (e.g., 320 kbps for highest quality)
4. Click **Download**

The audio will be saved as an MP3 file.

## Downloading a Song

YouTube Music links work exactly like normal ones — copy the address of the song
(`music.youtube.com/watch?v=...`), paste it, pick **Audio** and download.

If the song was opened from inside a playlist or album, the link also carries
the playlist. YTCD notices this and asks what you want:

- **Only this one** — just that song (this is the default)
- **All N items** — the whole playlist or album

## Downloading a Playlist

1. Open the playlist on YouTube and copy the URL from the address bar — it must
   look like `youtube.com/playlist?list=...`
2. Paste it into YTCD. The info card shows the playlist title, the number of
   videos and the total duration
3. Pick format and quality as usual — they apply to every video in the playlist
4. Click **Download**

Every item goes into its own folder named after the playlist, and files are
numbered in playlist order (`01 - First video.mp4`, `02 - Second video.mp4`, …).
The progress bar tracks the whole playlist and a badge shows which item is
running (`3 / 19`).

If a video in the playlist is private, blocked or otherwise unavailable, it is
skipped and the rest keep going. When the download ends you are told how many
items were saved and how many were skipped.

> You can also paste a `watch?v=...&list=...` link and pick **All N items** —
> the result is the same.

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

- On the Home page, click **Change** next to the save path in the card
- A folder picker dialog will open — navigate to your preferred folder and confirm
- The selected folder will be remembered for future downloads
- You can also set a permanent default in **Settings > Default Save Location**

## Download History

Navigate to the **History** page using the bar on the left to see all past downloads.
Entries are grouped into **Today** and **Earlier**, and the chips at the top —
**All**, **Video**, **Audio**, **Failed** — narrow the list; each shows how many
entries it holds.

- **Open file**: Click the external link icon to open the downloaded file. For a
  playlist entry this opens the playlist folder
- **Open folder**: Click the folder icon to open the containing directory
- **Clear history**: Click "Clear All" to remove all history entries

Playlist downloads appear as a single entry marked *Playlist* with the number of
items saved.

### Why did a download fail?

A failed entry is marked **Failed** and keeps the reason. Click the chevron (⌄)
on the right of the entry to expand **Error details** — the message comes
straight from yt-dlp, for example:

```
[youtube] Kj9mBpMbGrI: Sign in to confirm your age. This video may be
inappropriate for some users.
```

The text can be selected and copied, which is handy when reporting a problem.
Common causes are a private or removed video, an age or region restriction, or
no internet connection.

A playlist that finished but skipped some videos shows the same panel labelled
**Skipped items**, listing why each one was left out.

## Settings

Access **Settings** from the sidebar to configure:
- **Default Save Location** — Where downloads are saved by default
- **Default Video Quality** — Pre-selected quality in Video mode
- **Default Audio Quality** — Pre-selected bitrate in Audio mode
- **Default Format** — Start with Video or Audio mode
- **Auto-check for Updates** — Automatically check for new versions on startup
- **Desktop Notifications** — Show a Windows notification when a download
  finishes or fails. Clicking the notification reveals the file in Explorer
- **Start Minimized** — Open the app minimized to the taskbar. Takes effect the
  next time you start YTCD
- **Downloader Engine** — Shows the version of yt-dlp, the tool that does the
  actual downloading, with an **Update** button. Use it if downloads start
  failing with *HTTP Error 403*. The update is kept separately from the app, so
  it is not lost when YTCD itself updates

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

### "HTTP Error 403: Forbidden"
The downloader is out of date. YouTube changes its player every few weeks and
older builds stop working — often for only some videos, which is why it can
look like one particular song is broken.

Go to **Settings > Downloader Engine** and click **Update**. It fetches the
current yt-dlp release and the download works again — no need to wait for a new
version of YTCD.

If you are running from source you can also use `npm run update-ytdlp`.

### Download fails with error
- Open **History** and expand **Error details** on the failed entry — it tells
  you exactly what yt-dlp reported
- Verify the URL is a valid YouTube link
- Some videos may be private or age-restricted
- Refresh the downloader with `npm run update-ytdlp` — a stale yt-dlp is the most common cause
