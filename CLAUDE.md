# CLAUDE.md

YTCD — Electron desktop app (Windows) for downloading YouTube videos/audio via a bundled `yt-dlp` + `ffmpeg`, with `deno` as yt-dlp's JavaScript runtime.

## Commands

```bash
npm install          # deps
npm run setup        # downloads bin/yt-dlp.exe + ffmpeg.exe + deno.exe (REQUIRED before first run)
npm run update-ytdlp # force-refresh just yt-dlp (fixes HTTP 403 from a stale build)
npm start            # electron . (dev)
npm run build:win    # clean dist/ + electron-builder --win (NSIS installer)
```

`src/assets/icon.ico` (window, installer) is generated from the app mark by `scripts/make-icon.ps1 -OutIco src/assets/icon.ico -OutPreview <png>`. It draws the same geometry as the inline SVG in the titlebar; change both together. Keep that script ASCII-only, like `find-lock.ps1`.

There is no bundler, transpiler, linter, or test suite. `npm start` runs the source files directly.

`bin/` is gitignored, so a fresh clone will fail at runtime with "Failed to run yt-dlp" until `npm run setup` has been run. `setup.js` keeps binaries that already exist; `--force` re-downloads and `--only=yt-dlp` / `--only=ffmpeg` / `--only=deno` narrows it. Because it skips what is present, re-running `npm run setup` in an older checkout just adds the missing `deno.exe`.

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

`getBinPath(name)` in main.js resolves `process.resourcesPath/bin/...` when packaged and `<repo>/bin/...` in dev. The downloader also prepends the ffmpeg dir to `PATH` on the spawned process and passes `--ffmpeg-location`, and hands yt-dlp `--js-runtimes deno:<getBinPath('deno.exe')>` (`getRuntimeArgs()`, omitted if the file is missing). Anything that spawns a bundled binary must go through `getBinPath` — never hardcode a path.

**yt-dlp has one extra layer**: if `<userData>/bin/yt-dlp.exe` exists it wins over the bundled copy. That is where the in-app **Settings → Downloader Engine → Update** button writes ([src/ytdlp-updater.js](src/ytdlp-updater.js)) — userData is writable without admin rights and survives an app update, which would otherwise restore the older bundled build. ffmpeg and deno are never overridden — which is also why deno is passed by explicit path: the userData yt-dlp has no deno beside it.

## Conventions

- **CSS**: four files loaded in order — `theme.css` (custom properties) → `main.css` (globals, layout, utilities) → `components.css` → `animations.css` (keyframes only). Always use the tokens from [src/styles/theme.css](src/styles/theme.css) (`--bg-card`, `--gradient-action`, `--accent-text`, `--error`, …); don't hardcode colors — that includes SVG fills, which take a class (`.logo-stop-a`, `.logo-glyph`). Dark theme only.
- **The accent is two tokens.** `--accent` (#003E92) is only ever a FILL under white content — the primary button, toggle tracks, the gradient start. On these dark surfaces it reaches ~1.5:1, so text, icons, links and the focus ring use `--accent-text` (#68A3F3, same hue, 4.5:1+ on cards). Putting `--accent` on text makes it disappear.
- **Gloss and motion utilities** live in main.css: `.gloss` (sheen + top edge via `::before` at `z-index: -1` in an isolated context, so text contrast is untouched), `.recess` (inset shadow for fields and tracks), `.enter` with `.d1`–`.d3` (staggered entrance; because a page goes from `display:none` to visible, this is also the page transition). Components that already draw their own `::before` gloss — `.btn-secondary`, `.btn-primary`, `.seg-btn.active`, `.chip`, `.nav-item.active` — must not also get `.gloss`. `prefers-reduced-motion` switches every animation and transition off; keep new motion inside that.
- **CSP** is set via `<meta>` in [src/index.html](src/index.html): `script-src 'self'`, `img-src 'self' https:`. No CDNs, no inline `<script>`, no `eval`. Inline `style` attributes are fine (`style-src` allows `unsafe-inline`). Thumbnails load from YouTube over https.
- **Icons** are inline SVG (24×24 viewBox, `stroke="currentColor"`, `fill="none"`) — either in the HTML or in template strings in renderer.js. No icon library.
- **innerHTML** is used to build history rows; any user/video-derived string must go through `escapeHtml`/`escapeAttr` (bottom of the History section in renderer.js).
- Section comments use the `// ── Name ─────` box style; keep it when adding sections.
- User feedback goes through `showToast(title, type, text?)` with `success | error | warning | info`; `text` is the optional second line.

## UI structure

- **Titlebar**: the app mark and `#titlebar-status`, which reads "Downloading N%" during a download; nothing else.
- **Rail**: `.nav-item[data-page]` buttons; `showPage()` toggles `.page.active` and sets `#main-content[data-page]`, which the update banner (`#update-banner`, shared by all pages) uses to match the page's column width.
- **Home is one card that changes state in place** — `showCard('empty' | 'loading' | 'ready' | 'downloading')` in renderer.js is the only thing that shows/hides `#home-empty`, `#media-card`, its controls, the summary, the progress block and the playlist choice. Route new Home states through it rather than toggling `.hidden` piecemeal. While downloading, the link field and Paste are locked (`setInputLocked`) and the card header switches to the playlist when "All N items" was chosen.
- **History** filters (`.chip[data-filter]`) and Today / Earlier groups are computed in the renderer from `historyCache`; nothing about them is stored. Entries record `skippedCount` for playlists; older entries fall back to counting lines in `error`.
- **Settings toggles** are real checkboxes (`role="switch"`); the On/Off text comes from CSS (`input:checked ~ .toggle-state`), so the renderer only stores the value. The downloader-engine row shows its busy and failed states through `.is-busy` / `.is-error` on `#setting-ytdlp`.

## Playlists

**The downloader does not guess.** `download()` takes an explicit `options.playlist` boolean; the URL is only consulted as a fallback (`isPlaylistPageUrl`). The renderer decides:

- `youtube.com/playlist?list=…` → always the whole list.
- `watch?v=…&list=…` → `getInfo()` probes the list too and returns `playlist: { title, count }` alongside the video. The renderer shows the **Only this one / All N items** choice (`#playlist-choice`, default *single*) and sends the answer.

URL helpers are duplicated in [src/downloader.js](src/downloader.js) and [src/renderer.js](src/renderer.js) (`isPlaylistPageUrl`, `getPlaylistId`/`hasPlaylistId`) — keep them in sync. `isValidYouTubeUrl` accepts the `www`, `m` and `music` subdomains; music.youtube.com links are ordinary watch URLs to yt-dlp.

Playlist mode changes four things: the output template (`<playlist title>/<index> - <title>.<ext>`), `--yes-playlist --ignore-errors`, progress carries `playlistIndex`/`playlistCount`/`overallPercent` (the bar shows overall, the badge shows the item), and the close handler judges success by item count rather than exit code — yt-dlp exits non-zero when *any* item failed, so a 19-of-20 run must not be reported as a failure.

`getInfo()` fires the video probe and the playlist probe concurrently; a failing playlist probe is swallowed so a normal video still resolves.

## Gotchas

- **`--encoding utf-8` is mandatory on every yt-dlp call** (`UTF8_ARGS` in [src/downloader.js](src/downloader.js)). Without it yt-dlp encodes stdout in the Windows ANSI codepage and any non-Latin title — Cyrillic, for one — arrives mangled. That corrupts both the info card and the parsed destination filename, so the history entry points at a file that does not exist and "Open file" silently does nothing. `PYTHONIOENCODING` and `PYTHONUTF8` do *not* fix it; the flag does.
- **yt-dlp needs a JavaScript runtime for YouTube** (its "EJS" challenge solver; the official `yt-dlp.exe` bundles the scripts, not the runtime). Without one, many videos — sometimes a whole playlist — fail with `This video is not available` even though they play in a browser, and `--no-warnings` hides the "no JS runtime" hint, so it looks like a content problem. Deno ≥ 2.3 is the supported runtime and the only one enabled by default; Electron's own Node (18 in Electron 28) is too old to stand in (yt-dlp wants Node ≥ 22). The fix is `bin/deno.exe` plus `getRuntimeArgs()`; take the `deno` release asset, not `denort`. To tell it apart from a genuinely unavailable video: `bin/yt-dlp.exe -F <url>` by hand works (yt-dlp also finds a deno beside itself), and adding `--no-js-runtimes` reproduces the failure behind a `No supported JavaScript runtime` warning.
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
- **An `<img>` with `src=""` renders as a broken image.** `setThumbnail('')` removes the attribute instead, and a thumbnail that fails to load falls back the same way. The loading skeleton is `.media-card.is-loading`, painted with `--bg-skeleton` → `--bg-skeleton-hi`; placeholders need two tokens with real contrast between them, or the sweep is invisible.
- **Windows-only** by design: `.exe` binary names, `taskkill`/PowerShell in [scripts/clean-dist.js](scripts/clean-dist.js), NSIS-only build target.
- **`bin/` reaches the package only through `extraResources`** (→ `resources/bin`, where `getBinPath` looks). `build.files` in package.json keeps it — and `docs/`, `scripts/`, `.claude/`, `.vscode/`, `CLAUDE.md` — out of `app.asar`; without that list every binary shipped twice (~400 MB of dead weight) along with local dev settings. A new top-level folder that is not needed at runtime belongs on that list. Check with `@electron/asar`'s `listPackage()` on `dist/win-unpacked/resources/app.asar`.
- `npm run build:win` kills running `electron.exe`/`YTCD.exe` before cleaning `dist/`. If the build fails on a locked `app.asar`, run `npm run find-lock` to see which process is holding it.
- **[scripts/find-lock.ps1](scripts/find-lock.ps1) must stay ASCII-only** — Windows PowerShell 5.1 reads a BOM-less script as ANSI and any non-ASCII character (an em dash in a comment is enough) breaks parsing.

## Docs

[docs/](docs/) is the user- and spec-facing documentation and is meant to stay current: `README.md` (overview/setup), `REQUIREMENTS.md` (functional spec + IPC table), `USER_GUIDE.md` (end-user instructions). When a feature or channel changes, update the matching doc in the same change.
