# Mamba Cases 0.1.0 (first MVP)

Mamba Cases is an offline Windows app for keeping track of your cases and deadlines with Swedish agencies. The UI is in English, Swedish and Arabic (right to left). Everything stays on your PC, encrypted with your PIN: no cloud, no account, no AI service.

## Downloads (Windows 10/11 x64)
- **MambaCases-Setup-0.1.0-x64.exe**: installer for the current user. No admin rights needed.
- **MambaCases-Portable-0.1.0-x64.exe**: a single exe you run without installing.
- **MambaCases-0.1.0-win-x64.zip**: unzip it and run `Mamba Cases.exe`.

The app is **not code-signed**, so Windows SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**.

## What's in 0.1.0
- **People and cases per agency** with a status stepper: planned → preparing → submitted → waiting → needs action → decided → appealed → closed. Each case has a checklist, notes, history and documents.
- **Deadline rules engine** with 17 sourced rules:
  - Migrationsverket: protection permit renewal, the new-permit calculator including the subsidiary protection 3-year permit, and work permit extension
  - Arbetsförmedlingen: activity report, 1st–14th
  - Skatteverket: moving notice, tax return, residual tax
  - Försäkringskassan
  - CSN
  - Stockholm housing queue
  - Kronofogden: payment order and återvinning
  - Transportstyrelsen: foreign driving licence
  - 1177

  Every deadline shows *why this date*, *what happens if I miss it*, the official source URL and the date the rule was last verified. Swedish public holidays are built in, and a deadline is never moved later than the official date.
- **Letter import:** drag and drop a PDF or image. It is read with **local OCR** in Swedish, English and Arabic (bundled tesseract language data). Agency, case number, dates and amounts are suggested by rules, and nothing is saved until you confirm.
- **Document vault** stored encrypted, with search across letter text (Arabic-aware matching).
- **Timeline** of all deadlines and events.
- **Reminder ladders** (e.g. 30/14/7/3/1/0 days before) shown as Windows notifications. They keep working from the tray. **.ics export** for any calendar app.
- **Today dashboard:** what's due, what you're waiting for, letters to review, this month's activity report and permit expiry dates.
- **Encrypted backup** (.mcbak, protected by its own passphrase) that you can export and restore.
- **Security:** PIN lock with auto-lock and lockout after wrong attempts. AES-256-GCM, with the key also protected by Windows DPAPI. ID numbers are masked by default.

> Mamba Cases is a reminder aid and not legal advice. Always check the date in the letter or with the agency.
