// Renderer UI test (runs inside the app via MAMBA_CASES_UITEST). Real DOM clicks/typing; screenshots → docs/.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const results = []; let failed = 0;
const ok = (name, cond, extra) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failed++; };
async function waitFor(sel, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const e = typeof sel === 'function' ? sel() : $(sel); if (e) return e; await sleep(100); } throw new Error('timeout waiting for ' + sel); }
async function click(sel) { const e = await waitFor(sel); e.click(); await sleep(250); return e; }
async function type(sel, v) { const e = await waitFor(sel); e.focus(); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120); return e; }
const btnText = (txt) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(txt));
const shot = async (n) => { await sleep(500); await window.api.test.shot(n); };
const S = window.MC.S;

async function run() {
const sz = await window.api.test.size(1440, 900); await sleep(300); ok('window size', true, JSON.stringify(sz) + ' inner ' + innerWidth + 'x' + innerHeight + ' dpr ' + devicePixelRatio);
await waitFor('#startBtn');
await click('#lang-en'); await shot('01-welcome');
ok('welcome screen in English', $('#startBtn').textContent.includes('Start'));
await click('#lang-ar'); ok('Arabic sets RTL instantly', document.documentElement.dir === 'rtl'); await click('#lang-en');
await click('#startBtn');
await type('#pin1', '2468'); await type('#pin2', '2468'); await click('#pinNext');
await type('#pName', 'Ammar'); await type('[data-f="nameAr"]', 'عمار');
const pt = await waitFor('#pPermitType'); pt.value = 'subsidiary'; pt.dispatchEvent(new Event('change'));
await type('#pPermitEnd', '2026-12-10'); await type('#pFolk', '2026-01-15'); await type('[data-f="permitStart"]', '2023-12-11');
await click('#onbLicence'); await click('#onbAf'); await click('#youNext');
await waitFor('#finishOnb'); await shot('02-onboarding-proposals');
ok('onboarding proposes 4 rule cases', document.querySelectorAll('.prop').length === 4, String(document.querySelectorAll('.prop').length));
await click('#finishOnb'); await waitFor('#dueCard');
const dl = (rule) => S.data.deadlines.find((d) => d.ruleId === rule);
ok('permit renewal window opens 2 months before expiry', dl('migr.protection_extension').opensAt === '2026-10-10' && dl('migr.protection_extension').dueAt === '2026-12-10');
ok('AF activity report next period 1–14 Nov', dl('af.activity_report').opensAt === '2026-11-01' && dl('af.activity_report').dueAt === '2026-11-14');
ok('foreign licence valid until 1 year after folkbokföring', dl('ts.foreign_licence').dueAt === '2027-01-15');
ok('deklaration 2027 estimate flagged', S.data.deadlines.some((d) => d.ruleId === 'skv.deklaration' && d.estimated));

// a subsidiary-protection 3-year permit via the rule picker (new case)
await click('#newBtn'); await click('#qaRule');
const rs = await waitFor('#ruleSelect'); rs.value = 'migr.protection_new_permit'; rs.dispatchEvent(new Event('change')); await sleep(200);
await type('[data-in="start"]', '2026-02-10'); await sleep(300);
ok('3-year subsidiary permit expires 2029-02-09', [...document.querySelectorAll('.modal .dl b')].some((b) => /2029/.test(b.textContent)));
await shot('05-rule-picker-3year-permit');
await click('.mback [data-k=save]'); await waitFor('#stepper');
ok('3-year permit case created', S.data.deadlines.some((d) => d.ruleId === 'migr.protection_new_permit' && d.key === 'apply' && d.dueAt === '2029-02-09' && d.opensAt === '2028-12-09'));

// Kronofogden scanned letter → OCR → review → confirm
await window.MC.importPaths([await window.api.test.fixture('letter-kronofogden-sv.png')]);
await waitFor('#rvConfirm', 90000); await sleep(600);
ok('OCR detected Kronofogden', $('#rvAgency').value === 'kronofogden', $('#rvAgency').value);
ok('detected payment-order rule', $('#rvRule').value === 'kfm.betalningsforelaggande');
ok('detected målnummer', $('#rvRef').value === '12-345678-26', $('#rvRef').value);
ok('response days 10 from "inom tio dagar"', $('[data-in="response_days"]').value === '10');
await type('[data-in="served_date"]', '2026-10-17'); await sleep(300);
ok('due = delgivning + 10 days', $('[data-due="respond"]') && /27/.test($('[data-due="respond"]').textContent), $('[data-due="respond"]') && $('[data-due="respond"]').textContent);
ok('Kronofogden high-severity banner', !!document.querySelector('.dangerbox'));
await shot('04-import-review-kronofogden-ocr');
await click('#rvConfirm'); await waitFor('#stepper');
const kfm = S.data.deadlines.find((d) => d.ruleId === 'kfm.betalningsforelaggande');
ok('payment-order deadline saved after confirmation', kfm && kfm.dueAt === '2026-10-27' && kfm.severity === 'critical');
ok('letter stored in vault and linked', S.data.documents.some((d) => d.reviewed && d.caseId === kfm.caseId && /Kronofogden/.test(d.text)));
await shot('03-case-kronofogden');

// Text-layer PDF (Migrationsverket decision) via pdf.js
await window.MC.importPaths([await window.api.test.fixture('letter-migrationsverket-sv.pdf')]);
await waitFor('#rvConfirm', 60000); await sleep(800);
ok('PDF text layer → Migrationsverket', $('#rvAgency').value === 'migrationsverket');
ok('PDF ref number', $('#rvRef').value === '21-123456', $('#rvRef').value);
ok('PDF permit end 2029-02-09 prefilled', $('[data-in="permit_end"]') && $('[data-in="permit_end"]').value === '2029-02-09');
await shot('04b-import-review-pdf');
await click('#rvVaultOnly'); await sleep(400);

// Arabic photo letter
await window.MC.importPaths([await window.api.test.fixture('letter-arabic.png')]);
await waitFor('#rvConfirm', 90000); await sleep(600);
ok('Arabic OCR → Migrationsverket', $('#rvAgency').value === 'migrationsverket');
ok('Arabic date "12 مارس 2027" understood', $('[data-in="permit_end"]') && $('[data-in="permit_end"]').value === '2027-03-12');
await click('#rvVaultOnly'); await sleep(400);

// English Skatteverket letter
await window.MC.importPaths([await window.api.test.fixture('letter-skatteverket-en.png')]);
await waitFor('#rvConfirm', 90000); await sleep(600);
ok('English OCR → Skatteverket kvarskatt', $('#rvAgency').value === 'skatteverket' && $('#rvRule').value === 'skv.kvarskatt');
ok('pay-by 12 Nov 2026', $('[data-in="pay_by"]').value === '2026-11-12');
await click('#rvConfirm'); await waitFor('#stepper');

// Case detail with renewal window band
const permitCase = S.data.cases.find((c) => c.id === dl('migr.protection_extension').caseId);
window.MC.go('case', permitCase.id); await waitFor('.window-band');
document.querySelector('.dl details').open = true; await shot('06-case-permit-window');
// status change → Submitted
await click('#stepper .step:nth-child(3)'); await type('#statusNote', 'Applied in e-service'); await click('.mback [data-k=save]');
ok('status changed to submitted', permitCase.status === 'submitted' && permitCase.history.length === 2);

// Documents search (Arabic normalisation: search without hamza)
window.MC.go('docs'); await type('#docSearch', 'الاقامه'); await sleep(400);
ok('Arabic search finds letter (alef/taa-marbuta folding)', document.querySelectorAll('#docList tbody tr').length >= 1);
await type('#docSearch', 'betalningsforelaggande'); await sleep(400);
ok('Swedish search without diacritics', document.querySelectorAll('#docList tbody tr').length === 1);
await type('#docSearch', 'Kronofogden'); await shot('07-documents-search');

// Timeline, rules, today
window.MC.go('timeline'); await sleep(300); await click('#tl-1y'); ok('timeline renders lanes', document.querySelectorAll('.tl svg .lane-label').length >= 3); await shot('08-timeline');
window.MC.go('rules'); await sleep(300); ok('rules show source + verified date', document.querySelectorAll('[data-rule]').length === S.pack.rules.length && /verified/i.test(document.querySelector('[data-rule]').textContent)); await shot('09-rules-pack');
window.MC.go('today'); await sleep(400); await shot('10-today-dashboard');
ok('dashboard shows due + waiting', document.querySelectorAll('#dueCard .item').length >= 3 && document.querySelectorAll('#waitCard .item').length >= 1);

// reminders (main-process scheduler, notifications suppressed in test)
const fired = await window.api.test.tick('2026-10-20T08:30:00Z');
ok('reminder ladder fires (window open / due soon)', Array.isArray(fired) && fired.length >= 1, JSON.stringify(fired).slice(0, 160));
const again = await window.api.test.tick('2026-10-20T08:31:00Z');
ok('reminders do not repeat', Array.isArray(again) && again.length === 0);

// mark AF done → rolls to next month
const af = dl('af.activity_report'); window.MC.go('case', af.caseId); await waitFor(`[data-dl="${af.id}"] [data-act=done]`);
await click(`[data-dl="${af.id}"] [data-act=done]`); await type('#doneNote', 'Reported 6 applications'); await click('.mback [data-k=ok]');
ok('recurring AF report rolls to December after done', af.dueAt === '2026-12-14' && af.history.length === 1);

// override with reason
const lic = dl('ts.foreign_licence'); window.MC.go('case', lic.caseId); await click(`[data-dl="${lic.id}"] [data-act=override]`);
await type('#ovDate', '2027-01-10'); await type('#ovReason', 'Exchange appointment earlier'); await click('.mback [data-k=save]');
ok('override stored with reason', lic.dueAt === '2027-01-10' && lic.override.originalDue === '2027-01-15');

// ICS export + backup export
const ics = await window.MC.exportIcs(); ok('ics exported', !!ics, ics);
window.MC.go('settings'); await click('#backupBtn'); await type('#bkp1', 'correct horse battery'); await type('#bkp2', 'correct horse battery'); await click('.mback [data-k=save]'); await sleep(1500);
ok('backup exported', !!S.data.meta.lastBackup);
await shot('11-settings');

// Arabic RTL + Swedish
window.MC.go('today'); document.querySelector('.lang button:nth-child(3)').click(); await sleep(600);
ok('Arabic UI is RTL', document.documentElement.dir === 'rtl' && /اليوم/.test(document.body.textContent)); await shot('12-arabic-today-rtl');
window.MC.go('case', kfm.caseId); await sleep(500); await shot('13-arabic-case-kronofogden');
window.MC.go('review', S.data.documents.find((d) => /مصلحة/.test(d.text || '')).id); await sleep(1500); await shot('14-arabic-letter-review');
document.querySelector('.lang button:nth-child(2)').click(); await sleep(400); window.MC.go('case', permitCase.id); await sleep(800);
ok('Swedish UI', /Tidsfrister/.test(document.body.textContent)); await shot('15-swedish-case-permit');
document.querySelector('.lang button:nth-child(1)').click(); await sleep(300);
// dark theme
await window.api.setSettings({ theme: 'dark' }); S.settings.theme = 'dark'; document.body.classList.add('theme-dark'); window.MC.go('today'); await shot('16-dark-today'); document.body.classList.remove('theme-dark'); await window.api.setSettings({ theme: 'light' }); S.settings.theme = 'light';

// lock and unlock
await window.MC.flush(); await click('#lockBtn'); await waitFor('#pin'); await shot('17-lock-screen');
await type('#pin', '1111'); await click('#unlockBtn'); ok('wrong PIN rejected', !!$('#pin'));
await type('#pin', '2468'); await click('#unlockBtn'); await waitFor('#dueCard');
ok('unlock restores encrypted data', S.data.cases.length >= 6 && S.data.documents.length >= 4, `${S.data.cases.length} cases, ${S.data.documents.length} docs`);

// restore from backup (roundtrip): delete a case, restore, check it is back
const before = S.data.cases.length; S.data.cases.pop(); await window.MC.flush();
const bk = await window.api.test.fixture('export:' + 'MambaCases-backup-' + window.MCDates.today() + '.mcbak');
window.MC.restoreDlg(bk); await click('.mback [data-k=yes]'); await type('#rst1', 'correct horse battery'); await click('.mback [data-k=ok]'); await sleep(2500);
ok('backup restore roundtrip', S.data.cases.length === before, `${S.data.cases.length}/${before}`);

}
try { await run(); } catch (e) { ok('exception: ' + (e && e.message), false); }
const report = results.join('\n') + `\nUI: ${results.length - failed}/${results.length} passed`;
await window.api.test.done(failed ? 1 : 0, report);
