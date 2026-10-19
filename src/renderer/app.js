/* Mamba Cases — renderer. Plain JS, no framework. All untrusted text (letters, OCR) is inserted with textContent. */
'use strict';
const A = window.api;
const D = window.MCDates, R = window.MCRules, X = window.MCExtract, TX = window.MCText, I = window.MCI18n, ICS = window.MCIcs;
const S = { lang: 'en', settings: {}, info: {}, pack: null, data: null, unlocked: false, stage: 'boot', view: 'today', param: null, personFilter: '', onb: {}, tabs: {}, processing: {}, lastActivity: Date.now(), search: '' };
const t = (k, v) => I.t(S.lang, k, v);
const tr = (o) => (o == null ? '' : typeof o === 'string' ? o : o[S.lang] || o.en || '');
const STATUSES = ['planned', 'preparing', 'submitted', 'waiting', 'needs_action', 'decided', 'appealed', 'closed'];
const SEVS = ['low', 'normal', 'high', 'critical'];
const DOCTYPES = ['letter', 'decision', 'application', 'receipt', 'id', 'contract', 'payslip', 'grade', 'invoice', 'other'];
const PERMITS = ['none', 'refugee', 'subsidiary', 'work', 'family', 'study', 'eu', 'put', 'citizen', 'other'];
const COLORS = ['#ff7a00', '#2563eb', '#16a34a', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#475569'];
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowIso = () => new Date().toISOString();
const today = () => D.today();

/* ---------- DOM helper ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv === undefined) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') { /* never used for untrusted text */ el.innerHTML = v; }
    else if (k === 'value') el.value = v; else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) { if (c === null || c === undefined || c === false) continue; el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  return el;
}
const bdi = (s) => h('bdi', { class: 'ltr', dir: 'ltr' }, s);
const icon = (s) => h('span', { class: 'ic', 'aria-hidden': 'true' }, s);
function toast(msg, ms) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), ms || 2600); }
function modal(title, body, buttons, opts) {
  const root = document.getElementById('modal-root');
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const foot = h('div', { class: 'mf' }, (buttons || [{ label: t('close'), value: null }]).map((b) => h('button', { class: b.cls || '', 'data-k': b.key || '', onclick: async () => { if (b.onClick) { const r = await b.onClick(); if (r === false) return; close(r === undefined ? b.value : r); } else close(b.value); } }, b.label)));
    const back = h('div', { class: 'mback', onmousedown: (e) => { if (e.target === back && !(opts && opts.sticky)) close(null); } },
      h('div', { class: 'modal' + (opts && opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'mh' }, h('h2', null, title), h('button', { class: 'ghost', 'aria-label': t('close'), onclick: () => close(null) }, '✕')), h('div', { class: 'mb' }, body), foot));
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    root.append(back); const f = back.querySelector('input,select,textarea'); if (f) f.focus();
  });
}
async function confirmBox(msg) { return !!(await modal(t('confirm'), h('p', null, msg), [{ label: t('cancel'), value: false }, { label: t('yes'), value: true, cls: 'primary', key: 'yes' }])); }

/* ---------- formatting ---------- */
function locale() { if (S.lang === 'ar') return 'ar-u-ca-gregory-nu-' + (S.settings.numerals === 'arabic' ? 'arab' : 'latn'); return S.lang === 'sv' ? 'sv-SE' : 'en-GB'; }
function fmtDate(iso, withWeekday) { if (!iso) return '—'; try { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', weekday: withWeekday ? 'short' : undefined, timeZone: 'UTC' }).format(new Date(iso.slice(0, 10) + 'T00:00:00Z')); } catch (_) { return iso; } }
function num(n) { return S.lang === 'ar' && S.settings.numerals === 'arabic' ? String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : String(n); }
function rel(iso) { const n = D.diffDays(today(), iso); if (n === 0) return t('today'); if (n === 1) return t('tomorrow'); if (n > 1) return t('in_days', { n: num(n) }); return t('days_ago', { n: num(-n) }); }
const agencyOf = (code) => (S.pack.agencies.find((a) => a.code === code) || S.pack.agencies.find((a) => a.code === 'other'));
const agencyName = (code) => { const a = agencyOf(code); return S.lang === 'sv' ? a.sv : S.lang === 'ar' ? a.ar : a.en === a.sv ? a.sv : `${a.sv}`; };
const ruleById = (id) => S.pack.rules.find((r) => r.id === id);
const personById = (id) => (S.data.people || []).find((p) => p.id === id);
const caseById = (id) => (S.data.cases || []).find((c) => c.id === id);
const docById = (id) => (S.data.documents || []).find((d) => d.id === id);
function avatar(p, size) { const s = size || 28; return h('span', { class: 'avatar', title: p ? p.name : '', style: { background: (p && p.color) || '#999', width: s + 'px', height: s + 'px' } }, p ? (p.name || '?').trim().slice(0, 1).toUpperCase() : '?'); }
function sevChip(sev) { return h('span', { class: 'chip ' + ({ critical: 'red', high: 'amber', normal: 'blue', low: 'gray' }[sev] || 'gray') }, t('sev_' + sev)); }
function statusChip(st) { const c = { needs_action: 'red', waiting: 'blue', submitted: 'blue', decided: 'green', closed: 'gray', appealed: 'amber', preparing: 'amber', planned: 'gray' }[st] || 'gray'; return h('span', { class: 'chip ' + c }, t('st_' + st)); }
function dueChip(dl) {
  const st = R.deadlineState(dl, today());
  if (st === 'done') return h('span', { class: 'chip green' }, '✓ ' + t('state_done'));
  if (st === 'overdue') return h('span', { class: 'chip red' }, t('overdue') + ' · ' + rel(dl.dueAt));
  if (st === 'notyet') return h('span', { class: 'chip gray' }, t('opens_in', { n: num(D.diffDays(today(), dl.opensAt)) }));
  const n = D.diffDays(today(), dl.dueAt);
  return h('span', { class: 'chip ' + (n <= 3 ? 'red' : n <= 14 ? 'amber' : 'green') }, rel(dl.dueAt));
}
/** Countdown ring: colour shifts green → amber → red; pulses in the last 48 h. */
function ring(dl, size) {
  const s = size || 40, r = s / 2 - 4, c = 2 * Math.PI * r; const td = today();
  const left = D.diffDays(td, dl.dueAt); const span = dl.opensAt ? Math.max(1, D.diffDays(dl.opensAt, dl.dueAt)) : 30;
  const frac = dl.state === 'done' ? 1 : Math.max(0, Math.min(1, left / span));
  const col = dl.state === 'done' ? 'var(--ok)' : left < 0 ? 'var(--bad)' : left <= 3 ? 'var(--bad)' : left <= 14 ? 'var(--warn)' : 'var(--ok)';
  const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('class', 'ring' + (left >= 0 && left <= 2 && dl.state !== 'done' ? ' pulse' : ''));
  const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
  mk('circle', { cx: s / 2, cy: s / 2, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': 4 });
  mk('circle', { cx: s / 2, cy: s / 2, r, fill: 'none', stroke: col, 'stroke-width': 4, 'stroke-dasharray': `${c * frac} ${c}`, 'stroke-linecap': 'round', transform: `rotate(-90 ${s / 2} ${s / 2})` });
  const tx = mk('text', { x: s / 2, y: s / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: col }); tx.textContent = dl.state === 'done' ? '✓' : left < 0 ? '!' : num(left);
  return svg;
}

/* ---------- persistence ---------- */
function emptyData() { return { version: 1, people: [], cases: [], deadlines: [], documents: [], audit: [], meta: { created: nowIso() } }; }
let saveTimer = null;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try { await A.save(S.data); } catch (e) { toast(t('error', { e: e.message })); } }, 250); }
async function flush() { clearTimeout(saveTimer); if (S.data && S.unlocked) await A.save(S.data); }
function audit(entity, id, action, details) { S.data.audit = S.data.audit || []; S.data.audit.push({ at: nowIso(), entity, id, action, details: details || null }); if (S.data.audit.length > 3000) S.data.audit.splice(0, S.data.audit.length - 3000); }
function commit(fn, rerender) { fn(S.data); persist(); if (rerender !== false) render(); }
/** Recurring deadlines (e.g. AF report 1st–14th): roll past periods forward, recording missed ones. */
function rollRecurring() {
  let changed = false; const td = today();
  for (const dl of S.data.deadlines) {
    if (dl.kind !== 'recurring' || dl.state !== 'open' || !dl.recurrence) continue;
    let guard = 0;
    while (dl.dueAt < td && guard++ < 60) { dl.history = dl.history || []; dl.history.push({ period: dl.period, dueAt: dl.dueAt, state: 'missed', at: nowIso() }); const n = R.nextPeriod(dl.recurrence, dl.dueAt); Object.assign(dl, n); changed = true; }
  }
  if (changed) persist();
}

/* ---------- boot, lock, welcome ---------- */
async function boot() {
  S.info = await A.info(); if (S.info.fakeToday) window.__MC_FAKE_TODAY = S.info.fakeToday; S.settings = await A.settings(); S.pack = await A.pack();
  const sys = (navigator.language || 'en').slice(0, 2); S.lang = S.settings.lang || (['sv', 'ar'].includes(sys) ? sys : 'en');
  applyLang();
  const st = await A.vaultStatus(); S.stage = st.exists ? 'lock' : 'welcome'; S.vault = st;
  render();
  A.onLockNow(() => { if (S.unlocked) lockNow(); });
  A.onOpenDeadline((id) => { const dl = S.data && S.data.deadlines.find((d) => d.id === id); if (dl && dl.caseId) go('case', dl.caseId); });
  ['mousemove', 'keydown', 'mousedown', 'wheel'].forEach((ev) => window.addEventListener(ev, () => (S.lastActivity = Date.now()), { passive: true }));
  setInterval(() => { const m = +S.settings.autoLockMin || 0; if (S.unlocked && m > 0 && Date.now() - S.lastActivity > m * 60e3) lockNow(); }, 15e3);
  let lastDay = today(); setInterval(() => { if (today() !== lastDay) { lastDay = today(); if (S.unlocked) { rollRecurring(); render(); } } }, 60e3);
  setupDrop();
}
function applyLang() {
  document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('theme-dark', S.settings.theme === 'dark'); document.body.classList.toggle('reduced', !!S.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.style.setProperty('--fs', Math.round(14 * (S.settings.fontScale || 1)) + 'px');
}
async function setLang(l) { S.lang = l; S.settings = await A.setSettings({ lang: l }); applyLang(); render(); }
async function lockNow() { await flush().catch(() => {}); await A.lock(); S.data = null; S.unlocked = false; S.stage = 'lock'; document.getElementById('modal-root').innerHTML = ''; render(); }
function langSwitch() { return h('div', { class: 'lang' }, ['en', 'sv', 'ar'].map((l) => h('button', { class: S.lang === l ? 'on' : '', onclick: () => setLang(l), title: { en: 'English', sv: 'Svenska', ar: 'العربية' }[l] }, { en: 'EN', sv: 'SV', ar: 'ع' }[l]))); }

function viewLock() {
  const msg = h('div', { class: 'small', style: { color: 'var(--bad)', minHeight: '20px' } });
  const inp = h('input', { class: 'pinin', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 12, 'aria-label': t('pin'), id: 'pin' });
  const submit = async () => {
    const r = await A.unlock(inp.value); inp.value = '';
    if (r.ok) { S.data = Object.assign(emptyData(), r.data || {}); S.unlocked = true; S.stage = 'app'; S.lastActivity = Date.now(); rollRecurring(); render(); return; }
    msg.textContent = r.error === 'keystore' ? t('keystore_err') : r.waitMs ? t('pin_wait', { s: Math.ceil(r.waitMs / 1000) }) : t('pin_wrong', { n: r.failed });
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const pad = h('div', { class: 'pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '→'].map((k) => h('button', { onclick: () => { if (k === '⌫') inp.value = inp.value.slice(0, -1); else if (k === '→') submit(); else if (inp.value.length < 12) inp.value += k; inp.focus(); } }, k)));
  setTimeout(() => inp.focus(), 50);
  return h('div', { class: 'center' }, h('div', { class: 'card lockbox' }, h('div', { class: 'logo' }, 'MC'), h('h2', null, t('appName')), h('p', { class: 'muted' }, t('unlock_title')), inp, msg, pad, h('button', { class: 'primary', style: { width: '100%' }, onclick: submit, id: 'unlockBtn' }, t('unlock')), h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } }, langSwitch())));
}
function viewWelcome() {
  const o = S.onb;
  if (S.stage === 'welcome') {
    return h('div', { class: 'center' }, h('div', { class: 'card welcome' },
      h('div', { class: 'row' }, h('div', { class: 'logo' }, 'MC'), h('div', null, h('h1', { style: { margin: 0 } }, t('welcome_title')), h('div', { class: 'muted' }, t('tagline')))),
      h('h3', null, t('welcome_lang')),
      h('div', { class: 'langbtns' }, [['en', 'English'], ['sv', 'Svenska'], ['ar', 'العربية']].map(([l, n]) => h('button', { class: S.lang === l ? 'on' : '', onclick: () => setLang(l), id: 'lang-' + l }, n))),
      h('h3', null, t('privacy_title')), h('ul', { class: 'promise' }, ['privacy_1', 'privacy_2', 'privacy_3', 'privacy_4'].map((k) => h('li', null, t(k)))),
      h('div', { class: 'row end' }, h('button', { class: 'primary', id: 'startBtn', onclick: () => { S.stage = 'pin'; render(); } }, t('start') + ' →'))));
  }
  if (S.stage === 'pin') {
    const a = h('input', { type: 'password', inputmode: 'numeric', maxlength: 12, class: 'pinin', id: 'pin1' }); const b = h('input', { type: 'password', inputmode: 'numeric', maxlength: 12, class: 'pinin', id: 'pin2' });
    const msg = h('div', { class: 'small', style: { color: 'var(--bad)', minHeight: '20px' } });
    const go2 = () => { if (!/^\d{4,12}$/.test(a.value)) { msg.textContent = t('pin_short'); return; } if (a.value !== b.value) { msg.textContent = t('pin_mismatch'); return; } o.pin = a.value; S.stage = 'you'; render(); };
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') go2(); });
    return h('div', { class: 'center' }, h('div', { class: 'card lockbox' }, h('div', { class: 'logo' }, '🔒'), h('h2', null, t('pin_create')), h('p', { class: 'muted small' }, t('pin_create_help')),
      h('label', null, t('pin'), a), h('label', { style: { marginTop: '8px' } }, t('pin_repeat'), b), msg,
      h('p', { class: 'small muted' }, S.vault && S.vault.keystore ? t('s_keystore_on') : t('s_keystore_off')),
      h('div', { class: 'row between' }, h('button', { onclick: () => { S.stage = 'welcome'; render(); } }, t('back')), h('button', { class: 'primary', id: 'pinNext', onclick: go2 }, t('next')))));
  }
  if (S.stage === 'you') {
    o.me = o.me || { name: '', permitType: 'none' };
    const f = personForm(o.me, true);
    return h('div', { class: 'center' }, h('div', { class: 'card welcome' }, h('h1', null, t('onb_you')), h('p', { class: 'muted' }, t('onb_you_help')), f,
      h('label', { class: 'chk', style: { marginTop: '10px' } }, h('input', { type: 'checkbox', id: 'onbLicence', checked: o.licence, onchange: (e) => (o.licence = e.target.checked) }), t('onb_licence')),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'onbAf', checked: o.af, onchange: (e) => (o.af = e.target.checked) }), t('onb_af')),
      h('div', { class: 'row between', style: { marginTop: '14px' } }, h('button', { onclick: () => { S.stage = 'pin'; render(); } }, t('back')), h('button', { class: 'primary', id: 'youNext', onclick: () => { o.props = proposals(o); S.stage = 'proposals'; render(); } }, t('next')))));
  }
  if (S.stage === 'proposals') {
    const list = o.props || [];
    return h('div', { class: 'center' }, h('div', { class: 'card welcome' }, h('h1', null, t('onb_proposals')), h('p', { class: 'muted' }, list.length ? t('onb_proposals_help') : t('onb_none')),
      list.map((p) => { const r = ruleById(p.ruleId); const c = R.computeRule(S.pack, p.ruleId, p.inputs, { today: today() });
        return h('label', { class: 'prop' }, h('input', { type: 'checkbox', checked: p.on, onchange: (e) => (p.on = e.target.checked) }), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, h('span', { class: 'dot', style: { background: agencyOf(r.agency).color, marginInlineEnd: '6px' } }), tr(r.name)), h('div', { class: 'small muted' }, agencyName(r.agency)),
          c.deadlines.map((d) => h('div', { class: 'small' }, '• ', tr(d.title), ': ', h('b', null, fmtDate(d.dueAt)), d.opensAt ? ` (${t('dl_opens')}: ${fmtDate(d.opensAt)})` : ''))));
      }),
      h('div', { class: 'row between', style: { marginTop: '14px' } }, h('button', { onclick: () => { S.stage = 'you'; render(); } }, t('back')), h('button', { class: 'primary', id: 'finishOnb', onclick: finishOnboarding }, t('onb_finish')))));
  }
}
function proposals(o) {
  const me = o.me; const out = [];
  if (me.permitEnd && ['refugee', 'subsidiary', 'family', 'other'].includes(me.permitType)) out.push({ ruleId: 'migr.protection_extension', inputs: { permit_end: me.permitEnd, passport_expiry: me.permitType === 'family' ? me.passportExpiry : '' }, on: true });
  if (me.permitEnd && me.permitType === 'work') out.push({ ruleId: 'migr.work_permit_extension', inputs: { permit_end: me.permitEnd, permit_start: me.permitStart || '' }, on: true });
  if (o.af) out.push({ ruleId: 'af.activity_report', inputs: {}, on: true });
  if (o.licence && me.folkbokford) out.push({ ruleId: 'ts.foreign_licence', inputs: { folkbokford: me.folkbokford }, on: true });
  out.push({ ruleId: 'skv.deklaration', inputs: {}, on: true });
  return out;
}
async function finishOnboarding() {
  const o = S.onb; const data = emptyData();
  const me = { id: uid(), relation: 'self', color: COLORS[0], createdAt: nowIso(), ...o.me };
  if (!me.name) me.name = S.lang === 'ar' ? 'أنا' : S.lang === 'sv' ? 'Jag' : 'Me';
  data.people.push(me); S.data = data;
  for (const p of o.props || []) if (p.on) createCaseFromRule(p.ruleId, p.inputs, me.id, {}, true);
  audit('app', null, 'created');
  const r = await A.vaultCreate(o.pin, S.data);
  if (r.ok) { S.onb = {}; S.unlocked = true; S.stage = 'app'; S.view = 'today'; render(); }
}

/* ---------- shell ---------- */
function go(view, param) { S.view = view; S.param = param || null; S.search = ''; render(); const c = document.querySelector('.content'); if (c) c.scrollTop = 0; }
function inboxCount() { return (S.data.documents || []).filter((d) => !d.reviewed).length; }
function render() {
  const app = document.getElementById('app'); app.innerHTML = '';
  if (S.stage === 'boot') return;
  if (S.stage === 'lock') { app.append(viewLock()); return; }
  if (S.stage !== 'app') { app.append(viewWelcome()); return; }
  const navs = [['today', '🏠', 'nav_today'], ['cases', '📁', 'nav_cases'], ['people', '👥', 'nav_people'], ['inbox', '📥', 'nav_inbox', inboxCount()], ['docs', '🗂️', 'nav_docs'], ['timeline', '📈', 'nav_timeline'], ['rules', '📜', 'nav_rules'], ['glossary', '📖', 'nav_glossary'], ['settings', '⚙️', 'nav_settings']];
  const side = h('nav', { class: 'side' }, h('div', { class: 'brand', onclick: () => go('today') }, h('div', { class: 'logo' }, 'MC'), h('div', { class: 'bn' }, t('appName'))),
    navs.map(([v, ic, k, badge]) => h('button', { class: 'nav' + (S.view === v || (v === 'cases' && S.view === 'case') || (v === 'inbox' && S.view === 'review') ? ' on' : ''), id: 'nav-' + v, onclick: () => go(v) }, icon(ic), h('span', null, t(k)), badge ? h('span', { class: 'badge' }, num(badge)) : null)),
    h('div', { class: 'foot' }, `v${S.info.version} · ${t('pack_version')} ${S.pack.version}`));
  const people = S.data.people || [];
  const top = h('header', { class: 'top' },
    globalSearch(),
    people.length > 1 ? h('select', { 'aria-label': t('person'), onchange: (e) => { S.personFilter = e.target.value; render(); } }, h('option', { value: '' }, t('all_people')), people.map((p) => h('option', { value: p.id, selected: S.personFilter === p.id }, p.name))) : null,
    h('div', { class: 'grow' }),
    h('button', { class: 'primary', id: 'newBtn', onclick: quickAdd }, '＋ ' + t('new')),
    langSwitch(),
    h('button', { title: t('lock'), id: 'lockBtn', onclick: lockNow }, '🔒'));
  const views = { today: viewToday, cases: viewCases, case: viewCase, people: viewPeople, inbox: viewInbox, review: viewReview, docs: viewDocs, timeline: viewTimeline, rules: viewRules, glossary: viewGlossary, settings: viewSettings };
  let content; try { content = (views[S.view] || viewToday)(); } catch (e) { console.error(e); content = h('div', { class: 'card' }, t('error', { e: e.message })); }
  app.append(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, h('main', { class: 'content' }, content))));
}
function globalSearch() {
  const box = h('div', { class: 'sres hidden' });
  const inp = h('input', { type: 'search', placeholder: t('search_ph'), id: 'gsearch', 'aria-label': t('search_ph'),
    oninput: (e) => {
      const q = e.target.value; box.innerHTML = ''; if (q.trim().length < 2) { box.classList.add('hidden'); return; }
      const cases = TX.search(S.data.cases, q, [{ name: 'title', get: (c) => c.title, weight: 3 }, { name: 'ref', get: (c) => c.refNo, weight: 3 }, { name: 'notes', get: (c) => c.notes, weight: 1 }, { name: 'agency', get: (c) => agencyName(c.agency), weight: 1 }]).slice(0, 6);
      const docs = TX.search(S.data.documents, q, [{ name: 'title', get: (d) => d.title || d.name, weight: 3 }, { name: 'text', get: (d) => d.text, weight: 1 }]).slice(0, 6);
      const dls = TX.search(S.data.deadlines, q, [{ name: 'title', get: (d) => tr(d.title), weight: 2 }]).slice(0, 4);
      cases.forEach((r) => box.append(h('div', { class: 'it', onclick: () => go('case', r.rec.id) }, '📁 ', h('b', null, r.rec.title), ' ', r.rec.refNo ? bdi(r.rec.refNo) : '', h('div', { class: 'small muted' }, agencyName(r.rec.agency)))));
      dls.forEach((r) => box.append(h('div', { class: 'it', onclick: () => r.rec.caseId && go('case', r.rec.caseId) }, '⏰ ', tr(r.rec.title), ' — ', fmtDate(r.rec.dueAt))));
      docs.forEach((r) => box.append(h('div', { class: 'it', onclick: () => openDoc(r.rec.id) }, '📄 ', h('b', null, r.rec.title || r.rec.name), h('div', { class: 'small muted' }, TX.snippet(r.rec.text || '', q, 110)))));
      if (!box.childNodes.length) box.append(h('div', { class: 'it muted' }, t('results', { n: 0 })));
      box.classList.remove('hidden');
    }, onblur: () => setTimeout(() => box.classList.add('hidden'), 200) });
  return h('div', { class: 'search' }, h('span', { class: 'si' }, '🔍'), inp, box);
}
async function quickAdd() {
  const v = await modal(t('new'), h('div', { class: 'col' },
    h('button', { onclick: (e) => e.target.closest('.mback').querySelector('[data-k=case]').click() }, '📁 ' + t('new_case')),
    h('button', { id: 'qaRule', onclick: () => { document.querySelector('.mback').remove(); ruleModal({}); } }, '📜 ' + t('add_from_rule')),
    h('button', { onclick: () => { document.querySelector('.mback').remove(); go('inbox'); } }, '📥 ' + t('nav_inbox')),
    h('button', { onclick: () => { document.querySelector('.mback').remove(); editPerson(null); } }, '👤 ' + t('add_person'))), [{ label: t('cancel'), value: null }, { label: t('new_case'), value: 'case', key: 'case', cls: 'primary' }]);
  if (v === 'case') editCase(null);
}
const visible = (x) => !S.personFilter || x.personId === S.personFilter;

/* ---------- Today ---------- */
function viewToday() {
  const td = today(); const dls = S.data.deadlines.filter(visible);
  const open = dls.filter((d) => d.state === 'open' && d.dueAt && (D.diffDays(td, d.dueAt) <= 60 || (d.opensAt && d.opensAt <= td)));
  open.sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : SEVS.indexOf(b.severity) - SEVS.indexOf(a.severity)));
  const dueCard = h('section', { class: 'card', id: 'dueCard' }, h('h2', null, '⏰ ', t('due_soon')), open.length ? open.map(deadlineRow) : h('div', { class: 'empty' }, h('span', { class: 'big' }, '🌤️'), t('nothing_due')));
  const waiting = S.data.cases.filter(visible).filter((c) => ['submitted', 'waiting'].includes(c.status));
  const waitCard = h('section', { class: 'card', id: 'waitCard' }, h('h2', null, '⏳ ', t('waiting')), waiting.length ? waiting.map((c) => h('div', { class: 'item', onclick: () => go('case', c.id) }, h('span', { class: 'dot', style: { background: agencyOf(c.agency).color } }), h('div', { class: 'grow' }, h('div', { class: 't' }, c.title), h('div', { class: 's' }, agencyName(c.agency), c.refNo ? ' · ' : '', c.refNo ? bdi(c.refNo) : '', c.submittedAt ? ` · ${t('submitted_at')} ${fmtDate(c.submittedAt)}` : '')), c.expectedDecisionAt ? h('span', { class: 'chip blue' }, t('expected') + ' ' + fmtDate(c.expectedDecisionAt)) : h('span', { class: 'chip gray' }, t('no_expected')))) : h('div', { class: 'empty' }, t('nothing_waiting')));
  const n = inboxCount();
  const inboxCard = h('section', { class: 'card item', onclick: () => go('inbox'), style: { cursor: 'pointer' } }, h('span', { style: { fontSize: '26px' } }, '📥'), h('div', { class: 'grow' }, h('div', { class: 't' }, t('inbox_review')), h('div', { class: 's' }, n ? t('reviewed_n', { n: num(n) }) : t('no_inbox'))), n ? h('span', { class: 'badge' }, num(n)) : null);
  // AF progress (1st–14th)
  const af = dls.find((d) => d.ruleId === 'af.activity_report' && d.state === 'open');
  let afCard = null;
  if (af) {
    const day = +td.slice(8, 10); const inWin = af.opensAt <= td && td <= af.dueAt; const lastDone = (af.history || []).slice(-1)[0]; const reportedThis = lastDone && lastDone.state === 'done' && lastDone.at && D.today(new Date(lastDone.at)).slice(0, 7) === td.slice(0, 7);
    afCard = h('section', { class: 'card af', id: 'afCard' }, h('h2', null, '📝 ', t('af_progress')), h('div', { class: 'row between small' }, h('span', null, reportedThis ? t('af_done') : inWin ? t('af_day', { d: num(Math.min(day, 14)) }) : t('af_open')), dueChip(af)),
      h('div', { class: 'bar', style: { marginTop: '6px' } }, h('div', { style: { width: (reportedThis ? 100 : inWin ? Math.round((Math.min(day, 14) / 14) * 100) : 0) + '%', background: reportedThis ? 'var(--ok)' : day >= 13 && inWin ? 'var(--bad)' : undefined } })),
      h('div', { class: 'ticks' }, h('span', null, '1'), h('span', null, '10'), h('span', null, '13'), h('span', null, '14')),
      !reportedThis ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'sm', onclick: () => A.openUrl('https://arbetsformedlingen.se/for-arbetssokande/arbetslos---vad-hander-nu/aktivitetsrapportera') }, '↗ ' + t('open_portal')), h('button', { class: 'sm primary', onclick: () => markDone(af) }, '✓ ' + t('mark_done'))) : null);
  }
  // expiries
  const exp = [];
  for (const p of S.data.people.filter((p) => !S.personFilter || p.id === S.personFilter)) {
    if (p.permitEnd) exp.push({ date: p.permitEnd, label: `${p.name}: ${t('permit_end')}`, person: p });
    if (p.passportExpiry) exp.push({ date: p.passportExpiry, label: `${p.name}: ${t('passport_expiry')}`, person: p });
  }
  for (const d of S.data.documents.filter(visible)) if (d.expiresAt) exp.push({ date: d.expiresAt, label: d.title || d.name, doc: d });
  const expSoon = exp.filter((e) => D.diffDays(td, e.date) <= 365).sort((a, b) => (a.date < b.date ? -1 : 1));
  const expCard = expSoon.length ? h('section', { class: 'card' }, h('h2', null, '🪪 ', t('expiries')), expSoon.map((e) => { const n2 = D.diffDays(td, e.date); return h('div', { class: 'item', onclick: () => (e.doc ? openDoc(e.doc.id) : editPerson(e.person)) }, h('div', { class: 'grow' }, h('div', { class: 't' }, e.label), h('div', { class: 's' }, fmtDate(e.date))), h('span', { class: 'chip ' + (n2 < 0 ? 'red' : n2 <= 60 ? 'amber' : 'green') }, rel(e.date))); })) : null;
  // warnings: rule checks + passport vs permit
  const warns = [];
  for (const d of dls) if (d.state === 'open' && d.checks) for (const c of d.checks) warns.push(tr(c.text));
  for (const p of S.data.people) if (p.permitType === 'family' && p.passportExpiry && p.permitEnd && p.passportExpiry < D.addYears(p.permitEnd, 2)) warns.push(`${p.name}: ${t('passport_warn')}`);
  const warnCard = warns.length ? h('section', { class: 'card', id: 'warnCard' }, h('h2', null, '⚠️ ', t('warnings')), [...new Set(warns)].map((w) => h('div', { class: 'warnbox' }, w))) : null;
  return h('div', null, h('div', { class: 'row between' }, h('h1', null, t('today_title')), h('div', { class: 'muted' }, fmtDate(td, true))),
    h('div', { class: 'dash' }, h('div', { class: 'col', style: { gap: '16px' } }, warnCard, dueCard, waitCard), h('div', { class: 'col', style: { gap: '16px' } }, inboxCard, afCard, expCard)));
}
function deadlineRow(dl) {
  const c = caseById(dl.caseId); const p = personById(dl.personId || (c && c.personId));
  return h('div', { class: 'item', 'data-dl': dl.id, onclick: (e) => { if (e.target.closest('button')) return; if (c) go('case', c.id); } },
    ring(dl), h('div', { class: 'grow' }, h('div', { class: 't' }, tr(dl.title), dl.estimated ? h('span', { class: 'chip amber', style: { marginInlineStart: '6px' } }, t('estimate')) : null),
      h('div', { class: 's' }, h('span', { class: 'dot', style: { background: agencyOf(dl.agency || (c && c.agency)).color, marginInlineEnd: '5px' } }), agencyName(dl.agency || (c && c.agency)), c ? ' · ' + c.title : '', ' · ', fmtDate(dl.dueAt), dl.kind === 'window' && dl.opensAt && dl.opensAt <= today() ? ' · ' + t('window_open') : '')),
    p && S.data.people.length > 1 ? avatar(p, 24) : null, sevChip(dl.severity), dueChip(dl),
    h('button', { class: 'sm', title: t('mark_done'), onclick: () => markDone(dl) }, '✓'));
}

/* ---------- Cases ---------- */
function nextDeadline(c) { return S.data.deadlines.filter((d) => d.caseId === c.id && d.state === 'open' && d.dueAt).sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))[0]; }
function viewCases() {
  const g = S.tabs.caseGroup || 'agency'; const showClosed = !!S.tabs.showClosed;
  const list = S.data.cases.filter(visible).filter((c) => showClosed || c.status !== 'closed');
  const key = (c) => (g === 'agency' ? c.agency : g === 'status' ? c.status : c.personId);
  const label = (k) => (g === 'agency' ? agencyName(k) : g === 'status' ? t('st_' + k) : (personById(k) || {}).name || '—');
  const groups = {}; list.forEach((c) => (groups[key(c)] = groups[key(c)] || []).push(c));
  return h('div', null, h('div', { class: 'row between' }, h('h1', null, t('cases_title')), h('div', { class: 'row' },
    h('label', { class: 'chk small' }, h('input', { type: 'checkbox', checked: showClosed, onchange: (e) => { S.tabs.showClosed = e.target.checked; render(); } }), t('show_closed')),
    h('span', { class: 'small muted' }, t('group_by')), h('select', { onchange: (e) => { S.tabs.caseGroup = e.target.value; render(); } }, ['agency', 'status', 'person'].map((x) => h('option', { value: x, selected: g === x }, t('g_' + x)))),
    h('button', { class: 'primary', id: 'newCaseBtn', onclick: () => editCase(null) }, '＋ ' + t('new_case')))),
    list.length ? Object.entries(groups).map(([k, cs]) => h('section', { class: 'card', style: { marginBottom: '14px' } }, h('h2', null, g === 'agency' ? h('span', { class: 'dot', style: { background: agencyOf(k).color, marginInlineEnd: '8px' } }) : null, label(k), ' ', h('span', { class: 'muted small' }, `(${num(cs.length)})`)),
      h('table', null, h('thead', null, h('tr', null, h('th', null, t('case_title')), h('th', null, t('ref_no')), h('th', null, t('status')), h('th', null, t('next_deadline')), h('th', null, t('person')))),
        h('tbody', null, cs.map((c) => { const nd = nextDeadline(c); const p = personById(c.personId); return h('tr', { class: 'click', onclick: () => go('case', c.id) }, h('td', null, h('b', null, c.title)), h('td', null, c.refNo ? bdi(c.refNo) : '—'), h('td', null, statusChip(c.status)), h('td', null, nd ? h('div', { class: 'row' }, dueChip(nd), h('span', { class: 'small muted' }, tr(nd.title))) : h('span', { class: 'muted' }, t('none'))), h('td', null, p ? h('div', { class: 'row' }, avatar(p, 22), p.name) : '—')); })))))
      : h('div', { class: 'card empty' }, h('span', { class: 'big' }, '📂'), t('no_cases')));
}
function newCase(fields) {
  const me = S.data.people.find((p) => p.relation === 'self') || S.data.people[0];
  return { id: uid(), personId: S.personFilter || (me && me.id) || null, agency: 'other', title: '', refNo: '', status: 'planned', priority: 'normal', openedAt: today(), notes: '', portalUrl: '', officer: {}, history: [], checklist: [], createdAt: nowIso(), updatedAt: nowIso(), ...fields };
}
async function editCase(c) {
  const isNew = !c; const f = isNew ? newCase({}) : JSON.parse(JSON.stringify(c));
  const fld = (k, type) => h('input', { type: type || 'text', value: f[k] || '', oninput: (e) => (f[k] = e.target.value), name: k });
  const body = h('div', { class: 'col' },
    h('label', null, t('case_title'), h('input', { value: f.title, id: 'caseTitle', oninput: (e) => (f.title = e.target.value) })),
    h('div', { class: 'grid2' },
      h('label', null, t('agency'), h('select', { id: 'caseAgency', onchange: (e) => { f.agency = e.target.value; if (!f.portalUrl) f.portalUrl = agencyOf(f.agency).portal; } }, S.pack.agencies.map((a) => h('option', { value: a.code, selected: f.agency === a.code }, S.lang === 'ar' ? a.ar : S.lang === 'sv' ? a.sv : a.en)))),
      h('label', null, t('person'), h('select', { onchange: (e) => (f.personId = e.target.value) }, S.data.people.map((p) => h('option', { value: p.id, selected: f.personId === p.id }, p.name)))),
      h('label', null, t('ref_no'), h('input', { value: f.refNo, dir: 'ltr', id: 'caseRef', oninput: (e) => (f.refNo = e.target.value) })),
      h('label', null, t('priority'), h('select', { onchange: (e) => (f.priority = e.target.value) }, SEVS.map((s) => h('option', { value: s, selected: f.priority === s }, t('pr_' + s))))),
      h('label', null, t('status'), h('select', { onchange: (e) => (f.status = e.target.value) }, STATUSES.map((s) => h('option', { value: s, selected: f.status === s }, t('st_' + s))))),
      h('label', null, t('opened'), fld('openedAt', 'date')),
      h('label', null, t('submitted_at'), fld('submittedAt', 'date')),
      h('label', null, t('expected_decision'), fld('expectedDecisionAt', 'date')),
      h('label', null, t('portal'), h('input', { value: f.portalUrl || '', dir: 'ltr', oninput: (e) => (f.portalUrl = e.target.value) })),
      h('label', null, t('officer'), h('input', { value: (f.officer && f.officer.name) || '', oninput: (e) => (f.officer = { ...f.officer, name: e.target.value }) })),
      h('label', null, t('phone'), h('input', { value: (f.officer && f.officer.phone) || '', dir: 'ltr', oninput: (e) => (f.officer = { ...f.officer, phone: e.target.value }) })),
      h('label', null, t('email'), h('input', { value: (f.officer && f.officer.email) || '', dir: 'ltr', oninput: (e) => (f.officer = { ...f.officer, email: e.target.value }) }))));
  const ok = await modal(isNew ? t('new_case') : t('edit'), body, [{ label: t('cancel'), value: false }, { label: t('save'), value: true, cls: 'primary', key: 'save', onClick: () => (f.title.trim() ? true : (toast(t('required') + ': ' + t('case_title')), false)) }]);
  if (!ok) return;
  commit((d) => {
    f.updatedAt = nowIso();
    if (isNew) { if (!f.portalUrl) f.portalUrl = agencyOf(f.agency).portal; f.history.push({ from: null, to: f.status, at: nowIso(), note: '' }); d.cases.push(f); audit('case', f.id, 'create'); }
    else { if (c.status !== f.status) f.history.push({ from: c.status, to: f.status, at: nowIso(), note: '' }); Object.assign(c, f); audit('case', f.id, 'update'); }
  }, false);
  go('case', f.id);
}
/** Create a case with the deadlines of a rule. */
function createCaseFromRule(ruleId, inputs, personId, caseFields, silent) {
  const rule = ruleById(ruleId); const comp = R.computeRule(S.pack, ruleId, inputs, { today: today() });
  if (comp.errors.length) return null;
  const c = newCase({ agency: rule.agency, title: tr(rule.name), personId: personId || newCase({}).personId, portalUrl: agencyOf(rule.agency).portal, priority: comp.deadlines.some((d) => d.severity === 'critical') ? 'critical' : 'normal', ...caseFields });
  c.history.push({ from: null, to: c.status, at: nowIso(), note: '' });
  S.data.cases.push(c); audit('case', c.id, 'create', { rule: ruleId });
  addComputedDeadlines(c, comp);
  if (!silent) persist();
  return c;
}
function addComputedDeadlines(c, comp) {
  for (const d of comp.deadlines) {
    const dl = { id: uid(), caseId: c.id, personId: c.personId, agency: c.agency, state: 'open', createdAt: nowIso(), history: [], checks: comp.checks, ...JSON.parse(JSON.stringify(d)) };
    S.data.deadlines.push(dl); audit('deadline', dl.id, 'create', { rule: d.ruleId, due: d.dueAt });
  }
}

/* ---------- Case detail ---------- */
function viewCase() {
  const c = caseById(S.param); if (!c) return h('div', { class: 'card empty' }, t('no_cases'));
  const ag = agencyOf(c.agency); const p = personById(c.personId); const tab = S.tabs['case:' + c.id] || 'deadlines';
  const dls = S.data.deadlines.filter((d) => d.caseId === c.id).sort((a, b) => ((a.state === 'done') - (b.state === 'done')) || (a.dueAt < b.dueAt ? -1 : 1));
  const docs = S.data.documents.filter((d) => d.caseId === c.id && d.reviewed);
  const si = STATUSES.indexOf(c.status);
  const stepper = h('div', { class: 'stepper', id: 'stepper' }, STATUSES.map((s, i) => h('div', { class: 'step' + (i < si ? ' past' : i === si ? ' cur' : ''), title: t('change_status'), onclick: () => changeStatus(c, s) }, h('span', { class: 'b' }), t('st_' + s))));
  const head = h('div', { class: 'card' }, h('div', { class: 'chead', style: { '--c': ag.color } },
    h('div', { class: 'grow' }, h('div', { class: 'small muted' }, agencyName(c.agency)), h('h1', { style: { margin: '2px 0 4px' } }, c.title),
      h('div', { class: 'row wrap small' }, c.refNo ? h('span', { class: 'chip gray' }, '# ', bdi(c.refNo)) : null, statusChip(c.status), sevChip(c.priority), p ? h('span', { class: 'row' }, avatar(p, 20), p.name) : null,
        c.expectedDecisionAt ? h('span', { class: 'chip blue' }, t('expected_decision') + ': ' + fmtDate(c.expectedDecisionAt)) : null, c.officer && c.officer.name ? h('span', { class: 'chip gray' }, '👤 ' + c.officer.name) : null)),
    h('div', { class: 'row' }, c.portalUrl ? h('button', { onclick: () => A.openUrl(c.portalUrl) }, '↗ ' + t('open_portal')) : null, h('button', { onclick: () => editCase(c), id: 'editCaseBtn' }, '✎ ' + t('edit')),
      h('button', { class: 'danger', onclick: async () => { if (await confirmBox(t('del_case_q'))) commit((d) => { d.cases = d.cases.filter((x) => x.id !== c.id); d.deadlines = d.deadlines.filter((x) => x.caseId !== c.id); d.documents.forEach((x) => { if (x.caseId === c.id) x.caseId = null; }); audit('case', c.id, 'delete'); S.view = 'cases'; }); } }, '🗑'))), stepper);
  const tabs = h('div', { class: 'tabs' }, [['deadlines', t('deadlines'), dls.filter((d) => d.state === 'open').length], ['checklist', t('checklist'), (c.checklist || []).filter((x) => !x.done).length], ['documents', t('documents'), docs.length], ['notes', t('notes')], ['history', t('history')]].map(([k, l, n]) => h('button', { class: tab === k ? 'on' : '', id: 'tab-' + k, onclick: () => { S.tabs['case:' + c.id] = k; render(); } }, l, n ? ` (${num(n)})` : '')));
  let body;
  if (tab === 'deadlines') body = h('div', null, h('div', { class: 'row end', style: { marginBottom: '10px' } }, h('button', { onclick: () => ruleModal({ caseId: c.id, agency: c.agency }), id: 'addRuleDl' }, '📜 ' + t('add_from_rule')), h('button', { onclick: () => manualDeadline(c), id: 'addManualDl' }, '📅 ' + t('add_manual'))), dls.length ? dls.map(deadlineCard) : h('div', { class: 'empty' }, t('none')));
  else if (tab === 'checklist') {
    const inp = h('input', { class: 'grow', placeholder: t('add_item'), id: 'checkInput', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) add(); } });
    const add = () => commit(() => { c.checklist = c.checklist || []; c.checklist.push({ id: uid(), text: inp.value.trim(), done: false }); });
    body = h('div', null, (c.checklist || []).map((it) => h('div', { class: 'check' + (it.done ? ' done' : '') }, h('input', { type: 'checkbox', checked: it.done, onchange: (e) => commit(() => { it.done = e.target.checked; it.doneAt = it.done ? nowIso() : null; }) }), h('span', { class: 'grow' }, it.text), it.doneAt ? h('span', { class: 'small muted' }, fmtDate(it.doneAt.slice(0, 10))) : null, h('button', { class: 'ghost sm', onclick: () => commit(() => { c.checklist = c.checklist.filter((x) => x !== it); }) }, '✕'))), h('div', { class: 'row', style: { marginTop: '8px' } }, inp, h('button', { onclick: () => inp.value.trim() && add() }, t('add'))));
  } else if (tab === 'documents') body = h('div', null, h('div', { class: 'row end', style: { marginBottom: '8px' } }, h('button', { onclick: () => attachToCase(c) }, '📎 ' + t('attach'))), docs.length ? docTable(docs) : h('div', { class: 'empty' }, t('no_docs')));
  else if (tab === 'notes') body = h('div', null, h('textarea', { style: { minHeight: '220px' }, dir: 'auto', value: c.notes || '', id: 'caseNotes', onchange: (e) => commit(() => { c.notes = e.target.value; c.updatedAt = nowIso(); audit('case', c.id, 'notes'); }, false) }), h('div', { class: 'small muted' }, t('saved') + ' ✓ (auto)'));
  else body = h('div', null, h('table', null, h('tbody', null, [...(c.history || []).map((x) => ({ at: x.at, txt: x.from ? t('status_changed', { from: t('st_' + x.from), to: t('st_' + x.to) }) + (x.note ? ` — ${x.note}` : '') : t('created') + ' (' + t('st_' + x.to) + ')' })), ...S.data.audit.filter((a) => a.id === c.id || dls.some((d) => d.id === a.id)).map((a) => ({ at: a.at, txt: `${a.entity} · ${a.action}${a.details && a.details.due ? ' · ' + a.details.due : ''}${a.details && a.details.reason ? ' · ' + a.details.reason : ''}` }))].sort((a, b) => (a.at < b.at ? 1 : -1)).map((x) => h('tr', null, h('td', { class: 'small muted', style: { whiteSpace: 'nowrap' } }, new Date(x.at).toLocaleString(locale())), h('td', null, x.txt))))));
  return h('div', null, head, tabs, h('div', { class: 'card' }, body));
}
async function changeStatus(c, s) {
  if (s === c.status) return;
  const f = { note: '', date: today(), outcome: c.outcome || '' };
  const body = h('div', { class: 'col' }, h('p', null, t('status_changed', { from: t('st_' + c.status), to: t('st_' + s) })),
    h('label', null, t('status_note'), h('input', { oninput: (e) => (f.note = e.target.value), id: 'statusNote' })),
    ['submitted', 'decided'].includes(s) ? h('label', null, s === 'submitted' ? t('submitted_at') : t('decided_at'), h('input', { type: 'date', value: f.date, oninput: (e) => (f.date = e.target.value) })) : null,
    s === 'decided' ? h('label', null, t('outcome'), h('select', { onchange: (e) => (f.outcome = e.target.value) }, h('option', { value: '' }, '—'), ['approved', 'refused', 'partly', 'other'].map((o) => h('option', { value: o }, t('out_' + o))))) : null,
    s === 'submitted' || s === 'waiting' ? h('label', null, t('expected_decision') + ` (${t('optional')})`, h('input', { type: 'date', value: c.expectedDecisionAt || '', oninput: (e) => (f.expected = e.target.value) })) : null);
  if (!(await modal(t('change_status'), body, [{ label: t('cancel'), value: false }, { label: t('save'), value: true, cls: 'primary', key: 'save' }]))) return;
  commit(() => { c.history = c.history || []; c.history.push({ from: c.status, to: s, at: nowIso(), note: f.note }); c.status = s; if (s === 'submitted') c.submittedAt = f.date; if (s === 'decided') { c.decidedAt = f.date; c.outcome = f.outcome; } if (f.expected) c.expectedDecisionAt = f.expected; c.updatedAt = nowIso(); audit('case', c.id, 'status:' + s); });
}
function deadlineCard(dl) {
  const st = R.deadlineState(dl, today()); const rule = dl.ruleId ? ruleById(dl.ruleId) : null;
  const rem = R.reminderDates(dl).filter((r) => r.date >= today()).slice(0, 8);
  let band = null;
  if (dl.kind === 'window' && dl.opensAt && dl.state === 'open') {
    const start = D.addDays(dl.opensAt, -Math.max(14, Math.round(D.diffDays(dl.opensAt, dl.dueAt) / 2))); const end = D.addDays(dl.dueAt, 7); const span = D.diffDays(start, end);
    const pos = (x) => Math.max(0, Math.min(100, (D.diffDays(start, x) / span) * 100));
    band = h('div', null, h('div', { class: 'window-band', title: `${fmtDate(dl.opensAt)} → ${fmtDate(dl.dueAt)}`, style: { direction: 'ltr' } }, h('div', { class: 'w', style: { left: pos(dl.opensAt) + '%', width: pos(dl.dueAt) - pos(dl.opensAt) + '%' } }), h('div', { class: 'n', style: { left: pos(today()) + '%' } })), h('div', { class: 'small muted', style: { direction: 'ltr', position: 'relative', height: '18px' } }, h('span', { style: { position: 'absolute', left: pos(dl.opensAt) + '%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' } }, fmtDate(dl.opensAt)), h('span', { style: { position: 'absolute', left: pos(dl.dueAt) + '%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' } }, fmtDate(dl.dueAt))));
  }
  return h('div', { class: `dl sev-${dl.severity}${dl.state !== 'open' ? ' done' : ''}`, 'data-dl': dl.id },
    h('div', { class: 'row' }, ring(dl, 44), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, tr(dl.title), dl.estimated ? h('span', { class: 'chip amber', style: { marginInlineStart: '6px' } }, t('estimate')) : null, dl.override ? h('span', { class: 'chip blue', style: { marginInlineStart: '6px' } }, t('overridden')) : null),
      h('div', { class: 'small muted' }, dl.kind === 'recurring' ? `${t('recurring')} (${dl.recurrence.openDay}–${dl.recurrence.dueDay}) · ${t('period')} ${dl.period} · ` : '', dl.opensAt && dl.kind !== 'recurring' ? `${t('dl_opens')}: ${fmtDate(dl.opensAt)} · ` : '', t('dl_due'), ': ', h('b', null, fmtDate(dl.dueAt, true)))),
      sevChip(dl.severity), dueChip(dl)),
    st === 'overdue' && dl.consequence ? h('div', { class: 'dangerbox' }, '⛔ ', tr(dl.consequence)) : null,
    band,
    dl.doneNote ? h('div', { class: 'small' }, '✓ ', dl.doneNote, dl.doneAt ? ` (${fmtDate(dl.doneAt.slice(0, 10))})` : '') : null,
    (dl.checks || []).map((c) => h('div', { class: 'warnbox small' }, '⚠️ ', tr(c.text))),
    h('details', null, h('summary', null, t('why')),
      dl.explanation ? h('div', { class: 'explain', dir: 'auto' }, tr(dl.explanation)) : h('div', { class: 'explain' }, t('add_manual')),
      dl.override ? h('div', { class: 'explain' }, `${t('overridden')}: ${dl.override.originalDue} → ${dl.dueAt} · ${dl.override.reason}`) : null,
      dl.consequence ? h('div', { class: 'conseq' }, h('b', null, t('if_missed') + ': '), tr(dl.consequence)) : null,
      dl.sourceUrl ? h('div', { class: 'srcl' }, t('source'), ': ', h('button', { class: 'link', onclick: () => A.openUrl(dl.sourceUrl) }, dl.sourceUrl), ` · ${t('verified')}: ${dl.verifiedAt} · ${t('tag_' + (dl.sourceTag || 'S'))} · ${t('pack_version')} ${dl.rulePackVersion || ''}`) : null,
      rem.length && dl.state === 'open' ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, '🔔 ', t('reminders'), ': ', rem.map((r) => fmtDate(r.date)).join(' · ')) : null,
      (dl.history || []).length ? h('div', { class: 'small muted' }, (dl.history || []).slice(-6).map((x) => `${x.period || x.dueAt}: ${t('state_' + x.state)}`).join(' · ')) : null),
    h('div', { class: 'row end wrap', style: { marginTop: '6px' } },
      dl.state === 'open' ? [h('button', { class: 'sm primary', onclick: () => markDone(dl), 'data-act': 'done' }, '✓ ' + t('mark_done')), h('button', { class: 'sm', onclick: () => snooze(dl) }, '⏰ ' + t('snooze')), h('button', { class: 'sm', onclick: () => overrideDate(dl), 'data-act': 'override' }, '✎ ' + t('override'))]
        : h('button', { class: 'sm', onclick: () => commit(() => { dl.state = 'open'; dl.doneAt = null; audit('deadline', dl.id, 'reopen'); }) }, t('reopen')),
      h('button', { class: 'sm danger', onclick: async () => { if (await confirmBox(t('del_q'))) commit((d) => { d.deadlines = d.deadlines.filter((x) => x !== dl); audit('deadline', dl.id, 'delete'); }); } }, '🗑')));
}
async function markDone(dl) {
  let note = '';
  const ok = await modal(t('mark_done'), h('div', { class: 'col' }, h('div', null, h('b', null, tr(dl.title)), ' — ', fmtDate(dl.dueAt)), h('label', null, t('done_note'), h('input', { id: 'doneNote', oninput: (e) => (note = e.target.value) }))), [{ label: t('cancel'), value: false }, { label: '✓ ' + t('done'), value: true, cls: 'primary', key: 'ok' }]);
  if (!ok) return;
  commit(() => {
    audit('deadline', dl.id, 'done', { due: dl.dueAt, note });
    if (dl.kind === 'recurring' && dl.recurrence) { dl.history = dl.history || []; dl.history.push({ period: dl.period, dueAt: dl.dueAt, state: 'done', at: nowIso(), note }); Object.assign(dl, R.nextPeriod(dl.recurrence, dl.dueAt)); dl.snoozedUntil = null; }
    else { dl.state = 'done'; dl.doneAt = nowIso(); dl.doneNote = note; }
  });
  toast('✓ ' + t('saved'));
}
async function snooze(dl) {
  const v = await modal(t('snooze'), h('p', null, tr(dl.title)), [{ label: t('cancel'), value: null }, { label: t('snooze_1h'), value: '1h' }, { label: t('snooze_tomorrow'), value: 'tom', cls: 'primary' }]);
  if (!v) return; const d = new Date(); if (v === '1h') d.setHours(d.getHours() + 1); else { d.setDate(d.getDate() + 1); d.setHours(S.settings.reminderHour || 9, 0, 0, 0); }
  commit(() => { dl.snoozedUntil = d.toISOString(); audit('deadline', dl.id, 'snooze', { until: dl.snoozedUntil }); }); toast('⏰ ' + d.toLocaleString(locale()));
}
async function overrideDate(dl) {
  const f = { date: dl.dueAt, reason: '' };
  const ok = await modal(t('override'), h('div', { class: 'col' }, h('div', { class: 'small muted' }, tr(dl.explanation) || ''), h('label', null, t('dl_due'), h('input', { type: 'date', value: f.date, id: 'ovDate', oninput: (e) => (f.date = e.target.value) })), h('label', null, t('override_reason'), h('input', { id: 'ovReason', oninput: (e) => (f.reason = e.target.value) }))),
    [{ label: t('cancel'), value: false }, { label: t('save'), value: true, cls: 'primary', key: 'save', onClick: () => (D.isValid(f.date) && f.reason.trim() ? true : (toast(t('required') + ': ' + t('override_reason')), false)) }]);
  if (!ok) return;
  commit(() => { dl.override = { originalDue: (dl.override && dl.override.originalDue) || dl.dueAt, reason: f.reason, at: nowIso() }; dl.dueAt = f.date; audit('deadline', dl.id, 'override', { due: f.date, reason: f.reason }); });
}
async function manualDeadline(c) {
  const f = { title: '', dueAt: '', opensAt: '', severity: 'normal' };
  const ok = await modal(t('add_manual'), h('div', { class: 'col' }, h('label', null, t('dl_title'), h('input', { id: 'mdTitle', oninput: (e) => (f.title = e.target.value) })), h('div', { class: 'grid3' }, h('label', null, t('dl_due'), h('input', { type: 'date', id: 'mdDue', oninput: (e) => (f.dueAt = e.target.value) })), h('label', null, t('dl_opens') + ` (${t('optional')})`, h('input', { type: 'date', oninput: (e) => (f.opensAt = e.target.value) })), h('label', null, t('dl_severity'), h('select', { onchange: (e) => (f.severity = e.target.value) }, SEVS.map((s) => h('option', { value: s, selected: s === f.severity }, t('sev_' + s))))))),
    [{ label: t('cancel'), value: false }, { label: t('save'), value: true, cls: 'primary', key: 'save', onClick: () => (f.title.trim() && D.isValid(f.dueAt) ? true : (toast(t('required')), false)) }]);
  if (!ok) return;
  commit((d) => { const dl = { id: uid(), caseId: c.id, personId: c.personId, agency: c.agency, title: f.title, kind: f.opensAt ? 'window' : 'absolute', opensAt: f.opensAt || null, dueAt: f.dueAt, severity: f.severity, ladder: { atOpen: !!f.opensAt, days: S.pack.ladders[f.severity] }, state: 'open', createdAt: nowIso(), history: [] }; d.deadlines.push(dl); audit('deadline', dl.id, 'create', { due: f.dueAt, manual: true }); });
}
/** Rule picker: choose rule → enter dates → live computed preview with explanation → save to case or new case. */
async function ruleModal(ctx) {
  const st = { ruleId: ctx.ruleId || (ctx.agency ? (S.pack.rules.find((r) => r.agency === ctx.agency) || S.pack.rules[0]).id : S.pack.rules[0].id), inputs: { ...(ctx.inputs || {}) }, personId: (caseById(ctx.caseId) || {}).personId || newCase({}).personId };
  const wrap = h('div');
  const draw = () => {
    wrap.innerHTML = ''; const rule = ruleById(st.ruleId); const comp = R.computeRule(S.pack, st.ruleId, st.inputs, { today: today() });
    const errFor = (k) => { const e = comp.errors.find((x) => x.key === k); return e ? h('span', { style: { color: 'var(--bad)' } }, e.code === 'required' ? t('required') : e.code === 'range' ? t('out_of_range', { min: e.min, max: e.max }) : t('bad_date')) : null; };
    wrap.append(h('div', null,
      h('label', null, t('pick_rule'), h('select', { id: 'ruleSelect', onchange: (e) => { st.ruleId = e.target.value; st.inputs = {}; draw(); } }, S.pack.agencies.filter((a) => S.pack.rules.some((r) => r.agency === a.code)).map((a) => h('optgroup', { label: S.lang === 'ar' ? a.ar : a.sv }, S.pack.rules.filter((r) => r.agency === a.code).map((r) => h('option', { value: r.id, selected: r.id === st.ruleId }, tr(r.name))))))),
      h('p', { class: 'small' }, tr(rule.summary)),
      h('div', { class: 'srcl muted' }, t('source'), ': ', h('button', { class: 'link', onclick: () => A.openUrl(rule.source_url) }, rule.source_url), ` · ${t('verified')}: ${rule.verified_at} · ${t('tag_' + rule.source_tag)}`),
      rule.inputs.length ? h('h3', null, t('rule_inputs')) : null,
      h('div', { class: 'grid2' }, rule.inputs.map((i) => h('label', null, tr(i.label) + (i.required ? '' : ` (${t('optional')})`),
        i.type === 'select' ? h('select', { 'data-in': i.key, onchange: (e) => { st.inputs[i.key] = e.target.value; draw(); } }, i.options.map((o) => h('option', { value: o.value, selected: (comp.inputs ? comp.inputs[i.key] : st.inputs[i.key]) === o.value }, tr(o.label))))
          : h('input', { 'data-in': i.key, type: i.type === 'date' ? 'date' : 'number', min: i.min, max: i.max, value: (st.inputs[i.key] !== undefined ? st.inputs[i.key] : comp.inputs && comp.inputs[i.key]) || '', onchange: (e) => { st.inputs[i.key] = i.type === 'date' ? e.target.value : e.target.value === '' ? '' : Number(e.target.value); draw(); } }), errFor(i.key)))),
      !ctx.caseId ? h('label', { style: { marginTop: '8px' } }, t('person'), h('select', { onchange: (e) => (st.personId = e.target.value) }, S.data.people.map((p) => h('option', { value: p.id, selected: p.id === st.personId }, p.name)))) : null,
      h('h3', null, t('computed')),
      comp.deadlines.length ? comp.deadlines.map((d) => h('div', { class: `dl sev-${d.severity} fly` }, h('div', { class: 'row' }, h('b', { class: 'grow' }, tr(d.title)), sevChip(d.severity), d.estimated ? h('span', { class: 'chip amber' }, t('estimate')) : null), h('div', null, d.opensAt ? `${t('dl_opens')}: ${fmtDate(d.opensAt)} · ` : '', t('dl_due'), ': ', h('b', null, fmtDate(d.dueAt, true))), h('div', { class: 'explain', dir: 'auto' }, tr(d.explanation)))) : h('div', { class: 'muted small' }, '—'),
      comp.checks.map((c) => h('div', { class: 'warnbox small' }, '⚠️ ', tr(c.text))),
      comp.deadlines.length ? h('div', { class: 'conseq' }, h('b', null, t('if_missed') + ': '), tr(rule.consequence)) : null));
    st.ok = comp.errors.length === 0 && comp.deadlines.length > 0; st.comp = comp;
  };
  draw();
  const ok = await modal(t('add_from_rule'), wrap, [{ label: t('cancel'), value: false }, { label: ctx.caseId ? t('save') : t('create_case_from_rule'), value: true, cls: 'primary', key: 'save', onClick: () => (st.ok ? true : (toast(t('required')), false)) }], { wide: true });
  if (!ok) return;
  if (ctx.caseId) { const c = caseById(ctx.caseId); commit(() => addComputedDeadlines(c, st.comp)); }
  else { const c = createCaseFromRule(st.ruleId, st.inputs, st.personId, {}); if (c) go('case', c.id); }
}

/* ---------- People ---------- */
function personForm(p, onboarding) {
  const inp = (k, type, extra) => h('input', { type: type || 'text', value: p[k] || '', oninput: (e) => (p[k] = e.target.value), 'data-f': k, ...(extra || {}) });
  return h('div', { class: 'grid2' },
    h('label', null, t('name'), inp('name', 'text', { id: 'pName' })), h('label', null, t('name_ar'), inp('nameAr', 'text', { dir: 'rtl', lang: 'ar' })),
    !onboarding ? h('label', null, t('relation'), h('select', { onchange: (e) => (p.relation = e.target.value) }, ['self', 'partner', 'child', 'managed'].map((r) => h('option', { value: r, selected: p.relation === r }, t('rel_' + r))))) : null,
    h('label', null, t('dob'), inp('dob', 'date')),
    h('label', null, t('pnr') + ` (${t('optional')})`, inp('pnr', 'text', { dir: 'ltr', autocomplete: 'off', placeholder: 'ÅÅÅÅMMDD-XXXX' })),
    h('label', null, t('folkbokford'), inp('folkbokford', 'date', { id: 'pFolk' })),
    h('label', null, t('permit_type'), h('select', { id: 'pPermitType', onchange: (e) => (p.permitType = e.target.value) }, PERMITS.map((x) => h('option', { value: x, selected: (p.permitType || 'none') === x }, t('pt_' + x))))),
    h('label', null, t('permit_start'), inp('permitStart', 'date')), h('label', null, t('permit_end'), inp('permitEnd', 'date', { id: 'pPermitEnd' })), h('label', null, t('passport_expiry'), inp('passportExpiry', 'date')),
    !onboarding ? h('label', null, t('citizenship'), inp('citizenship')) : null, !onboarding ? h('label', null, t('languages'), inp('languages')) : null);
}
function maskPnr(s) { return s ? String(s).replace(/(\d{4})$/, '****') : ''; }
function viewPeople() {
  return h('div', null, h('div', { class: 'row between' }, h('h1', null, t('people_title')), h('button', { class: 'primary', onclick: () => editPerson(null), id: 'addPersonBtn' }, '＋ ' + t('add_person'))),
    h('p', { class: 'small muted' }, t('helper_note')),
    h('div', { class: 'cards' }, S.data.people.map((p) => {
      const cs = S.data.cases.filter((c) => c.personId === p.id && c.status !== 'closed'); const revealed = S.tabs['reveal:' + p.id];
      return h('div', { class: 'card' }, h('div', { class: 'row' }, avatar(p, 40), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700, fontSize: '1.1em' } }, p.name), p.nameAr ? h('div', { dir: 'rtl', lang: 'ar' }, p.nameAr) : null, h('div', { class: 'small muted' }, t('rel_' + (p.relation || 'self')))), h('button', { class: 'sm', onclick: () => editPerson(p) }, '✎ ' + t('edit'))),
        h('table', { class: 'small', style: { marginTop: '8px' } }, h('tbody', null,
          p.pnr ? h('tr', null, h('td', { class: 'muted' }, t('pnr')), h('td', null, bdi(revealed || !S.settings.maskIds ? p.pnr : maskPnr(p.pnr)), ' ', h('button', { class: 'link small', onclick: () => revealPnr(p) }, revealed ? t('hide_ids') : t('show_ids')))) : null,
          p.permitType && p.permitType !== 'none' ? h('tr', null, h('td', { class: 'muted' }, t('permit_type')), h('td', null, t('pt_' + p.permitType))) : null,
          p.permitEnd ? h('tr', null, h('td', { class: 'muted' }, t('permit_end')), h('td', null, fmtDate(p.permitEnd), ' ', h('span', { class: 'small muted' }, `(${rel(p.permitEnd)})`))) : null,
          p.passportExpiry ? h('tr', null, h('td', { class: 'muted' }, t('passport_expiry')), h('td', null, fmtDate(p.passportExpiry))) : null,
          p.folkbokford ? h('tr', null, h('td', { class: 'muted' }, t('folkbokford')), h('td', null, fmtDate(p.folkbokford))) : null,
          p.relation === 'managed' ? h('tr', null, h('td', { class: 'muted' }, t('consent_date')), h('td', null, p.consentAt ? fmtDate(p.consentAt.slice(0, 10)) : '—')) : null)),
        p.permitType === 'family' && p.passportExpiry && p.permitEnd && p.passportExpiry < D.addYears(p.permitEnd, 2) ? h('div', { class: 'warnbox small' }, t('passport_warn')) : null,
        h('h3', null, t('cases_title'), ` (${num(cs.length)})`), cs.slice(0, 6).map((c) => h('div', { class: 'item', onclick: () => go('case', c.id) }, h('span', { class: 'dot', style: { background: agencyOf(c.agency).color } }), h('span', { class: 'grow' }, c.title), statusChip(c.status))));
    })));
}
async function revealPnr(p) {
  const k = 'reveal:' + p.id; if (S.tabs[k]) { S.tabs[k] = false; render(); return; }
  let pin = ''; const ok = await modal(t('pin_to_reveal'), h('input', { type: 'password', inputmode: 'numeric', class: 'pinin', oninput: (e) => (pin = e.target.value) }), [{ label: t('cancel'), value: false }, { label: t('show_ids'), value: true, cls: 'primary' }]);
  if (ok && (await A.verifyPin(pin))) { S.tabs[k] = true; render(); setTimeout(() => { S.tabs[k] = false; if (S.view === 'people') render(); }, 30000); } else if (ok) toast(t('pin_wrong', { n: '' }));
}
async function editPerson(p) {
  const isNew = !p; const f = isNew ? { id: uid(), relation: S.data.people.length ? 'partner' : 'self', color: COLORS[S.data.people.length % COLORS.length], permitType: 'none', createdAt: nowIso() } : { ...p };
  const body = h('div', { class: 'col' }, personForm(f, false),
    h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, t('color')), COLORS.map((c) => h('button', { class: 'sm', style: { background: c, width: '26px', height: '26px', borderRadius: '50%', border: f.color === c ? '3px solid var(--ink)' : '0' }, 'aria-label': c, onclick: (e) => { f.color = c; e.target.parentNode.querySelectorAll('button').forEach((b) => (b.style.border = '0')); e.target.style.border = '3px solid var(--ink)'; } }))),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!f.consentAt, onchange: (e) => (f.consentAt = e.target.checked ? nowIso() : null) }), t('consent')), h('div', { class: 'small muted' }, t('helper_note')));
  const v = await modal(isNew ? t('add_person') : t('edit'), body, [...(!isNew && S.data.people.length > 1 ? [{ label: t('delete'), value: 'del', cls: 'danger' }] : []), { label: t('cancel'), value: false }, { label: t('save'), value: true, cls: 'primary', key: 'save', onClick: () => (f.name && f.name.trim() ? true : (toast(t('required') + ': ' + t('name')), false)) }], { wide: true });
  if (v === 'del') { if (await confirmBox(t('del_q'))) commit((d) => { d.people = d.people.filter((x) => x.id !== p.id); audit('person', p.id, 'delete'); }); return; }
  if (!v) return;
  commit((d) => { if (isNew) { d.people.push(f); audit('person', f.id, 'create'); } else { Object.assign(p, f); audit('person', p.id, 'update'); } });
}

/* ---------- Import (letters) ---------- */
function setupDrop() {
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if (!S.unlocked) return; e.preventDefault(); depth++; document.querySelectorAll('.drop').forEach((d) => d.classList.add('over')); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.querySelectorAll('.drop').forEach((d) => d.classList.remove('over')); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); depth = 0; if (!S.unlocked) return;
    const files = [...(e.dataTransfer.files || [])]; if (!files.length) return;
    const paths = files.map((f) => A.pathFor(f)).filter(Boolean);
    if (paths.length) importPaths(paths);
    else for (const f of files) importMetas([await A.importBuffer(f.name, new Uint8Array(await f.arrayBuffer()))]);
  });
}
async function importPaths(paths, opts) { const metas = await A.importPaths(paths); return importMetas(metas, opts); }
async function importMetas(metas, opts) {
  const created = [];
  for (const m of metas) {
    if (m.error) { toast(t('error', { e: `${m.name}: ${m.error}` }), 5000); continue; }
    if (m.duplicateOf && !(opts && opts.allowDup)) { toast(t('duplicate'), 4000); await A.docDelete(m.id); if (!(opts && opts.attachCase)) go('review', m.duplicateOf); continue; }
    const doc = { id: m.id, name: m.name, title: m.name.replace(/\.[^.]+$/, ''), mime: m.mime, size: m.size, sha256: m.sha256, type: 'letter', personId: newCase({}).personId, caseId: (opts && opts.attachCase) || null, text: '', importedAt: nowIso(), reviewed: !!(opts && opts.attachCase), source: 'drop' };
    S.data.documents.push(doc); audit('document', doc.id, 'import'); created.push(doc);
  }
  persist();
  if (!created.length) return created;
  if (opts && opts.attachCase) { render(); for (const d of created) await processDoc(d, true); render(); return created; }
  created.forEach((d) => (S.processing[d.id] = { stage: 'reading' }));
  go('review', created[0].id);
  for (const d of created) await processDoc(d);
  return created;
}
async function attachToCase(c) { const paths = await A.pickFiles(); if (paths.length) importPaths(paths, { attachCase: c.id }); }
async function pdfDoc(bytes) {
  if (!window.pdfjsLib) await new Promise((r) => window.addEventListener('pdfjs-ready', r, { once: true }));
  return window.pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, disableFontFace: false, useSystemFonts: true }).promise;
}
async function pdfText(pdf, maxPages) {
  let out = ''; const n = Math.min(pdf.numPages, maxPages || 30);
  for (let i = 1; i <= n; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); let line = ''; let lastY = null; for (const it of tc.items) { const y = it.transform ? Math.round(it.transform[5]) : 0; if (lastY !== null && Math.abs(y - lastY) > 2) { out += line.trim() + '\n'; line = ''; } line += it.str + (it.hasEOL ? '\n' : ' '); lastY = y; } out += line.trim() + '\n\f\n'; }
  return out;
}
async function pdfPagePng(pdf, i, scale) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: scale || 2 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); return new Uint8Array(await blob.arrayBuffer()); }
/** Pipeline: pdf.js text layer → (if none) render pages → local OCR → rule-based extraction. */
async function processDoc(doc, quiet) {
  S.processing[doc.id] = { stage: 'reading' }; if (!quiet && S.view === 'review' && S.param === doc.id) render();
  try {
    let text = ''; let ocr = false; let conf = null;
    if (doc.mime === 'application/pdf') {
      const pdf = await pdfDoc(await A.docBytes(doc.id)); doc.pages = pdf.numPages;
      text = await pdfText(pdf);
      if (text.replace(/\s/g, '').length < 40 * Math.min(pdf.numPages, 3)) {
        const n = Math.min(pdf.numPages, 6); const images = [];
        for (let i = 1; i <= n; i++) images.push(await pdfPagePng(pdf, i, 2));
        S.processing[doc.id] = { stage: 'ocr', p: 1, n }; if (!quiet && S.view === 'review') render();
        const r = await A.ocr({ images }); text = r.text; ocr = true; conf = r.confidence;
      }
    } else if (/^image\//.test(doc.mime)) {
      S.processing[doc.id] = { stage: 'ocr', p: 1, n: 1 }; if (!quiet && S.view === 'review' && S.param === doc.id) render();
      const r = await A.ocr({ id: doc.id }); text = r.text; ocr = true; conf = r.confidence;
    }
    const ex = X.extract(text, { today: today() });
    doc.text = ex.text; doc.ocr = ocr; doc.ocrConfidence = conf; doc.language = ex.language;
    doc.extraction = { agency: ex.classification.agency, confidence: ex.classification.confidence, rule: ex.process && ex.process.rule, proposal: ex.proposal };
    if (ex.proposal.letterDate && !doc.issuedAt) doc.issuedAt = ex.proposal.letterDate;
    persist();
  } catch (e) { console.error(e); doc.error = String(e.message || e); toast(t('error', { e: doc.error }), 5000); }
  delete S.processing[doc.id];
  if (!quiet && S.view === 'review' && S.param === doc.id) render();
}
A.onOcrProgress && A.onOcrProgress((x) => { const k = Object.keys(S.processing)[0]; if (k) { S.processing[k] = { stage: 'ocr', p: Math.min(x.page + 1, x.pages), n: x.pages }; const el = document.getElementById('ocrStatus'); if (el) el.textContent = t('ocr_running', { p: num(S.processing[k].p), n: num(x.pages) }); } });
function viewInbox() {
  const pending = S.data.documents.filter((d) => !d.reviewed);
  return h('div', null, h('h1', null, t('inbox_title')),
    h('div', { class: 'drop', id: 'dropZone' }, h('div', { class: 'big' }, '📄'), h('h2', null, t('drop_here')), h('button', { class: 'primary', id: 'pickBtn', onclick: async () => { const p = await A.pickFiles(); if (p.length) importPaths(p); } }, t('or_pick')), h('p', { class: 'small muted' }, t('import_help'))),
    h('h3', null, t('to_review')),
    pending.length ? h('div', { class: 'card' }, pending.map((d) => h('div', { class: 'item', onclick: () => go('review', d.id) }, h('span', { style: { fontSize: '22px' } }, d.mime === 'application/pdf' ? '📕' : '🖼️'), h('div', { class: 'grow' }, h('div', { class: 't' }, d.title), h('div', { class: 's' }, fmtDate(d.importedAt.slice(0, 10)), d.extraction && d.extraction.agency ? ` · ${agencyName(d.extraction.agency)} ${num(d.extraction.confidence)}%` : '')), S.processing[d.id] ? h('span', { class: 'chip amber' }, '…') : h('span', { class: 'chip blue' }, t('review_title'))))) : h('div', { class: 'card empty' }, t('no_inbox')));
}
async function renderPreview(doc, host, pages) {
  try {
    const bytes = await A.docBytes(doc.id);
    if (doc.mime === 'application/pdf') { const pdf = await pdfDoc(bytes); for (let i = 1; i <= Math.min(pdf.numPages, pages || 4); i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1.4 }); const cv = h('canvas', { width: vp.width, height: vp.height }); host.append(cv); await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; } }
    else if (/^image\//.test(doc.mime)) { const url = URL.createObjectURL(new Blob([bytes], { type: doc.mime })); host.append(h('img', { src: url, alt: doc.title })); }
  } catch (e) { host.append(h('div', { class: 'muted' }, String(e.message || e))); }
}
function viewReview() {
  const doc = docById(S.param); if (!doc) return h('div', { class: 'card empty' }, t('no_inbox'));
  const proc = S.processing[doc.id];
  const pv = h('div', { class: 'pv' + (proc ? ' scanning' : ''), id: 'preview' }); renderPreview(doc, pv);
  if (proc) return h('div', null, h('h1', null, t('review_title')), h('div', { class: 'review' }, pv, h('div', { class: 'card' }, h('h2', { id: 'ocrStatus' }, proc.stage === 'ocr' ? t('ocr_running', { p: num(proc.p || 1), n: num(proc.n || 1) }) : t('reading')), h('div', { class: 'bar' }, h('div', { style: { width: proc.stage === 'ocr' ? '60%' : '25%' } })), h('p', { class: 'small muted' }, t('import_help')))));
  const ex = doc.extraction || { proposal: {} }; const P = ex.proposal || {};
  // review state lives on S.tabs so re-renders keep user edits
  const key = 'rv:' + doc.id;
  if (!S.tabs[key]) {
    const refMatch = P.refNo && S.data.cases.find((c) => c.refNo && TX.fold(c.refNo).replace(/\s/g, '') === TX.fold(P.refNo).replace(/\s/g, ''));
    S.tabs[key] = { agency: ex.agency || 'other', ruleId: ex.rule || '', refNo: P.refNo || '', personId: doc.personId, caseId: refMatch ? refMatch.id : 'new', caseTitle: '', docType: /beslut|decision|قرار/i.test(doc.text || '') ? 'decision' : 'letter', title: doc.title, issuedAt: doc.issuedAt || P.letterDate || '', inputs: ex.rule ? X.inputsForRule(ex.rule, P, today()) : {}, manualTitle: '', manualDue: P.dueDate || '' };
  }
  const st = S.tabs[key]; const rr = () => render();
  const rule = st.ruleId ? ruleById(st.ruleId) : null;
  const comp = rule ? R.computeRule(S.pack, st.ruleId, st.inputs, { today: today() }) : null;
  const dateInputs = rule ? rule.inputs.filter((i) => i.type === 'date') : [];
  const fullText = doc.text || '';
  const glos = I.GLOSSARY.filter((g) => TX.fold(fullText).includes(TX.fold(g.sv.split(' (')[0])));
  const ex2 = fullText ? X.extract(fullText) : null;
  const form = h('div', { class: 'rform col' },
    h('div', { class: 'confirm-note warnbox small' }, '🛈 ', t('confirm_note')),
    st.agency === 'kronofogden' ? h('div', { class: 'dangerbox small' }, '⚠️ ', t('kfm_warn')) : null,
    !fullText ? h('div', { class: 'warnbox small' }, t('no_text')) : null,
    h('div', { class: 'grid2 fly' },
      h('label', null, h('span', null, t('detected_agency'), ex.agency ? h('span', { class: 'chip ' + (ex.confidence >= 70 ? 'green' : ex.confidence >= 40 ? 'amber' : 'red'), style: { marginInlineStart: '6px' }, id: 'confChip' }, `${num(ex.confidence)}% ${t('confidence')}`) : null),
        h('select', { id: 'rvAgency', onchange: (e) => { st.agency = e.target.value; rr(); } }, S.pack.agencies.map((a) => h('option', { value: a.code, selected: st.agency === a.code }, S.lang === 'ar' ? a.ar : a.sv)))),
      h('label', null, t('detected_process'), h('select', { id: 'rvRule', onchange: (e) => { st.ruleId = e.target.value; st.inputs = st.ruleId ? X.inputsForRule(st.ruleId, P, today()) : {}; if (st.ruleId) st.agency = ruleById(st.ruleId).agency; rr(); } }, h('option', { value: '' }, '— ' + t('unknown') + ' —'), S.pack.rules.map((r) => h('option', { value: r.id, selected: st.ruleId === r.id }, `${agencyOf(r.agency).sv}: ${tr(r.name)}`)))),
      h('label', null, t('ref_no'), h('input', { id: 'rvRef', dir: 'ltr', value: st.refNo, oninput: (e) => (st.refNo = e.target.value) })),
      h('label', null, t('person'), h('select', { onchange: (e) => (st.personId = e.target.value) }, S.data.people.map((p) => h('option', { value: p.id, selected: st.personId === p.id }, p.name)))),
      h('label', null, t('case_match'), h('select', { id: 'rvCase', onchange: (e) => { st.caseId = e.target.value; rr(); } }, h('option', { value: 'new', selected: st.caseId === 'new' }, t('new_case_opt')), S.data.cases.slice().sort((a, b) => (a.agency === st.agency ? -1 : 0) - (b.agency === st.agency ? -1 : 0)).map((c) => h('option', { value: c.id, selected: st.caseId === c.id }, `${agencyOf(c.agency).sv}: ${c.title}${c.refNo ? ' (' + c.refNo + ')' : ''}`)))),
      st.caseId === 'new' ? h('label', null, t('case_title'), h('input', { id: 'rvCaseTitle', value: st.caseTitle || (rule ? tr(rule.name) : `${agencyName(st.agency)}`), oninput: (e) => (st.caseTitle = e.target.value) })) : h('div'),
      h('label', null, t('doc_type'), h('select', { onchange: (e) => (st.docType = e.target.value) }, DOCTYPES.map((x) => h('option', { value: x, selected: st.docType === x }, t('dt_' + x))))),
      h('label', null, t('issued'), h('input', { type: 'date', value: st.issuedAt, oninput: (e) => (st.issuedAt = e.target.value) }))),
    rule ? h('div', { class: 'card fly', style: { padding: '10px 12px' } }, h('h3', { style: { marginTop: 0 } }, t('rule_inputs')), h('div', { class: 'grid2' }, rule.inputs.map((i) => h('label', null, tr(i.label), i.type === 'select' ? h('select', { onchange: (e) => { st.inputs[i.key] = e.target.value; rr(); } }, i.options.map((o) => h('option', { value: o.value, selected: (comp.inputs || {})[i.key] === o.value }, tr(o.label)))) : h('input', { 'data-in': i.key, type: i.type === 'date' ? 'date' : 'number', min: i.min, max: i.max, value: st.inputs[i.key] !== undefined ? st.inputs[i.key] : (comp.inputs || {})[i.key] || '', onchange: (e) => { st.inputs[i.key] = i.type === 'date' ? e.target.value : Number(e.target.value); rr(); } })))),
      P.responseDays ? h('div', { class: 'small muted' }, t('response_time'), ': ', num(P.responseDays), ' ', S.lang === 'sv' ? 'dagar' : S.lang === 'ar' ? 'أيام' : 'days') : null,
      h('h3', null, t('computed')), comp && comp.deadlines.length ? comp.deadlines.map((d) => h('div', { class: `dl sev-${d.severity}` }, h('div', { class: 'row' }, h('b', { class: 'grow' }, tr(d.title)), sevChip(d.severity)), h('div', null, d.opensAt ? `${t('dl_opens')}: ${fmtDate(d.opensAt)} · ` : '', t('dl_due'), ': ', h('b', { 'data-due': d.key }, fmtDate(d.dueAt, true))), h('div', { class: 'explain', dir: 'auto' }, tr(d.explanation)))) : h('div', { class: 'small', style: { color: 'var(--bad)' } }, (comp && comp.errors.length ? t('required') : '—')),
      comp ? comp.checks.map((c) => h('div', { class: 'warnbox small' }, '⚠️ ', tr(c.text))) : null)
      : h('div', { class: 'card', style: { padding: '10px 12px' } }, h('h3', { style: { marginTop: 0 } }, t('add_manual') + ` (${t('optional')})`), h('div', { class: 'grid2' }, h('label', null, t('dl_title'), h('input', { value: st.manualTitle, id: 'rvManualTitle', oninput: (e) => (st.manualTitle = e.target.value) })), h('label', null, t('dl_due'), h('input', { type: 'date', id: 'rvManualDue', value: st.manualDue, oninput: (e) => (st.manualDue = e.target.value) })))),
    ex2 && ex2.dates.length ? h('div', null, h('h3', null, t('found_dates')), ex2.dates.map((d) => h('div', { class: 'datechip' }, h('span', { class: 'chip ' + (d.role === 'due' ? 'red' : d.role === 'expiry' ? 'amber' : 'gray') }, t('role_' + d.role)), h('b', null, bdi(d.date)), h('span', { class: 'ctx', dir: 'auto', title: d.context }, d.context),
      (rule ? dateInputs : [{ key: '__manual', label: { en: t('dl_due'), sv: t('dl_due'), ar: t('dl_due') } }]).map((i) => h('button', { class: 'sm', title: t('use_as'), onclick: () => { if (i.key === '__manual') st.manualDue = d.date; else st.inputs[i.key] = d.date; rr(); } }, '→ ' + tr(i.label)))))) : null,
    ex2 && (ex2.amounts.length || ex2.pnr.length || Object.keys(ex2.payment).length) ? h('div', { class: 'small' }, ex2.amounts.length ? h('div', null, h('b', null, t('found_amounts') + ': '), ex2.amounts.map((a) => a.raw).join(' · ')) : null, Object.entries(ex2.payment).map(([k, v]) => h('div', null, h('b', null, k.toUpperCase() + ': '), bdi(v))), ex2.pnr.length ? h('div', { class: 'muted' }, '🔒 ', t('found_pnr')) : null) : null,
    glos.length ? h('div', null, h('h3', null, t('glossary_terms')), h('div', { class: 'row wrap' }, glos.map((g) => h('span', { class: 'chip blue', title: tr(g.x) }, g.sv, ' = ', S.lang === 'ar' ? g.ar : g.en)))) : null,
    fullText ? h('details', null, h('summary', null, t('letter_text'), doc.ocr ? ` (OCR ${num(Math.round(doc.ocrConfidence || 0))}%)` : ''), h('pre', { class: 'txt', dir: 'auto', id: 'letterText' }, ex2 && ex2.pnr.length ? ex2.pnr.reduce((s, p) => s.split(p.raw).join(p.masked), fullText) : fullText)) : null,
    h('div', { class: 'row end wrap', style: { position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '8px 0' } },
      h('button', { class: 'danger', id: 'rvDiscard', onclick: async () => { if (await confirmBox(t('discard') + '?')) { await A.docDelete(doc.id); commit((d) => { d.documents = d.documents.filter((x) => x.id !== doc.id); audit('document', doc.id, 'discard'); }, false); delete S.tabs[key]; go('inbox'); } } }, t('discard')),
      h('button', { id: 'rvVaultOnly', onclick: () => confirmReview(doc, st, null) }, t('vault_only')),
      h('button', { class: 'primary', id: 'rvConfirm', onclick: () => confirmReview(doc, st, comp) }, '✓ ' + t('confirm_save'))));
  return h('div', null, h('div', { class: 'row between' }, h('h1', null, t('review_title'), ': ', doc.title), doc.reviewed ? h('span', { class: 'chip green' }, '✓') : null), h('div', { class: 'review' }, pv, form));
}
function confirmReview(doc, st, comp) {
  let caseId = st.caseId === 'new' ? null : st.caseId;
  commit((d) => {
    const createCase = comp || (st.caseId === 'new' && (st.manualTitle && st.manualDue));
    if (!caseId && createCase) {
      const rule = st.ruleId ? ruleById(st.ruleId) : null;
      const c = newCase({ agency: st.agency, title: (st.caseTitle || (rule ? tr(rule.name) : agencyName(st.agency))).trim(), refNo: st.refNo, personId: st.personId, portalUrl: agencyOf(st.agency).portal, status: 'needs_action', priority: st.agency === 'kronofogden' ? 'critical' : 'normal' });
      c.history.push({ from: null, to: c.status, at: nowIso(), note: doc.title }); d.cases.push(c); caseId = c.id; audit('case', c.id, 'create', { fromLetter: doc.id });
    } else if (caseId && st.refNo) { const c = caseById(caseId); if (c && !c.refNo) c.refNo = st.refNo; }
    if (comp && comp.deadlines.length && caseId && st.caseId !== 'skip') addComputedDeadlines(caseById(caseId), comp);
    if (!comp && st.manualTitle && D.isValid(st.manualDue) && caseId) { const c = caseById(caseId); const dl = { id: uid(), caseId, personId: c.personId, agency: c.agency, title: st.manualTitle, kind: 'absolute', dueAt: st.manualDue, severity: st.agency === 'kronofogden' ? 'critical' : 'normal', ladder: { days: S.pack.ladders[st.agency === 'kronofogden' ? 'critical' : 'normal'] }, state: 'open', createdAt: nowIso(), history: [] }; d.deadlines.push(dl); audit('deadline', dl.id, 'create', { due: dl.dueAt, fromLetter: doc.id }); }
    Object.assign(doc, { reviewed: true, caseId: comp || st.manualTitle ? caseId : caseId, personId: st.personId, type: st.docType, title: st.title, issuedAt: st.issuedAt || doc.issuedAt });
    audit('document', doc.id, 'confirm', { case: caseId });
  }, false);
  delete S.tabs['rv:' + doc.id]; toast('✓ ' + t('saved'));
  const next = S.data.documents.find((x) => !x.reviewed && !S.processing[x.id]);
  if (caseId) go('case', caseId); else if (next) go('review', next.id); else go('docs');
}

/* ---------- Documents (vault) ---------- */
function docTable(docs, q) {
  return h('table', null, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, t('case_title')), h('th', null, t('doc_type')), h('th', null, t('issued')), h('th', null, t('expires')), h('th', null, t('case_match')))),
    h('tbody', null, docs.map((d) => { const c = caseById(d.caseId); return h('tr', { class: 'click', onclick: () => openDoc(d.id) }, h('td', null, d.mime === 'application/pdf' ? '📕' : '🖼️'), h('td', null, h('b', null, d.title || d.name), q ? h('div', { class: 'small muted', dir: 'auto' }, TX.snippet(d.text || '', q, 140)) : null), h('td', null, t('dt_' + (d.type || 'other'))), h('td', null, fmtDate(d.issuedAt)), h('td', null, d.expiresAt ? fmtDate(d.expiresAt) : '—'), h('td', null, c ? c.title : h('span', { class: 'muted' }, t('not_linked')))); })));
}
function viewDocs() {
  const f = S.tabs.docs || (S.tabs.docs = { q: '', type: '', caseId: '' });
  let docs = S.data.documents.filter((d) => d.reviewed).filter(visible);
  if (f.type) docs = docs.filter((d) => d.type === f.type); if (f.caseId) docs = docs.filter((d) => d.caseId === f.caseId);
  let shown = docs;
  if (f.q.trim()) shown = TX.search(docs, f.q, [{ name: 'title', get: (d) => d.title || d.name, weight: 3 }, { name: 'text', get: (d) => d.text, weight: 1 }, { name: 'case', get: (d) => (caseById(d.caseId) || {}).title, weight: 2 }]).map((r) => r.rec);
  else shown = docs.slice().sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
  const listHost = h('div', { id: 'docList' });
  const drawList = () => { listHost.innerHTML = ''; listHost.append(h('div', { class: 'small muted', style: { margin: '6px 0' } }, t('results', { n: num(shown.length) })), shown.length ? h('div', { class: 'card' }, docTable(shown, f.q)) : h('div', { class: 'card empty' }, t('no_docs'))); };
  drawList();
  const qInput = h('input', { type: 'search', class: 'grow', id: 'docSearch', placeholder: t('search_docs'), value: f.q, oninput: (e) => { f.q = e.target.value; const pos = e.target.selectionStart; render(); const el = document.getElementById('docSearch'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } });
  return h('div', null, h('div', { class: 'row between' }, h('h1', null, t('docs_title')), h('button', { onclick: async () => { const p = await A.pickFiles(); if (p.length) importPaths(p); } }, '＋ ' + t('nav_inbox'))),
    h('div', { class: 'row wrap' }, qInput, h('select', { onchange: (e) => { f.type = e.target.value; render(); } }, h('option', { value: '' }, t('all_types')), DOCTYPES.map((x) => h('option', { value: x, selected: f.type === x }, t('dt_' + x)))), h('select', { onchange: (e) => { f.caseId = e.target.value; render(); } }, h('option', { value: '' }, t('all_cases')), S.data.cases.map((c) => h('option', { value: c.id, selected: f.caseId === c.id }, c.title)))),
    listHost);
}
async function openDoc(id) {
  const d = docById(id); if (!d) return; if (!d.reviewed) { go('review', id); return; }
  const f = { title: d.title, type: d.type, caseId: d.caseId || '', issuedAt: d.issuedAt || '', expiresAt: d.expiresAt || '' };
  const pv = h('div', { class: 'pv', style: { maxHeight: '60vh' } }); renderPreview(d, pv, 3);
  const body = h('div', { class: 'review', style: { height: 'auto' } }, pv, h('div', { class: 'col' },
    h('label', null, t('case_title'), h('input', { value: f.title, oninput: (e) => (f.title = e.target.value) })),
    h('label', null, t('doc_type'), h('select', { onchange: (e) => (f.type = e.target.value) }, DOCTYPES.map((x) => h('option', { value: x, selected: f.type === x }, t('dt_' + x))))),
    h('label', null, t('link_case'), h('select', { onchange: (e) => (f.caseId = e.target.value) }, h('option', { value: '' }, t('not_linked')), S.data.cases.map((c) => h('option', { value: c.id, selected: f.caseId === c.id }, c.title)))),
    h('div', { class: 'grid2' }, h('label', null, t('issued'), h('input', { type: 'date', value: f.issuedAt, oninput: (e) => (f.issuedAt = e.target.value) })), h('label', null, t('expires'), h('input', { type: 'date', value: f.expiresAt, oninput: (e) => (f.expiresAt = e.target.value) }))),
    h('div', { class: 'small muted' }, `${d.name} · ${(d.size / 1024).toFixed(0)} KB · SHA-256 ${d.sha256.slice(0, 12)}… · ${t('imported')} ${fmtDate(d.importedAt.slice(0, 10))}`),
    d.text ? h('details', null, h('summary', null, t('letter_text')), h('pre', { class: 'txt', dir: 'auto' }, d.text)) : null));
  const v = await modal(d.title || d.name, body, [{ label: t('delete'), value: 'del', cls: 'danger' }, { label: t('download'), value: 'dl' }, { label: t('cancel'), value: null }, { label: t('save'), value: 'save', cls: 'primary' }], { wide: true });
  if (v === 'dl') { await A.docSaveAs(d.id, d.name); return; }
  if (v === 'del') { if (await confirmBox(t('del_q'))) { await A.docDelete(d.id); commit((x) => { x.documents = x.documents.filter((y) => y.id !== d.id); audit('document', d.id, 'delete'); }); } return; }
  if (v === 'save') commit(() => { Object.assign(d, { title: f.title, type: f.type, caseId: f.caseId || null, issuedAt: f.issuedAt || null, expiresAt: f.expiresAt || null }); audit('document', d.id, 'update'); });
}

/* ---------- Timeline ---------- */
function viewTimeline() {
  const f = S.tabs.tl || (S.tabs.tl = { by: 'agency', range: '1y' });
  const months = { '3m': 3, '1y': 12, '3y': 36 }[f.range]; const td = today();
  const start = D.addMonths(td, -Math.round(months / 4)); const end = D.addMonths(start, months); const span = D.diffDays(start, end);
  const cases = S.data.cases.filter(visible); const dls = S.data.deadlines.filter(visible).filter((d) => d.dueAt); const docs = S.data.documents.filter((d) => d.reviewed).filter(visible);
  const laneKey = (x) => (f.by === 'agency' ? x.agency || (caseById(x.caseId) || {}).agency || 'other' : x.personId || (caseById(x.caseId) || {}).personId || '');
  const keys = [...new Set([...cases.map(laneKey), ...dls.map(laneKey), ...docs.filter((d) => d.caseId).map(laneKey)])].filter((k) => k !== undefined);
  const W = 1100, L = 170, laneH = 54, top = 34, H = top + Math.max(1, keys.length) * laneH + 20;
  const mirror = S.lang === 'ar' && S.settings.timelineDir === 'rtl';
  const X0 = (iso) => L + 10 + (Math.max(-5, Math.min(span + 5, D.diffDays(start, iso))) / span) * (W - L - 30);
  const Xp = (iso) => (mirror ? W - (X0(iso) - L) - 20 : X0(iso));
  const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W + (mirror ? L : 0)} ${H}`);
  const el = (tag, a, txt) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt !== undefined) e.textContent = txt; svg.append(e); return e; };
  // month grid
  let m = D.ymd(+start.slice(0, 4), +start.slice(5, 7), 1); const step = months > 12 ? 3 : 1;
  while (m <= end) { if (m >= start) { const x = Xp(m); el('line', { x1: x, x2: x, y1: top - 6, y2: H - 10, stroke: 'var(--line)' }); el('text', { x: x + 3, y: top - 12 }, new Intl.DateTimeFormat(locale(), { month: 'short', year: months > 3 ? '2-digit' : undefined, timeZone: 'UTC' }).format(new Date(m + 'T00:00:00Z'))); } m = D.addMonths(m, step); }
  keys.forEach((k, i) => {
    const y = top + i * laneH; el('rect', { x: 0, y, width: W + (mirror ? L : 0), height: laneH, fill: i % 2 ? 'transparent' : 'rgba(127,127,127,.05)' });
    const lbl = f.by === 'agency' ? agencyOf(k).sv : (personById(k) || {}).name || '—';
    el('text', { x: mirror ? W + L - 10 : 10, y: y + laneH / 2 + 4, class: 'lane-label', 'text-anchor': mirror ? 'end' : 'start' }, lbl);
    const col = f.by === 'agency' ? agencyOf(k).color : (personById(k) || {}).color || '#888';
    cases.filter((c) => laneKey(c) === k).forEach((c, j) => {
      const s0 = c.openedAt || c.createdAt.slice(0, 10); const last = S.data.deadlines.filter((d) => d.caseId === c.id && d.dueAt).map((d) => d.dueAt).sort().pop();
      const e0 = c.decidedAt || (c.status === 'closed' ? (c.updatedAt || '').slice(0, 10) : last && last > td ? last : td);
      if (e0 < start || s0 > end) return;
      const x1 = Xp(s0), x2 = Xp(e0); const yy = y + 8 + (j % 3) * 12;
      const r = el('rect', { x: Math.min(x1, x2), y: yy, width: Math.max(4, Math.abs(x2 - x1)), height: 9, rx: 4, fill: col, opacity: c.status === 'closed' ? 0.35 : 0.75, class: 'bar-case' });
      const tt = document.createElementNS(NS, 'title'); tt.textContent = `${c.title} (${t('st_' + c.status)})`; r.append(tt); r.addEventListener('click', () => go('case', c.id));
    });
    dls.filter((d) => laneKey(d) === k && d.dueAt >= start && d.dueAt <= end).forEach((d) => {
      const x = Xp(d.dueAt), yy = y + laneH - 14; const c2 = d.state === 'done' ? 'var(--ok)' : { critical: 'var(--bad)', high: 'var(--warn)', normal: 'var(--info)', low: '#888' }[d.severity];
      if (d.opensAt && d.opensAt < d.dueAt) el('line', { x1: Xp(d.opensAt), x2: x, y1: yy, y2: yy, stroke: c2, 'stroke-width': 3, opacity: 0.35 });
      const p = el('path', { d: `M${x} ${yy - 7} L${x + 7} ${yy} L${x} ${yy + 7} L${x - 7} ${yy} Z`, fill: c2, style: 'cursor:pointer' });
      const tt = document.createElementNS(NS, 'title'); tt.textContent = `${tr(d.title)} — ${d.dueAt}`; p.append(tt); p.addEventListener('click', () => d.caseId && go('case', d.caseId));
    });
    docs.filter((d) => laneKey(d) === k && (d.issuedAt || d.importedAt.slice(0, 10)) >= start).forEach((d) => { const ds = d.issuedAt || d.importedAt.slice(0, 10); if (ds > end) return; const c3 = el('circle', { cx: Xp(ds), cy: y + laneH - 14, r: 4, fill: 'var(--card)', stroke: 'var(--ink)', 'stroke-width': 1.5, style: 'cursor:pointer' }); const tt = document.createElementNS(NS, 'title'); tt.textContent = d.title; c3.append(tt); c3.addEventListener('click', () => openDoc(d.id)); });
  });
  const tx = Xp(td); el('line', { x1: tx, x2: tx, y1: top - 8, y2: H - 6, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }); el('text', { x: tx + 4, y: H - 8, fill: 'var(--accent)' }, t('today'));
  return h('div', { class: 'tl' }, h('div', { class: 'row between' }, h('h1', null, t('tl_title')), h('div', { class: 'row' },
    h('div', { class: 'lang' }, ['agency', 'person'].map((b) => h('button', { class: f.by === b ? 'on' : '', onclick: () => { f.by = b; render(); } }, t(b === 'agency' ? 'tl_by_agency' : 'tl_by_person')))),
    h('div', { class: 'lang' }, ['3m', '1y', '3y'].map((r) => h('button', { class: f.range === r ? 'on' : '', id: 'tl-' + r, onclick: () => { f.range = r; render(); } }, t('tl_' + r)))))),
    keys.length ? svg : h('div', { class: 'card empty' }, t('tl_empty')),
    h('div', { class: 'legend' }, h('span', null, '▬ ', t('tl_legend_case')), h('span', null, '◆ ', t('tl_legend_dl')), h('span', null, '○ ', t('tl_legend_doc')), h('span', { style: { color: 'var(--accent)' } }, '┆ ', t('tl_legend_today'))));
}

/* ---------- Rules & glossary ---------- */
function viewRules() {
  return h('div', null, h('h1', null, t('rules_title')), h('p', { class: 'muted' }, t('rules_help')), h('div', { class: 'small', style: { marginBottom: '12px' } }, h('b', null, t('pack_version') + ': '), S.pack.version, ' · ', tr(S.pack.disclaimer)),
    S.pack.agencies.filter((a) => S.pack.rules.some((r) => r.agency === a.code)).map((a) => h('section', { class: 'card', style: { marginBottom: '14px' } }, h('h2', null, h('span', { class: 'dot', style: { background: a.color, marginInlineEnd: '8px' } }), S.lang === 'ar' ? `${a.ar} (${a.sv})` : a.sv),
      S.pack.rules.filter((r) => r.agency === a.code).map((r) => h('div', { class: 'dl', 'data-rule': r.id }, h('div', { class: 'row' }, h('b', { class: 'grow' }, tr(r.name)), h('span', { class: 'chip ' + (r.source_tag === 'GK' ? 'amber' : 'gray'), title: t('tag_' + r.source_tag) }, `[${r.source_tag}] ${t('tag_' + r.source_tag)}`)),
        h('div', { class: 'small' }, tr(r.summary)),
        h('div', { class: 'srcl' }, t('source'), ': ', h('button', { class: 'link', onclick: () => A.openUrl(r.source_url) }, r.source_url)),
        h('div', { class: 'small muted' }, `${t('verified')}: ${r.verified_at}`, r.valid_from ? ` · valid from ${r.valid_from}` : '', ` · ${r.deadlines.map((d) => t('sev_' + d.severity)).join(', ')}`),
        h('details', null, h('summary', null, t('if_missed')), h('div', { class: 'conseq' }, tr(r.consequence))),
        h('div', { class: 'row end' }, h('button', { class: 'sm', onclick: () => ruleModal({ ruleId: r.id }) }, t('use_rule'))))))));
}
function viewGlossary() {
  const q = S.tabs.gq || '';
  const list = q ? I.GLOSSARY.filter((g) => TX.fold([g.sv, g.en, g.ar, tr(g.x)].join(' ')).includes(TX.fold(q))) : I.GLOSSARY;
  return h('div', null, h('h1', null, t('glossary_title')), h('p', { class: 'muted' }, t('glossary_help')),
    h('input', { type: 'search', placeholder: '🔍', value: q, id: 'glossSearch', style: { width: '320px', marginBottom: '10px' }, oninput: (e) => { S.tabs.gq = e.target.value; render(); const el = document.getElementById('glossSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }),
    h('div', { class: 'card' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Svenska'), h('th', null, 'English'), h('th', null, 'العربية'), h('th', null, ''))), h('tbody', null, list.map((g) => h('tr', null, h('td', null, h('b', null, g.sv)), h('td', null, g.en), h('td', { dir: 'rtl', lang: 'ar' }, g.ar), h('td', { class: 'small muted' }, tr(g.x))))))));
}

/* ---------- Settings, backup, ICS ---------- */
function icsEvents() {
  const ev = [];
  for (const d of S.data.deadlines) {
    if (d.state !== 'open' || !d.dueAt) continue;
    const c = caseById(d.caseId); const alarms = [...(d.ladder && d.ladder.days) || [0]]; if (d.ladder && d.ladder.atOpen && d.opensAt) alarms.push(D.diffDays(d.opensAt, d.dueAt));
    const desc = [c ? `${agencyOf(c.agency).sv}: ${c.title}${c.refNo ? ' (' + c.refNo + ')' : ''}` : '', d.opensAt ? `${t('dl_opens')}: ${d.opensAt}` : '', tr(d.explanation), d.consequence ? `${t('if_missed')}: ${tr(d.consequence)}` : '', d.sourceUrl ? `${t('source')}: ${d.sourceUrl} (${t('verified')} ${d.verifiedAt})` : '', t('disclaimer')].filter(Boolean).join('\n');
    const occ = [{ dueAt: d.dueAt, opensAt: d.opensAt, period: d.period }];
    if (d.kind === 'recurring' && d.recurrence) { let n = { dueAt: d.dueAt }; for (let i = 0; i < 11; i++) { n = R.nextPeriod(d.recurrence, n.dueAt); occ.push(n); } }
    occ.forEach((o, i) => ev.push({ uid: `${d.id}-${i}`, date: o.dueAt, title: `${tr(d.title)}${o.period ? ' (' + o.period + ')' : ''}`, description: desc, url: d.sourceUrl, categories: c ? agencyOf(c.agency).sv : '', alarms: [...new Set(alarms.filter((x) => x >= 0 && x <= 120))] }));
  }
  return ev;
}
async function exportIcs() { const text = ICS.build(icsEvents(), { version: S.info.version, name: 'Mamba Cases' }); const f = await A.saveText(`MambaCases-${today()}.ics`, text, 'iCalendar', 'ics'); if (f) toast(t('ics_done', { f })); return f; }
function viewSettings() {
  const s = S.settings; const set = async (patch) => { S.settings = await A.setSettings(patch); applyLang(); render(); };
  const chk = (k, label, id) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', id, checked: !!s[k], onchange: (e) => set({ [k]: e.target.checked }) }), label);
  return h('div', null, h('h1', null, t('settings_title')), h('div', { class: 'cards' },
    h('div', { class: 'setsec' }, h('h3', null, t('s_general')), h('div', { class: 'card' },
      h('label', null, t('s_language'), h('select', { onchange: (e) => setLang(e.target.value) }, [['en', 'English'], ['sv', 'Svenska'], ['ar', 'العربية']].map(([v, n]) => h('option', { value: v, selected: S.lang === v }, n)))),
      h('label', null, t('s_theme'), h('select', { id: 'themeSel', onchange: (e) => set({ theme: e.target.value }) }, ['light', 'dark'].map((v) => h('option', { value: v, selected: s.theme === v }, t('th_' + v))))),
      h('label', null, t('s_font'), h('select', { onchange: (e) => set({ fontScale: +e.target.value }) }, [0.9, 1, 1.15, 1.3].map((v) => h('option', { value: v, selected: +s.fontScale === v }, Math.round(v * 100) + '%')))),
      chk('reducedMotion', t('s_motion')),
      h('label', null, t('s_numerals'), h('select', { onchange: (e) => set({ numerals: e.target.value }) }, ['western', 'arabic'].map((v) => h('option', { value: v, selected: s.numerals === v }, t('num_' + v))))),
      h('label', null, t('s_tl_dir'), h('select', { onchange: (e) => set({ timelineDir: e.target.value }) }, ['ltr', 'rtl'].map((v) => h('option', { value: v, selected: s.timelineDir === v }, t('tl_' + v))))))),
    h('div', { class: 'setsec' }, h('h3', null, t('s_notifications')), h('div', { class: 'card' },
      chk('notifications', t('s_notify')), chk('notifyDetails', t('s_notify_details')),
      h('label', null, t('s_hour'), h('select', { onchange: (e) => set({ reminderHour: +e.target.value }) }, [7, 8, 9, 10, 12, 15, 18].map((v) => h('option', { value: v, selected: +s.reminderHour === v }, `${v}:00`)))),
      chk('trayOnClose', t('s_tray')), chk('startWithWindows', t('s_startup')),
      h('div', { class: 'small muted' }, h('b', null, t('ladders')), h('div', null, t('ladder_critical')), h('div', null, t('ladder_high')), h('div', null, t('ladder_normal')), h('div', null, t('ladder_af'))),
      h('div', { class: 'row' }, h('button', { onclick: async () => toast(await A.notifyTest()) }, '🔔 ' + t('test_notification')), h('button', { id: 'icsBtn', onclick: exportIcs }, '📅 ' + t('ics_export'))))),
    h('div', { class: 'setsec' }, h('h3', null, t('s_security')), h('div', { class: 'card' },
      h('label', null, t('s_autolock'), h('select', { id: 'autolockSel', onchange: (e) => set({ autoLockMin: +e.target.value }) }, [1, 2, 5, 10, 15, 30, 0].map((v) => h('option', { value: v, selected: +s.autoLockMin === v }, v ? `${v} ${t('minutes')}` : '∞')))),
      chk('maskIds', t('s_mask')), h('div', { class: 'small muted' }, S.info.keystore ? '🛡️ ' + t('s_keystore_on') : t('s_keystore_off')),
      h('button', { onclick: changePinDlg }, '🔑 ' + t('s_change_pin')))),
    h('div', { class: 'setsec' }, h('h3', null, t('s_data')), h('div', { class: 'card' },
      h('div', { class: 'small muted' }, t('last_backup'), ': ', S.data.meta && S.data.meta.lastBackup ? new Date(S.data.meta.lastBackup).toLocaleString(locale()) : '—'),
      h('button', { id: 'backupBtn', onclick: backupDlg }, '💾 ' + t('backup_export')), h('button', { id: 'restoreBtn', onclick: restoreDlg }, '♻️ ' + t('backup_import')),
      h('button', { class: 'danger', onclick: wipeDlg }, '🗑 ' + t('wipe')))),
    h('div', { class: 'setsec' }, h('h3', null, t('s_about')), h('div', { class: 'card' }, h('div', null, h('b', null, t('appName')), ` ${t('version')} ${S.info.version}`), h('div', null, `${t('pack_version')}: ${S.pack.version}`), h('div', { class: 'small muted' }, t('data_folder'), ': ', bdi(S.info.dataDir)), h('div', { class: 'warnbox small' }, t('disclaimer')), h('div', { class: 'small muted' }, 'Local OCR: Tesseract.js (Apache-2.0) · PDF: pdf.js (Apache-2.0) · Font: Noto Sans Arabic (OFL)')))));
}
async function changePinDlg() {
  const f = { o: '', n: '', n2: '' };
  const ok = await modal(t('s_change_pin'), h('div', { class: 'col' }, h('label', null, t('old_pin'), h('input', { type: 'password', inputmode: 'numeric', oninput: (e) => (f.o = e.target.value) })), h('label', null, t('new_pin'), h('input', { type: 'password', inputmode: 'numeric', oninput: (e) => (f.n = e.target.value) })), h('label', null, t('pin_repeat'), h('input', { type: 'password', inputmode: 'numeric', oninput: (e) => (f.n2 = e.target.value) }))),
    [{ label: t('cancel'), value: false }, { label: t('save'), value: true, cls: 'primary', onClick: () => (!/^\d{4,12}$/.test(f.n) ? (toast(t('pin_short')), false) : f.n !== f.n2 ? (toast(t('pin_mismatch')), false) : true) }]);
  if (!ok) return; const r = await A.changePin(f.o, f.n); toast(r.ok ? t('pin_changed') : t('pin_wrong', { n: '' }));
}
async function backupDlg() {
  const f = { p: '', p2: '' };
  const ok = await modal(t('backup_export'), h('div', { class: 'col' }, h('label', null, t('passphrase'), h('input', { type: 'password', id: 'bkp1', oninput: (e) => (f.p = e.target.value) })), h('label', null, t('passphrase_repeat'), h('input', { type: 'password', id: 'bkp2', oninput: (e) => (f.p2 = e.target.value) }))),
    [{ label: t('cancel'), value: false }, { label: t('save'), value: true, cls: 'primary', key: 'save', onClick: () => (f.p.length < 8 ? (toast(t('passphrase')), false) : f.p !== f.p2 ? (toast(t('pin_mismatch')), false) : true) }]);
  if (!ok) return;
  S.data.meta = { ...(S.data.meta || {}), lastBackup: nowIso() }; await flush();
  const r = await A.backupExport(f.p); if (r) { toast(t('backup_done', { f: r.file }), 4000); render(); } return r;
}
async function restoreDlg(file) {
  if (!(await confirmBox(t('restore_q')))) return; let p = '';
  const ok = await modal(t('backup_import'), h('label', null, t('passphrase'), h('input', { type: 'password', id: 'rst1', oninput: (e) => (p = e.target.value) })), [{ label: t('cancel'), value: false }, { label: t('confirm'), value: true, cls: 'primary', key: 'ok' }]);
  if (!ok) return; const r = await A.backupImport(p, typeof file === 'string' ? file : undefined);
  if (!r) return; if (!r.ok) { toast(t('error', { e: r.error }), 4000); return; }
  S.data = Object.assign(emptyData(), r.data); rollRecurring(); toast(t('restore_done', { n: r.files }), 4000); go('today');
}
async function wipeDlg() {
  let p = ''; const ok = await modal(t('wipe'), h('div', { class: 'col' }, h('div', { class: 'dangerbox' }, t('wipe_q')), h('input', { type: 'password', inputmode: 'numeric', class: 'pinin', oninput: (e) => (p = e.target.value) })), [{ label: t('cancel'), value: false }, { label: t('wipe'), value: true, cls: 'danger' }]);
  if (!ok) return; const r = await A.wipe(p); if (r.ok) { S.data = null; S.unlocked = false; S.stage = 'welcome'; S.vault = await A.vaultStatus(); render(); } else toast(t('pin_wrong', { n: '' }));
}

window.MC = { S, render, go, importPaths, exportIcs, backupDlg, restoreDlg, createCaseFromRule, markDone, lockNow, rollRecurring, flush };
boot();
