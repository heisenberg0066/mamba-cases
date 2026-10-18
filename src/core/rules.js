/* Mamba Cases — deadline rules engine. Pure functions over the JSON rules pack (no hard-coded rules).
 * Every computed date carries an explanation: rule + source + verified date + the user's inputs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates'));
  else root.MCRules = factory(root.MCDates);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const LANGS = ['en', 'sv', 'ar'];
  const U = {
    days: { en: 'days', sv: 'dagar', ar: 'يوم' }, months: { en: 'months', sv: 'mån', ar: 'شهر' }, years: { en: 'years', sv: 'år', ar: 'سنة' },
    rule: { en: 'Rule', sv: 'Regel', ar: 'القاعدة' }, verified: { en: 'verified', sv: 'kontrollerad', ar: 'تم التحقق' },
    input: { en: 'your input', sv: 'din uppgift', ar: 'مدخلاتك' }, opens: { en: 'opens', sv: 'öppnar', ar: 'تُفتح' }, due: { en: 'due', sv: 'senast', ar: 'الموعد' },
    lastBank: { en: 'last bank day of month', sv: 'sista bankdagen i månaden', ar: 'آخر يوم عمل مصرفي في الشهر' },
    nextBank: { en: 'moved to next bank day', sv: 'flyttad till nästa bankdag', ar: 'نُقل إلى يوم العمل التالي' },
    prevBank: { en: 'moved to previous bank day', sv: 'flyttad till föregående bankdag', ar: 'نُقل إلى يوم العمل السابق' },
    published: { en: 'published date', sv: 'publicerat datum', ar: 'تاريخ منشور' },
    estimate: { en: 'ESTIMATE until the authority publishes the date', sv: 'UPPSKATTNING tills myndigheten publicerar datumet', ar: 'تقدير حتى تنشر الجهة التاريخ' },
    monthly: { en: 'every month', sv: 'varje månad', ar: 'كل شهر' }, today: { en: 'today', sv: 'idag', ar: 'اليوم' },
  };
  const tr = (o, lang) => (o && (o[lang] || o.en)) || '';
  const sign = (n) => (n < 0 ? '− ' + Math.abs(n) : '+ ' + n);

  function resolveDefault(input, today) {
    const d = input.default;
    if (d === undefined || d === null) return undefined;
    const y = +today.slice(0, 4);
    if (d === 'today') return today;
    if (d === 'nextDeklarationYear') return today > `${y}-05-15` ? y + 1 : y;
    if (d === 'nextAprilYear') return today > `${y}-04-30` ? y + 1 : y;
    return d;
  }
  function withDefaults(rule, inputs, today) {
    const out = { ...(inputs || {}) };
    for (const i of rule.inputs || []) if (out[i.key] === undefined || out[i.key] === '' || out[i.key] === null) { const v = resolveDefault(i, today); if (v !== undefined) out[i.key] = v; }
    return out;
  }
  function validate(rule, inputs) {
    const errors = [];
    for (const i of rule.inputs || []) {
      const v = inputs[i.key];
      if (v === undefined || v === '' || v === null) { if (i.required) errors.push({ key: i.key, code: 'required' }); continue; }
      if (i.type === 'date' && !D.isValid(v)) errors.push({ key: i.key, code: 'date' });
      if (i.type === 'number') { const n = Number(v); if (!Number.isFinite(n)) errors.push({ key: i.key, code: 'number' }); else if ((i.min !== undefined && n < i.min) || (i.max !== undefined && n > i.max)) errors.push({ key: i.key, code: 'range', min: i.min, max: i.max }); }
      if (i.type === 'year' && !/^\d{4}$/.test(String(v))) errors.push({ key: i.key, code: 'year' });
      if (i.type === 'select' && !(i.options || []).some((o) => o.value === v)) errors.push({ key: i.key, code: 'option' });
    }
    return errors;
  }
  const inputLabel = (rule, key, lang) => { const i = (rule.inputs || []).find((x) => x.key === key); return i ? tr(i.label, lang) : key; };

  /** Evaluate a date expression. Returns { date, estimated, text:{en,sv,ar} }. */
  function evalDate(expr, rule, inputs, today) {
    const text = {}; LANGS.forEach((l) => (text[l] = []));
    const say = (fn) => LANGS.forEach((l) => text[l].push(fn(l)));
    let date; let estimated = false;
    if (expr.byYear || expr.lastBankDayOfMonth) {
      const year = +(inputs[expr.yearInput] || today.slice(0, 4));
      if (expr.lastBankDayOfMonth) { date = D.lastBankDayOfMonth(year, expr.lastBankDayOfMonth); say((l) => `${U.lastBank[l]} (${year}-${String(expr.lastBankDayOfMonth).padStart(2, '0')}) = ${date}`); }
      else if (expr.byYear[String(year)]) { date = expr.byYear[String(year)]; say((l) => `${U.published[l]} ${year}: ${date}`); }
      else {
        const f = expr.fallback; let d0 = D.ymd(year, f.month, f.day); date = d0;
        if (f.shift === 'nextBankDay') date = D.nextBankDay(d0); else if (f.shift === 'prevBankDay') date = D.prevBankDay(d0);
        estimated = true;
        say((l) => `${d0}${date !== d0 ? ` → ${f.shift === 'nextBankDay' ? U.nextBank[l] : U.prevBank[l]} ${date}` : ''} (${U.estimate[l]})`);
      }
    } else {
      const fromKey = expr.from; const base = fromKey === 'today' ? today : inputs[fromKey];
      if (!base || !D.isValid(base)) return { date: null, estimated, text, error: 'missing:' + fromKey };
      date = base;
      say((l) => `${fromKey === 'today' ? U.today[l] : inputLabel(rule, fromKey, l)} (${base})`);
      const step = (e) => {
        if (e.monthsFromInput) { const sel = (rule.inputs || []).find((i) => i.key === e.monthsFromInput); const opt = sel && (sel.options || []).find((o) => o.value === inputs[e.monthsFromInput]); const m = opt ? opt.months : 0; date = D.addMonths(date, m); say((l) => `${sign(m)} ${U.months[l]} (${tr(opt && opt.label, l)})`); }
        if (e.years) { date = D.addYears(date, e.years); say((l) => `${sign(e.years)} ${U.years[l]}`); }
        if (e.months) { date = D.addMonths(date, e.months); say((l) => `${sign(e.months)} ${U.months[l]}`); }
        if (e.daysFromInput) { const n = Number(inputs[e.daysFromInput]); date = D.addDays(date, n); say((l) => `${sign(n)} ${U.days[l]} (${inputLabel(rule, e.daysFromInput, l)})`); }
        if (e.days) { date = D.addDays(date, e.days); say((l) => `${sign(e.days)} ${U.days[l]}`); }
        if (e.shift === 'nextBankDay') { const n = D.nextBankDay(date); if (n !== date) { date = n; say((l) => U.nextBank[l]); } }
        if (e.then) step(e.then);
      };
      step(expr);
      say(() => `= ${date}`);
    }
    const out = {}; LANGS.forEach((l) => (out[l] = text[l].join(' ')));
    return { date, estimated, text: out };
  }

  /** Current (or next) period of a monthly recurrence relative to `today`. */
  function recurringPeriod(rec, today) {
    let y = +today.slice(0, 4), m = +today.slice(5, 7);
    const dueThis = D.ymd(y, m, Math.min(rec.dueDay, D.lastDayOfMonth(y, m)));
    if (today > dueThis) { m += 1; if (m > 12) { m = 1; y += 1; } }
    return periodFor(rec, y, m);
  }
  function periodFor(rec, y, m) {
    const opensAt = D.ymd(y, m, Math.min(rec.openDay, D.lastDayOfMonth(y, m)));
    const dueAt = D.ymd(y, m, Math.min(rec.dueDay, D.lastDayOfMonth(y, m)));
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    return { opensAt, dueAt, period: `${py}-${String(pm).padStart(2, '0')}` };
  }
  function nextPeriod(rec, dueAt) { let y = +dueAt.slice(0, 4), m = +dueAt.slice(5, 7) + 1; if (m > 12) { m = 1; y += 1; } return periodFor(rec, y, m); }

  function checkCond(c, rule, inputs, today) {
    const v = inputs[c.input]; if (!v || !D.isValid(v)) return false;
    if (c.before) { const r = evalDate(c.before, rule, inputs, today); return r.date && v < r.date; }
    if (c.after) { const r = evalDate(c.after, rule, inputs, today); return r.date && v > r.date; }
    return false;
  }

  /** Compute all deadlines of a rule for the given inputs. */
  function computeRule(pack, ruleId, rawInputs, opts) {
    const today = (opts && opts.today) || D.today();
    const rule = pack.rules.find((r) => r.id === ruleId);
    if (!rule) return { errors: [{ code: 'unknown_rule', key: ruleId }], deadlines: [], checks: [] };
    const inputs = withDefaults(rule, rawInputs, today);
    const errors = validate(rule, inputs);
    if (errors.length) return { rule, inputs, errors, deadlines: [], checks: [] };
    const agency = (pack.agencies || []).find((a) => a.code === rule.agency) || { sv: rule.agency };
    const head = {}; LANGS.forEach((l) => (head[l] = `${U.rule[l]} "${tr(rule.name, l)}" (${agency.sv}; ${rule.source_url}; ${U.verified[l]} ${rule.verified_at}) + ${U.input[l]}:`));
    const deadlines = [];
    for (const d of rule.deadlines) {
      const out = { key: d.key, ruleId: rule.id, rulePackVersion: pack.version, agency: rule.agency, kind: d.kind, severity: d.severity, title: d.title,
        ladder: { atOpen: !!(d.ladder && d.ladder.atOpen), days: (d.ladder && d.ladder.days) || pack.ladders[d.severity] || [0] },
        inputs, consequence: rule.consequence, sourceUrl: rule.source_url, verifiedAt: rule.verified_at, sourceTag: rule.source_tag, estimated: false, explanation: {} };
      if (d.kind === 'recurring') {
        const p = recurringPeriod(d.recurrence, today);
        Object.assign(out, { recurrence: d.recurrence, opensAt: p.opensAt, dueAt: p.dueAt, period: p.period });
        LANGS.forEach((l) => (out.explanation[l] = `${head[l]} ${U.monthly[l]} ${d.recurrence.openDay}–${d.recurrence.dueDay} → ${U.opens[l]} ${p.opensAt}, ${U.due[l]} ${p.dueAt}`));
      } else {
        const due = evalDate(d.due, rule, inputs, today);
        if (!due.date) { errors.push({ code: due.error || 'date', key: d.key }); continue; }
        out.dueAt = due.date; out.estimated = due.estimated;
        let opensTxt = null;
        if (d.opens) { const o = evalDate(d.opens, rule, inputs, today); out.opensAt = o.date; opensTxt = o.text; }
        LANGS.forEach((l) => (out.explanation[l] = `${head[l]} ${U.due[l]}: ${due.text[l]}${opensTxt ? ` · ${U.opens[l]}: ${opensTxt[l]}` : ''}`));
      }
      deadlines.push(out);
    }
    const checks = (rule.checks || []).filter((c) => checkCond(c.if, rule, inputs, today)).map((c) => ({ level: c.level, text: c.text }));
    return { rule, inputs, errors, deadlines, checks };
  }

  /** Reminder ladder → concrete reminder dates (each fires at 09:00 local). */
  function reminderDates(dl) {
    const out = []; if (!dl || !dl.dueAt) return out;
    const lad = dl.ladder || { days: [0] };
    if (lad.atOpen && dl.opensAt) out.push({ key: 'open:' + dl.opensAt, date: dl.opensAt, kind: 'open' });
    for (const n of lad.days || []) { const date = D.addDays(dl.dueAt, -n); if (!dl.opensAt || !lad.atOpen || date >= dl.opensAt || n === 0) out.push({ key: `d${n}:${dl.dueAt}`, date, kind: 'before', days: n }); }
    const seen = new Set();
    return out.filter((r) => (seen.has(r.date) ? false : seen.add(r.date))).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /** Display state of a deadline on a given day. */
  function deadlineState(dl, today) {
    if (dl.state === 'done') return 'done';
    if (dl.state === 'cancelled') return 'cancelled';
    if (!dl.dueAt) return 'unknown';
    const left = D.diffDays(today, dl.dueAt);
    if (left < 0) return 'overdue';
    if (dl.opensAt && today < dl.opensAt) return 'notyet';
    if (left <= 7) return 'soon';
    return 'open';
  }

  return { computeRule, evalDate, recurringPeriod, nextPeriod, reminderDates, deadlineState, validate, withDefaults, tr };
});
