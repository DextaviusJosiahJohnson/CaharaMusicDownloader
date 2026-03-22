'use strict';

/* ─── State ─────────────────────────────────────────────────────────────── */
let outputDir     = null;
let ytOutputDir   = null;
let isDownloading = false;
let logCount      = 0;

/* ─── DOM refs ───────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

/* ─── Init ──────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {

  // ── Wire up every button via addEventListener ────────────────────────────

  // Window controls
  $('btn-minimize').addEventListener('click', () => window.cmd.minimize());
  $('btn-maximize').addEventListener('click', () => window.cmd.maximize());
  $('btn-close').addEventListener('click',    () => window.cmd.close());

  // Top-bar actions
  $('btn-settings').addEventListener('click', toggleSettings);
  $('btn-depcheck').addEventListener('click', showDepCheck);

  // URL input — detect on input AND paste
  $('url-input').addEventListener('input', onUrlChange);
  $('url-input').addEventListener('paste', () => setTimeout(onUrlChange, 0)); // paste fires before value updates

  // Download / cancel
  $('download-btn').addEventListener('click', initiateDownload);
  $('cancel-btn').addEventListener('click', cancelDownload);

  // Output dir strip
  $('btn-browse-dir').addEventListener('click', pickOutputDir);
  $('btn-open-dir').addEventListener('click', openOutputDir);

  // Log controls
  $('btn-clear-log').addEventListener('click', clearLog);

  // Dep check proceed
  $('dep-proceed').addEventListener('click', () => {
    $('dep-overlay').classList.add('hidden');
    log('info', 'CMD online. Paste a Spotify or YouTube URL to begin.');
  });

  // Settings drawer
  $('settings-close-btn').addEventListener('click', toggleSettings);
  $('settings-overlay').addEventListener('click', (e) => {
    // Close if clicking the dark backdrop (not the drawer itself)
    if (!$('settings-drawer').contains(e.target)) toggleSettings();
  });

  // Settings selects
  $('setting-format').addEventListener('change', (e) => saveSetting('format', e.target.value));
  $('setting-quality').addEventListener('change', (e) => saveSetting('quality', e.target.value));

  // Settings dir buttons
  $('btn-pick-yt-dir').addEventListener('click', pickYtDir);
  $('btn-clear-yt-dir').addEventListener('click', clearYtDir);

  // ── Subscribe to download events from main process ───────────────────────
  window.cmd.onDownloadEvent(handleDownloadEvent);

  // ── Load persisted config ────────────────────────────────────────────────
  outputDir    = await window.cmd.configGet('outputDir')   || null;
  ytOutputDir  = await window.cmd.configGet('ytOutputDir') || null;

  const format  = await window.cmd.configGet('format')  || 'mp3';
  const quality = await window.cmd.configGet('quality') || '0';

  updateDirDisplay();
  setSelectValue('setting-format', format);
  setSelectValue('setting-quality', quality);
  refreshSettingsDirDisplay('setting-yt-dir', ytOutputDir, 'Same as global');

  // ── First-run dep check ──────────────────────────────────────────────────
  const depShown = await window.cmd.configGet('depCheckShown');
  if (!depShown) {
    await runDepCheck();
    await window.cmd.configSet('depCheckShown', true);
  } else {
    log('info', 'CMD online. Paste a Spotify or YouTube URL to begin.');
  }
});

/* ─── URL Detection ─────────────────────────────────────────────────────── */
const BADGE_LABELS = {
  'youtube-video':    'YOUTUBE AUDIO',
  'youtube-playlist': 'YOUTUBE PLAYLIST',
};

async function onUrlChange() {
  const val = $('url-input').value.trim();
  const badge = $('url-badge');

  if (!val) {
    badge.classList.add('hidden');
    return;
  }

  const type = await window.cmd.detectUrl(val);
  badge.classList.remove('hidden', 'spotify-track', 'spotify-playlist', 'youtube-video', 'youtube-playlist', 'invalid');

  if (type) {
    badge.textContent = BADGE_LABELS[type] || type.toUpperCase().replace('-', ' ');
    badge.classList.add(type);
  } else {
    badge.textContent = 'INVALID URL — NOT SUPPORTED';
    badge.classList.add('invalid');
  }
}

/* ─── Download ───────────────────────────────────────────────────────────── */
async function initiateDownload() {
  if (isDownloading) return;

  const url = $('url-input').value.trim();
  if (!url) { log('err', 'No URL entered.'); return; }

  const urlType = await window.cmd.detectUrl(url);
  if (!urlType) {
    log('err', 'Unsupported or invalid URL. Only Spotify and YouTube links are accepted.');
    return;
  }

  // Resolve effective output dir (global or yt-specific override)
  let effectiveDir = outputDir;
  if (urlType.startsWith('youtube') && ytOutputDir) effectiveDir = ytOutputDir;

  if (!effectiveDir) {
    log('warn', 'No output directory set. Select one now.');
    await pickOutputDir();
    effectiveDir = outputDir;
    if (!effectiveDir) { log('err', 'Download aborted — no output directory.'); return; }
  }

  setDownloading(true);
  setStatus('active', '● ACTIVE');

  const result = await window.cmd.startDownload({ url, outputDir: effectiveDir });

  setDownloading(false);
  setStatus(result?.ok ? 'ready' : 'error', result?.ok ? '● READY' : '● ERROR');
  if (result?.ok) hideProgress();
}

function cancelDownload() {
  window.cmd.cancelDownload();
  log('warn', 'Download cancelled by user.');
  setDownloading(false);
  setStatus('ready', '● READY');
  hideProgress();
}

/* ─── Download Events ────────────────────────────────────────────────────── */
function handleDownloadEvent(ev) {
  switch (ev.type) {
    case 'info':     log('info', ev.message); break;
    case 'ok':       log('ok',   ev.message); break;
    case 'warn':     log('warn', ev.message); break;
    case 'done':     log('done', ev.message); break;
    case 'error':
      log('err', ev.message);
      setDownloading(false);
      setStatus('error', '● ERROR');
      hideProgress();
      break;
    case 'progress':
      setProgress(ev.percent, ev.message);
      break;
  }
}

/* ─── Directory ─────────────────────────────────────────────────────────── */
async function pickOutputDir() {
  const dir = await window.cmd.pickDirectory();
  if (!dir) return;
  outputDir = dir;
  await window.cmd.configSet('outputDir', dir);
  updateDirDisplay();
  log('info', `Output directory set: ${dir}`);
}

async function openOutputDir() {
  if (!outputDir) { log('warn', 'No output directory set.'); return; }
  await window.cmd.openDirectory(outputDir);
}

function updateDirDisplay() {
  const el = $('dir-path');
  if (outputDir) {
    el.textContent = outputDir;
    el.title = outputDir;
    el.classList.remove('muted');
  } else {
    el.textContent = 'Not set';
    el.title = '';
    el.classList.add('muted');
  }
}

/* ─── Settings ───────────────────────────────────────────────────────────── */
function toggleSettings() {
  const overlay = $('settings-overlay');
  const visible = overlay.classList.contains('visible');
  if (visible) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 250);
  } else {
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }
}

async function saveSetting(key, value) {
  await window.cmd.configSet(key, value);
}

async function pickYtDir() {
  const dir = await window.cmd.pickDirectory();
  if (!dir) return;
  ytOutputDir = dir;
  await window.cmd.configSet('ytOutputDir', dir);
  refreshSettingsDirDisplay('setting-yt-dir', dir, 'Same as global');
}

async function clearYtDir() {
  ytOutputDir = null;
  await window.cmd.configSet('ytOutputDir', null);
  refreshSettingsDirDisplay('setting-yt-dir', null, 'Same as global');
}

function refreshSettingsDirDisplay(elemId, dir, fallback) {
  const el = $(elemId);
  if (dir) { el.textContent = dir;       el.classList.remove('muted'); }
  else      { el.textContent = fallback; el.classList.add('muted');    }
}

/* ─── Dependency Check ───────────────────────────────────────────────────── */
async function showDepCheck() {
  await runDepCheck();
}

async function runDepCheck() {
  $('dep-overlay').classList.remove('hidden');

  // Reset all to "checking"
  ['dep-ytdlp', 'dep-ffmpeg', 'dep-python'].forEach((id) => {
    const el = $(id);
    el.classList.remove('ok', 'missing');
    el.classList.add('checking');
    el.querySelector('.dep-status').textContent = 'CHECKING...';
    el.querySelector('.dep-version').textContent = '';
  });

  $('dep-proceed').disabled = true;

  const results = await window.cmd.checkDependencies();
  setDepItem('dep-ytdlp',  results.ytdlp);
  setDepItem('dep-ffmpeg', results.ffmpeg);
  setDepItem('dep-python', results.python);

  $('dep-proceed').disabled = false;
}

function setDepItem(id, result) {
  const el = $(id);
  el.classList.remove('checking', 'ok', 'missing');
  const statusEl  = el.querySelector('.dep-status');
  const versionEl = el.querySelector('.dep-version');

  if (result && result.ok) {
    el.classList.add('ok');
    statusEl.textContent  = 'INSTALLED';
    versionEl.textContent = result.version || '';
  } else {
    el.classList.add('missing');
    statusEl.textContent  = 'NOT FOUND';
    versionEl.textContent = '';
  }
}

/* ─── Log Panel ─────────────────────────────────────────────────────────── */
const TYPE_MAP = {
  info: { cls: 'info', prefix: '[INFO]' },
  ok:   { cls: 'ok',   prefix: '[OK]'   },
  warn: { cls: 'warn', prefix: '[WARN]' },
  err:  { cls: 'err',  prefix: '[FAIL]' },
  done: { cls: 'done', prefix: '[DONE]' },
};

function log(type, message) {
  const panel = $('log-panel');
  const { cls, prefix } = TYPE_MAP[type] || TYPE_MAP.info;
  const now = new Date();
  const ts  = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const entry = document.createElement('div');
  entry.className = `log-entry ${cls}`;
  entry.innerHTML =
    `<span class="log-time">${ts}</span>` +
    `<span class="log-prefix">${prefix}</span>` +
    `<span class="log-msg">${escHtml(message)}</span>`;

  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;

  logCount++;
  $('log-count').textContent = `${logCount} entries`;
}

function clearLog() {
  $('log-panel').innerHTML = '';
  logCount = 0;
  $('log-count').textContent = '0 entries';
}

/* ─── Progress ───────────────────────────────────────────────────────────── */
function setProgress(pct) {
  const wrap = $('progress-bar-wrap');
  wrap.classList.remove('hidden');
  const p = Math.min(100, Math.max(0, pct || 0));
  $('progress-bar').style.width = `${p}%`;
  $('progress-label').textContent = `${Math.round(p)}%`;
}

function hideProgress() {
  $('progress-bar-wrap').classList.add('hidden');
  $('progress-bar').style.width = '0%';
}

/* ─── UI State ───────────────────────────────────────────────────────────── */
function setDownloading(active) {
  isDownloading = active;
  $('download-btn').classList.toggle('hidden', active);
  $('cancel-btn').classList.toggle('hidden', !active);
  $('url-input').disabled = active;
}

function setStatus(cls, label) {
  const el = $('status-indicator');
  el.className = `status-indicator ${cls}`;
  el.textContent = label;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function pad(n)    { return String(n).padStart(2, '0'); }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function setSelectValue(id, val) { const el = $(id); if (el) el.value = val; }
