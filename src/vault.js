'use strict';
/* Encrypted local vault.
 * - A random 256-bit data key (DEK) encrypts the database (vault.enc) and every stored file (files/*.bin) with AES-256-GCM.
 * - The DEK is wrapped with a key derived from the user's PIN (scrypt N=2^15), and that wrapped blob is wrapped again
 *   with the OS keystore (Electron safeStorage → Windows DPAPI) when available, so the vault cannot be attacked off this
 *   Windows account. Nothing ever leaves the device. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MAGIC = Buffer.from('MCV1');

function aesEncrypt(key, plain, aad) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); if (aad) c.setAAD(aad);
  const enc = Buffer.concat([c.update(plain), c.final()]); return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}
function aesDecrypt(key, blob, aad) {
  if (blob.length < 32 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error('not a Mamba Cases encrypted blob');
  const iv = blob.subarray(4, 16), tag = blob.subarray(16, 32), enc = blob.subarray(32);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); if (aad) d.setAAD(aad); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]);
}
const kdf = (secret, salt) => crypto.scryptSync(String(secret).normalize('NFC'), salt, 32, SCRYPT);

class Vault {
  /** @param dir data directory; @param keystore optional { available(), encrypt(buf)->buf, decrypt(buf)->buf } */
  constructor(dir, keystore) {
    this.dir = dir; this.keystore = keystore || null; this.dek = null;
    this.metaPath = path.join(dir, 'vault-key.json'); this.dbPath = path.join(dir, 'vault.enc'); this.filesDir = path.join(dir, 'files');
  }
  exists() { return fs.existsSync(this.metaPath); }
  meta() { return JSON.parse(fs.readFileSync(this.metaPath, 'utf8')); }
  isUnlocked() { return !!this.dek; }
  _wrapOuter(buf) { if (this.keystore && this.keystore.available()) return { os: true, blob: this.keystore.encrypt(buf).toString('base64') }; return { os: false, blob: buf.toString('base64') }; }
  _unwrapOuter(m) { const b = Buffer.from(m.blob, 'base64'); if (!m.os) return b; if (!this.keystore || !this.keystore.available()) throw new Error('OS keystore unavailable'); return this.keystore.decrypt(b); }
  _writeMeta(pin, dek, extra) {
    const salt = crypto.randomBytes(16); const kek = kdf(pin, salt);
    const inner = aesEncrypt(kek, dek, Buffer.from('dek'));
    const m = { v: 1, kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64'), wrapped: this._wrapOuter(inner), created: (extra && extra.created) || new Date().toISOString(), failed: 0, lockUntil: 0 };
    this._atomic(this.metaPath, Buffer.from(JSON.stringify(m, null, 1)));
  }
  _atomic(file, buf) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file); }
  create(pin, initialData) {
    if (!/^\d{4,12}$/.test(String(pin))) throw new Error('PIN must be 4–12 digits');
    if (this.exists()) throw new Error('vault exists');
    fs.mkdirSync(this.filesDir, { recursive: true });
    const dek = crypto.randomBytes(32); this._writeMeta(pin, dek); this.dek = dek;
    this.save(initialData || {}); return true;
  }
  /** Returns { ok } or { ok:false, waitMs, failed }. Escalating delay after 5 wrong PINs. */
  unlock(pin) {
    const m = this.meta(); const now = Date.now();
    if (m.lockUntil && now < m.lockUntil) return { ok: false, waitMs: m.lockUntil - now, failed: m.failed };
    try {
      const kek = crypto.scryptSync(String(pin).normalize('NFC'), Buffer.from(m.salt, 'base64'), 32, { N: m.N, r: m.r, p: m.p, maxmem: SCRYPT.maxmem });
      this.dek = aesDecrypt(kek, this._unwrapOuter(m.wrapped), Buffer.from('dek'));
      if (m.failed) { m.failed = 0; m.lockUntil = 0; this._atomic(this.metaPath, Buffer.from(JSON.stringify(m, null, 1))); }
      return { ok: true };
    } catch (e) {
      if (/keystore/.test(e.message)) return { ok: false, error: 'keystore' };
      m.failed = (m.failed || 0) + 1; if (m.failed >= 5) m.lockUntil = now + Math.min(30 * 60e3, 30e3 * 2 ** (m.failed - 5));
      this._atomic(this.metaPath, Buffer.from(JSON.stringify(m, null, 1)));
      return { ok: false, failed: m.failed, waitMs: m.lockUntil ? m.lockUntil - now : 0 };
    }
  }
  verifyPin(pin) { const dek = this.dek; const r = this.unlock(pin); if (!r.ok) this.dek = dek; return r.ok; }
  changePin(oldPin, newPin) {
    if (!this.verifyPin(oldPin)) return false;
    if (!/^\d{4,12}$/.test(String(newPin))) throw new Error('PIN must be 4–12 digits');
    this._writeMeta(newPin, this.dek, { created: this.meta().created }); return true;
  }
  lock() { if (this.dek) this.dek.fill(0); this.dek = null; }
  _need() { if (!this.dek) throw new Error('vault locked'); }
  load() { this._need(); if (!fs.existsSync(this.dbPath)) return {}; return JSON.parse(aesDecrypt(this.dek, fs.readFileSync(this.dbPath), Buffer.from('db')).toString('utf8')); }
  save(data) {
    this._need(); const blob = aesEncrypt(this.dek, Buffer.from(JSON.stringify(data)), Buffer.from('db'));
    if (fs.existsSync(this.dbPath)) { try { fs.copyFileSync(this.dbPath, this.dbPath + '.prev'); } catch (_) {} }
    this._atomic(this.dbPath, blob); return true;
  }
  filePath(id) { if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) throw new Error('bad id'); return path.join(this.filesDir, id + '.bin'); }
  putFile(id, buf) { this._need(); fs.mkdirSync(this.filesDir, { recursive: true }); this._atomic(this.filePath(id), aesEncrypt(this.dek, buf, Buffer.from('file:' + id))); }
  getFile(id) { this._need(); return aesDecrypt(this.dek, fs.readFileSync(this.filePath(id)), Buffer.from('file:' + id)); }
  hasFile(id) { return fs.existsSync(this.filePath(id)); }
  deleteFile(id) { try { fs.rmSync(this.filePath(id), { force: true }); } catch (_) {} }
  listFiles() { try { return fs.readdirSync(this.filesDir).filter((f) => f.endsWith('.bin')).map((f) => f.slice(0, -4)); } catch (_) { return []; } }
  wipe() { this.lock(); fs.rmSync(this.dir, { recursive: true, force: true }); }
}

/* Backup archive (.mcbak): gzip(JSON{ data, files{id: base64} }) encrypted with a passphrase-derived key.
 * Independent of PIN and of the OS keystore, so it restores on another PC. */
const zlib = require('zlib');
function makeBackup(vault, data, passphrase, appInfo) {
  if (String(passphrase || '').length < 8) throw new Error('passphrase must be at least 8 characters');
  const files = {}; for (const d of data.documents || []) if (vault.hasFile(d.id)) files[d.id] = vault.getFile(d.id).toString('base64');
  const payload = zlib.gzipSync(Buffer.from(JSON.stringify({ format: 'mamba-cases-backup', v: 1, created: new Date().toISOString(), app: appInfo || {}, data, files })));
  const salt = crypto.randomBytes(16); const key = kdf(passphrase, salt);
  const head = Buffer.from(JSON.stringify({ format: 'mamba-cases-backup', v: 1, kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64') }));
  const len = Buffer.alloc(4); len.writeUInt32BE(head.length);
  return Buffer.concat([Buffer.from('MCBK'), len, head, aesEncrypt(key, payload, head)]);
}
function readBackup(buf, passphrase) {
  if (!buf.subarray(0, 4).equals(Buffer.from('MCBK'))) throw new Error('not a Mamba Cases backup');
  const n = buf.readUInt32BE(4); const head = buf.subarray(8, 8 + n); const h = JSON.parse(head.toString('utf8'));
  const key = crypto.scryptSync(String(passphrase).normalize('NFC'), Buffer.from(h.salt, 'base64'), 32, { N: h.N, r: h.r, p: h.p, maxmem: SCRYPT.maxmem });
  let plain; try { plain = aesDecrypt(key, buf.subarray(8 + n), head); } catch (_) { throw new Error('wrong passphrase or damaged backup'); }
  const obj = JSON.parse(zlib.gunzipSync(plain).toString('utf8'));
  if (obj.format !== 'mamba-cases-backup') throw new Error('unknown backup format');
  return obj;
}
module.exports = { Vault, makeBackup, readBackup, aesEncrypt, aesDecrypt };
