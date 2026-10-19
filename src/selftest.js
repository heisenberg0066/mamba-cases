'use strict';
/* Packaged-app smoke test: `Mamba Cases.exe --self-test` (used by CI on windows-latest).
 * Checks the encrypted vault (with Windows DPAPI when available), rules engine, local OCR with the bundled
 * language data, pdf.js in the real renderer, and that the UI boots. Writes mamba-selftest.txt, exit code 0/1. */
const path = require('path'); const fs = require('fs'); const os = require('os');
async function run({ app, Vault, makeBackup, readBackup, keystore, registerIpc, BrowserWindow }) {
  const out = []; let failed = 0;
  const step = async (name, fn) => { const t0 = Date.now(); try { const r = await fn(); if (r === false) throw new Error('assertion failed'); out.push(`PASS ${name} (${Date.now() - t0} ms)${r && r !== true ? ' ' + JSON.stringify(r) : ''}`); } catch (e) { failed++; out.push(`FAIL ${name}: ${e && e.stack || e}`); } };
  const base = process.env.MAMBA_SMOKE || path.join(os.tmpdir(), 'mamba-cases-smoke'); fs.rmSync(base, { recursive: true, force: true }); fs.mkdirSync(base, { recursive: true });
  const assets = [process.resourcesPath && path.join(process.resourcesPath, 'selftest'), path.join(__dirname, '..', 'assets', 'selftest')].find((p) => p && fs.existsSync(path.join(p, 'letter.png')));
  out.push(`Mamba Cases ${app.getVersion()} self-test · ${process.platform} ${process.arch} · electron ${process.versions.electron} · keystore ${keystore.available()}`);
  await step('vault create/unlock (AES-256-GCM, scrypt PIN, DPAPI wrap if available)', () => {
    const v = new Vault(path.join(base, 'vault'), keystore); v.create('2468', { people: [{ name: 'Selftest' }] }); v.putFile('selftest01', Buffer.from('secret file'));
    v.lock(); const v2 = new Vault(path.join(base, 'vault'), keystore); if (v2.unlock('0000').ok) return false; if (!v2.unlock('2468').ok) return false;
    const enc = fs.readFileSync(path.join(base, 'vault', 'vault.enc')); if (enc.includes('Selftest')) return false;
    const b = makeBackup(v2, { documents: [{ id: 'selftest01' }] }, 'selftest-passphrase'); return readBackup(b, 'selftest-passphrase').files.selftest01 === Buffer.from('secret file').toString('base64') && { osWrapped: v2.meta().wrapped.os };
  });
  await step('rules engine (permit window, AF 1–14, Kronofogden +10)', () => {
    const R = require('./core/rules'); const P = require('./core/rules-pack.json');
    const a = R.computeRule(P, 'migr.protection_extension', { permit_end: '2026-12-10' }, { today: '2026-10-19' }).deadlines[0];
    const b = R.computeRule(P, 'af.activity_report', {}, { today: '2026-10-19' }).deadlines[0];
    const c = R.computeRule(P, 'kfm.betalningsforelaggande', { served_date: '2026-10-17', response_days: 10 }, { today: '2026-10-19' }).deadlines[0];
    return a.opensAt === '2026-10-10' && b.dueAt === '2026-11-14' && c.dueAt === '2026-10-27' && { rules: P.rules.length, pack: P.version };
  });
  await step('local OCR swe+eng+ara with bundled tessdata (no network)', async () => {
    const ocr = require('./ocr'); const X = require('./core/extract');
    const r = await ocr.recognize(fs.readFileSync(path.join(assets, 'letter.png'))); const e = X.extract(r.text); await ocr.terminate();
    return e.proposal.agency === 'kronofogden' && e.proposal.refNo === '12-345678-26' && { confidence: Math.round(r.confidence), tessdata: ocr.assetsDir() };
  });
  await step('renderer boots + pdf.js text extraction in the real UI', async () => {
    process.env.MAMBA_CASES_SELFTEST_UI = '1'; registerIpc();
    const w = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false } });
    await w.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    const b64 = fs.readFileSync(path.join(assets, 'letter.pdf')).toString('base64');
    const res = await w.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 100 && !document.querySelector('#startBtn,#pin'); i++) await new Promise((r) => setTimeout(r, 100));
      if (!window.pdfjsLib) await new Promise((r) => addEventListener('pdfjs-ready', r, { once: true }));
      const bytes = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
      const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise; const pg = await pdf.getPage(1); const tc = await pg.getTextContent();
      const text = tc.items.map((i) => i.str).join(' ');
      return { ui: !!document.querySelector('#startBtn,#pin'), pages: pdf.numPages, agency: MCExtract.classify(text).agency };
    })()`);
    w.destroy(); return res.ui && res.agency === 'migrationsverket' && res;
  });
  await step('Windows notifications supported', () => { const { Notification } = require('electron'); return process.platform !== 'win32' || Notification.isSupported(); });
  out.push(`${out.filter((l) => l.startsWith('PASS')).length} passed, ${failed} failed`);
  const txt = out.join('\n'); fs.writeFileSync(path.join(base, 'mamba-selftest.txt'), txt); console.log(txt);
  return failed ? 1 : 0;
}
module.exports = { run };
