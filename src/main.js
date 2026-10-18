'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Tray, Menu, nativeImage, safeStorage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Vault, makeBackup, readBackup } = require('./vault');
const D = require('./core/dates');
const R = require('./core/rules');
const PACK = require('./core/rules-pack.json');

if (process.env.MAMBA_CASES_DATA) app.setPath('userData', process.env.MAMBA_CASES_DATA);
const SELFTEST = process.argv.includes('--self-test');
const UITEST = process.env.MAMBA_CASES_UITEST;
const HIDDEN = process.argv.includes('--hidden');
if (!SELFTEST && !UITEST && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.ammar.mambacases');

const dataDir = () => path.join(app.getPath('userData'), 'vault');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = { lang: null, theme: 'light', autoLockMin: 5, notifications: true, notifyDetails: true, reminderHour: 9, trayOnClose: true, startWithWindows: false, timelineDir: 'ltr', reducedMotion: false, fontScale: 1, numerals: 'western', maskIds: true };
function settings() { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }; } catch (_) { return { ...DEFAULT_SETTINGS }; } }
function saveSettings(s) { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 1)); }

const keystore = {
  available: () => { try { return !process.env.MAMBA_CASES_NO_KEYSTORE && safeStorage.isEncryptionAvailable() && process.platform === 'win32'; } catch (_) { return false; } },
  encrypt: (buf) => safeStorage.encryptString(buf.toString('base64')),
  decrypt: (buf) => Buffer.from(safeStorage.decryptString(buf), 'base64'),
};
let vault, data = null, win = null, tray = null, quitting = false, uiLocked = true;
const MAX_FILE = 60 * 1024 * 1024;
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp', '.gif': 'image/gif', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.txt': 'text/plain' };
function sniff(buf, name) {
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 2).toString() === 'BM') return 'image/bmp';
  return MIME[path.extname(name || '').toLowerCase()] || 'application/octet-stream';
}
const newId = () => crypto.randomBytes(12).toString('base64url');

// ---------- reminders ----------
let fired = {};
function loadFired() { try { fired = vault.hasFile('state-reminders') ? JSON.parse(vault.getFile('state-reminders').toString('utf8')) : {}; } catch (_) { fired = {}; } }
function saveFired() { try { vault.putFile('state-reminders', Buffer.from(JSON.stringify(fired))); } catch (_) {} }
const T = {
  en: { due: (t, n) => n > 1 ? `${t} — due in ${n} days` : n === 1 ? `${t} — due tomorrow` : n === 0 ? `${t} — due TODAY` : `${t} — OVERDUE`, open: (t) => `${t} — the window is open from today`, many: (n) => `${n} deadlines need your attention`, generic: 'You have a deadline coming up. Open Mamba Cases to see it.', snooze: (t) => `Reminder: ${t}` },
  sv: { due: (t, n) => n > 1 ? `${t} — om ${n} dagar` : n === 1 ? `${t} — i morgon` : n === 0 ? `${t} — IDAG` : `${t} — FÖRSENAD`, open: (t) => `${t} — fönstret är öppet från idag`, many: (n) => `${n} tidsfrister behöver din uppmärksamhet`, generic: 'Du har en tidsfrist som närmar sig. Öppna Mamba Cases.', snooze: (t) => `Påminnelse: ${t}` },
  ar: { due: (t, n) => n > 1 ? `${t} — بعد ${n} أيام` : n === 1 ? `${t} — غداً` : n === 0 ? `${t} — اليوم` : `${t} — متأخر`, open: (t) => `${t} — النافذة مفتوحة اعتباراً من اليوم`, many: (n) => `${n} مواعيد تحتاج إلى انتباهك`, generic: 'لديك موعد قريب. افتح Mamba Cases لرؤيته.', snooze: (t) => `تذكير: ${t}` },
};
function dueReminders(now) {
  if (!data) return [];
  const s = settings(); const today = D.today(now); const hour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hour12: false }).format(now);
  const out = [];
  for (const dl of data.deadlines || []) {
    if (dl.state === 'done' || dl.state === 'cancelled' || !dl.dueAt) continue;
    if (dl.snoozedUntil) { if (now < new Date(dl.snoozedUntil)) continue; const k = `${dl.id}|snooze:${dl.snoozedUntil}`; if (!fired[k]) { out.push({ key: k, dl, kind: 'snooze' }); continue; } }
    if (hour < (s.reminderHour || 9)) continue;
    for (const r of R.reminderDates(dl)) {
      if (r.date > today || D.diffDays(r.date, today) > 3) continue;
      const k = `${dl.id}|${r.key}`; if (!fired[k]) out.push({ key: k, dl, kind: r.kind, days: D.diffDays(today, dl.dueAt) });
    }
    if (today > dl.dueAt && D.diffDays(dl.dueAt, today) <= 3) { const k = `${dl.id}|overdue:${dl.dueAt}`; if (!fired[k]) out.push({ key: k, dl, kind: 'overdue', days: D.diffDays(today, dl.dueAt) }); }
  }
  // one notification per deadline (latest rung) — older rungs are marked as fired silently
  const byDl = new Map(); for (const r of out) byDl.set(r.dl.id, [...(byDl.get(r.dl.id) || []), r]);
  return [...byDl.values()].map((list) => ({ ...list[list.length - 1], keys: list.map((x) => x.key) }));
}
function titleOf(dl, lang) { return (dl.title && (typeof dl.title === 'string' ? dl.title : dl.title[lang] || dl.title.en)) || 'Deadline'; }
function tickReminders(now) {
  now = now || new Date(); const s = settings(); const list = dueReminders(now); if (!list.length) return [];
  const lang = s.lang || 'en'; const t = T[lang] || T.en; const shown = [];
  for (const r of list) r.keys.forEach((k) => (fired[k] = now.toISOString()));
  saveFired();
  if (!s.notifications) return list;
  const body = (r) => (!s.notifyDetails ? t.generic : r.kind === 'open' ? t.open(titleOf(r.dl, lang)) : r.kind === 'snooze' ? t.snooze(titleOf(r.dl, lang)) : t.due(titleOf(r.dl, lang), r.days));
  const items = list.length > 3 ? [{ many: true }] : list;
  for (const r of items) {
    const text = r.many ? t.many(list.length) : body(r);
    shown.push(text);
    if (!Notification.isSupported() || UITEST || SELFTEST) continue;
    const n = new Notification({ title: 'Mamba Cases', body: text, icon: path.join(__dirname, 'renderer', 'icon.png'), urgency: r.dl && r.dl.severity === 'critical' ? 'critical' : 'normal' });
    n.on('click', () => { showWindow(); if (r.dl && win) win.webContents.send('open-deadline', r.dl.id); });
    n.show();
  }
  return shown;
}
setInterval(() => { try { tickReminders(); } catch (e) { console.error('reminders', e); } }, 60 * 1000).unref();

// ---------- window ----------
function showWindow() { if (!win) createWindow(); else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } }
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 640, show: false, title: 'Mamba Cases', backgroundColor: '#f7f5f0', autoHideMenuBar: true,
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!HIDDEN || UITEST) win.show(); });
  win.on('close', (e) => { if (!quitting && settings().trayOnClose && tray && !UITEST) { e.preventDefault(); win.hide(); if (win.webContents) win.webContents.send('lock-now'); } });
  win.on('closed', () => { win = null; });
}
function createTray() {
  if (UITEST || SELFTEST) return;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'renderer', 'icon.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip('Mamba Cases');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Mamba Cases', click: showWindow }, { type: 'separator' }, { label: 'Quit', click: () => { quitting = true; app.quit(); } }]));
    tray.on('click', showWindow);
  } catch (_) { tray = null; }
}
app.on('second-instance', () => showWindow());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!tray || quitting) app.quit(); });

// ---------- IPC ----------
function registerIpc() {
  const GUARDED = /^(doc:|backup:|vault:save|vault:changePin|reminders:)/;
  const H = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { if (GUARDED.test(ch) && uiLocked) throw new Error('locked'); return fn(...a); });
  H('app:info', () => ({ version: app.getVersion(), packVersion: PACK.version, platform: process.platform, keystore: keystore.available(), dataDir: dataDir(), test: !!UITEST }));
  H('settings:get', () => settings());
  H('settings:set', (patch) => {
    const s = { ...settings(), ...patch }; saveSettings(s);
    if ('startWithWindows' in patch && process.platform === 'win32' && !UITEST) { try { app.setLoginItemSettings({ openAtLogin: !!s.startWithWindows, args: ['--hidden'], path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath }); } catch (_) {} }
    return s;
  });
  H('rules:pack', () => PACK);
  H('vault:status', () => ({ exists: vault.exists(), unlocked: vault.isUnlocked(), keystore: keystore.available(), osWrapped: vault.exists() ? !!vault.meta().wrapped.os : null }));
  H('vault:create', (pin, initial) => { vault.create(pin, initial); data = initial; loadFired(); uiLocked = false; return { ok: true }; });
  H('vault:unlock', (pin) => {
    const wasUnlocked = vault.isUnlocked(); const r = vault.unlock(pin);
    if (!r.ok) return r;
    if (!wasUnlocked || !data) { data = vault.load(); loadFired(); }
    uiLocked = false; return { ok: true, data };
  });
  H('vault:lock', () => { uiLocked = true; return { ok: true }; }); // UI lock: the key stays in memory only so that reminders keep working
  H('vault:save', (d) => { vault.save(d); data = d; return { ok: true, at: new Date().toISOString() }; });
  H('vault:verifyPin', (pin) => vault.verifyPin(pin));
  H('vault:changePin', (o, n) => { try { return { ok: vault.changePin(o, n) }; } catch (e) { return { ok: false, error: e.message }; } });
  H('vault:wipe', (pin) => { if (!vault.verifyPin(pin)) return { ok: false }; vault.wipe(); data = null; fired = {}; uiLocked = true; return { ok: true }; });
  H('doc:import', async (paths) => {
    const out = [];
    for (const p of paths || []) {
      try {
        const st = fs.statSync(p); if (!st.isFile()) throw new Error('not a file'); if (st.size > MAX_FILE) throw new Error('file larger than 60 MB');
        const buf = fs.readFileSync(p); out.push(storeBuffer(buf, path.basename(p)));
      } catch (e) { out.push({ error: String(e.message || e), name: path.basename(String(p)) }); }
    }
    return out;
  });
  H('doc:importBuffer', (name, bytes) => storeBuffer(Buffer.from(bytes), name));
  H('doc:bytes', (id) => new Uint8Array(vault.getFile(id)));
  H('doc:delete', (id) => { vault.deleteFile(id); return true; });
  H('doc:ocr', async (req) => {
    const { recognize } = require('./ocr');
    const images = req.id ? [vault.getFile(req.id)] : (req.images || []).map((b) => Buffer.from(b));
    let text = ''; let conf = 0;
    for (let i = 0; i < images.length; i++) {
      const r = await recognize(images[i], req.langs); text += (i ? '\n\f\n' : '') + r.text; conf += r.confidence;
      if (win) win.webContents.send('ocr-progress', { page: i + 1, pages: images.length });
    }
    return { text, confidence: images.length ? conf / images.length : 0 };
  });
  H('doc:saveAs', async (id, name) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name || 'document' }); if (r.canceled) return null;
    fs.writeFileSync(r.filePath, vault.getFile(id)); return r.filePath;
  });
  H('dialog:openFiles', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Letters & documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] }] });
    return r.canceled ? [] : r.filePaths;
  });
  H('file:saveText', async (name, text, filterName, ext) => {
    if (UITEST && process.env.MAMBA_CASES_EXPORT_DIR) { const f = path.join(process.env.MAMBA_CASES_EXPORT_DIR, name); fs.writeFileSync(f, text); return f; }
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: filterName || ext, extensions: [ext] }] }); if (r.canceled) return null;
    fs.writeFileSync(r.filePath, text); return r.filePath;
  });
  H('backup:export', async (passphrase) => {
    const buf = makeBackup(vault, data || {}, passphrase, { version: app.getVersion(), packVersion: PACK.version });
    const name = `MambaCases-backup-${D.today()}.mcbak`;
    let file;
    if (UITEST && process.env.MAMBA_CASES_EXPORT_DIR) file = path.join(process.env.MAMBA_CASES_EXPORT_DIR, name);
    else { const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'Mamba Cases backup', extensions: ['mcbak'] }] }); if (r.canceled) return null; file = r.filePath; }
    fs.writeFileSync(file, buf); return { file, size: buf.length };
  });
  H('backup:import', async (passphrase, file) => {
    if (!file) { const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Mamba Cases backup', extensions: ['mcbak'] }] }); if (r.canceled) return null; file = r.filePaths[0]; }
    let obj; try { obj = readBackup(fs.readFileSync(file), passphrase); } catch (e) { return { ok: false, error: e.message }; }
    for (const [id, b64] of Object.entries(obj.files || {})) vault.putFile(id, Buffer.from(b64, 'base64'));
    vault.save(obj.data); data = obj.data; return { ok: true, data: obj.data, created: obj.created, files: Object.keys(obj.files || {}).length };
  });
  H('shell:open', (url) => { if (/^https:\/\//i.test(url)) return shell.openExternal(url); return false; });
  H('notify:test', () => {
    const s = settings(); const t = T[s.lang || 'en'] || T.en; const text = t.due('Mamba Cases', 3);
    if (Notification.isSupported() && !UITEST) new Notification({ title: 'Mamba Cases', body: text, icon: path.join(__dirname, 'renderer', 'icon.png') }).show();
    return text;
  });
  H('reminders:preview', (iso) => dueReminders(iso ? new Date(iso) : new Date()).map((r) => ({ id: r.dl.id, kind: r.kind, days: r.days })));
  if (UITEST) {
    H('test:shot', async (name) => { const dir = process.env.MAMBA_CASES_SHOTS || 'docs'; fs.mkdirSync(dir, { recursive: true }); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, name + '.png'), img.toPNG()); return true; });
    H('test:fixture', (name) => path.join(__dirname, '..', 'test', 'fixtures', name));
    H('test:tick', (iso) => tickReminders(new Date(iso)));
    H('test:done', (code, report) => { console.log(report || ''); setTimeout(() => app.exit(code || 0), 200); });
    H('test:size', (w, h) => { win.setSize(w, h); return true; });
  }
}
function storeBuffer(buf, name) {
  if (buf.length > MAX_FILE) throw new Error('file larger than 60 MB');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const dup = ((data && data.documents) || []).find((d) => d.sha256 === sha256);
  const id = newId(); vault.putFile(id, buf);
  return { id, name, mime: sniff(buf, name), size: buf.length, sha256, duplicateOf: dup ? dup.id : null };
}

app.whenReady().then(async () => {
  vault = new Vault(dataDir(), keystore);
  if (SELFTEST) { const code = await require('./selftest').run({ app, Vault, makeBackup, readBackup, keystore }); app.exit(code); return; }
  registerIpc(); createWindow(); createTray();
  powerMonitor.on('lock-screen', () => { if (win) win.webContents.send('lock-now'); });
  powerMonitor.on('suspend', () => { if (win) win.webContents.send('lock-now'); });
  if (UITEST) {
    win.webContents.once('did-finish-load', async () => {
      const code = fs.readFileSync(path.resolve(UITEST), 'utf8');
      try { await win.webContents.executeJavaScript(`(async () => { ${code} })().catch((e) => window.api.test.done(1, 'UI TEST ERROR: ' + (e && e.stack || e)))`); } catch (e) { console.error(e); app.exit(1); }
    });
  }
});
