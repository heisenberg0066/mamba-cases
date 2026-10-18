/* Mamba Cases — iCalendar (.ics) export with VALARMs from each deadline's reminder ladder. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MCIcs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  /** RFC 5545 line folding at 75 octets (UTF-8 safe). */
  function fold(line) {
    const out = []; let cur = ''; let bytes = 0;
    for (const ch of line) { const b = new TextEncoder().encode(ch).length; if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; } cur += ch; bytes += b; }
    out.push(cur); return out.join('\r\n ');
  }
  const ymd = (s) => s.replace(/-/g, '');
  const next = (s) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  /** events: [{ uid, date:'YYYY-MM-DD', title, description, url, alarms:[daysBefore] }] */
  function build(events, opts) {
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mamba Cases//' + ((opts && opts.version) || '0.1.0') + '//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc((opts && opts.name) || 'Mamba Cases'), 'X-WR-TIMEZONE:Europe/Stockholm'];
    for (const e of events) {
      L.push('BEGIN:VEVENT', 'UID:' + e.uid + '@mamba-cases', 'DTSTAMP:' + now, 'DTSTART;VALUE=DATE:' + ymd(e.date), 'DTEND;VALUE=DATE:' + ymd(next(e.date)), 'SUMMARY:' + esc(e.title), 'TRANSP:TRANSPARENT');
      if (e.description) L.push('DESCRIPTION:' + esc(e.description));
      if (e.url) L.push('URL:' + e.url);
      if (e.categories) L.push('CATEGORIES:' + esc(e.categories));
      for (const d of e.alarms || []) {
        // all-day event starts 00:00; fire at 09:00 local on the reminder day → -(d days) + 9h
        const trig = d === 0 ? 'PT9H' : `-P${d - 1}DT15H`;
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:' + (d === 0 ? trig : trig), 'END:VALARM');
      }
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  return { build, fold, esc };
});
