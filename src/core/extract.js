/* Mamba Cases — rule-based letter understanding (no AI, no network).
 * Detects the sender agency, the process, dates (with their role), relative response times,
 * reference numbers, amounts, payment numbers and personal identity numbers (masked).
 * Output is ONLY a proposal: the user must confirm every value before anything is saved. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text'), require('./dates'));
  else root.MCExtract = factory(root.MCText, root.MCDates);
})(typeof self !== 'undefined' ? self : this, function (T, D) {
  'use strict';
  const MONTHS = {
    januari: 1, jan: 1, februari: 2, feb: 2, mars: 3, mar: 3, april: 4, apr: 4, maj: 5, juni: 6, jun: 6, juli: 7, jul: 7, augusti: 8, aug: 8, september: 9, sept: 9, sep: 9, oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12,
    january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10, oct: 10,
    'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4, 'إبريل': 4, 'مايو': 5, 'يونيو': 6, 'يونيه': 6, 'يوليو': 7, 'يوليه': 7, 'اغسطس': 8, 'أغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
    'كانون الثاني': 1, 'شباط': 2, 'آذار': 3, 'نيسان': 4, 'أيار': 5, 'حزيران': 6, 'تموز': 7, 'آب': 8, 'أيلول': 9, 'تشرين الأول': 10, 'تشرين الثاني': 11, 'كانون الأول': 12,
  };
  const monthAlt = Object.keys(MONTHS).sort((a, b) => b.length - a.length).map((m) => m.replace(/ /g, '\\s+')).join('|');
  const NUMW = { en: 1, ett: 1, one: 1, 'två': 2, two: 2, tre: 3, three: 3, fyra: 4, four: 4, fem: 5, five: 5, sex: 6, six: 6, sju: 7, seven: 7, 'åtta': 8, eight: 8, nio: 9, nine: 9, tio: 10, ten: 10, elva: 11, tolv: 12, fjorton: 14, fourteen: 14, femton: 15, tjugo: 20, twenty: 20, trettio: 30, thirty: 30,
    'يوم': 1, 'شهر': 1, 'يومين': 2, 'ثلاثة': 3, 'ثلاث': 3, 'خمسة': 5, 'سبعة': 7, 'عشرة': 10, 'عشر': 10, 'أربعة عشر': 14, 'اربعة عشر': 14, 'ثلاثين': 30 };
  const AGENCIES = {
    migrationsverket: { strong: ['migrationsverket', 'swedish migration agency', 'مصلحة الهجرة', 'migrationsverket.se'], weak: ['uppehållstillstånd', 'uppehållstillståndskort', 'arbetstillstånd', 'medborgarskap', 'residence permit', 'asyl', 'تصريح الإقامة'] },
    skatteverket: { strong: ['skatteverket', 'swedish tax agency', 'مصلحة الضرائب', 'skatteverket.se'], weak: ['slutskattebesked', 'kvarskatt', 'deklaration', 'folkbokföring', 'flyttanmälan', 'skattekonto', 'personbevis', 'samordningsnummer'] },
    forsakringskassan: { strong: ['försäkringskassan', 'forsakringskassan', 'swedish social insurance agency', 'صندوق التأمينات'], weak: ['bostadsbidrag', 'föräldrapenning', 'barnbidrag', 'sjukpenning', 'etableringsersättning', 'tillfällig föräldrapenning'] },
    arbetsformedlingen: { strong: ['arbetsförmedlingen', 'arbetsformedlingen', 'public employment service', 'مكتب العمل'], weak: ['aktivitetsrapport', 'etableringsprogrammet', 'handlingsplan', 'aktivitetsstöd', 'arbetssökande'] },
    csn: { strong: ['centrala studiestödsnämnden', 'csn.se', ' csn '], weak: ['studiemedel', 'årsbelopp', 'fribelopp', 'studielån', 'återkrav', 'studiebidrag'] },
    bostadsformedlingen: { strong: ['bostadsförmedlingen', 'bostad.stockholm.se', 'bostadsformedlingen'], weak: ['köavgift', 'bostadskö', 'kötid', 'vilande', 'intresseanmälan'] },
    kronofogden: { strong: ['kronofogden', 'kronofogdemyndigheten', 'swedish enforcement authority', 'كرونوفوغدن'], weak: ['betalningsföreläggande', 'utslag', 'målnummer', 'utmätning', 'bestrida', 'betalningsanmärkning', 'återvinning', 'skuldsanering'] },
    transportstyrelsen: { strong: ['transportstyrelsen', 'trafikverket'], weak: ['körkort', 'körkortstillstånd', 'kunskapsprov', 'körprov', 'driving licence'] },
    1177: { strong: ['1177', 'vårdcentral', 'region stockholm', 'region skåne', 'västra götalandsregionen'], weak: ['kallelse', 'remiss', 'recept', 'mottagning', 'patient', 'vårdgivare', 'tolk', 'högkostnadsskydd'] },
  };
  const PROCESSES = [
    { rule: 'kfm.atervinning', agency: 'kronofogden', any: ['utslag'], not: ['betalningsföreläggande'] },
    { rule: 'kfm.betalningsforelaggande', agency: 'kronofogden', any: ['betalningsföreläggande', 'föreläggande', 'bestrida', 'payment order', 'أمر الدفع'] },
    { rule: 'migr.work_permit_extension', agency: 'migrationsverket', any: ['arbetstillstånd', 'work permit'] },
    { rule: 'migr.protection_extension', agency: 'migrationsverket', any: ['förlänga', 'förlängning', 'förlängt', 'extension', 'skydd', 'skyddsbehövande', 'flykting', 'تمديد', 'تصريح الإقامة'] },
    { rule: 'skv.kvarskatt', agency: 'skatteverket', any: ['kvarskatt', 'slutskattebesked', 'att betala', 'residual tax', 'final tax statement'] },
    { rule: 'skv.deklaration', agency: 'skatteverket', any: ['deklaration', 'inkomstdeklaration', 'tax return'] },
    { rule: 'skv.flyttanmalan', agency: 'skatteverket', any: ['flyttanmälan', 'flytt'] },
    { rule: 'fk.report_change', agency: 'forsakringskassan', any: ['bostadsbidrag', 'ändring', 'ändrade'] },
    { rule: 'af.activity_report', agency: 'arbetsformedlingen', any: ['aktivitetsrapport', 'aktivitetsrapportera', 'activity report', 'تقرير النشاط'] },
    { rule: 'csn.reclaim', agency: 'csn', any: ['återkrav', 'fribelopp'] },
    { rule: 'csn.annual_repayment', agency: 'csn', any: ['årsbelopp'] },
    { rule: 'bf.queue_fee', agency: 'bostadsformedlingen', any: ['köavgift', 'avgift', 'årsavgift'] },
    { rule: 'ts.foreign_licence', agency: 'transportstyrelsen', any: ['utländskt körkort', 'körkort'] },
    { rule: '1177.prescription', agency: '1177', any: ['recept'] },
    { rule: '1177.appointment', agency: '1177', any: ['kallelse', 'välkommen', 'besök', 'appointment', 'موعد'] },
  ];
  const ROLE_CUES = [
    { role: 'due', re: /(senast|sista\s+(?:dag|dagen)|förfallo(?:dag|datum)|betalas\s+senast|ska\s+vara\s+(?:bokförd|betald|inkommen)|svara\s+senast|due(?:\s+date)?|deadline|no\s+later\s+than|by|بحلول|آخر\s+موعد|في\s+موعد\s+أقصاه|قبل)\s*[:.]?\s*(?:den\s+|the\s+)?$/i },
    { role: 'expiry', re: /(giltig[t]?\s+(?:till|t\.?\s?o\.?\s?m\.?)|till\s+och\s+med|gäller\s+(?:till|t\.?\s?o\.?\s?m\.?)|t\.?\s?o\.?\s?m\.?|tillståndet\s+gäller\s+till|valid\s+(?:until|to|through)|expir(?:es|y|y\s+date)|utgångsdatum|صالح\s+حتى|تاريخ\s+الانتهاء|ينتهي\s+في)\s*[:.]?\s*(?:den\s+)?$/i },
    { role: 'start', re: /(från\s+och\s+med|fr\.?\s?o\.?\s?m\.?|gäller\s+från|valid\s+from|من\s+تاريخ|اعتباراً\s+من)\s*[:.]?\s*(?:den\s+)?$/i },
    { role: 'appointment', re: /(besöks?tid|tid\s*:|datum\s+för\s+besöket|välkommen\s+(?:den|på)|appointment|موعدك|الموعد)\s*[:.]?\s*(?:den\s+)?$/i },
    { role: 'letter', re: /(datum|daterad|beslutsdatum|beslut\s+den|utfärdat|skickat|date|التاريخ)\s*[:.]?\s*(?:den\s+)?$/i },
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const mk = (y, m, d) => { const s = `${y}-${pad(m)}-${pad(d)}`; return D.isValid(s) ? s : null; };

  function findDates(text) {
    const out = []; const push = (idx, len, date, raw) => { if (date && !out.some((o) => o.index === idx)) out.push({ index: idx, length: len, date, raw }); };
    let m;
    const reIso = /\b(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})\b/g; while ((m = reIso.exec(text))) push(m.index, m[0].length, mk(+m[1], +m[2], +m[3]), m[0]);
    const reDmy = /(?<![\d-])(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g; while ((m = reDmy.exec(text))) push(m.index, m[0].length, mk(+m[3], +m[2], +m[1]), m[0]);
    const reText = new RegExp(`(?<![\\p{L}\\d])(\\d{1,2})(?::e|:a|\\.)?\\s+(${monthAlt})\\.?,?\\s+(20\\d{2})`, 'giu');
    while ((m = reText.exec(text))) { const mo = MONTHS[m[2].toLowerCase().replace(/\s+/g, ' ')]; push(m.index, m[0].length, mk(+m[3], mo, +m[1]), m[0]); }
    const reMdy = new RegExp(`(?<![\\p{L}])(${monthAlt})\\s+(\\d{1,2}),?\\s+(20\\d{2})`, 'giu');
    while ((m = reMdy.exec(text))) { const mo = MONTHS[m[1].toLowerCase()]; if (mo) push(m.index, m[0].length, mk(+m[3], mo, +m[2]), m[0]); }
    out.sort((a, b) => a.index - b.index);
    for (const d of out) {
      const before = text.slice(Math.max(0, d.index - 60), d.index);
      const line = before.split('\n').pop();
      d.role = 'other';
      for (const c of ROLE_CUES) { if (c.re.test(line) || c.re.test(before.replace(/\s+/g, ' '))) { d.role = c.role; break; } }
      d.context = (line + d.raw + text.slice(d.index + d.length, d.index + d.length + 40).split('\n')[0]).trim();
    }
    return out;
  }
  function findDurations(text) {
    const out = []; const words = Object.keys(NUMW).sort((a, b) => b.length - a.length).join('|');
    const re = new RegExp(`(inom|within|senast\\s+inom|خلال|في\\s+غضون)\\s+(\\d{1,3}|${words})\\s*(dagar|dag|days|day|veckor|vecka|weeks|week|månader|månad|months|month|أيام|يوماً|يوما|أسابيع|أسبوع|أشهر|شهر)?`, 'giu');
    let m;
    while ((m = re.exec(text))) {
      let n = /^\d+$/.test(m[2]) ? +m[2] : NUMW[m[2].toLowerCase()]; let unit = (m[3] || '').toLowerCase();
      if (!unit && /^(شهر)$/.test(m[2])) unit = 'month'; if (!unit && /^(يوم|يومين)$/.test(m[2])) unit = 'day';
      if (!n || !unit) continue;
      const u = /^(dag|day|أيام|يوم)/.test(unit) ? 'days' : /^(veck|week|أسبوع|أسابيع)/.test(unit) ? 'weeks' : 'months';
      out.push({ index: m.index, raw: m[0], n, unit: u, days: u === 'days' ? n : u === 'weeks' ? n * 7 : null, months: u === 'months' ? n : null });
    }
    return out;
  }
  const REF_LABEL = /(ärendenummer|ärende-?id|ärende\s*nr|ärendenr|diarienummer|dnr|målnummer|mål\s*nr|målnr|referensnummer|referens|ref\.?\s*nr|vårt\s+ärende|kundnummer|case\s+(?:number|no\.?)|reference(?:\s+number)?|رقم\s+القضية|رقم\s+الملف|رقم\s+المرجع)\s*[:.#]?\s*/giu;
  function findRefs(text) {
    const out = []; let m;
    while ((m = REF_LABEL.exec(text))) {
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      const t = /^([A-ZÅÄÖ]{0,4}[\s-]?[0-9][0-9A-Z\-\/.]{2,28}[0-9A-Z])/i.exec(rest);
      if (t && /\d{3,}/.test(t[1].replace(/\D/g, ''))) out.push({ label: m[1], value: t[1].replace(/[.\s]+$/, ''), index: m.index });
    }
    return out;
  }
  function findAmounts(text) {
    const out = []; const re = /(?<![\d,])(\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)(?:,(\d{2}))?\s*(kr|kronor|sek)\b/giu; let m;
    while ((m = re.exec(text))) out.push({ raw: m[0], value: +(m[1].replace(/[ .\u00a0]/g, '') + '.' + (m[2] || '0')), index: m.index });
    return out;
  }
  function findPnr(text) {
    const out = []; const re = /(?<!\d)((?:19|20)?\d{6})[-+ ]?(\d{4})(?!\d)/g; let m;
    while ((m = re.exec(text))) { const s = m[1].slice(-6); const mo = +s.slice(2, 4), d = +s.slice(4, 6); if (mo >= 1 && mo <= 12 && ((d >= 1 && d <= 31) || (d >= 61 && d <= 91))) out.push({ raw: m[0], masked: m[1].slice(0, -6) + s + '-****', index: m.index, kind: d > 60 ? 'samordningsnummer' : 'personnummer' }); }
    return out;
  }
  function findPayment(text) {
    const r = {}; let m;
    if ((m = /\bocr(?:-?nummer)?\s*[:.]?\s*(\d[\d ]{4,30}\d)/i.exec(text))) r.ocr = m[1].replace(/\s/g, '');
    if ((m = /\bbankgiro(?:nummer)?\s*[:.]?\s*(\d{3,4}-\d{4})/i.exec(text))) r.bankgiro = m[1];
    if ((m = /\b(?:plusgiro|pg)\s*[:.]?\s*(\d{1,7}-\d)/i.exec(text))) r.plusgiro = m[1];
    return r;
  }
  function classify(text) {
    const f = ' ' + T.fold(text) + ' ';
    const scores = Object.entries(AGENCIES).map(([code, k]) => {
      let s = 0; const hits = [];
      for (const w of k.strong) { const n = f.split(T.fold(w)).length - 1; if (n) { s += 5 + Math.min(n - 1, 3); hits.push(w.trim()); } }
      for (const w of k.weak) { if (f.includes(T.fold(w))) { s += 1.5; hits.push(w); } }
      return { code, score: s, hits };
    }).sort((a, b) => b.score - a.score);
    const [a, b] = scores;
    if (!a || a.score === 0) return { agency: null, confidence: 0, candidates: scores.slice(0, 3) };
    const conf = Math.round(100 * (1 - Math.exp(-a.score / 4)) * (a.score / (a.score + (b ? b.score : 0) * 0.8)));
    return { agency: a.code, confidence: Math.max(5, Math.min(99, conf)), hits: a.hits, candidates: scores.filter((x) => x.score > 0).slice(0, 3) };
  }
  function detectProcess(text, agency) {
    const f = T.fold(text);
    for (const p of PROCESSES) {
      if (agency && p.agency !== agency) continue;
      if (p.not && p.not.some((w) => f.includes(T.fold(w)))) continue;
      const hits = p.any.filter((w) => f.includes(T.fold(w)));
      if (hits.length) return { rule: p.rule, hits };
    }
    return null;
  }
  /** Main entry. `opts.today` for proposals that need a reference date. */
  function extract(rawText, opts) {
    const text = T.clean(rawText || '');
    const cls = classify(text);
    const proc = detectProcess(text, cls.agency);
    const dates = findDates(text); const durations = findDurations(text); const refs = findRefs(text);
    const amounts = findAmounts(text); const pnr = findPnr(text); const payment = findPayment(text);
    const urls = [...new Set((text.match(/\bhttps?:\/\/[^\s)>\]]+|\bwww\.[a-z0-9.-]+\.[a-z]{2,}[^\s)>\]]*/gi) || []).map((u) => u.replace(/[.,]$/, '')))];
    const phones = [...new Set((text.match(/(?<!\d)(?:\+46\s?|0)\d{1,3}[- ]?\d{2,3}[ ]?\d{2}[ ]?\d{2,3}(?!\d)/g) || []).filter((p) => !pnr.some((x) => x.raw.includes(p.trim()))))].slice(0, 5);
    const pick = (role) => (dates.find((d) => d.role === role) || {}).date || null;
    const proposal = { agency: cls.agency, rule: proc ? proc.rule : null, refNo: refs[0] ? refs[0].value : null, dueDate: pick('due'), expiryDate: pick('expiry'), letterDate: pick('letter'), startDate: pick('start'), appointment: pick('appointment'), responseDays: null, amount: amounts[0] ? amounts[0].value : null };
    const dur = durations.find((d) => d.days) || null; if (dur) proposal.responseDays = dur.days;
    const durM = durations.find((d) => d.months) || null; if (durM) proposal.responseMonths = durM.months;
    // Language guess (for OCR feedback & display)
    const ar = (text.match(/[\u0600-\u06FF]/g) || []).length; const sv = (T.fold(text).match(/\b(och|att|det|för|är|som|med|till|inte|ska|du|din|ditt)\b/g) || []).length;
    const language = ar > 30 ? 'ar' : sv > 3 ? 'sv' : 'en';
    return { text, language, classification: cls, process: proc, dates, durations, refs, amounts, pnr, payment, urls, phones, proposal };
  }
  /** Map a proposal to the selected rule's inputs (pre-filled, editable by the user). */
  function inputsForRule(ruleId, p, today) {
    const t = today || D.today();
    switch (ruleId) {
      case 'kfm.betalningsforelaggande': return { served_date: t, response_days: p.responseDays && p.responseDays <= 14 ? p.responseDays : 10 };
      case 'kfm.atervinning': return { utslag_date: p.letterDate || t };
      case 'migr.protection_extension': case 'migr.work_permit_extension': return { permit_end: p.expiryDate || p.dueDate || '' };
      case 'migr.protection_new_permit': return { start: p.startDate || p.letterDate || '' };
      case 'skv.kvarskatt': return { pay_by: p.dueDate || '2026-11-12' };
      case 'skv.flyttanmalan': return { move_date: p.startDate || p.letterDate || t };
      case 'fk.report_change': return { change_date: p.letterDate || t };
      case 'csn.reclaim': return { decision_date: p.letterDate || t };
      case 'bf.queue_fee': return { notice_date: p.letterDate || t };
      case 'ts.foreign_licence': return {};
      case '1177.appointment': return { appointment: p.appointment || p.dueDate || '' };
      case '1177.prescription': return { runs_out: p.expiryDate || '' };
      default: return {};
    }
  }
  return { extract, classify, detectProcess, findDates, findDurations, findRefs, findAmounts, findPnr, findPayment, inputsForRule, AGENCIES };
});
