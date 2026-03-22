'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const Store = require('electron-store');

const store = new Store();

let mainWindow;
let activeDownload = null;

// ─── Window ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0D0D0D',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0D0D0D',
      symbolColor: '#FF6A00',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Window controls ───────────────────────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ─── IPC: Config ───────────────────────────────────────────────────────────

ipcMain.handle('config-get', (_, key) => store.get(key));
ipcMain.handle('config-set', (_, key, val) => { store.set(key, val); return true; });

// ─── IPC: Directory picker ──────────────────────────────────────────────────

ipcMain.handle('pick-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'SELECT OUTPUT DIRECTORY',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('open-directory', async (_, dirPath) => {
  if (dirPath && fs.existsSync(dirPath)) {
    shell.openPath(dirPath);
    return true;
  }
  return false;
});

// ─── IPC: Dependency check ──────────────────────────────────────────────────

ipcMain.handle('check-dependencies', async () => {
  const results = {};
  results.ytdlp  = await checkCommand('yt-dlp',  ['--version']);
  results.ffmpeg = await checkCommand('ffmpeg',   ['-version']);
  results.python = await checkCommand('python3',  ['--version'])
    .catch(() => checkCommand('python', ['--version']));
  return results;
});

function checkCommand(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, version: null });
      } else {
        const out = (stdout || stderr || '').trim().split('\n')[0];
        resolve({ ok: true, version: out });
      }
    });
  });
}

// ─── IPC: URL detect ───────────────────────────────────────────────────────

ipcMain.handle('detect-url', (_, url) => {
  return detectUrl(url);
});

function detectUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();

  const patterns = [
    { re: /^https?:\/\/(www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/, type: 'youtube-video' },
    { re: /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]+)/,                     type: 'youtube-video' },
    { re: /^https?:\/\/(www\.)?youtube\.com\/playlist\?list=([A-Za-z0-9_-]+)/, type: 'youtube-playlist' },
  ];

  for (const p of patterns) {
    if (p.re.test(u)) return p.type;
  }
  return null;
}

// ─── IPC: Download ─────────────────────────────────────────────────────────

ipcMain.handle('start-download', async (event, { url, outputDir }) => {
  const send = (type, data) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('download-event', { type, ...data });
    }
  };

  const urlType = detectUrl(url);
  if (!urlType) {
    send('error', { message: 'Invalid or unsupported URL.' });
    return { ok: false };
  }

  if (!outputDir || !fs.existsSync(outputDir)) {
    send('error', { message: 'Output directory not set or does not exist.' });
    return { ok: false };
  }

  const safeOutput = fs.realpathSync(outputDir);

  send('info', { message: `Detected: ${urlType.toUpperCase().replace('-', ' ')}` });
  send('info', { message: `Output: ${safeOutput}` });

  try {
    await handleYtDlp(url, urlType, safeOutput, send);
    send('done', { message: 'Download complete.' });
    return { ok: true };
  } catch (err) {
    send('error', { message: err.message || 'Download failed.' });
    return { ok: false };
  }
});

ipcMain.on('cancel-download', () => {
  if (activeDownload) {
    activeDownload.kill();
    activeDownload = null;
  }
});

// ─── yt-dlp integration ─────────────────────────────────────────────────────

async function handleYtDlp(url, urlType, outputDir, send) {
  const isPlaylist = urlType === 'youtube-playlist';

  let destDir = outputDir;

  if (isPlaylist) {
    send('info', { message: 'Fetching playlist metadata...' });
    const title = await getYtPlaylistTitle(url);
    const folderName = sanitizeFilename(title || 'YouTube_Playlist');
    destDir = resolvePlaylistDir(outputDir, folderName);
    send('info', { message: `Playlist folder: ${folderName}` });
  }

  const outputTemplate = isPlaylist
    ? path.join(destDir, '%(playlist_index)02d - %(title)s.%(ext)s')
    : path.join(destDir, '%(title)s.%(ext)s');

  const args = [
    url,
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--embed-thumbnail',
    '--add-metadata',
    '--output', outputTemplate,
    '--no-playlist',
    ...(isPlaylist ? ['--yes-playlist'] : []),
    '--no-warnings',
    '--newline',
    // Strip non-standard characters from title before it's used as filename
    '--replace-in-metadata', 'title', '[^a-zA-Z0-9 \\-()\\[\\]]', '',
  ];

  send('info', { message: 'Starting yt-dlp...' });

  await new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeDownload = proc;

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.includes('[download]')) {
          const pct = trimmed.match(/(\d+\.\d+)%/);
          if (pct) {
            send('progress', { message: trimmed, percent: parseFloat(pct[1]) });
          } else {
            send('info', { message: trimmed });
          }
        } else if (trimmed.includes('[ExtractAudio]') || trimmed.includes('Destination')) {
          send('info', { message: trimmed });
        } else if (trimmed.includes('ERROR')) {
          send('warn', { message: `[FAIL] ${trimmed}` });
        } else {
          send('info', { message: trimmed });
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith('WARNING')) {
          send('warn', { message: t });
        }
      }
    });

    proc.on('close', (code) => {
      activeDownload = null;
      if (code === 0 || code === null) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });

    proc.on('error', () => {
      activeDownload = null;
      reject(new Error('yt-dlp not found. Install it via: pip install yt-dlp'));
    });
  });

  // Generate playlist files for YouTube playlists
  if (isPlaylist) {
    const files = fs.readdirSync(destDir)
      .filter(f => /\.(mp3|flac|m4a|aac)$/i.test(f))
      .sort();

    // Rename any files that still contain non-standard characters
    const renamedFiles = files.map(f => {
      const ext = path.extname(f);
      const base = f.slice(0, f.length - ext.length);
      const cleanBase = sanitizeFilename(base);
      if (cleanBase === base) return f;
      let cleanName = cleanBase + ext;
      // Avoid collisions
      let counter = 1;
      while (fs.existsSync(path.join(destDir, cleanName))) {
        cleanName = `${cleanBase} (${counter++})${ext}`;
      }
      fs.renameSync(path.join(destDir, f), path.join(destDir, cleanName));
      return cleanName;
    });

    const manifest = renamedFiles.map((f, i) => {
      const name = f.replace(/^\d+ - /, '').replace(/\.[^.]+$/, '');
      return { num: i + 1, title: name, artist: '', file: f };
    });

    const folderName = path.basename(destDir);
    generatePlaylistFiles(destDir, folderName, manifest, send);
  }
}

function getYtPlaylistTitle(url) {
  return new Promise((resolve) => {
    execFile('yt-dlp', ['--flat-playlist', '--print', 'playlist_title', '--playlist-items', '1', url], { timeout: 20000 }, (err, stdout) => {
      if (err || !stdout.trim()) resolve('YouTube_Playlist');
      else resolve(stdout.trim().split('\n')[0]);
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9 \-()\[\]]/g, '')  // keep only letters, numbers, spaces, dashes, parens, brackets
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
    || 'track';  // fallback if everything was stripped
}

function resolvePlaylistDir(outputDir, folderName) {
  let dirPath = path.join(outputDir, folderName);

  const resolved = path.resolve(dirPath);
  if (!resolved.startsWith(path.resolve(outputDir))) {
    dirPath = path.join(outputDir, 'Playlist');
  }

  if (fs.existsSync(dirPath)) {
    const ts = new Date().toISOString().replace(/[-T:]/g, '').slice(0, 14);
    dirPath = `${dirPath}_${ts}`;
  }

  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function generatePlaylistFiles(dir, name, manifest, send) {
  if (!manifest.length) return;

  // ── M3U ─────────────────────────────────────────────────────────────────
  // Standard Winamp / media player playlist format
  const m3u = '#EXTM3U\n' + manifest.map(t =>
    `#EXTINF:-1,${t.artist ? t.artist + ' - ' : ''}${t.title}\n${t.file}`
  ).join('\n');
  fs.writeFileSync(path.join(dir, 'playlist.m3u'), m3u, 'utf8');

  // ── HTML (Winamp-compatible + visual) ────────────────────────────────────
  // Winamp reads <a href="..."> links pointing to audio files from HTML.
  // Drop this file into Winamp (File > Play Location, or drag onto Winamp)
  // and it will build the playlist automatically from the anchor tags.
  // It also renders as a clean visual track listing in any browser.
  const items = manifest.map(t =>
    `    <li>
      <a href="${escHtml(t.file)}" class="track-link">
        <span class="track-num">${String(t.num).padStart(2, '0')}</span>
        <span class="title">${escHtml(t.title)}</span>${t.artist ? `
        <span class="artist">${escHtml(t.artist)}</span>` : ''}
      </a>
    </li>`
  ).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escHtml(name)}</title>
<style>
  :root { --bg: #0D0D0D; --surface: #1A1A1A; --orange: #FF6A00; --text: #E0E0E0; --muted: #888; --border: #2E2E2E; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Courier New', monospace; padding: 2rem; }
  h1 { color: var(--orange); font-size: 1.4rem; letter-spacing: .12em; margin-bottom: .4rem; border-bottom: 2px solid var(--orange); padding-bottom: .5rem; }
  .subtitle { font-size: .75rem; color: var(--muted); margin-bottom: 1.5rem; }
  ol { list-style: none; }
  li { border-bottom: 1px solid var(--border); }
  li:hover { background: var(--surface); }
  a.track-link {
    display: flex; align-items: baseline; gap: 1rem;
    padding: .5rem .75rem;
    color: inherit; text-decoration: none; width: 100%;
  }
  a.track-link:hover { color: var(--orange); }
  .track-num { color: var(--orange); min-width: 2rem; font-size: .85rem; flex-shrink: 0; }
  .title { flex: 1; }
  .artist { color: var(--muted); font-size: .85rem; }
</style>
</head>
<body>
<h1>${escHtml(name)}</h1>
<p class="subtitle">${manifest.length} track${manifest.length !== 1 ? 's' : ''} — open in Winamp to load playlist</p>
<ol>
${items}
</ol>
</body>
</html>`;

  fs.writeFileSync(path.join(dir, 'playlist.html'), html, 'utf8');
  send('ok', { message: `[OK] Generated playlist.html (Winamp-compatible) + playlist.m3u` });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
