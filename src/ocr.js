'use strict';
/* Local OCR with tesseract.js (WASM) and bundled language data (swe, eng, ara). No network access:
 * langPath points at the bundled folder and caching is disabled. */
const path = require('path');
const fs = require('fs');

function unpacked(p) { return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'); }
function assetsDir() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'tessdata'),
    unpacked(path.join(__dirname, '..', 'assets', 'tessdata')),
    path.join(__dirname, '..', 'assets', 'tessdata'),
  ].filter(Boolean);
  return candidates.find((d) => fs.existsSync(path.join(d, 'eng.traineddata.gz'))) || candidates[candidates.length - 1];
}
const workers = new Map();
async function getWorker(langs) {
  const key = langs.join('+');
  if (workers.has(key)) return workers.get(key);
  const T = require('tesseract.js');
  const tjsDir = path.dirname(require.resolve('tesseract.js/package.json'));
  const coreDir = path.dirname(require.resolve('tesseract.js-core/package.json'));
  const p = T.createWorker(langs, T.OEM.LSTM_ONLY, {
    langPath: assetsDir(), cacheMethod: 'none', gzip: true,
    workerPath: unpacked(path.join(tjsDir, 'src', 'worker-script', 'node', 'index.js')),
    corePath: unpacked(coreDir),
    errorHandler: (e) => console.error('[ocr]', e),
  });
  workers.set(key, p);
  try { return await p; } catch (e) { workers.delete(key); throw e; }
}
/** OCR one image buffer (PNG/JPEG/BMP/WebP). langs default swe+eng+ara. */
async function recognize(buf, langs, onProgress) {
  langs = (langs && langs.length ? langs : ['swe', 'eng', 'ara']).filter((l) => ['swe', 'eng', 'ara'].includes(l));
  const w = await getWorker(langs);
  if (onProgress) onProgress(0.1);
  const r = await w.recognize(buf, {}, { text: true });
  if (onProgress) onProgress(1);
  return { text: r.data.text || '', confidence: r.data.confidence || 0, langs };
}
async function terminate() { for (const p of workers.values()) { try { (await p).terminate(); } catch (_) {} } workers.clear(); }
module.exports = { recognize, terminate, assetsDir };
