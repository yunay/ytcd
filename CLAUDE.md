# CLAUDE.md

YTCD — Electron desktop app (Windows) for downloading YouTube videos/audio via a bundled `yt-dlp` + `ffmpeg`.

## Commands

```bash
npm install          # deps
npm run setup        # downloads bin/yt-dlp.exe + bin/ffmpeg.exe (REQUIRED before first run)
npm run update-ytdlp # force-refresh just yt-dlp (fixes HTTP 403 from a stale build)
npm start            # electron . (dev)
npm run build:win    # clean dist/ + electron-builder --win (NSIS installer)
```

There is no bundler, transpiler, linter, or test suite. `npm start` runs the source files directly.

`bin/` is gitignored, so a fresh clone will fail at runtime with "Failed to run yt-dlp" until `npm run setup` has been run. `setup.js` keeps binaries that already exist; `--force` re-downloads and `--only=yt-dlp` / `--only=ffmpeg` narrows it.

**A stale yt-dlp is the single most likely cause of a download failing.** YouTube changes its player regularly and an older build answers with `HTTP Error 403: Forbidden` (often only on some videos, which makes it look content-specific). `npm run update-ytdlp` is the first thing to try in dev; end users have **Settings → Downloader Engine → Update**, which is why a YouTube-side breakage no longer needs a new YTCD release.

## Architecture

```
renderer.js  ──(window.api)──►  preload.js  ──(ipcRenderer)──►  main.js
   UI only                     contextBridge                  ├─ downloader.js  → spawns yt-dlp.exe
   no Node access              whitelist                      ├─ updater.js     → electron-updater
                                                              └─ settings/history JSON in userData
```

- **[src/main.js](src/main.js)** — window creation, all `ipcMain.handle` registrations, settings/history file I/O.
- **[src/downloader.js](src/downloader.js)** — factory `createDownloader(getBinPath)`; builds yt-dlp argv, spawns it, parses stdout for progress. Holds a single module-level `childProcess`, so **only one download can run at a time**.
- **[src/preload.js](src/preload.js)** — the only bridge; renderer has `nodeIntegration: false`, `contextIsolation: true`.
- **[src/renderer.js](src/renderer.js)** — one IIFE, vanilla DOM, `$`/`$$` helpers, no framework.
- **[src/updater.js](src/updater.js)** — `initUpdater(mainWindow)`; no-ops when `!app.isPackaged`.

### Adding an IPC channel

Four places must stay in sync, in this order:
1. `ipcMain.handle('domain:action', ...)` in [src/main.js](src/main.js)
2. a method on the `api` object in [src/preload.js](src/preload.js)
3. the caller in [src/renderer.js](src/renderer.js)
4. the channel table in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (section 4) — keep it accurate, it's the reference

Channel naming is `domain:action` (`download:start`, `settings:get`). Main→renderer pushes use `webContents.send`; the preload wrapper calls `removeAllListeners` first, so **each `onX` subscriber replaces the previous one** — don't register the same listener twice.

### Binary resolution

`getBinPath(name)` in main.js resolves `process.resourcesPath/bin/...` when packaged and `<repo>/bin/...` in dev. The downloader also prepends the ffmpeg dir to `PATH` on the spawned process and passes `--ffmpeg-location`. Anything that spawns a bundled binary must go through `getBinPath` — never hardcode a path.

**yt-dlp has one extra layer**: if `<userData>/bin/yt-dlp.exe` exists it wins over the bundled copy. That is where the in-app **Settings → Downloader Engine → Update** button writes ([src/ytdlp-updater.js](src/ytdlp-updater.js)) — userData is writable without admin rights and survives an app update, which would otherwise restore the older bundled build. ffmpeg is never overridden.

## Conventions

- **CSS**: four files loaded in order — `theme.css` (custom properties) → `main.css` (globals/layout) → `components.css` → `animations.css`. Always use the tokens from [src/styles/theme.css](src/styles/theme.css) (`--bg-card`, `--accent-gradient`, `--color-error`, …); don't hardcode colors. Dark theme only.
- **CSP** is set via `<meta>` in [src/index.html](src/index.html): `script-src 'self'`, `img-src 'self' https:`. No CDNs, no inline `<script>`, no `eval`. Inline `style` attributes are fine (`style-src` allows `unsafe-inline`). Thumbnails load from YouTube over https.
- **Icons** are inline SVG (24×24 viewBox, `stroke="currentColor"`, `fill="none"`) — either in the HTML or in template strings in renderer.js. No icon library.
- **innerHTML** is used to build history rows; any user/video-derived string must go through `escapeHtml`/`escapeAttr` ([src/renderer.js:425](src/renderer.js:425)).
- Section comments use the `// ── Name ─────` box style; keep it when adding sections.
- User feedback goes through `showToast(message, type)` with `success | error | warning | info`.

## Playlists

**The downloader does not guess.** `download()` takes an explicit `options.playlist` boolean; the URL is only consulted as a fallback (`isPlaylistPageUrl`). The renderer decides:

- `youtube.com/playlist?list=…` → always the whole list.
- `watch?v=…&list=…` → `getInfo()` probes the list too and returns `playlist: { title, count }` alongside the video. The renderer shows the **Only this one / All N items** choice (`#playlist-choice`, default *single*) and sends the answer.

URL helpers are duplicated in [src/downloader.js](src/downloader.js) and [src/renderer.js](src/renderer.js) (`isPlaylistPageUrl`, `getPlaylistId`/`hasPlaylistId`) — keep them in sync. `isValidYouTubeUrl` accepts the `www`, `m` and `music` subdomains; music.youtube.com links are ordinary watch URLs to yt-dlp.

Playlist mode changes four things: the output template (`<playlist title>/<index> - <title>.<ext>`), `--yes-playlist --ignore-errors`, progress carries `playlistIndex`/`playlistCount`/`overallPercent` (the bar shows overall, the badge shows the item), and the close handler judges success by item count rather than exit code — yt-dlp exits non-zero when *any* item failed, so a 19-of-20 run must not be reported as a failure.

`getInfo()` fires the video probe and the playlist probe concurrently; a failing playlist probe is swallowed so a normal video still resolves.

## Gotchas

- **`--encoding utf-8` is mandatory on every yt-dlp call** (`UTF8_ARGS` in [src/downloader.js](src/downloader.js)). Without it yt-dlp encodes stdout in the Windows ANSI codepage and any non-Latin title — Cyrillic, for one — arrives mangled. That corrupts both the info card and the parsed destination filename, so the history entry points at a file that does not exist and "Open file" silently does nothing. `PYTHONIOENCODING` and `PYTHONUTF8` do *not* fix it; the flag does.
- **Progress parsing is regex over yt-dlp stdout** ([src/downloader.js](src/downloader.js)). A yt-dlp output format change silently breaks the progress bar without failing the download. `--newline` is required for line-wise parsing. The destination regex must keep matching `ExtractAudio`, otherwise audio downloads record the pre-conversion `.webm` name and "Open file" in history breaks.
- **stderr is not fatal by itself** — the downloader only treats a line containing `ERROR` as one, because yt-dlp prints warnings to stderr too. In playlist mode those errors are collected, not raised, since the run continues.
- **There is no log file.** The yt-dlp error text is passed through `cleanError()` (strips ANSI, keeps `ERROR` lines) and stored on the history entry as `error`, which the History page renders as a collapsible panel — that entry is the *only* lasting record of a failure, so don't drop the field when touching `history:add` or `createHistoryItem`. The same field carries the skipped-item reasons of a partly downloaded playlist, styled `warning` instead of error.
- **One terminal event per download.** yt-dlp can report the same failure on stderr *and* via a non-zero exit; the `settled` flag in `download()` guarantees `onComplete`/`onError` fires exactly once. Drop it and history gets duplicate entries.
- **Cancel vs. failure**: on kill, the close code is `null` and the handler returns early. Preserve that check or cancelling will log a bogus error.
- **`initUpdater` is called after `createWindow()`** but `autoUpdater` events fire against the captured `mainWindow`; re-creating the window would leave the updater pointing at a dead reference.
- `update:install` is registered in main.js **unconditionally** and returns `{ success, error }`; `installUpdate()` in [src/updater.js](src/updater.js) answers with an explanation when no updater is running (dev builds, auto-update off) instead of leaving the channel unregistered.
- **Windows toasts need `app.setAppUserModelId('com.ytcd.app')`** — it must match `build.appId` in package.json or notifications silently never appear.
- Settings and history live in `app.getPath('userData')` (`%APPDATA%/YTCD/`), not in the repo — deleting the repo doesn't reset app state. History is capped at 100 entries.
- **`loadSettings()` merges over `defaultSettings()`**, so a new key is picked up by existing installs instead of arriving `undefined`. It also strips a trailing `p` from `defaultQuality` — older builds stored `'1080p'` while the `<option>` values are bare numbers, and **assigning a `<select>` a value with no matching option silently blanks it** (`selectedIndex` -1). Use `selectIfPresent()` in renderer.js rather than assigning `.value` directly.
- **An `<img>` with `src=""` renders as a broken image.** `setThumbnail('')` removes the attribute instead. The `.url-info.loading` skeleton uses `--bg-skeleton`/`--bg-skeleton-highlight`; don't build placeholders out of `--bg-input`/`--bg-card-hover`, which are the same value and produce a flat, invisible gradient.
- **Windows-only** by design: `.exe` binary names, `taskkill`/PowerShell in [scripts/clean-dist.js](scripts/clean-dist.js), NSIS-only build target.
- `npm run build:win` kills running `electron.exe`/`YTCD.exe` before cleaning `dist/`. If the build fails on a locked `app.asar`, run `npm run find-lock` to see which process is holding it.
- **[scripts/find-lock.ps1](scripts/find-lock.ps1) must stay ASCII-only** — Windows PowerShell 5.1 reads a BOM-less script as ANSI and any non-ASCII character (an em dash in a comment is enough) breaks parsing.

## Docs

[docs/](docs/) is the user- and spec-facing documentation and is meant to stay current: `README.md` (overview/setup), `REQUIREMENTS.md` (functional spec + IPC table), `USER_GUIDE.md` (end-user instructions). When a feature or channel changes, update the matching doc in the same change.
