/* Mamba Cases — date utilities: Swedish public holidays, bank days, statutory deadline shift.
 * All dates are calendar dates (no time) represented as 'YYYY-MM-DD' strings in Europe/Stockholm.
 * UMD: works in Node (tests, main) and in the renderer (window.MCDates). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MCDates = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parse = (s) => {
    if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) throw new Error('bad date: ' + s);
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCMonth() !== +m[2] - 1) throw new Error('bad date: ' + s);
    return d;
  };
  const isValid = (s) => { try { parse(s); return true; } catch (_) { return false; } };
  const ymd = (y, m, d) => iso(new Date(Date.UTC(y, m - 1, d)));
  const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  /** Calendar-month arithmetic: if the target month has no such day, use its last day. */
  const addMonths = (s, n) => {
    const d = parse(s); const y = d.getUTCFullYear(); const m = d.getUTCMonth() + n; const day = d.getUTCDate();
    const ty = y + Math.floor(m / 12); const tm = ((m % 12) + 12) % 12;
    return ymd(ty, tm + 1, Math.min(day, lastDayOfMonth(ty, tm + 1)));
  };
  const addYears = (s, n) => addMonths(s, 12 * n);
  const weekday = (s) => parse(s).getUTCDay(); // 0 = Sunday
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a
  /** Today's date in Europe/Stockholm. */
  const fake = () => { try { if (typeof self !== 'undefined' && self.__MC_FAKE_TODAY) return self.__MC_FAKE_TODAY; if (typeof process !== 'undefined' && process.env && process.env.MAMBA_CASES_FAKE_TODAY) return process.env.MAMBA_CASES_FAKE_TODAY; } catch (_) {} return null; };
  const today = (now) => {
    if (!now && fake()) return fake();
    const d = now ? new Date(now) : new Date();
    try {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    } catch (_) {}
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  /** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, month, day);
  }
  const firstWeekdayBetween = (y, m, from, to, wd) => { for (let d = from; d <= to; d++) { const s = ymd(y, m, d); if (weekday(s) === wd) return s; } return null; };
  const cache = {};
  /** Swedish public holidays (helgdagar, lag 1989:253) plus the de-facto non-working eves.
   * Returns a map date → { sv, en, ar, eve:boolean }. */
  function holidays(y) {
    if (cache[y]) return cache[y];
    const e = easter(y); const H = {};
    const add = (d, sv, en, ar, eve) => { H[d] = { sv, en, ar, eve: !!eve }; };
    add(ymd(y, 1, 1), 'Nyårsdagen', "New Year's Day", 'رأس السنة');
    add(ymd(y, 1, 6), 'Trettondedag jul', 'Epiphany', 'عيد الغطاس');
    add(addDays(e, -2), 'Långfredagen', 'Good Friday', 'الجمعة العظيمة');
    add(e, 'Påskdagen', 'Easter Sunday', 'عيد الفصح');
    add(addDays(e, 1), 'Annandag påsk', 'Easter Monday', 'اثنين الفصح');
    add(ymd(y, 5, 1), 'Första maj', 'May Day', 'عيد العمال');
    add(addDays(e, 39), 'Kristi himmelsfärdsdag', 'Ascension Day', 'عيد الصعود');
    add(ymd(y, 6, 6), 'Sveriges nationaldag', 'National Day of Sweden', 'اليوم الوطني للسويد');
    add(addDays(e, 49), 'Pingstdagen', 'Whit Sunday', 'عيد العنصرة');
    const mid = firstWeekdayBetween(y, 6, 20, 26, 6);
    add(addDays(mid, -1), 'Midsommarafton', 'Midsummer Eve', 'عشية منتصف الصيف', true);
    add(mid, 'Midsommardagen', 'Midsummer Day', 'يوم منتصف الصيف');
    const allh = firstWeekdayBetween(y, 10, 31, 31, 6) || firstWeekdayBetween(y, 11, 1, 6, 6);
    add(allh, 'Alla helgons dag', "All Saints' Day", 'عيد جميع القديسين');
    add(ymd(y, 12, 24), 'Julafton', 'Christmas Eve', 'عشية الميلاد', true);
    add(ymd(y, 12, 25), 'Juldagen', 'Christmas Day', 'عيد الميلاد');
    add(ymd(y, 12, 26), 'Annandag jul', 'Boxing Day', 'ثاني أيام الميلاد');
    add(ymd(y, 12, 31), 'Nyårsafton', "New Year's Eve", 'ليلة رأس السنة', true);
    return (cache[y] = H);
  }
  const holidayOn = (s) => holidays(parse(s).getUTCFullYear())[s] || null;
  /** Bank day: not Saturday/Sunday, not a public holiday, not midsommar-/jul-/nyårsafton. */
  const isBankDay = (s) => { const w = weekday(s); return w !== 0 && w !== 6 && !holidayOn(s); };
  const nextBankDay = (s) => { let d = s; while (!isBankDay(d)) d = addDays(d, 1); return d; };
  const prevBankDay = (s) => { let d = s; while (!isBankDay(d)) d = addDays(d, -1); return d; };
  const lastBankDayOfMonth = (y, m) => prevBankDay(ymd(y, m, lastDayOfMonth(y, m)));
  /** Lag (1930:173) om beräkning av lagstadgad tid: a last day on Sat/Sun/public holiday/midsommar-,
   * jul- or nyårsafton moves to the next weekday that is none of those. */
  const statutoryShift = (s) => nextBankDay(s);
  return { iso, parse, isValid, ymd, addDays, addMonths, addYears, weekday, diffDays, today, easter, holidays, holidayOn, isBankDay, nextBankDay, prevBankDay, lastBankDayOfMonth, lastDayOfMonth, statutoryShift };
});
