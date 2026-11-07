// "Your data" on Start here: back up everything the extensions remember (points, quotes, giveaways,
// counters and more), export one extension, restore from a file or a daily backup, and see what is waiting.
(() => {
  const view = { summary: null, restore: null };
  const host = () => document.getElementById('your-data-content');
  const status = (message) => { const node = document.getElementById('your-data-state'); if (node) node.textContent = message; };
  const post = async (path, body) => await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const size = (bytes) => bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${String(bytes)} bytes`;
  const when = (value) => { const time = Date.parse(value); return Number.isNaN(time) ? '' : new Date(time).toLocaleString(); };
  const kindLabel = { daily: 'Daily', manual: 'Saved by you', 'before-restore': 'Before a restore' };
  const slug = (value) => String(value).replace(/^thsv\./u, '').replace(/[^a-z0-9-]+/giu, '-');
  const save = (name, value) => {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  function render() {
    const target = host(); const summary = view.summary; if (!target || !summary) return;
    const modules = summary.modules || [];
    const withData = modules.filter((item) => item.dataBytes > 0 || item.hasSettings);
    const pending = summary.pendingRestore;
    const pendingHtml = pending ? `<div class="notice your-data-pending" role="alert"><strong>Restore waiting for a restart.</strong> ${safe((pending.modules || []).map((item) => item.name).join(', '))} will be replaced the next time StreamBridge starts. <button type="button" class="ghost compact" data-your-data-cancel>Cancel restore</button></div>` : '';
    const rows = withData.map((item) => `<div class="your-data-row"><span><strong>${safe(item.name)}</strong><small>${item.dataBytes ? `${safe(size(item.dataBytes))} saved${item.dataUpdatedAt ? ` · changed ${safe(when(item.dataUpdatedAt))}` : ''}` : 'Settings only'}</small></span><button type="button" class="ghost compact" data-your-data-export="${safe(item.moduleId)}">Export</button></div>`).join('');
    const backups = (summary.backups || []).map((item) => `<div class="your-data-row"><span><strong>${safe(when(item.createdAt))}</strong><small>${safe(kindLabel[item.kind] || item.kind)} · ${safe(size(item.bytes))}</small></span><span class="button-row"><button type="button" class="ghost compact" data-your-data-download="${safe(item.filename)}">Download</button><button type="button" class="ghost compact" data-your-data-restore-backup="${safe(item.filename)}">Restore</button></span></div>`).join('');
    target.innerHTML = `${pendingHtml}<div class="backup-tiles"><div class="backup-tile"><h4>Back up everything</h4><p>One file with every extension's data and settings, plus your wizard settings. No passwords or tokens.</p><div class="button-row"><button type="button" data-your-data-everything>Download backup</button><button type="button" class="ghost" data-your-data-now>Save a copy on this PC</button></div></div><div class="backup-tile"><h4>Restore from a file</h4><p>Pick a backup or an extension export. You choose what to bring back, and it applies when StreamBridge restarts.</p><div class="button-row"><label class="button-link ghost your-data-file">Choose file<input type="file" accept=".json,application/json" data-your-data-file hidden></label></div></div><div class="backup-tile"><h4>Daily backups</h4><p>StreamBridge saves a copy every day and keeps the last ${safe(summary.automaticBackupsKept || 14)}. They are in the StreamBridge folder under data\\backups\\data.</p></div></div>
      <div data-your-data-restore></div>
      <details class="addon-settings-section" data-disclosure-key="your-data:extensions"><summary><span><strong>Export one extension</strong><small>${safe(withData.length)} extension${withData.length === 1 ? '' : 's'} have saved data.</small></span></summary><div class="your-data-list">${rows || '<p class="notice">Nothing saved yet. Extensions save data once they are used.</p>'}</div></details>
      <details class="addon-settings-section" data-disclosure-key="your-data:backups"${backups ? '' : ' hidden'}><summary><span><strong>Saved backups</strong><small>${safe((summary.backups || []).length)} on this PC</small></span></summary><div class="your-data-list">${backups}</div></details>`;
    renderRestore();
  }

  function renderRestore() {
    const target = document.querySelector('[data-your-data-restore]'); const restore = view.restore; if (!target) return;
    if (!restore) { target.innerHTML = ''; return; }
    const items = (restore.preview.modules || []).map((item) => `<label class="your-data-choice"><input type="checkbox" value="${safe(item.moduleId)}"${item.installed ? ' checked' : ' disabled'}><span><strong>${safe(item.name)}</strong><small>${item.installed ? [item.hasData ? `data ${safe(size(item.dataBytes))}${item.currentDataBytes ? ` (now ${safe(size(item.currentDataBytes))})` : ''}` : '', item.hasSettings ? 'settings' : ''].filter(Boolean).join(' · ') : 'Not turned on here. Turn it on first to restore it.'}</small></span></label>`).join('');
    target.innerHTML = `<section class="your-data-restore transaction"><h4>Restore from ${safe(restore.label)}</h4><p>Made ${safe(when(restore.preview.createdAt) || 'at an unknown time')}${restore.preview.appVersion ? ` with StreamBridge ${safe(restore.preview.appVersion)}` : ''}. Tick what to bring back. It replaces what is there now.</p><div class="your-data-choices">${items || '<p class="notice">This file has no extension data.</p>'}</div><div class="your-data-parts"><label><input type="checkbox" data-your-data-part="data" checked> Data (points, quotes, history)</label><label><input type="checkbox" data-your-data-part="settings" checked> Extension settings</label>${restore.preview.hasConfiguration ? '<label><input type="checkbox" data-your-data-part="configuration"> Wizard settings too (you review them before saving)</label>' : ''}</div><div class="button-row"><button type="button" data-your-data-apply>Restore on next start</button><button type="button" class="ghost" data-your-data-close>Cancel</button></div></section>`;
  }

  async function refresh() {
    try { view.summary = await api('/wizard/api/data'); render(); status('A copy of everything is saved every day. Download one to keep it somewhere safe too.'); }
    catch (error) { status(error.message); }
  }

  async function exportOne(moduleId) {
    const bundle = await post('/wizard/api/data/export', { moduleIds: [moduleId] });
    save(`streambridge-${slug(moduleId)}-${new Date().toISOString().slice(0, 10)}.json`, bundle);
    status(`Exported ${(view.summary?.modules || []).find((item) => item.moduleId === moduleId)?.name || moduleId}.`);
  }

  async function openRestore(source, label) {
    const preview = await post('/wizard/api/data/preview', source);
    view.restore = { source, label, preview }; renderRestore();
    document.querySelector('[data-your-data-restore]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function applyRestore() {
    const restore = view.restore; if (!restore) return;
    const moduleIds = [...document.querySelectorAll('.your-data-choices input:checked')].map((input) => input.value);
    const part = (name) => document.querySelector(`[data-your-data-part="${name}"]`)?.checked === true;
    const withConfiguration = part('configuration');
    if (!moduleIds.length && !withConfiguration) { status('Tick at least one thing to restore.'); return; }
    if (moduleIds.length && !part('data') && !part('settings')) { status('Tick data, settings or both.'); return; }
    if (!confirm('Restore the ticked items? A backup of everything is saved first, and the restore happens the next time StreamBridge starts.')) return;
    const messages = [];
    if (moduleIds.length) {
      const result = await post('/wizard/api/data/restore', { ...restore.source, moduleIds, data: part('data'), settings: part('settings'), approvedByCreator: true });
      messages.push(`${String(result.staged)} extension${result.staged === 1 ? '' : 's'} will be restored when StreamBridge restarts.`);
      if (result.skipped?.length) messages.push(`Skipped: ${result.skipped.map((item) => `${item.moduleId} (${item.reason})`).join(', ')}.`);
    }
    if (withConfiguration) {
      const bundle = restore.source.bundle || await post('/wizard/api/data/backups/read', { filename: restore.source.backup });
      if (bundle?.configuration && typeof stageConfigurationImport === 'function') { await stageConfigurationImport(JSON.stringify(bundle.configuration)); messages.push('Wizard settings are waiting under Unsaved changes. Review and save them.'); }
    }
    view.restore = null; await refresh(); status(messages.join(' '));
  }

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null; if (!button || !button.closest('#your-data')) return;
    const run = (task) => { button.disabled = true; void task().catch((error) => status(error.message)).finally(() => { button.disabled = false; }); };
    if (button.matches('[data-your-data-refresh]')) run(refresh);
    else if (button.matches('[data-your-data-everything]')) run(async () => { save(`streambridge-backup-${new Date().toISOString().slice(0, 10)}.json`, await post('/wizard/api/data/export', {})); status('Backup downloaded. Keep it somewhere safe, like OneDrive or a USB stick.'); });
    else if (button.matches('[data-your-data-now]')) run(async () => { await post('/wizard/api/data/backups/now', {}); await refresh(); status('A copy was saved on this PC.'); });
    else if (button.dataset.yourDataExport) run(async () => await exportOne(button.dataset.yourDataExport));
    else if (button.dataset.yourDataDownload) run(async () => { save(button.dataset.yourDataDownload, await post('/wizard/api/data/backups/read', { filename: button.dataset.yourDataDownload })); });
    else if (button.dataset.yourDataRestoreBackup) run(async () => await openRestore({ backup: button.dataset.yourDataRestoreBackup }, 'a saved backup'));
    else if (button.matches('[data-your-data-apply]')) run(applyRestore);
    else if (button.matches('[data-your-data-close]')) { view.restore = null; renderRestore(); }
    else if (button.matches('[data-your-data-cancel]')) run(async () => { await post('/wizard/api/data/restore/cancel', {}); await refresh(); status('The waiting restore was cancelled. Nothing was changed.'); });
  });

  document.addEventListener('change', (event) => {
    const input = event.target; if (!(input instanceof HTMLInputElement) || !input.matches('[data-your-data-file]')) return;
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    void (async () => {
      if (file.size > 64 * 1_048_576) throw new Error('That file is too big.');
      let bundle; try { bundle = JSON.parse(await file.text()); } catch { throw new Error('That file is not a StreamBridge backup.'); }
      await openRestore({ bundle }, file.name);
    })().catch((error) => status(error.message));
  });

  window.refreshYourData = refresh;
  document.addEventListener('wizard:authenticated', () => { if (host()) void refresh(); });
})();
