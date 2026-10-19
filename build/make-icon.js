// Renders the app icon (SVG) to PNGs and packs build/icon.ico + build/icon.png + src/renderer/icon.png.
// Run: xvfb-run -a electron --no-sandbox build/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a00"/><stop offset="1" stop-color="#ffc15e"/></linearGradient></defs>
<rect x="8" y="8" width="240" height="240" rx="56" fill="url(#g)"/>
<rect x="56" y="70" width="144" height="128" rx="18" fill="#fff"/><rect x="56" y="70" width="144" height="34" rx="14" fill="#fff3e6"/><rect x="56" y="92" width="144" height="12" fill="#fff3e6"/>
<rect x="84" y="52" width="16" height="36" rx="8" fill="#fff"/><rect x="156" y="52" width="16" height="36" rx="8" fill="#fff"/>
<path d="M92 150 l24 24 l48 -52" fill="none" stroke="#ff7a00" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
app.whenReady().then(async () => {
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512]; const pngs = {};
  const w = new BrowserWindow({ show: false, width: 512, height: 512, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  const big = await w.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  for (const s of sizes) pngs[s] = big.resize({ width: s, height: s, quality: 'best' }).toPNG();
  fs.writeFileSync(path.join(__dirname, 'icon.png'), pngs[512]); fs.writeFileSync(path.join(__dirname, '..', 'src', 'renderer', 'icon.png'), pngs[256]);
  const list = [16, 24, 32, 48, 64, 128, 256]; const head = Buffer.alloc(6 + 16 * list.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(list.length, 4);
  let off = head.length; const bodies = [];
  list.forEach((s, i) => { const b = pngs[s]; const o = 6 + 16 * i; head.writeUInt8(s >= 256 ? 0 : s, o); head.writeUInt8(s >= 256 ? 0 : s, o + 1); head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(b.length, o + 8); head.writeUInt32LE(off, o + 12); off += b.length; bodies.push(b); });
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, ...bodies])); console.log('icons written'); app.quit();
});
