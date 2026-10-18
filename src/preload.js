'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('api', {
  pathFor: (f) => { try { return webUtils.getPathForFile(f); } catch (_) { return ''; } },
  info: inv('app:info'), settings: inv('settings:get'), setSettings: inv('settings:set'), pack: inv('rules:pack'),
  vaultStatus: inv('vault:status'), vaultCreate: inv('vault:create'), unlock: inv('vault:unlock'), lock: inv('vault:lock'), save: inv('vault:save'),
  verifyPin: inv('vault:verifyPin'), changePin: inv('vault:changePin'), wipe: inv('vault:wipe'),
  importPaths: inv('doc:import'), importBuffer: inv('doc:importBuffer'), docBytes: inv('doc:bytes'), docDelete: inv('doc:delete'), ocr: inv('doc:ocr'), docSaveAs: inv('doc:saveAs'),
  pickFiles: inv('dialog:openFiles'), saveText: inv('file:saveText'), backupExport: inv('backup:export'), backupImport: inv('backup:import'),
  openUrl: inv('shell:open'), notifyTest: inv('notify:test'), remindersPreview: inv('reminders:preview'),
  onOcrProgress: (cb) => ipcRenderer.on('ocr-progress', (_e, x) => cb(x)),
  onOpenDeadline: (cb) => ipcRenderer.on('open-deadline', (_e, id) => cb(id)),
  onLockNow: (cb) => ipcRenderer.on('lock-now', () => cb()),
  ...(process.env.MAMBA_CASES_UITEST ? { test: { shot: inv('test:shot'), fixture: inv('test:fixture'), tick: inv('test:tick'), done: inv('test:done'), size: inv('test:size') } } : {}),
});
