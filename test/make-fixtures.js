// Generates synthetic letters (fictional people/numbers) as PNG (for OCR) and PDF (text layer).
// Run: xvfb-run -a electron --no-sandbox test/make-fixtures.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'fixtures');
const css = `body{margin:0;background:#fff;font:19px/1.45 "DejaVu Sans","Noto Sans","Noto Sans Arabic",Arial,sans-serif;color:#111;padding:48px 60px;width:900px}h1{font-size:30px;margin:0 0 6px}h2{font-size:22px;margin:24px 0 8px}.r{text-align:right}`;
const letters = {
  'letter-kronofogden-sv': `<h1>Kronofogden</h1><div>Box 1050, 172 21 Sundbyberg</div><h2>Betalningsföreläggande</h2>
   <p>Målnummer: 12-345678-26<br>Datum: 2026-10-15</p><p>Till: Sami Exempel, Storgatan 1, 123 45 Stockholm</p>
   <p>Sökanden Exempel Inkasso AB begär att du ska betala 4 250 kr enligt bifogad ansökan.</p>
   <p>Om du inte håller med om kravet ska du bestrida det skriftligt inom tio dagar från att du tog del av detta brev. Bestrid även om du redan har betalat.</p>
   <p>Svarar du inte kan Kronofogden meddela utslag.</p><p>Läs mer på kronofogden.se</p>`,
  'letter-skatteverket-en': `<h1>Swedish Tax Agency – Skatteverket</h1><h2>Final tax statement – residual tax</h2>
   <p>Reference number: 2026/0456-77<br>Date: 2026-08-20</p><p>You have residual tax to pay: 3 120 kr.</p>
   <p>The amount must be booked on your tax account no later than 12 November 2026.</p><p>Bankgiro: 5050-1055 &nbsp; OCR: 1990010112345</p>`,
  'letter-arabic': `<div dir="rtl"><h1>مصلحة الهجرة</h1><h2>ملخص القرار</h2><p>رقم القضية: 22-778899</p>
   <p>تصريح الإقامة صالح حتى 12 مارس 2027.</p><p>يمكنك تقديم طلب التمديد قبل انتهاء التصريح بشهرين.</p></div>`,
};
const pdfLetter = `<h1>Migrationsverket</h1><div>601 70 Norrköping</div><h2>Beslut om uppehållstillstånd</h2>
  <p>Ärendenummer: 21-123456<br>Beslutsdatum: 3 februari 2026</p><p>Sökande: Sami Exempel</p>
  <p>Migrationsverket beviljar dig uppehållstillstånd som subsidiärt skyddsbehövande.</p>
  <p>Tillståndet gäller från och med 2026-02-10 till och med 2029-02-09.</p>
  <p>Du kan ansöka om förlängning tidigast två månader innan tillståndet går ut.</p>`;
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = new BrowserWindow({ show: false, width: 1020, height: 900, webPreferences: { offscreen: false } });
  for (const [name, body] of Object.entries(letters)) {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset=utf-8><style>${css}</style>${body}`));
    await new Promise((r) => setTimeout(r, 300));
    const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); console.log('wrote', name + '.png');
  }
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset=utf-8><style>${css}</style>${pdfLetter}`));
  fs.writeFileSync(path.join(OUT, 'letter-migrationsverket-sv.pdf'), await w.webContents.printToPDF({ pageSize: 'A4' })); console.log('wrote pdf');
  app.quit();
});
