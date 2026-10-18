/* Mamba Cases — text normalisation (Swedish/English/Arabic) and local full-text search. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MCText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /** Arabic-Indic and Persian digits → ASCII. */
  const digits = (s) => String(s || '').replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
  /** Normalise for display-independent processing (keeps Swedish letters). */
  function clean(s) {
    return digits(s).replace(/\r/g, '').replace(/[\u00A0\u2007\u202F]/g, ' ').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/[‐‑‒–—]/g, '-').replace(/[ \t]+/g, ' ');
  }
  /** Search folding: lower-case, Arabic letter variants unified, diacritics/tashkeel/tatweel removed, Latin accents folded. */
  function fold(s) {
    return clean(s).toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/\u0640/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  }
  const tokens = (s) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  /** Search a list of records. fields: [{ get: (rec)=>string, weight }]. All query tokens must match (prefix match). */
  function search(records, query, fields) {
    const q = tokens(query); if (!q.length) return [];
    const out = [];
    for (const r of records) {
      let score = 0; let ok = true; let hitField = null;
      const texts = fields.map((f) => ({ f, t: fold(f.get(r) || '') }));
      for (const tok of q) {
        let best = 0;
        for (const { f, t } of texts) { const i = t.indexOf(tok); if (i >= 0) { const word = i === 0 || /[^\p{L}\p{N}]/u.test(t[i - 1]); const s = f.weight * (word ? 2 : 1); if (s > best) { best = s; if (!hitField || f.weight >= hitField.weight) hitField = f; } } }
        if (!best) { ok = false; break; }
        score += best;
      }
      if (ok) out.push({ rec: r, score, field: hitField && hitField.name });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  /** Short snippet around the first token hit (on the original text). */
  function snippet(text, query, len) {
    len = len || 120; const t = clean(text || '').replace(/\s+/g, ' '); const f = fold(t); const q = tokens(query);
    let i = -1; for (const tok of q) { i = f.indexOf(tok); if (i >= 0) break; }
    if (i < 0) return t.slice(0, len);
    const s = Math.max(0, i - Math.floor(len / 3));
    return (s > 0 ? '…' : '') + t.slice(s, s + len) + (s + len < t.length ? '…' : '');
  }
  return { digits, clean, fold, tokens, search, snippet };
});
