# CMD — Cahara Music Downloader

A minimal Electron desktop app for downloading YouTube audio and playlists as high-quality MP3s, with first-class Winamp playlist support. Built for Windows with a terminal aesthetic.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-orange)
![Electron](https://img.shields.io/badge/electron-29-47848F)
![yt-dlp](https://img.shields.io/badge/powered%20by-yt--dlp-red)

---

## What it does

CMD is a GUI frontend for [yt-dlp](https://github.com/yt-dlp/yt-dlp). Paste a YouTube URL, pick a folder, click download. That's it.

- Downloads **YouTube audio as MP3** — single videos or full playlists
- Generates **Winamp-compatible playlist files** (`.m3u` + `.html`) for every playlist download
- Embeds **album art and metadata** into every file via FFmpeg
- Runs as a **portable `.exe`** — no installation needed

> **Note:** This tool downloads **audio only** — no video files. Spotify is not supported and won't be added.

---

## Prerequisites

CMD is a frontend. The heavy lifting is done by two external tools that must be on your system `PATH`:

| Tool | Install | Purpose |
|------|---------|---------|
| **yt-dlp** | `pip install yt-dlp` or [GitHub releases](https://github.com/yt-dlp/yt-dlp/releases) | Downloads audio from YouTube |
| **FFmpeg** | `winget install ffmpeg` or [ffmpeg.org](https://ffmpeg.org/download.html) | Converts to MP3, embeds thumbnails |

CMD will check for these on first launch and tell you if anything is missing.

---

## Download

Grab the latest `CaharaMD.exe` from [Releases](../../releases). Run it directly — no installer required.

---

## Build from source

Requires [Node.js](https://nodejs.org) v18+.

```bash
git clone https://github.com/YOUR_USERNAME/cmd-cahara-music-downloader.git
cd cmd-cahara-music-downloader
npm install

# Run in dev mode
npm start

# Build portable .exe  →  dist/
npm run build

# Build full installer  →  dist/
npm run build:installer
```

On Windows you can also double-click **`build.bat`**.

---

## Usage

1. Launch CMD
2. On first run, the dependency checker will verify yt-dlp and FFmpeg — install any missing tools, then click **PROCEED**
3. Set your **output directory** using the Browse button at the bottom of the window
4. Paste a YouTube video or playlist URL into the input field
5. Click **▶ INITIATE DOWNLOAD**
6. Watch the log panel for real-time progress, track names, and any errors
7. Click 📂 to open your output folder when done

### Playlist downloads

Each playlist gets its own named subfolder (`Output Dir / Playlist Name /`). Inside, alongside the MP3 files, you'll find:

- **`playlist.m3u`** — standard playlist file; works in Winamp, VLC, foobar2000, Windows Media Player
- **`playlist.html`** — drag this onto Winamp to import the full playlist automatically; also opens in any browser as a visual track listing

---

## Settings

Click **⚙** in the top bar:

- **Audio Format** — MP3, FLAC, AAC, or M4A
- **Audio Quality** — Best available (default), or fixed bitrate
- **YouTube Output Dir** — set a separate output folder just for YouTube downloads, overriding the global one

---

## FAQ

**Will you add Spotify support?**
No.

**Will you add video downloading?**
No. This tool is for audio. Use yt-dlp directly from the command line if you need video.

**Why does CMD need Python?**
yt-dlp is a Python package. If you installed yt-dlp via pip, Python is already there. If you used a standalone yt-dlp binary, Python is optional.

**The dependency check fails for yt-dlp/FFmpeg but I have them installed.**
Make sure both are on your system `PATH`. Open a terminal and run `yt-dlp --version` and `ffmpeg -version` to confirm.

---

## Stack

- [Electron 29](https://www.electronjs.org/) — desktop shell
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — YouTube audio extraction (MIT)
- [FFmpeg](https://ffmpeg.org/) — audio conversion and metadata embedding (LGPL)
- [electron-store](https://github.com/sindresorhus/electron-store) — persistent settings (MIT)
- [electron-builder](https://www.electron.build/) — packaging (MIT)

---

## Legal

This software is a GUI wrapper around yt-dlp. It does not host, serve, or distribute any content.

- Downloading YouTube content may violate [YouTube's Terms of Service](https://www.youtube.com/t/terms) (Section 5.1), which prohibits downloading without explicit permission from YouTube or the content owner.
- Downloading copyrighted material you do not own may infringe copyright law in your jurisdiction.
- The author provides no warranty and accepts no liability for how this software is used. You are responsible for ensuring your usage complies with applicable laws and platform terms.
- Intended for personal use: archiving your own uploads, downloading Creative Commons or public domain material, or content you have the right to access offline.

---

## License

[MIT](LICENSE) — do whatever you want with the source code.
