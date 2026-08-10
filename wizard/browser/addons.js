async function fetchAddOnRuntimeDiagnostics() {
  try {
    const response = await fetch('/diagnostics');
    if (!response.ok) throw new Error(`Runtime diagnostics failed (${response.status})`);
    return await response.json();
  } catch {
    return null;
  }
}

async function waitForAddOnOverlayClient(moduleId, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs;
  do {
    const runtime = await fetchAddOnRuntimeDiagnostics();
    if (runtime) state.addOnRuntime = runtime;
    const clients = state.addOnRuntime?.browserOverlay?.addOnClients?.[moduleId] || 0;
    if (clients > 0 || Date.now() >= deadline) return clients;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return 0;
}

async function loadAddOns() {
  const status = byId('addon-state');
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Verifying installed add-ons...';
  try {
    const [result, runtime] = await Promise.all([
      api('/wizard/api/addons'),
      fetchAddOnRuntimeDiagnostics(),
    ]);
    let acceptanceResult = { acceptance: {} };
    try { acceptanceResult = await api('/wizard/api/addons/acceptance'); }
    catch (error) {
      // A 2.5 wizard can be hot-updated over a 2.4 service. Inventory and settings remain usable;
      // only the newer creator-facing acceptance ledger stays unavailable until the core updates.
      if (!/not found/iu.test(String(error?.message || error))) throw error;
    }
    state.addOns = result.addOns;
    state.addOnRuntime = runtime;
    syncAddOnRestartState(runtime?.startedAt);
    state.discoveredAddOns = result.discovered || [];
    state.trustedAddOnPublishers = result.trustedPublishers || [];
    state.addOnAcceptance = acceptanceResult.acceptance || {};
    if (!state.addOnActionDrafts) state.addOnActionDrafts = {};
    if (!state.addOnActionGroupDrafts) state.addOnActionGroupDrafts = {};
    if (!state.addOnActionNameCache) state.addOnActionNameCache = loadAddOnActionNameCache();
    const installedIds = new Set(state.addOns.map((addOn) => addOn.moduleId));
    for (const id of Object.keys(state.addOnActionDrafts)) if (!installedIds.has(id)) delete state.addOnActionDrafts[id];
    for (const id of Object.keys(state.addOnActionGroupDrafts)) if (!installedIds.has(id)) delete state.addOnActionGroupDrafts[id];
    if (state.selectedAddOnId && !state.addOns.some((addOn) => addOn.moduleId === state.selectedAddOnId)) state.selectedAddOnId = '';
    if (!state.selectedAddOnId && state.addOns.length) state.selectedAddOnId = state.addOns[0].moduleId;
    renderAddOns();
    renderDiscoveredAddOns();
    renderTrustedPublishers();
    const pending = state.addOnRestartRequiredIds.size;
    const runtimeSummary = runtime ? `${runtime.ready ? 'Runtime ready' : 'Runtime needs attention'}; ${runtime.browserOverlay?.clients || 0} shared overlay client(s) connected.` : 'Runtime diagnostics are unavailable; saved settings remain usable.';
    status.textContent = `${state.addOns.length} installed and ${state.discoveredAddOns.length} discovered add-on package(s) inspected. ${runtimeSummary}${pending ? ` Restart StreamBridge to apply ${pending} pending add-on change${pending === 1 ? '' : 's'}.` : ''}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    status.removeAttribute('aria-busy');
  }
}

const ADD_ON_RESTART_STORAGE_KEY = 'thsv-addon-restart-required-v1';

function readAddOnRestartState() {
  try {
    const value = JSON.parse(sessionStorage.getItem(ADD_ON_RESTART_STORAGE_KEY) || 'null');
    return value && Array.isArray(value.moduleIds) ? value : { startedAt: '', moduleIds: [] };
  } catch {
    return { startedAt: '', moduleIds: [] };
  }
}

function syncAddOnRestartState(startedAt) {
  const pending = readAddOnRestartState();
  if (pending.startedAt && startedAt && pending.startedAt !== startedAt) {
    sessionStorage.removeItem(ADD_ON_RESTART_STORAGE_KEY);
    state.addOnRestartRequiredIds = new Set();
    return;
  }
  state.addOnRestartRequiredIds = new Set(pending.moduleIds);
}

function markAddOnRestartRequired(moduleId) {
  state.addOnRestartRequiredIds.add(moduleId);
  sessionStorage.setItem(ADD_ON_RESTART_STORAGE_KEY, JSON.stringify({
    startedAt: state.addOnRuntime?.startedAt || readAddOnRestartState().startedAt || '',
    moduleIds: [...state.addOnRestartRequiredIds],
  }));
}

function reportAddOnFeedback(message, kind = 'success', button) {
  const status = byId('addon-state');
  if (status) status.textContent = message;
  showWizardFeedback(message, kind, button);
}

function addOnRuntimeModule(moduleId) {
  return state.addOnRuntime?.modules?.find((module) => module.moduleId === moduleId);
}

function renderAddOnRuntimeStatus(addOn) {
  if (addOn.health === 'rejected') return '<span class="status-chip status-warning">Package rejected</span>';
  if (state.addOnRestartRequiredIds.has(addOn.moduleId)) return '<span class="status-chip status-neutral">Restart required</span>';
  if (!addOn.enabled) return '<span class="status-chip status-neutral">Disabled</span>';
  const runtime = addOnRuntimeModule(addOn.moduleId);
  if (!state.addOnRuntime) return '<span class="status-chip status-neutral">Runtime unknown</span>';
  if (!runtime) return '<span class="status-chip status-warning">Not loaded</span>';
  if (runtime.status === 'healthy') return '<span class="status-chip status-ready">Runtime healthy</span>';
  return `<span class="status-chip status-warning">${safe(addOnOptionLabel(runtime.status || 'Needs attention'))}</span>`;
}

function renderAddOnRuntimeSummary(addOn) {
  if (addOn.health === 'rejected') return '';
  const pending = state.addOnRestartRequiredIds.has(addOn.moduleId);
  const runtime = addOnRuntimeModule(addOn.moduleId);
  const moduleMessage = pending
    ? '<strong>Saved change pending:</strong> restart StreamBridge, then refresh this page to verify the active module.'
    : !addOn.enabled
      ? '<strong>Module disabled:</strong> enable it and restart StreamBridge before testing.'
      : runtime?.status === 'healthy'
        ? '<strong>Module:</strong> healthy in the running StreamBridge process.'
        : runtime
          ? `<strong>Module needs attention:</strong> ${safe(runtime.message || addOnOptionLabel(runtime.status || 'unknown status'))}.`
          : '<strong>Module not loaded:</strong> restart StreamBridge. If it remains missing, inspect the package status and daily log.';
  const addOnOverlayClients = state.addOnRuntime?.browserOverlay?.addOnClients?.[addOn.moduleId] || 0;
  const overlayMessage = addOn.permissions.includes('overlay.publish')
    ? addOnOverlayClients > 0
      ? `<span><strong>Overlay connected:</strong> ${safe(addOnOverlayClients)} browser-source instance${addOnOverlayClients === 1 ? '' : 's'} registered for this add-on. Send a preview below for a final visual check.</span>`
      : state.addOnRuntime?.browserOverlay?.clients > 0
        ? '<span><strong>This overlay is not connected:</strong> the shared transport is running for another source, but this add-on did not register an OBS browser source. Add or refresh its URL below.</span>'
        : '<span><strong>Overlay not connected:</strong> add or open the browser-source URL below, then send a preview. Saving settings alone cannot make OBS display it.</span>'
    : '';
  const serviceMessage = !state.addOnRuntime
    ? '<span><strong>Runtime diagnostics unavailable:</strong> refresh the page after confirming StreamBridge is running.</span>'
    : state.addOnRuntime.ready
      ? ''
      : '<span><strong>Bridge not ready:</strong> review Connections and Diagnostics before testing this add-on.</span>';
  const tone = pending || !addOn.enabled || !runtime || runtime.status !== 'healthy' || (addOn.permissions.includes('overlay.publish') && addOnOverlayClients === 0) ? 'warning' : 'ready';
  return `<div class="addon-runtime-summary status-${tone}" role="status"><span>${moduleMessage}</span>${overlayMessage}${serviceMessage}</div>`;
}

function renderTrustedPublishers() {
  const list = byId('trusted-publisher-list');
  const publishers = state.trustedAddOnPublishers || [];
  if (!publishers.length) { list.innerHTML = '<p class="notice">No third-party publishers are trusted. Official THSV updates remain available above.</p>'; return; }
  list.innerHTML = publishers.map((publisher) => `<article class="item"><strong>${safe(publisher.publisherId)}</strong><small>${safe(publisher.repository)}</small><div class="button-row"><button type="button" class="compact" data-check-trusted-publisher="${safe(publisher.publisherId)}">Check updates</button><button type="button" class="ghost compact" data-remove-trusted-publisher="${safe(publisher.publisherId)}">Remove trust</button></div></article>`).join('');
  document.querySelectorAll('[data-check-trusted-publisher]').forEach((button) => button.addEventListener('click', checkTrustedPublisherUpdates));
  document.querySelectorAll('[data-remove-trusted-publisher]').forEach((button) => button.addEventListener('click', removeTrustedPublisher));
}

async function checkTrustedPublisherUpdates(event) {
  const publisherId = event.currentTarget.dataset.checkTrustedPublisher;
  const status = byId('addon-update-state'); status.textContent = `Checking the authenticated release for ${publisherId}...`;
  try {
    const result = await api('/wizard/api/addons/trusted-updates/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publisherId }) });
    state.addOnUpdates = result.available ? result : null; state.addOnUpdatePublisherId = publisherId;
    status.textContent = result.available ? `${result.updateCount} compatible update(s) found for ${publisherId}. Nothing was downloaded or installed.` : `Publisher update check unavailable: ${result.error}`;
    renderAddOns();
  } catch (error) { status.textContent = error.message; }
}

async function removeTrustedPublisher(event) {
  const publisherId = event.currentTarget.dataset.removeTrustedPublisher;
  if (!confirm(`Remove update trust for ${publisherId}? Installed add-ons and their data are preserved.`)) return;
  try { await api(`/wizard/api/addons/trusted-publishers/${encodeURIComponent(publisherId)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvedByCreator: true }) }); await loadAddOns(); }
  catch (error) { byId('addon-state').textContent = error.message; }
}

function addOnOptionLabel(value) {
  const knownLabels = { youtube: 'YouTube', tiktok: 'TikTok', tikfinity: 'TikFinity', streamerbot: 'Streamer.bot' };
  const normalized = String(value).toLowerCase();
  return knownLabels[normalized] || String(value).replaceAll('-', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function addOnVisibilityAttributes(ui) {
  const condition = ui?.visibleWhen;
  if (!condition || typeof condition.field !== 'string') return '';
  if (Object.hasOwn(condition, 'equals')) return ` data-addon-visible-field="${safe(condition.field)}" data-addon-visible-value="${safe(JSON.stringify(condition.equals))}"`;
  if (Array.isArray(condition.in) && condition.in.length > 0) return ` data-addon-visible-field="${safe(condition.field)}" data-addon-visible-values="${safe(JSON.stringify(condition.in))}"`;
  return '';
}

function safeAddOnLink(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function renderAddOnTrustLinks(trust = {}) {
  const links = [
    ['Source', trust.sourceUrl],
    ['Support', trust.supportUrl],
    ['Updates', trust.updateManifestUrl],
    ['Revocations', trust.revocationListUrl],
  ].map(([label, value]) => {
    const href = safeAddOnLink(value);
    return href ? `<a href="${safe(href)}" target="_blank" rel="noreferrer noopener">${safe(label)}</a>` : '';
  }).filter(Boolean).join('');
  const publisher = trust.publisherId ? `<small><strong>Publisher ID:</strong> ${safe(trust.publisherId)}</small>` : '';
  if (!links && !publisher) return '<p class="notice">No publisher update or revocation metadata is declared. Install only if you trust the bundled source and release page.</p>';
  return `<div class="addon-trust-links">${publisher}${links ? `<div class="button-row">${links}</div>` : ''}</div>`;
}

function renderAddOnUpdate(addOn) {
  const update = state.addOnUpdates?.addOns?.find((entry) => entry.moduleId === addOn.moduleId);
  if (!update) return '';
  const labels = {
    current: 'Current',
    'update-available': 'Update available',
    'requires-newer-core': 'Core update required',
    'publisher-mismatch': 'Publisher mismatch',
    revoked: 'Revoked',
    'not-listed': 'Not in official index',
    rejected: 'Local package rejected',
  };
  const version = update.latestVersion ? ` Latest authenticated version: ${update.latestVersion}.` : '';
  const warning = update.warning ? ` ${update.warning}` : '';
  const archive = update.archiveName ? `<small><strong>Verified release package:</strong> ${safe(update.archiveName)}</small>` : '';
  const checksum = update.sha256 ? `<small><strong>Published SHA-256:</strong> <code>${safe(update.sha256)}</code></small>` : '';
  const download = update.state === 'update-available' && update.latestVersion
    ? `<div class="button-row"><button type="button" class="compact" data-stage-addon-update="${safe(update.moduleId)}" data-stage-addon-version="${safe(update.latestVersion)}">Download &amp; verify update</button></div><small>The wizard verifies the official release bundle, SHA-256 checksums, GitHub build provenance, publisher, version, and inner package before placing it in the inbox. Installation still requires your separate review and approval.</small>`
    : '';
  return `<div class="notice addon-update-result" data-addon-update-state="${safe(update.state)}"><strong>${safe(labels[update.state] || update.state)}.</strong>${safe(version + warning)}${archive}${checksum}${download}</div>`;
}

function renderAddOnField(name, schema, value, ui = {}) {
  const type = schema.type;
  const label = safe(schema.title || name);
  const help = schema.description ? `<small>${safe(schema.description)}</small>` : '';
  const fullRow = type === 'array' || schema.format === 'multiline' || ui.fullRow === true;
  const wrapper = (content) => `<div class="addon-setting ${fullRow ? 'full-row' : ''}"${addOnVisibilityAttributes(ui)}>${content}</div>`;
  if (ui.control === 'scene-mappings') return wrapper(renderSceneMappingEditor(name, value, help));
  if (ui.control === 'streamerbot-action') return wrapper(`<label>${label}<select name="${safe(name)}">${inspectedActionOptions(value || '')}</select>${help}<small>Refresh Streamer.bot actions first. The selected action must also be approved in this add-on's action-grants section.</small></label>`);
  if (type === 'array' && Array.isArray(schema.items?.enum)) {
    const selected = new Set(Array.isArray(value) ? value : []);
    return wrapper(`<fieldset class="addon-choice-field"><legend>${label}</legend><div class="addon-choice-grid">${schema.items.enum.map((entry) => `<label class="addon-choice"><input name="${safe(name)}" type="checkbox" value="${safe(entry)}" data-addon-enum-list="true" ${selected.has(entry) ? 'checked' : ''}><span>${safe(ui.labels?.[entry] || addOnOptionLabel(entry))}</span></label>`).join('')}</div>${help}</fieldset>`);
  }
  if (Array.isArray(schema.enum)) return wrapper(`<label>${label}<select name="${safe(name)}">${schema.enum.map((entry) => `<option value="${safe(entry)}" ${entry === value ? 'selected' : ''}>${safe(ui.labels?.[entry] || addOnOptionLabel(entry))}</option>`).join('')}</select>${help}</label>`);
  if (type === 'boolean') return wrapper(`<label class="addon-toggle"><span><strong>${label}</strong>${help}</span><input name="${safe(name)}" type="checkbox" role="switch" ${value === true ? 'checked' : ''}><i aria-hidden="true"></i></label>`);
  if (type === 'number' || type === 'integer') return wrapper(`<label>${label}<input name="${safe(name)}" type="number" ${type === 'integer' ? 'step="1"' : 'step="any"'} value="${safe(value ?? '')}" ${Number.isFinite(schema.minimum) ? `min="${safe(schema.minimum)}"` : ''} ${Number.isFinite(schema.maximum) ? `max="${safe(schema.maximum)}"` : ''}>${help}</label>`);
  if (type === 'array') return wrapper(`<label>${label}<textarea name="${safe(name)}" rows="${safe(Number.isInteger(ui.rows) ? ui.rows : 4)}" data-addon-string-list="true" placeholder="One item per line">${safe(Array.isArray(value) ? value.join('\n') : '')}</textarea>${help}<small>Enter one item per line. Empty and duplicate entries are rejected.</small></label>`);
  if (schema.format === 'multiline') return wrapper(`<label>${label}<textarea name="${safe(name)}" rows="${safe(Number.isInteger(ui.rows) ? ui.rows : 4)}" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 2000)}">${safe(value ?? '')}</textarea>${help}</label>`);
  if (schema.format === 'color') return wrapper(`<label>${label}<input name="${safe(name)}" type="color" value="${safe(value || '#6f42c1')}">${help}</label>`);
  return wrapper(`<label>${label}<input name="${safe(name)}" type="text" value="${safe(value ?? '')}" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 500)}">${help}</label>`);
}

function parseSceneMappingRows(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => { try { const parsed = JSON.parse(entry); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; } }).filter(Boolean).slice(0, 50);
}

function sceneActionOptions(selectedId = '') {
  const prohibited = new Set(['143fce1d-c5b0-4108-b766-ee2d0249e2d4', '18bdc91c-64eb-4787-8be9-6a921b272943']);
  const starterActions = [
    { id: '68fa3646-8b6c-4ef0-bf96-19474de8b620', name: 'THSV Scene - Starting Soon', group: 'THSV Addon - Scene Actions', enabled: true },
    { id: '93ff064c-dd73-44fd-9a7e-f0b9499e4760', name: 'THSV Scene - Just Chatting', group: 'THSV Addon - Scene Actions', enabled: true },
    { id: '6f22b156-ad06-42c2-bc5d-92ce89c02510', name: 'THSV Scene - Gameplay', group: 'THSV Addon - Scene Actions', enabled: true },
    { id: '8b58b594-06c3-45e9-9fc1-f2655b02b92f', name: 'THSV Scene - Be Right Back', group: 'THSV Addon - Scene Actions', enabled: true },
    { id: 'c7f5238b-33e1-4095-9dbe-06a331218c74', name: 'THSV Scene - Ending Soon', group: 'THSV Addon - Scene Actions', enabled: true },
  ];
  const byId = new Map(starterActions.map((action) => [action.id, action]));
  for (const action of state.liveActions) if (!prohibited.has(action.id.toLowerCase())) byId.set(action.id, action);
  const actions = [...byId.values()].sort((left, right) => actionGroupName(left).localeCompare(actionGroupName(right)) || left.name.localeCompare(right.name));
  const hasSelected = actions.some((action) => action.id === selectedId); const remembered = state.addOnActionNameCache?.[selectedId];
  const unavailable = selectedId && !hasSelected ? `<option value="${safe(selectedId)}" selected>${safe(remembered?.name || 'Saved action')} — ${safe(selectedId)}</option>` : '';
  return `<option value="">Choose a Streamer.bot action…</option>${unavailable}${actions.map((action) => `<option value="${safe(action.id)}" ${action.id === selectedId ? 'selected' : ''}>${safe(actionGroupName(action))} — ${safe(action.name)}</option>`).join('')}`;
}

function inspectedActionOptions(selectedId = '') {
  const prohibited = new Set([
    '143fce1d-c5b0-4108-b766-ee2d0249e2d4', '18bdc91c-64eb-4787-8be9-6a921b272943',
    '6a78d950-17b5-4a98-9de7-1a5b4275f31c', 'e924f0ad-36c1-4687-8c05-c39466d06963',
    'b2a5681e-329a-40ac-9ce3-57d249ba80fe', 'c3a739c4-dfdc-455b-a377-bf9d72f4cd30',
    '74d1914e-8b75-4cb6-90f6-977a77803082',
  ]);
  const actions = state.liveActions.filter((action) => !prohibited.has(action.id.toLowerCase()))
    .sort((left, right) => actionGroupName(left).localeCompare(actionGroupName(right)) || left.name.localeCompare(right.name));
  const hasSelected = actions.some((action) => action.id === selectedId); const remembered = state.addOnActionNameCache?.[selectedId];
  const unavailable = selectedId && !hasSelected ? `<option value="${safe(selectedId)}" selected>${safe(remembered?.name || 'Saved action')} - ${safe(selectedId)}</option>` : '';
  const prompt = actions.length ? 'Choose an inspected Streamer.bot action...' : 'Refresh Streamer.bot actions to choose...';
  return `<option value="">${prompt}</option>${unavailable}${actions.map((action) => `<option value="${safe(action.id)}" ${action.id === selectedId ? 'selected' : ''}>${safe(actionGroupName(action))} - ${safe(action.name)}</option>`).join('')}`;
}

function renderSceneMappingRow(mapping = {}) {
  const provider = ['obs', 'streamlabs', 'meld'].includes(mapping.provider) ? mapping.provider : 'obs'; const delay = Number.isInteger(mapping.delaySeconds) ? Math.min(60, Math.max(0, mapping.delaySeconds)) : 0;
  const id = typeof mapping.id === 'string' && mapping.id ? mapping.id : `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return `<article class="scene-mapping-row" data-scene-mapping-row data-scene-mapping-id="${safe(id)}"><div class="title-row"><label class="addon-toggle"><span><strong>Mapping enabled</strong></span><input type="checkbox" role="switch" data-scene-mapping-field="enabled" ${mapping.enabled !== false ? 'checked' : ''}><i aria-hidden="true"></i></label><button type="button" class="danger ghost" data-remove-scene-mapping>Remove</button></div><div class="scene-mapping-grid"><label>Provider<select data-scene-mapping-field="provider"><option value="obs" ${provider === 'obs' ? 'selected' : ''}>OBS Studio</option><option value="streamlabs" ${provider === 'streamlabs' ? 'selected' : ''}>Streamlabs Desktop</option><option value="meld" ${provider === 'meld' ? 'selected' : ''}>Meld Studio</option></select></label><label>Exact scene name<input type="text" maxlength="256" required data-scene-mapping-field="sceneName" value="${safe(mapping.sceneName || '')}" placeholder="Starting Soon"></label><label>Connection name (optional)<input type="text" maxlength="256" data-scene-mapping-field="connectionName" value="${safe(mapping.connectionName || '')}" placeholder="Any connection"></label><label>Wait before action (seconds)<input type="number" min="0" max="60" step="1" data-scene-mapping-field="delaySeconds" value="${safe(delay)}"></label><label class="full-row">Streamer.bot target action<select required data-scene-mapping-field="actionId">${sceneActionOptions(mapping.actionId || '')}</select><small>Approve this same action in the section below before restarting StreamBridge.</small></label></div></article>`;
}

function renderSceneMappingEditor(name, value, help) {
  const rows = parseSceneMappingRows(value);
  return `<fieldset class="scene-mapping-editor" data-scene-mapping-editor><legend>Scene-to-action mappings</legend><p>One scene can run one or more approved actions. Use the optional connection name only when two connections reuse the same scene name.</p><textarea class="hidden" aria-hidden="true" tabindex="-1" name="${safe(name)}" data-addon-string-list="true">${safe(Array.isArray(value) ? value.join('\n') : '')}</textarea><div data-scene-mapping-list>${rows.map(renderSceneMappingRow).join('')}</div><button type="button" class="ghost" data-add-scene-mapping>Add scene mapping</button>${help}<small>Mappings use stable action IDs, so renaming a target action in Streamer.bot does not break it.</small></fieldset>`;
}

function syncSceneMappingEditor(editor) {
  const textarea = editor.querySelector('textarea[name="mappings"]');
  const mappings = [...editor.querySelectorAll('[data-scene-mapping-row]')].map((row) => ({ id: row.dataset.sceneMappingId, enabled: row.querySelector('[data-scene-mapping-field="enabled"]').checked, provider: row.querySelector('[data-scene-mapping-field="provider"]').value, connectionName: row.querySelector('[data-scene-mapping-field="connectionName"]').value.trim(), sceneName: row.querySelector('[data-scene-mapping-field="sceneName"]').value.trim(), actionId: row.querySelector('[data-scene-mapping-field="actionId"]').value, delaySeconds: Number(row.querySelector('[data-scene-mapping-field="delaySeconds"]').value) }));
  textarea.value = mappings.map((mapping) => JSON.stringify(mapping)).join('\n'); return mappings;
}

function attachSceneMappingEditor(editor) {
  editor.addEventListener('input', () => syncSceneMappingEditor(editor)); editor.addEventListener('change', () => syncSceneMappingEditor(editor));
  editor.querySelector('[data-add-scene-mapping]').addEventListener('click', () => { const list = editor.querySelector('[data-scene-mapping-list]'); if (list.children.length >= 50) { byId('addon-state').textContent = 'Scene Actions supports at most 50 mappings.'; return; } list.insertAdjacentHTML('beforeend', renderSceneMappingRow()); syncSceneMappingEditor(editor); });
  editor.addEventListener('click', (event) => { const button = event.target.closest('[data-remove-scene-mapping]'); if (!button) return; button.closest('[data-scene-mapping-row]').remove(); syncSceneMappingEditor(editor); });
}

function orderedAddOnProperties(addOn) {
  const properties = addOn.configurationSchema?.properties || {};
  const requested = Array.isArray(addOn.settingsUi?.order) ? addOn.settingsUi.order.filter((name) => typeof name === 'string' && Object.hasOwn(properties, name)) : [];
  const seen = new Set(requested);
  return [...requested.map((name) => [name, properties[name]]), ...Object.entries(properties).filter(([name]) => !seen.has(name))];
}

function addOnSectionTitle(title) {
  const normalized = String(title).replace(/^\s*\d+\s*[.)-]\s*/u, '').trim();
  return normalized.toLocaleLowerCase() === 'start here' ? 'Essentials' : normalized;
}

function renderAddOnSettings(addOn) {
  const entries = orderedAddOnProperties(addOn);
  if (!entries.length) return '';
  const byName = new Map(entries);
  const rendered = new Set();
  const fieldUi = addOn.settingsUi?.fields && typeof addOn.settingsUi.fields === 'object' ? addOn.settingsUi.fields : {};
  const savedSettings = addOn.settings && typeof addOn.settings === 'object' ? addOn.settings : {};
  const sharedVoiceAlias = addOn.moduleId === 'thsv.village-hydration-station' && !String(savedSettings.voiceAlias || '').trim()
    ? String(state.addOns.find((candidate) => candidate.moduleId === 'thsv.voice-relay')?.settings?.voiceAlias || '').trim()
    : '';
  const renderNames = (names) => names.filter((name) => byName.has(name)).map((name) => {
    rendered.add(name);
    const value = name === 'voiceAlias' && sharedVoiceAlias ? sharedVoiceAlias : savedSettings[name];
    return renderAddOnField(name, byName.get(name), value, fieldUi[name]);
  }).join('');
  const requestedSections = Array.isArray(addOn.settingsUi?.sections) ? addOn.settingsUi.sections : [];
  let openedEssentialSection = false;
  const sections = requestedSections.filter((section) => section && typeof section.title === 'string' && Array.isArray(section.fields)).map((section, sectionIndex) => {
    const fields = renderNames(section.fields);
    const notice = typeof section.notice === 'string' && section.notice.trim() ? `<p class="addon-settings-notice">${safe(section.notice)}</p>` : '';
    const links = Array.isArray(section.links) ? section.links.map((link) => {
      const href = safeAddOnLink(link?.url);
      return href && typeof link?.label === 'string' ? `<a href="${safe(href)}" target="_blank" rel="noreferrer noopener">${safe(link.label)}</a>` : '';
    }).filter(Boolean).join('') : '';
    if (!fields && !notice && !links) return '';
    const body = `${notice}${links ? `<div class="addon-settings-links">${links}</div>` : ''}${fields ? `<div class="addon-settings-grid">${fields}</div>` : ''}`;
    const disclosureId = typeof section.id === 'string' && section.id.trim() ? section.id.trim() : `section-${sectionIndex}`;
    const openByDefault = section.open === true && !openedEssentialSection;
    if (openByDefault) openedEssentialSection = true;
    return `<details class="addon-settings-section" data-disclosure-key="${safe(`addon:${addOn.moduleId}:settings:${disclosureId}`)}"${addOnVisibilityAttributes(section)} ${openByDefault ? 'open' : ''}><summary><span>${safe(addOnSectionTitle(section.title))}${section.description ? `<small>${safe(section.description)}</small>` : ''}</span></summary><div class="addon-settings-section-body">${body}</div></details>`;
  }).join('');
  const remaining = renderNames(entries.map(([name]) => name).filter((name) => !rendered.has(name)));
  if (!sections) return `<details class="addon-settings-section" data-disclosure-key="${safe(`addon:${addOn.moduleId}:settings:general`)}" open><summary><span>General settings<small>The essential settings supplied by this add-on.</small></span></summary><div class="addon-settings-grid">${remaining}</div></details>`;
  return `${sections}${remaining ? `<details class="addon-settings-section" data-disclosure-key="${safe(`addon:${addOn.moduleId}:settings:other`)}"><summary><span>Other settings<small>Less commonly changed options</small></span></summary><div class="addon-settings-grid">${remaining}</div></details>` : ''}`;
}

function renderAddOnSetupGuide(addOn) {
  if (addOn.health === 'rejected') return '';
  const steps = Array.isArray(addOn.installationSteps) ? addOn.installationSteps : [];
  const removals = Array.isArray(addOn.uninstallationSteps) ? addOn.uninstallationSteps : [];
  const checks = Array.isArray(addOn.healthChecks) ? addOn.healthChecks : [];
  const guideSlug = String(addOn.moduleId).replace(/^thsv\./u, '');
  const onlineGuide = `https://github.com/surakage/THSV-StreamBridge/blob/main/docs/addons/${encodeURIComponent(guideSlug)}.md`;
  const instructions = steps.length
    ? `<p>Complete these steps in order. The same versioned guide is included in the add-on release ZIP.</p><ol class="setup-checklist">${steps.map((step) => `<li>${safe(step)}</li>`).join('')}</ol>`
    : '<p class="notice"><strong>Ready to configure.</strong> This add-on does not require a separate file or manual installation step.</p>';
  return `<details class="form-section addon-setup-guide addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:setup-guide`)}"><summary><span><span class="step-number">1</span><strong>Before you begin</strong><small>Open for complete install and repair instructions.</small></span></summary><div class="addon-step-body">${instructions}${checks.length ? `<h4>How to verify it</h4><ul>${checks.map((check) => `<li><strong>${safe(check.id)}</strong>: ${safe(check.description)}</li>`).join('')}</ul>` : ''}${removals.length ? `<details data-disclosure-key="${safe(`addon:${addOn.moduleId}:repair`)}"><summary>Repair or remove this add-on</summary><ul>${removals.map((step) => `<li>${safe(step)}</li>`).join('')}</ul></details>` : ''}<div class="button-row"><a class="button-link ghost compact" href="${safe(onlineGuide)}" target="_blank" rel="noreferrer noopener">Open full setup guide</a></div></div></details>`;
}

function updateAddOnFieldVisibility(form) {
  form.querySelectorAll('[data-addon-visible-field]').forEach((container) => {
    const controller = form.elements.namedItem(container.dataset.addonVisibleField);
    let current;
    if (controller instanceof RadioNodeList) current = controller.value;
    else if (controller?.type === 'checkbox') current = controller.checked;
    else current = controller?.value;
    let expected;
    if (container.dataset.addonVisibleValues !== undefined) {
      let values;
      try { values = JSON.parse(container.dataset.addonVisibleValues); } catch { values = []; }
      container.hidden = !Array.isArray(values) || !values.includes(current);
    } else {
      try { expected = JSON.parse(container.dataset.addonVisibleValue); } catch { expected = container.dataset.addonVisibleValue; }
      container.hidden = current !== expected;
    }
  });
  form.querySelectorAll('.addon-settings-section').forEach((section) => {
    const settings = [...section.querySelectorAll('.addon-setting')];
    if (settings.length > 0) section.hidden = settings.every((setting) => setting.hidden);
  });
}

const DIRECT_ADDON_TRIGGER_REQUIREMENTS = {
  'thsv.kofi-donations': {
    actionId: 'e61c4b43-6cf0-5d56-a1c9-2176ae09c312',
    actionName: 'THSV Addon - Ko-fi Donations - Intake',
    groupName: 'THSV Addon - Ko-fi Donations',
    triggers: ['Ko-fi > Donation'],
  },
  'thsv.scene-actions': {
    actionId: '18bdc91c-64eb-4787-8be9-6a921b272943',
    actionName: 'THSV Scene Actions - Intake',
    groupName: 'THSV Addon - Scene Actions',
    triggers: ['OBS Studio > Scene Changed', 'Streamlabs Desktop > Scene Changed', 'Meld Studio > Scene Changed'],
  },
};

const BROKER_ROUTED_ADDONS = new Set([
  'thsv.automated-shoutouts', 'thsv.discord-chat-archive', 'thsv.fan-crown',
  'thsv.first-five', 'thsv.quote-vault', 'thsv.raid-scout', 'thsv.random-clip-player',
  'thsv.subathon-timer', 'thsv.user-translate', 'thsv.chat-guard', 'thsv.community-analytics', 'thsv.viewer-foundation', 'thsv.viewer-spotlight',
  'thsv.creator-controls',
  'thsv.category-pilot',
  'thsv.live-beacon',
  'thsv.clip-courier',
  'thsv.viewer-lobby',
  'thsv.voice-relay',
  'thsv.follower-pulse',
  'thsv.village-hydration-station',
  'thsv.village-jukebox',
]);

// These are only the fixed actions that an add-on dispatches through the capability broker.
// Direct commands and creator controls such as Enable, Reset, Pause, !clip, and !guardtrust are
// intentionally omitted: Streamer.bot invokes those itself and they need no action grant.
const RECOMMENDED_ADDON_ACTION_NAMES = {
  'thsv.automated-shoutouts': ['THSV Addon - Automated Shoutouts - Lookup Twitch Creator', 'THSV Addon - Automated Shoutouts - Twitch Native Shoutout'],
  'thsv.category-pilot': ['THSV Addon - Category Pilot - Process Probe'],
  'thsv.chat-guard': ['THSV Addon - Chat Guard - Moderate'],
  'thsv.clip-courier': ['THSV Addon - Clip Courier - Create Clip', 'THSV Addon - Clip Courier - Deliver'],
  'thsv.clip-library-cache': ['THSV Addon - Clip Library Cache - Refresh'],
  'thsv.creator-controls': ['THSV Addon - Creator Controls - Provider Controller'],
  'thsv.discord-chat-archive': ['THSV Addon - Discord Chat Archive - Deliver'],
  'thsv.fan-crown': ['THSV Addon - Fan Crown - Controller'],
  'thsv.first-five': ['THSV Addon - First Five - Controller'],
  'thsv.follower-pulse': ['THSV Addon - Follower Pulse - Snapshot Page'],
  'thsv.free-game-check': ['THSV Addon - Free Game Check - Refresh', 'THSV Addon - Free Game Check - Settle Twitch Reward'],
  'thsv.live-beacon': ['THSV Addon - Live Beacon - Deliver'],
  'thsv.raid-scout': ['THSV Addon - Raid Scout - Controller', 'THSV Addon - Raid Scout - Run Ending Ad'],
  'thsv.random-clip-player': ['THSV Addon - Random Clip Player - Get Clips', 'THSV Addon - Random Clip Player - Get Clip Download'],
  'thsv.user-translate': ['THSV Addon - Translate - Translate Text'],
  'thsv.viewer-spotlight': ['THSV Addon - Viewer Spotlight - Settle Reward', 'THSV Addon - Viewer Spotlight - Discord Snapshot'],
  'thsv.voice-relay': ['THSV Addon - Voice Relay - Speak'],
  'thsv.village-jukebox': ['THSV Addon - Village Jukebox - Resolve YouTube Track', 'THSV Addon - Village Jukebox - Settle Twitch Reward'],
};
const RAID_SCOUT_CONTROLLER_ACTION_ID = '6a78d950-17b5-4a98-9de7-1a5b4275f31c';
const RAID_SCOUT_RUN_ENDING_AD_ACTION_ID = '18a8de7c-1c5f-4a1e-8d58-7944c74060d5';

function renderAddOnQuickSummary(addOn, hasSettings) {
  const steps = Array.isArray(addOn.installationSteps) ? addOn.installationSteps : [];
  const recommended = RECOMMENDED_ADDON_ACTION_NAMES[addOn.moduleId] || [];
  const triggerRequirement = DIRECT_ADDON_TRIGGER_REQUIREMENTS[addOn.moduleId];
  const commandNames = Array.isArray(addOn.commandsProvided) ? addOn.commandsProvided.map((command) => command.name).filter(Boolean) : [];
  const connection = addOn.moduleId === 'thsv.viewer-lobby'
    ? 'Creator controls + chat'
    : triggerRequirement
    ? `${triggerRequirement.triggers.length} direct trigger${triggerRequirement.triggers.length === 1 ? '' : 's'}`
    : commandNames.length
      ? `${commandNames.length} included command${commandNames.length === 1 ? '' : 's'}`
      : 'No direct trigger';
  return `<section class="addon-quick-summary" aria-label="Simple setup summary"><div><small>Settings</small><strong>${hasSettings ? 'Optional' : 'None'}</strong></div><div><small>Streamer.bot</small><strong>${safe(connection)}</strong></div><div><small>Approvals</small><strong>${recommended.length ? `${recommended.length} recommended` : 'None'}</strong></div><div><small>Setup steps</small><strong>${steps.length || 'None'}</strong></div></section>`;
}

function renderAddOnTriggerReadiness(addOn) {
  if (addOn.moduleId === 'thsv.village-hydration-station') {
    return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-hydration-station:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect hydration once</strong><small>Choose the broadcaster command, Stream Deck, or creator hotkeys.</small></span><span class="status-chip status-ready">No voice setup</span></summary><div class="addon-step-body"><p class="notice"><strong>Hydration does not use Voice Control.</strong> Microphone listening and spoken-command triggers are not required.</p><ol><li>Use the saved broadcaster-only <strong>!water</strong> command for chat control, or attach <strong>Log Water</strong> to a Stream Deck button or creator hotkey.</li><li>Keep Twitch and Kick hydration rewards on their existing main platform intake actions. YouTube and TikTok use the saved automatic viewer command.</li><li>Keep <strong>Speak</strong> triggerless and approve it only when optional Speaker.bot reminders are enabled.</li><li>Attach Undo, Snooze, and Reset only to creator-controlled buttons or hotkeys.</li></ol></div></details>`;
  }
  if (addOn.moduleId === 'thsv.viewer-lobby') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.viewer-lobby:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect the lobby controls</strong><small>Viewer commands use the main chat intakes; only creator controls need your own triggers.</small></span><span class="status-chip status-neutral">Control import required</span></summary><div class="addon-step-body"><div class="notice"><strong>Normal stream flow</strong><p>Open the lobby &rarr; viewers use <code>!join</code> &rarr; choose Next or Random &rarr; Complete the current viewer &rarr; Close or Clear when finished.</p></div><ol><li>Import <strong>THSV StreamBridge - Viewer Lobby</strong> in Streamer.bot.</li><li>Leave the imported actions without public chat or platform-event triggers.</li><li>Attach <strong>Open, Close, Pause, Resume, Next, Random, Complete,</strong> and <strong>Clear</strong> only to creator-controlled hotkeys, Stream Deck buttons, or optional Scene Actions.</li><li>Keep Twitch, YouTube, Kick, and TikTok chat triggers on the existing main THSV intake actions. Do not create duplicate <code>!join</code> commands in Command Sync.</li><li>Add the browser source below to OBS, Meld, or Streamlabs Desktop, then send a queue preview.</li></ol><p class="notice"><strong>What the controls mean:</strong> Pause and Close keep the saved queue but stop new joins. Complete removes the selected viewer. Next and Random finish the current selection before choosing another. Clear permanently empties the queue.</p></div></details>`;
  if (addOn.moduleId === 'thsv.creator-controls') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.creator-controls:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect your profile buttons</strong><small>Each Apply Profile action runs one saved setup.</small></span><span class="status-chip status-neutral">One approval needed</span></summary><div class="addon-step-body"><div class="notice"><strong>Easy mapping</strong><ul><li><strong>Apply Profile 1</strong> &rarr; Starting Soon</li><li><strong>Apply Profile 2</strong> &rarr; Gameplay</li><li><strong>Apply Profile 3</strong> &rarr; Just Chatting</li></ul></div><ol><li>Import <strong>THSV StreamBridge - Creator Controls</strong> in Streamer.bot.</li><li>Leave <strong>Provider Controller</strong> enabled with no trigger. Approve only that controller in the next wizard step.</li><li>Add your scene-change trigger, hotkey, or deck button to the matching <strong>Apply Profile</strong> action. Do not attach those triggers to Provider Controller.</li><li>Save the wizard, restart StreamBridge, temporarily allow Test buttons, and run one Apply Profile action.</li><li>Confirm the title/category changed, then turn Test buttons back off before going live.</li></ol><p class="notice"><strong>TikTok is intentionally not listed:</strong> TikFinity does not provide a verified equivalent for changing live title/category. Blank category fields are safely skipped.</p></div></details>`;
  if (addOn.moduleId === 'thsv.free-game-check') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.free-game-check:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect redemption-only checks</strong><small>One matching reward or points command starts one GamerPower lookup.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> before using YouTube or TikTok points.</li><li>Import <strong>THSV StreamBridge - Free Game Check</strong>. Leave Refresh, Discord Deliver, and Settle Twitch Reward triggerless.</li><li>Approve <strong>Refresh</strong> and <strong>Settle Twitch Reward</strong> below. Approve <strong>Discord Deliver</strong> only when Discord posting is enabled.</li><li>Create a pending <strong>Free Games</strong> Twitch reward and a Kick reward, then paste their stable IDs. Keep one Reward Redemption trigger on each existing intake.</li><li>Choose the YouTube and TikTok command and points cost. Save and restart; no separate Streamer.bot Command object is needed.</li></ol><p class="notice"><strong>No timer:</strong> the add-on checks only after a valid live redemption. Available games produce one source-chat Discord guide; no games or lookup failures refund Twitch and Viewer Foundation points. Kick remains accepted because Streamer.bot does not currently expose an equivalent refund method.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-jukebox') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-jukebox:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect the jukebox safely</strong><small>One private resolver validates YouTube tracks; the main intakes receive viewer commands.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> first if YouTube or TikTok viewers will spend bridge points.</li><li>Import <strong>THSV StreamBridge - Village Jukebox</strong> in Streamer.bot.</li><li>Open <strong>Resolve YouTube Track</strong>, replace the private <code>villageJukeboxYouTubeApiKey</code> Set Argument value, then Save and Compile. Leave both imported actions triggerless.</li><li>Approve <strong>Resolve YouTube Track</strong> below. Approve <strong>Settle Twitch Reward</strong> only when the Twitch reward path is enabled.</li><li>Choose which jukebox commands are enabled in this wizard. Save and restart; the existing main chat intakes register them automatically without Command Sync packages.</li><li>Add the browser-source URL below at <strong>640 x 460</strong>, save, restart StreamBridge, and request a track with <code>!sr song or YouTube link</code>.</li></ol><p class="notice"><strong>Keep the API key private:</strong> it stays in Streamer.bot and must never be pasted into the wizard, logs, or support messages. Spotify playback is intentionally excluded; only use music you are permitted to broadcast.</p></div></details>`;
  if (addOn.moduleId === 'thsv.first-five') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.first-five:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect each platform once</strong><small>Rewards use the main intakes; one controller changes Twitch rewards safely.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> before using YouTube or TikTok points.</li><li>Import the First Five Streamer.bot package. Leave <strong>Controller</strong> triggerless and approve only that action below.</li><li>Keep one Twitch and one Kick Reward Redemption trigger on their existing main THSV intake actions. Paste the five stable reward IDs for each platform in placement order.</li><li>Choose the no-response command name in this wizard. It registers automatically for YouTube and TikTok after save and restart.</li><li>Save, restart StreamBridge, then test each path separately. Never attach reward triggers to the controller.</li></ol><p class="notice"><strong>One claim path per platform:</strong> duplicate intake triggers can process the same claim twice. Twitch can settle pending rewards; Kick claims are accepted directly because equivalent refund methods are unavailable.</p></div></details>`;
  if (addOn.moduleId === 'thsv.fan-crown') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.fan-crown:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect the crown safely</strong><small>Twitch uses its controller; Kick rewards and point commands stay on the main intakes.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> before enabling YouTube or TikTok crown claims.</li><li>Import the Fan Crown package. Leave <strong>Controller</strong> triggerless and approve only that action below.</li><li>Create the Twitch reward inside Streamer.bot and paste its stable ID. Paste the Kick reward ID only if Kick claims are enabled.</li><li>Choose the no-response command name in this wizard. It registers automatically for YouTube and TikTok after save and restart.</li><li>Save, restart StreamBridge, test one claim, and use the imported Reset action only as a creator control.</li></ol><p class="notice"><strong>Do not duplicate reward triggers:</strong> both native rewards arrive through the existing platform intakes. Twitch supports fulfillment and rollback; Kick does not expose the same settlement controls.</p></div></details>`;
  if (addOn.moduleId === 'thsv.stream-labels') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.stream-labels:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing platform intakes</strong><small>Stream Labels listens to events the main bridge already receives.</small></span><span class="status-chip status-ready">No import or extra trigger</span></summary><div class="addon-step-body"><ol><li>Keep the main THSV Twitch, YouTube, Kick, TikTok, Streamlabs, and Ko-fi intake triggers in Streamer.bot.</li><li>Do not attach duplicate triggers to this add-on. It receives normalized follows, subscriptions, gifts, cheers, donations, and other configured events internally.</li><li>Save the label layout, restart StreamBridge, then copy the browser-source URL below into OBS, Meld, or Streamlabs Desktop.</li><li>Send a simulated preview and confirm the source updates before relying on it live.</li></ol><p class="notice"><strong>One connection:</strong> the labels share StreamBridge's existing overlay connection and never open another Streamer.bot WebSocket.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-roll-call') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-roll-call:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Choose rewards or points</strong><small>Twitch and Kick use native rewards; YouTube and TikTok use Viewer Foundation points.</small></span><span class="status-chip status-ready">Command automatic</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> before enabling YouTube or TikTok check-ins.</li><li>Create the Twitch check-in reward inside Streamer.bot, enable Skip Reward Queue, and paste its stable ID. Paste a stable Kick reward ID if Kick is enabled.</li><li>Keep one Reward Redemption trigger on each existing main platform intake. Do not attach a trigger directly to Village Roll Call.</li><li>Choose the check-in command name in this wizard. It registers automatically for YouTube and TikTok after save and restart.</li><li>Save the time zone and points cost, restart StreamBridge, then test each enabled platform once.</li></ol><p class="notice"><strong>One daily check-in per stable platform account:</strong> duplicates do not score twice. Twitch/Kick rewards and YouTube/TikTok point commands share the same bounded monthly leaderboard.</p></div></details>`;
  if (addOn.moduleId === 'thsv.viewer-spotlight') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.viewer-spotlight:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect card requests</strong><small>Viewer Foundation and Community Analytics supply the card; the overlay stores no identity history.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> and <strong>Community Analytics</strong> first.</li><li>Import Viewer Spotlight. Approve <strong>Settle Reward</strong> only for Twitch reward requests and <strong>Discord Snapshot</strong> only when Discord delivery is enabled.</li><li>Keep Twitch/Kick reward triggers on their existing main intakes. The saved YouTube/TikTok request command registers automatically after restart.</li><li>Add the browser-source URL below, accept the public-field disclosure, save, and restart StreamBridge.</li><li>Use Manual cards and Stream Score below for a safe offline check before enabling viewer requests.</li></ol><p class="notice"><strong>Fail closed:</strong> missing viewer projections, queue limits, cooldowns, stream-end cleanup, or overlay failures reject the card and refund supported pending payment paths.</p></div></details>`;
  if (addOn.moduleId === 'thsv.voice-relay') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.voice-relay:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect Village Voice</strong><small>One bounded queue serves alert speech and optional viewer TTS.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Create and test the exact voice alias in Speaker.bot, then connect Speaker.bot inside Streamer.bot.</li><li>Import Village Voice. Leave <strong>Speak</strong> triggerless, approve only Speak below, and attach Pause/Resume/Stop only to creator controls.</li><li>For Twitch/Kick viewer TTS, keep native reward triggers on the existing main platform intakes and paste their stable reward IDs.</li><li>For YouTube/TikTok, choose the request command in this wizard and enable Viewer Foundation points. The command registers automatically after restart.</li><li>Add the browser-source URL below if the speaking card is enabled. Save, restart, and test a harmless short phrase.</li></ol><p class="notice"><strong>Safety first:</strong> links and control characters are removed, text and queue sizes are bounded, cooldown memory is capped, and failures refund supported Viewer Foundation point requests.</p></div></details>`;
  if (addOn.moduleId === 'thsv.prize-wheel') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.prize-wheel:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Enable the wheel command</strong><small>The saved command uses the existing platform chat intakes automatically.</small></span><span class="status-chip status-ready">Command automatic</span></summary><div class="addon-step-body"><ol><li>Enter 2–10 unique choices and choose the command name.</li><li>Save and restart StreamBridge. No Command Sync package or separate Streamer.bot Command object is needed.</li><li>Keep chat-message triggers on the existing main THSV platform intake actions. Do not add duplicate triggers to the wheel.</li><li>Add the browser-source URL below and send a preview before running <code>!spinwheel</code>.</li></ol><p class="notice"><strong>Server-selected result:</strong> StreamBridge chooses and records the winner before the animation starts. A second spin is rejected until the first finishes.</p></div></details>`;
  if (addOn.moduleId === 'thsv.chat-play-pack') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.chat-play-pack:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect optional game providers</strong><small>Game commands already use the main chat intakes and one Viewer Foundation balance.</small></span><span class="status-chip status-neutral">Provider import optional</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> first.</li><li>Import <strong>THSV StreamBridge - Chat Play Pack</strong> only when using the OpenTDB or Dictionary provider actions.</li><li>Leave those provider actions triggerless. The existing platform chat intakes deliver every game command automatically.</li><li>Enable or disable each game in this wizard. No separate Streamer.bot Command objects or Command Sync package is needed.</li><li>Approve only the OpenTDB or Dictionary fetch action(s) you enabled. Creator-only Trivia and Unscramble require no approved provider action.</li><li>After the automatic intake path passes, disable legacy game Command objects to keep Streamer.bot tidy.</li><li>Keep creator fallback questions and words filled in when using Mixed mode. Add the browser-source URL only when you want result cards.</li></ol><p class="notice"><strong>One intake path:</strong> Chat Play reads normalized public chat directly, ignores the bridge's derived command copy, and opens no additional WebSocket connection. Losing never removes points; persistent caps, cooldowns, serialized rounds, and idempotent awards prevent farming and replay problems.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-polls') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-polls:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>No separate Streamer.bot commands or poll triggers are needed.</small></span><span class="status-chip status-ready">Direct chat commands</span></summary><div class="addon-step-body"><ol><li>Keep chat-message triggers on the existing main THSV Twitch, YouTube, Kick, and TikTok intake actions.</li><li>Do not generate Village Polls commands in Command Sync and do not attach separate poll triggers in Streamer.bot.</li><li>Restart StreamBridge after saving the enabled setting.</li><li>Open a poll with <code>!poll open Question | First choice | Second choice</code>, vote with <code>!vote 1</code>, and close it with <code>!poll close</code>.</li></ol><p class="notice"><strong>One universal total:</strong> Village Polls reads normalized chat directly and combines Twitch, YouTube, Kick, and TikTok votes. Native Twitch and YouTube polls are not mixed in because Kick and TikTok votes cannot be inserted into those provider totals. Opening and closing are announced to all four chats; the result also appears for 12 seconds on the Village Polls overlay.</p></div></details>`;
  if (addOn.moduleId === 'thsv.viewer-foundation') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.viewer-foundation:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>Points and lurk commands register automatically from the saved names.</small></span><span class="status-chip status-ready">Commands automatic</span></summary><div class="addon-step-body"><ol><li>Keep chat, follow, subscription, membership, gift, cheer, Super Chat, raid, and reward triggers on the existing main THSV platform intake actions.</li><li>Choose the balance and lurk command names in this wizard, save, and restart StreamBridge.</li><li>Viewers can then use <code>!points</code> and <code>!lurk</code> without separate Streamer.bot Command objects or Command Sync packages.</li><li>Use local test events before going live. Disable legacy duplicate Command objects only after this intake-owned path passes.</li></ol><p class="notice"><strong>Time tracking is observation-based:</strong> platforms do not expose a dependable cross-platform silent-viewer list. Active time is settled when a viewer continues chatting; lurk time settles on their next message or when the final observed platform goes offline.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-draw') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-draw:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>No separate Streamer.bot commands or giveaway triggers are needed.</small></span><span class="status-chip status-ready">Direct chat commands</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> first.</li><li>Keep chat-message triggers on the existing main THSV Twitch, YouTube, Kick, and TikTok intake actions.</li><li>Do not generate Village Draw commands in Command Sync and do not attach duplicate triggers in Streamer.bot.</li><li>Save the prize and entry settings, restart StreamBridge, then use the authenticated controls below to open entries.</li><li>Viewers use <code>!enter</code>, <code>!tickets 3</code>, and <code>!mytickets</code> directly in chat.</li></ol><p class="notice"><strong>Management stays protected:</strong> <code>!giveaway</code> shows public status, while management arguments still require Moderator or Broadcaster. Pending point purchases must settle before entries can close or a winner can be drawn.</p></div></details>`;
  if (addOn.moduleId === 'thsv.clip-library-cache') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.clip-library-cache:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect the shared Twitch lookup</strong><small>One internal action supplies every installed clip add-on.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Import <strong>THSV StreamBridge - Clip Library Cache</strong> in Streamer.bot.</li><li>Leave <strong>Refresh</strong> enabled and triggerless. Do not attach a timer or platform trigger.</li><li>Approve only Refresh in the next wizard step, enable the shared clip list, save, and restart StreamBridge.</li><li>Return to Random Clip Player or Clip Courier to configure what happens with the shared results.</li></ol><p class="notice"><strong>Why this is separate:</strong> it is optional shared infrastructure. Keeping it outside Bridge Core means creators without clip features perform no clip lookup, while multiple clip add-ons avoid duplicate Twitch requests.</p><p>This helper has no overlay and never plays, posts, or downloads a clip by itself.</p></div></details>`;
  if (addOn.moduleId === 'thsv.clip-courier') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.clip-courier:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect !clip and Discord</strong><small>The main Twitch intake owns the command; two private helpers create and deliver the clip.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Import <strong>THSV StreamBridge - Clip Courier</strong> in Streamer.bot. Leave Create Clip and Deliver triggerless.</li><li>Open <strong>Create Clip</strong>. Set <code>clipCourierDurationSeconds</code> to <strong>30</strong> or <strong>60</strong>, then Save and Compile.</li><li>Open <strong>Deliver</strong>, replace <code>clipCourierWebhookUrl</code> with a private webhook for the Discord channel or forum selected above, then Save and Compile.</li><li>Approve <strong>Create Clip</strong> and <strong>Deliver</strong> below, enable Clip Courier, save, and restart StreamBridge.</li><li>Test <code>!clip</code> from Twitch through the main intake. Disable any older Streamer.bot <code>!clip</code> Command object so only the intake-owned route responds.</li><li>Optional: install Clip Library Cache and enable current-stream discovery if clips made without <code>!clip</code> should also be sent.</li></ol><p class="notice"><strong>No old-library posting:</strong> automatic discovery accepts only Twitch clip timestamps inside the stream session observed by StreamBridge. If the session boundary is unknown, it sends nothing. Never paste the webhook into the wizard or a support message.</p></div></details>`;
  if (addOn.moduleId === 'thsv.community-analytics') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.community-analytics:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Confirm the data path</strong><small>Community Analytics listens to the existing Bridge intakes.</small></span><span class="status-chip status-ready">No add-on import needed</span></summary><div class="addon-step-body"><ol><li>Install and enable <strong>Viewer Foundation</strong> first.</li><li>Keep Twitch, YouTube, Kick, and TikTok triggers attached to their main <strong>THSV &lt;Platform&gt; - Intake</strong> actions.</li><li>Do not create a Community Analytics action or attach duplicate chat triggers.</li><li>Save the selected platforms and restart StreamBridge. Local counters update when normalized events arrive.</li><li>Use the Reports section below to refresh the session summary or export bounded reports.</li></ol><p class="notice">This is a private local observation tool, not official platform analytics. It stores no chat text, display names, avatars, raw events, or financial amounts.</p></div></details>`;
  if (addOn.moduleId === 'thsv.chat-guard') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.chat-guard:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>Moderation uses one helper; trusted-viewer replies are registered automatically.</small></span><span class="status-chip status-neutral">Moderation import optional</span></summary><div class="addon-step-body"><ol><li>Import the version-matched Chat Guard package only when automatic moderation is needed. Leave both helper actions triggerless.</li><li>Approve <strong>Moderate</strong> only after observation testing. The Trust Viewer helper is retained for backward compatibility but is no longer required by the intake-owned command.</li><li>Keep platform chat triggers only on the main THSV intake actions.</li></ol><p><strong>To trust someone:</strong> as broadcaster or moderator, reply to that viewer's chat message with <code>!guardtrust</code>. StreamBridge reads the stable reply identity and adds it locally after restart.</p><p class="notice">Twitch, YouTube, and Kick support the reply workflow. For TikTok, use the clearly labeled manual fallback.</p></div></details>`;
  const requirement = DIRECT_ADDON_TRIGGER_REQUIREMENTS[addOn.moduleId];
  const automaticCommands = Array.isArray(addOn.commandsProvided) ? addOn.commandsProvided.map((command) => command.name).filter(Boolean) : [];
  if (!requirement && automaticCommands.length > 0) return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:trigger-readiness`)}"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>Enabled add-on commands are registered automatically after restart.</small></span><span class="status-chip status-ready">${safe(`${automaticCommands.length} auto command${automaticCommands.length === 1 ? '' : 's'}`)}</span></summary><div class="addon-step-body"><p><strong>No Streamer.bot Command object or extra trigger is required.</strong></p><p>Keep each platform's Chat Message trigger on its main THSV intake. StreamBridge reads the saved names below, checks command collisions, and routes a matching message to this enabled add-on.</p><p class="notice"><strong>Legacy commands:</strong> existing Streamer.bot Command objects may stay in place during testing, but they are no longer required for these add-on commands. Disable duplicates only after the intake-owned path passes your live acceptance check.</p><ul>${automaticCommands.map((command) => `<li><code>${safe(command)}</code></li>`).join('')}</ul></div></details>`;
  if (!requirement) return BROKER_ROUTED_ADDONS.has(addOn.moduleId)
    ? `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:trigger-readiness`)}"><summary><span><span class="step-number">3</span><strong>Connect Streamer.bot</strong><small>Confirm whether this add-on needs its own trigger.</small></span><span class="status-chip status-ready">No direct trigger needed</span></summary><div class="addon-step-body"><p><strong>Nothing needs to be attached manually.</strong></p><p>This add-on receives normalized events or approved action dispatches through StreamBridge. Leave platform triggers on the main StreamBridge intake actions unless this add-on's setup guide explicitly says otherwise.</p></div></details>`
    : '';

  const expected = `<ul class="trigger-checklist">${requirement.triggers.map((trigger) => `<li>${safe(trigger)}</li>`).join('')}</ul>`;
  const shell = (status, tone, body, open = false) => `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:trigger-readiness`)}" ${open ? 'open' : ''}><summary><span><span class="step-number">3</span><strong>Connect Streamer.bot</strong><small>Check the imported intake action and its required triggers.</small></span><span class="status-chip status-${tone}">${safe(status)}</span></summary><div class="addon-step-body">${body}<div class="button-row"><button type="button" class="ghost" data-inspect-addon-actions>Refresh Streamer.bot status</button></div></div></details>`;
  if (!state.liveActions.length) return shell('Not checked', 'neutral', `<p><strong>Your saved Streamer.bot triggers remain active.</strong> Refresh the live action list when you want the wizard to verify this setup.</p><div class="trigger-requirement"><strong>Action</strong><span>${safe(requirement.actionName)}</span><strong>Group</strong><span>${safe(requirement.groupName)}</span></div><h4>Required triggers</h4>${expected}`, true);

  const action = state.liveActions.find((candidate) => candidate.id === requirement.actionId);
  if (!action) return shell('Setup needed', 'warning', `<p class="error"><strong>${safe(requirement.actionName)}</strong> was not found. Import the add-on's Streamer.bot package, then add the triggers below to that action.</p><h4>Required triggers</h4>${expected}`, true);

  const expectedCount = requirement.triggers.length;
  const countKnown = Number.isInteger(action.triggerCount);
  const countReady = countKnown && action.triggerCount >= expectedCount;
  const actionReady = action.enabled !== false;
  const nameReady = action.name === requirement.actionName;
  const currentGroup = actionGroupName(action);
  const groupReady = currentGroup === requirement.groupName;
  const ready = actionReady && countReady && nameReady && groupReady;
  const countText = countKnown ? `${action.triggerCount} attached trigger${action.triggerCount === 1 ? '' : 's'} reported` : 'attached-trigger count unavailable';
  const status = ready ? 'Ready' : 'Setup needed';
  const detail = !actionReady
    ? 'The intake action is disabled in Streamer.bot.'
    : !nameReady
      ? `The stable action ID is present, but it is named "${action.name}" instead of "${requirement.actionName}".`
      : !groupReady
        ? `The action is in "${currentGroup}" instead of its expected "${requirement.groupName}" group.`
        : countReady
      ? `${countText}. The documented GetActions read exposes a count, not trigger names, so compare the labels below after manual edits.`
      : `${countText}; at least ${expectedCount} ${expectedCount === 1 ? 'is' : 'are'} required.`;
  return shell(status, ready ? 'ready' : 'warning', `<p class="${ready ? 'notice' : 'error'}"><strong>${safe(requirement.actionName)}</strong> is ${actionReady ? 'enabled' : 'disabled'}; ${safe(detail)}</p><div class="trigger-requirement"><strong>Expected group</strong><span>${safe(requirement.groupName)}</span></div><h4>Required triggers</h4>${expected}`, !ready);
}

function renderViewerFoundationAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.viewer-foundation' || !addOn.enabled) return '';
  const links = (addOn.settings?.accountLinks || []).map((value) => String(value).split('|')).filter((parts) => parts.length === 3);
  const linkedAccounts = links.length === 0
    ? '<p class="notice">No cross-platform accounts are linked. Platform accounts still receive private installation-local IDs.</p>'
    : `<ul class="entity-list">${links.map(([viewerId, platform, userId]) => `<li class="entity-row"><span class="entity-item"><strong>${safe(viewerId)}</strong><small>${safe(addOnOptionLabel(platform))} stable ID: ${safe(userId)}</small></span><button type="button" class="entity-remove" data-viewer-link-remove="${safe(`${viewerId}|${platform}|${userId}`)}" aria-label="Remove ${safe(platform)} link from ${safe(viewerId)}">Remove</button></li>`).join('')}</ul>`;
  return `<details class="form-section" data-disclosure-key="addon:thsv.viewer-foundation:administration"><summary><span><strong>Viewer accounts, points &amp; privacy</strong><small>Find a viewer, manage verified links, correct points, export data, or erase a record.</small></span></summary><div class="addon-step-body">
    <p class="notice"><strong>Stable IDs only:</strong> Viewer Foundation never stores display names, chat text, avatars, or OAuth data. Link accounts only after verifying that the same person owns both platform IDs.</p>
    <details class="addon-settings-section" data-disclosure-key="addon:thsv.viewer-foundation:find"><summary>1. Find a viewer</summary><div class="addon-step-body"><p>Search with either the lowercase Viewer Foundation ID or one stable platform account ID.</p><div class="button-row"><button type="button" class="ghost" data-viewer-admin-status>Refresh private-state summary</button><button type="button" class="ghost" data-viewer-admin-audit>Show recent administration history</button></div><form class="addon-settings-grid" data-viewer-search-id-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64" placeholder="alex"></label><div class="button-row full-row"><button type="submit">Find by Viewer ID</button></div></form><form class="addon-settings-grid" data-viewer-search-account-form><label>Platform<select name="platform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok</option></select></label><label>Stable platform user ID<input name="userId" required maxlength="256" autocomplete="off" placeholder="Not a display name or channel URL"></label><div class="button-row full-row"><button type="submit">Find by platform account</button></div></form><pre class="diagnostic full-row" data-viewer-admin-output>Choose a search or administration operation.</pre></div></details>
    <details class="addon-settings-section" data-disclosure-key="addon:thsv.viewer-foundation:links"><summary>2. Link verified platform accounts</summary><div class="addon-step-body">${linkedAccounts}<form class="addon-settings-grid" data-viewer-link-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64" placeholder="alex"></label><label>Platform<select name="platform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok</option></select></label><label>Stable platform user ID<input name="userId" required maxlength="256" autocomplete="off"></label><label>Audit reason<input name="reason" required minlength="3" maxlength="200" placeholder="Verified both accounts with the viewer"></label><label class="check full-row"><input name="approved" type="checkbox" required> I verified this stable account belongs to this viewer.</label><div class="button-row full-row"><button type="submit">Add verified link</button></div></form><small>Link changes are saved atomically and audited without retaining the raw account ID in audit history. Restart StreamBridge to apply them.</small></div></details>
    <details class="addon-settings-section" data-disclosure-key="addon:thsv.viewer-foundation:points"><summary>3. Correct or safely undo points</summary><div class="addon-step-body"><form class="addon-settings-grid" data-viewer-correction-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64"></label><label>Correction<select name="adjustment"><option value="add">Add points</option><option value="remove">Remove points</option><option value="reset">Reset to zero</option></select></label><label>Amount<input name="amount" type="number" min="1" max="1000000" step="1" value="1"></label><label>Audit reason<input name="reason" required minlength="3" maxlength="200" placeholder="Creator correction"></label><div class="button-row full-row"><button type="submit">Apply correction</button></div></form><form class="addon-settings-grid" data-viewer-undo-form><label>Correction audit ID<input name="auditId" required pattern="[a-f0-9]{32}" maxlength="32" autocomplete="off"></label><label>Undo reason<input name="reason" required minlength="3" maxlength="200" placeholder="Correction entered incorrectly"></label><label class="check full-row"><input name="approved" type="checkbox" required> Undo only if no newer point activity has changed this balance.</label><div class="button-row full-row"><button type="submit" class="ghost">Undo correction safely</button></div></form><p class="notice">Undo fails closed when points changed after the correction, preventing older data from overwriting newer viewer activity.</p></div></details>
    <details class="addon-settings-section" data-disclosure-key="addon:thsv.viewer-foundation:privacy"><summary>4. Export or erase viewer data</summary><div class="addon-step-body"><form class="addon-settings-grid" data-viewer-export-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64" placeholder="alex"></label><div class="button-row full-row"><button type="submit" class="ghost">Prepare privacy export</button></div></form><form class="addon-settings-grid" data-viewer-delete-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64"></label><label class="check full-row"><input name="approved" type="checkbox" required> I understand this permanently erases the viewer record and its mutation history.</label><div class="button-row full-row"><button type="submit" class="danger">Delete viewer record</button></div></form></div></details>
    <details class="addon-settings-section" data-disclosure-key="addon:thsv.viewer-foundation:legacy-migration"><summary>5. Import preserved Viewer Progression state</summary><div class="addon-step-body"><p class="notice">Preview reads the preserved local data/state/viewer-progression.json file without changing it. Import keeps the higher point total when an ID already exists and records the file digest so the same snapshot cannot run twice.</p><div class="button-row"><button type="button" class="ghost" data-viewer-migration-preview>Preview legacy records</button><button type="button" data-viewer-migration-apply disabled>Import exact preview</button></div><pre class="diagnostic" data-viewer-migration-output>No legacy file has been previewed.</pre></div></details>
  </div></details>`;
}

function renderCommunityAnalyticsAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.community-analytics' || !addOn.enabled) return '';
  return `<details class="form-section addon-step" data-disclosure-key="addon:thsv.community-analytics:administration" open><summary><span><strong>View activity &amp; reports</strong><small>A readable local summary loads automatically; downloads remain available for deeper review.</small></span></summary><div class="addon-step-body"><p class="notice">These are local StreamBridge observations—not official platform analytics, revenue, payout, or tax data. Names, account IDs, chat text, raw events, and financial amounts are excluded.</p><div class="button-row"><button type="button" class="ghost" data-analytics-admin-status>Refresh activity</button><button type="button" class="ghost" data-analytics-report="session-json">Download session summary</button><button type="button" class="ghost" data-analytics-report="viewers-csv">Download viewer activity</button></div><div class="analytics-dashboard" data-analytics-admin-output aria-live="polite"><p class="notice">Loading the private local activity summary…</p></div><details class="addon-settings-section" data-disclosure-key="addon:thsv.community-analytics:privacy-tools"><summary><span><strong>Advanced: one-viewer privacy tools</strong><small>Export or permanently remove one pseudonymous Viewer Foundation record.</small></span></summary><div class="addon-settings-section-body"><form class="addon-settings-grid" data-analytics-export-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64" placeholder="twitch-…"></label><div class="button-row full-row"><button type="submit" class="ghost">Preview privacy record</button></div></form><form class="addon-settings-grid" data-analytics-delete-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64"></label><label class="check full-row"><input name="approved" type="checkbox" required> I understand this permanently erases this viewer's private analytics record and active-session attendance.</label><div class="button-row full-row"><button type="submit" class="danger">Delete analytics record</button></div></form></div></details></div></details>`;
}

function renderViewerSpotlightAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.viewer-spotlight' || !addOn.enabled) return '';
  return `<details class="form-section" data-disclosure-key="addon:thsv.viewer-spotlight:manual-display"><summary>Manual cards and Stream Score</summary><p class="notice">These creator-only tools use bounded Viewer Foundation and Community Analytics projections. Display names and optional HTTPS avatars exist only in the in-memory request and overlay message.</p><div class="button-row"><button type="button" class="ghost" data-spotlight-admin-status>Refresh queue status</button><button type="button" class="ghost" data-spotlight-stream-score>Show current Stream Score</button></div><pre class="diagnostic" data-spotlight-admin-output>Enter the stable platform account ID, not the display name or channel URL.</pre><form class="addon-settings-grid" data-spotlight-display-form><label>Platform<select name="platform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok / TikFinity</option></select></label><label>Stable platform user ID<input name="userId" required maxlength="256" autocomplete="off" placeholder="Provider account ID"></label><label>Display name<input name="displayName" required maxlength="80" autocomplete="off" placeholder="Name shown on the card"></label><label>Profile picture URL (optional)<input name="avatarUrl" type="url" maxlength="2048" pattern="https://.*" placeholder="https://..."></label><label class="check full-row"><input name="sendDiscord" type="checkbox"> Also send this card as a Discord snapshot (requires configured approved action).</label><label class="check full-row"><input name="approved" type="checkbox" required> Display this viewer's selected public fields on the live Viewer Spotlight overlay.</label><div class="button-row full-row"><button type="submit">Queue manual card</button></div></form></details>`;
}

function renderFollowerPulseAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.follower-pulse' || !addOn.enabled) return '';
  return `<details class="form-section addon-step" data-disclosure-key="addon:thsv.follower-pulse:private-history" open><summary><span><strong>Private follower history</strong><small>Review baseline health and confirmed Twitch follower changes locally.</small></span></summary><div class="addon-step-body"><p class="notice"><strong>Private by design:</strong> names shown here are available only through this authenticated local wizard. They are never sent to chat, Discord, overlays, or ordinary logs. Twitch has no immediate unfollow event, so removals require complete comparison scans.</p><div class="button-row"><button type="button" class="ghost" data-follower-pulse-status>Refresh history</button><button type="button" data-follower-pulse-reconcile>Check Twitch now</button></div><div data-follower-pulse-output aria-live="polite"><p class="notice">Loading the private follower snapshot status…</p></div></div></details>`;
}

function renderChatGuardAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.chat-guard' || !addOn.enabled) return '';
  return [
    '<details class="form-section addon-step" data-disclosure-key="addon:thsv.chat-guard:trusted-viewers"><summary><span><span class="step-number">5</span><strong>Optional: trust a specific viewer</strong><small>Use a reply command so you never need to find their account ID.</small></span></summary><div class="addon-step-body">',
    '<ol><li>In Streamer.bot, review and enable the imported <code>!guardtrust</code> command.</li><li>Reply to the viewer\'s message with <code>!guardtrust</code> as the broadcaster or a moderator.</li><li>Return here and press <strong>Refresh trusted viewers</strong>.</li></ol>',
    '<p class="notice">This step is optional. Twitch, YouTube, and Kick can read the replied-to viewer\'s stable account ID automatically. TikTok currently uses the manual fallback below. Chat Guard displays only a friendly label and the final six ID characters.</p>',
    '<div class="button-row"><button type="button" class="ghost" data-chat-guard-status>Refresh trusted viewers</button></div>',
    '<div class="item-list" data-chat-guard-trusted-list><p class="notice">Refresh to view trusted accounts.</p></div>',
    '<details data-disclosure-key="addon:thsv.chat-guard:manual-trust"><summary>Manual stable-ID fallback</summary><p class="notice">Use this only when a provider cannot supply reply identity. Display names alone are not accepted.</p><form class="addon-settings-grid" data-chat-guard-trust-form><label>Platform<select name="platform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok / TikFinity</option></select></label><label>Stable platform user ID<input name="userId" required maxlength="256" autocomplete="off" placeholder="Provider account ID"></label><label>Friendly label<input name="label" required maxlength="80" autocomplete="off" placeholder="Name used only in this manager"></label><label class="check full-row"><input name="approved" type="checkbox" required> Save this stable ID as a trusted Chat Guard exception.</label><div class="button-row full-row"><button type="submit">Add trusted viewer</button></div></form></details>',
    '</div></details>',
    '<details class="form-section addon-step" data-disclosure-key="addon:thsv.chat-guard:observations"><summary><span><span class="step-number">6</span><strong>Moderation dashboard</strong><small>Review privacy-safe incidents, outcomes, and false positives without retaining chat text.</small></span></summary><div class="addon-step-body">',
    '<p class="notice"><strong>Privacy boundary:</strong> incident rows contain time, platform, matched rules, review state, enforcement outcome, and a short installation-local viewer fingerprint. Chat text, names, and raw account IDs are never retained.</p>',
    '<div class="grid" data-chat-guard-dashboard-summary><article class="stat"><span>Mode</span><strong>Not loaded</strong></article><article class="stat"><span>Incidents</span><strong>0</strong></article><article class="stat"><span>Needs review</span><strong>0</strong></article><article class="stat"><span>Failed actions</span><strong>0</strong></article></div>',
    '<form class="addon-settings-grid" data-chat-guard-incident-filters><label>Platform<select name="platform"><option value="">All platforms</option><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok</option></select></label><label>Matched rule<select name="rule"><option value="">All rules</option><option value="blocked-term">Blocked term</option><option value="blocked-domain">Blocked domain</option><option value="unapproved-domain">Unapproved domain</option><option value="excessive-links">Too many links</option><option value="excessive-caps">Excessive capitals</option><option value="repeated-characters">Repeated characters</option><option value="long-message">Long message</option><option value="repeated-message">Repeated message</option></select></label><label>Review<select name="review"><option value="">All reviews</option><option value="unreviewed">Needs review</option><option value="confirmed">Confirmed match</option><option value="false-positive">False positive</option></select></label><label>Action outcome<select name="enforcementStatus"><option value="">All outcomes</option><option value="none">Observed only</option><option value="dispatched">Awaiting provider result</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="unsupported">Skipped by safety gate</option></select></label><div class="button-row full-row"><button type="submit">Load incidents</button><button type="button" class="ghost" data-chat-guard-report>Download bounded report</button><button type="button" class="danger" data-chat-guard-clear>Clear retained history</button></div></form>',
    '<div class="item-list" data-chat-guard-incident-list><p class="notice">Choose Load incidents to open the private local dashboard.</p></div><div class="button-row"><button type="button" class="ghost" data-chat-guard-incidents-prev disabled>Previous</button><span data-chat-guard-page-state>Page not loaded</span><button type="button" class="ghost" data-chat-guard-incidents-next disabled>Next</button></div>',
    '<details data-disclosure-key="addon:thsv.chat-guard:rule-test"><summary>Test current rules safely</summary><p class="notice"><strong>No moderation happens during this test.</strong> The sample is not saved. Results contain only matching rule names and character count.</p><pre class="diagnostic" data-chat-guard-output>Paste a harmless sample to check the current rule settings.</pre><form class="addon-settings-grid" data-chat-guard-test-form><label class="full-row">Sample public-chat message<textarea name="message" required minlength="1" maxlength="2000" rows="4" placeholder="Paste a safe test sample. It will not be saved."></textarea></label><label>Prior matching messages<input name="priorMatchingMessages" type="number" min="0" max="9" step="1" value="0"></label><div class="button-row full-row"><button type="submit" class="ghost">Test current rules</button></div><small class="full-row">Only the character count and matched rule IDs are returned. The sample is not persisted or echoed back.</small></form></details>',
    '<details data-disclosure-key="addon:thsv.chat-guard:temporary-permit"><summary>Temporary link permit</summary><p class="notice">A permit bypasses blocked/unapproved-domain signals only. Other spam rules continue to observe the message.</p><form class="addon-settings-grid" data-chat-guard-permit-form><label>Platform<select name="platform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok / TikFinity</option></select></label><label>Stable platform user ID<input name="userId" required maxlength="256" autocomplete="off" placeholder="Provider account ID"></label><label>Expires after (minutes)<input name="durationMinutes" type="number" min="1" max="1440" step="1" value="15"></label><label>Maximum uses<input name="maximumUses" type="number" min="1" max="20" step="1" value="1"></label><label class="check full-row"><input name="approved" type="checkbox" required> I approve this time- and use-bounded domain exception.</label><div class="button-row full-row"><button type="submit">Create permit</button><button type="button" class="danger" data-chat-guard-clear-permits>Clear all permits</button></div></form></details>',
    '<details data-disclosure-key="addon:thsv.chat-guard:incident-review"><summary>Review by incident ID</summary><p class="notice">Usually, use the inline buttons in the dashboard. This fallback accepts an incident ID copied from a report.</p><form class="addon-settings-grid" data-chat-guard-review-form><label class="full-row">Incident ID<input name="incidentId" required pattern="[a-f0-9]{64}" maxlength="64" autocomplete="off"></label><label>Decision<select name="decision"><option value="confirmed">Confirmed match</option><option value="false-positive">False positive</option></select></label><label class="check full-row"><input name="approved" type="checkbox" required> Save this review label to the private incident record.</label><div class="button-row full-row"><button type="submit">Save review</button></div></form></details>',
    '</div></details>',
  ].join('');
}

function renderVillageDrawAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.village-draw' || !addOn.enabled) return '';
  return [
    '<details class="form-section addon-step" data-disclosure-key="addon:thsv.village-draw:live-controls" open><summary><span><span class="step-number">5</span><strong>Run the giveaway</strong><small>Open, close, draw, confirm, or safely cancel from one authenticated control panel.</small></span></summary><div class="addon-step-body">',
    '<p class="notice"><strong>Use these controls in order.</strong> Save and restart after changing the prize or ticket settings. Open creates an immutable active giveaway from those saved settings. Drawing is unavailable until entries are closed.</p>',
    '<div class="button-row"><button type="button" class="ghost" data-village-draw-operation="status">Refresh status</button><button type="button" data-village-draw-operation="open">Open entries</button><button type="button" class="ghost" data-village-draw-operation="pause">Pause</button><button type="button" class="ghost" data-village-draw-operation="resume">Resume</button><button type="button" data-village-draw-operation="close">Close entries</button></div>',
    '<div class="button-row"><button type="button" data-village-draw-operation="draw">Draw winner</button><button type="button" data-village-draw-operation="confirm">Confirm winner</button><button type="button" class="ghost" data-village-draw-operation="redraw">Redraw unconfirmed winner</button><button type="button" class="danger" data-village-draw-operation="cancel">Cancel and refund</button><button type="button" class="danger" data-village-draw-operation="reset">Clear completed draw</button></div>',
    '<pre class="diagnostic" data-village-draw-output>Press Refresh status. No entrant names or stable account IDs are displayed here.</pre>',
    '<details data-disclosure-key="addon:thsv.village-draw:control-help"><summary>What each button does</summary><ol><li><strong>Open:</strong> snapshots the saved prize and rules, announces the giveaway, and accepts entries.</li><li><strong>Pause:</strong> temporarily rejects new tickets without changing existing entries.</li><li><strong>Close:</strong> permanently freezes entries for this draw.</li><li><strong>Draw:</strong> securely selects one weighted ticket and displays the winner.</li><li><strong>Confirm:</strong> archives the result. Redraw is allowed only before confirmation.</li><li><strong>Cancel and refund:</strong> closes the draw and idempotently returns every unrefunded Viewer Foundation point.</li></ol></details>',
    '</div></details>',
  ].join('');
}

function renderAddOns() {
  const list = byId('addon-list');
  if (!state.addOns.length) {
    list.innerHTML = '<p class="notice">No add-ons are installed. Core chat, commands, alerts, timers, and rewards continue to work without add-ons.</p>';
    return;
  }
  const selected = state.addOns.find((addOn) => addOn.moduleId === state.selectedAddOnId) || state.addOns[0];
  state.selectedAddOnId = selected.moduleId;
  const selector = `<label class="addon-selector">Manage installed add-on<select id="addon-selector">${state.addOns.map((addOn) => `<option value="${safe(addOn.moduleId)}" ${addOn.moduleId === selected.moduleId ? 'selected' : ''}>${safe(addOn.name)} ${safe(addOn.version)}</option>`).join('')}</select></label>`;
  list.innerHTML = selector + [selected].map((addOn) => {
    const rejected = addOn.health === 'rejected';
    const fields = rejected ? '' : renderAddOnSettings(addOn);
    const permissions = addOn.permissions.length ? addOn.permissions.join(', ') : 'No optional permissions requested';
    const trustLinks = rejected ? '' : renderAddOnTrustLinks(addOn.trust);
    const updateNotice = renderAddOnUpdate(addOn);
    const liveChatWarning = addOn.permissions.includes('chat.send') ? '<p class="notice"><strong>Live chat permission:</strong> this add-on can automatically post messages to creator-enabled platforms through StreamBridge. Review its settings and publisher before enabling it.</p>' : '';
    const providerWarning = addOn.permissions.includes('provider.events.publish') ? '<p class="notice"><strong>Financial-event permission:</strong> this add-on can publish only its assigned provider donations into the core alert pipeline. Stable provider IDs, bounded values, and core validation are enforced; review the provider connection before enabling it.</p>' : '';
    const viewerWarning = addOn.permissions.some((permission) => permission.startsWith('viewer.foundation.') || permission.startsWith('community.analytics.')) ? '<p class="notice"><strong>Viewer-data permission:</strong> this add-on participates in the optional Viewer Foundation or Community Analytics services. Review whether it provides or reads pseudonymous viewer data before enabling it.</p>' : '';
    const triggerReadiness = rejected ? '' : renderAddOnTriggerReadiness(addOn);
    const settingsIntro = typeof addOn.settingsUi?.intro === 'string' && addOn.settingsUi.intro.trim() ? addOn.settingsUi.intro : 'Open only the section you want to change. Hidden options keep their saved values.';
    const settings = rejected || !fields ? '' : `<details class="form-section addon-settings-shell addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:configure`)}" open><summary><span><span class="step-number">2</span><strong>Configure the add-on</strong><small>Change only the sections you need; saved collapsed sections stay collapsed.</small></span></summary><form class="addon-settings" data-addon-settings="${safe(addOn.moduleId)}"><div class="addon-settings-heading"><p class="addon-settings-intro">${safe(settingsIntro)}</p><div class="button-row"><button type="button" class="ghost compact" data-addon-sections="expand">Expand all</button><button type="button" class="ghost compact" data-addon-sections="collapse">Collapse all</button></div></div>${fields}<div class="addon-settings-save"><button type="submit">Save all settings</button><small>Settings are preserved now and become active after StreamBridge restarts.</small></div></form></details>`;
    let nextWorkflowStep = 4;
    const chatGuardGrantHelp = addOn.moduleId === 'thsv.chat-guard'
      ? '<p class="notice"><strong>Observation-only users can leave this empty.</strong> For automatic moderation, approve only <strong>THSV Addon - Chat Guard - Moderate</strong>. The main chat intake now handles <code>!guardtrust</code> locally; the older Trust Viewer helper does not need approval.</p>'
      : '';
    const actionGrant = rejected || !addOn.permissions.includes('streamerbot.run-approved-action') ? '' : `<details class="form-section addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:approved-actions`)}"><summary><span><span class="step-number">${nextWorkflowStep++}</span><strong>Approve Streamer.bot actions</strong><small>${addOn.moduleId === 'thsv.chat-guard' ? 'Optional: required only for automatic moderation.' : 'Grant only the actions this add-on is allowed to run.'}</small></span></summary><div class="addon-step-body">${chatGuardGrantHelp}${renderAddOnActionGrant(addOn)}</div></details>`;
    const overlayTools = rejected || !addOn.permissions.includes('overlay.publish') ? '' : `<details class="form-section addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:overlay-tools`)}"><summary><span><span class="step-number">${nextWorkflowStep++}</span><strong>Open overlay &amp; test</strong><small>Open the hosted overlay and send a safe preview before going live.</small></span></summary><div class="addon-step-body">${renderAddOnOverlayTools(addOn)}</div></details>`;
    const viewerAdministration = rejected ? '' : `${renderViewerFoundationAdmin(addOn)}${renderCommunityAnalyticsAdmin(addOn)}${renderViewerSpotlightAdmin(addOn)}${renderFollowerPulseAdmin(addOn)}${renderChatGuardAdmin(addOn)}${renderVillageDrawAdmin(addOn)}`;
    const setupGuide = renderAddOnSetupGuide(addOn);
    if (addOn.moduleId === 'thsv.chat-guard' && addOn.enabled) nextWorkflowStep = Math.max(nextWorkflowStep, 7);
    if (addOn.moduleId === 'thsv.village-draw' && addOn.enabled) nextWorkflowStep = Math.max(nextWorkflowStep, 6);
    const acceptance = rejected ? '' : renderAddOnAcceptance(addOn, nextWorkflowStep);
    const toggle = rejected ? '' : `<button type="button" data-toggle-addon="${safe(addOn.moduleId)}" data-addon-enabled="${String(addOn.enabled)}">${addOn.enabled ? 'Disable' : 'Enable'}</button>`;
    const packageDetails = rejected ? '' : `<details class="form-section addon-package-details" data-disclosure-key="${safe(`addon:${addOn.moduleId}:package-details`)}"><summary><span><strong>Package and publisher details</strong><small>Permissions, source, updates, release notes, and security information.</small></span></summary><div class="addon-step-body"><p><strong>Publisher:</strong> ${safe(addOn.author)}</p><p><strong>Package type:</strong> ${safe(addOn.packageKind)}</p><p><strong>Permissions:</strong> ${safe(permissions)}</p>${trustLinks}${liveChatWarning}${providerWarning}${viewerWarning}${addOn.packageKind === 'executable' ? '<p class="notice">Executable add-ons run with the same Windows account permissions as StreamBridge. The broker limits supported framework operations, but it is not an operating-system sandbox. Install executable packages only from publishers you trust.</p>' : ''}${addOn.changelog ? `<details data-disclosure-key="${safe(`addon:${addOn.moduleId}:release-notes`)}"><summary>Release notes</summary><p>${safe(addOn.changelog)}</p></details>` : ''}</div></details>`;
    const maintenance = rejected ? '' : `<details class="form-section addon-maintenance" data-disclosure-key="${safe(`addon:${addOn.moduleId}:maintenance`)}"><summary><span><strong>Enable, disable, or uninstall</strong><small>Routine maintenance and removal controls.</small></span></summary><div class="addon-step-body"><div class="button-row">${toggle}<button type="button" class="danger" data-remove-addon="${safe(addOn.moduleId)}">Uninstall</button></div><small>Enable and disable changes require a bridge restart. Uninstall preserves private settings for a later reinstall.</small></div></details>`;
    return `<article class="item addon-card ${rejected ? 'muted' : ''}" data-addon-id="${safe(addOn.moduleId)}"><div class="addon-card-header"><div><p class="addon-kicker">Installed add-on</p><h3>${safe(addOn.name)} ${safe(addOn.version)}</h3><p class="addon-version">${safe(addOn.moduleId)}</p></div><div class="addon-card-status"><span class="badge">${rejected ? 'Rejected' : (addOn.enabled ? 'Enabled' : 'Disabled')}</span>${renderAddOnRuntimeStatus(addOn)}</div></div><p class="addon-description">${safe(addOn.description)}</p>${renderAddOnRuntimeSummary(addOn)}${rejected ? '' : renderAddOnQuickSummary(addOn, Boolean(fields))}${updateNotice}${rejected ? `<p class="error">${safe(addOn.error)}</p>` : ''}<div class="addon-flow">${setupGuide}${!rejected && !fields ? '<p class="notice">This add-on has no creator-editable settings. Continue to its connection and testing steps.</p>' : ''}${settings}${triggerReadiness}${actionGrant}${overlayTools}${viewerAdministration}${acceptance}</div>${packageDetails}${maintenance}</article>`;
  }).join('');
  // Saving settings and other add-on operations rebuild this subtree. Restore both open and
  // closed choices immediately so sections never flash or return to their package defaults.
  restoreDisclosureStates(list);
  byId('addon-selector').addEventListener('change', (event) => { state.selectedAddOnId = event.target.value; renderAddOns(); });
  document.querySelectorAll('[data-toggle-addon]').forEach((button) => button.addEventListener('click', toggleAddOn));
  document.querySelectorAll('[data-remove-addon]').forEach((button) => button.addEventListener('click', removeAddOn));
  document.querySelectorAll('[data-stage-addon-update]').forEach((button) => button.addEventListener('click', stageOfficialAddOnUpdate));
  document.querySelectorAll('[data-addon-settings]').forEach((form) => {
    form.addEventListener('submit', saveAddOnSettings);
    form.addEventListener('change', () => updateAddOnFieldVisibility(form));
    form.querySelectorAll('[data-addon-sections]').forEach((button) => button.addEventListener('click', () => {
      const open = button.dataset.addonSections === 'expand';
      form.querySelectorAll('.addon-settings-section').forEach((section) => { section.open = open; });
    }));
    updateAddOnFieldVisibility(form);
  });
  document.querySelectorAll('[data-scene-mapping-editor]').forEach(attachSceneMappingEditor);
  document.querySelectorAll('[data-inspect-addon-actions]').forEach((button) => button.addEventListener('click', runInspection));
  document.querySelectorAll('[data-addon-action-group]').forEach((select) => select.addEventListener('change', selectAddOnActionGroup));
  document.querySelectorAll('[data-add-addon-action]').forEach((button) => button.addEventListener('click', addAddOnActionDraft));
  document.querySelectorAll('[data-add-recommended-addon-actions]').forEach((button) => button.addEventListener('click', addRecommendedAddOnActions));
  document.querySelectorAll('[data-remove-addon-action]').forEach((button) => button.addEventListener('click', removeAddOnActionDraft));
  document.querySelectorAll('[data-save-addon-action-grants]').forEach((button) => button.addEventListener('click', saveAddOnActionGrants));
  document.querySelectorAll('[data-copy-addon-overlay]').forEach((button) => button.addEventListener('click', copyAddOnOverlayUrl));
  document.querySelectorAll('[data-preview-addon-overlay]').forEach((button) => button.addEventListener('click', previewAddOnOverlay));
  document.querySelectorAll('[data-hide-addon-overlay]').forEach((button) => button.addEventListener('click', hideAddOnOverlayPreview));
  document.querySelector('[data-addon-acceptance-form]')?.addEventListener('submit', saveAddOnAcceptance);
  document.querySelector('[data-viewer-admin-status]')?.addEventListener('click', refreshViewerFoundationStatus);
  document.querySelector('[data-viewer-admin-audit]')?.addEventListener('click', refreshViewerFoundationAudit);
  document.querySelector('[data-viewer-search-id-form]')?.addEventListener('submit', searchViewerFoundationId);
  document.querySelector('[data-viewer-search-account-form]')?.addEventListener('submit', searchViewerFoundationAccount);
  document.querySelector('[data-viewer-link-form]')?.addEventListener('submit', addViewerFoundationLink);
  document.querySelectorAll('[data-viewer-link-remove]').forEach((button) => button.addEventListener('click', removeViewerFoundationLink));
  document.querySelector('[data-viewer-export-form]')?.addEventListener('submit', exportViewerFoundationRecord);
  document.querySelector('[data-viewer-correction-form]')?.addEventListener('submit', correctViewerFoundationRecord);
  document.querySelector('[data-viewer-undo-form]')?.addEventListener('submit', undoViewerFoundationCorrection);
  document.querySelector('[data-viewer-delete-form]')?.addEventListener('submit', deleteViewerFoundationRecord);
  document.querySelector('[data-viewer-migration-preview]')?.addEventListener('click', previewViewerFoundationMigration);
  document.querySelector('[data-viewer-migration-apply]')?.addEventListener('click', applyViewerFoundationMigration);
  document.querySelector('[data-analytics-admin-status]')?.addEventListener('click', refreshCommunityAnalyticsStatus);
  document.querySelector('[data-analytics-export-form]')?.addEventListener('submit', exportCommunityAnalyticsRecord);
  document.querySelector('[data-analytics-delete-form]')?.addEventListener('submit', deleteCommunityAnalyticsRecord);
  document.querySelectorAll('[data-analytics-report]').forEach((button) => button.addEventListener('click', downloadCommunityAnalyticsReport));
  if (document.querySelector('[data-analytics-admin-output]')) void refreshCommunityAnalyticsStatus();
  document.querySelector('[data-spotlight-admin-status]')?.addEventListener('click', refreshViewerSpotlightStatus);
  document.querySelector('[data-spotlight-stream-score]')?.addEventListener('click', showViewerSpotlightStreamScore);
  document.querySelector('[data-spotlight-display-form]')?.addEventListener('submit', displayViewerSpotlightCard);
  document.querySelector('[data-follower-pulse-status]')?.addEventListener('click', refreshFollowerPulseStatus);
  document.querySelector('[data-follower-pulse-reconcile]')?.addEventListener('click', reconcileFollowerPulse);
  if (document.querySelector('[data-follower-pulse-output]')) void refreshFollowerPulseStatus();
  document.querySelectorAll('[data-chat-guard-status]').forEach((button) => button.addEventListener('click', refreshChatGuardStatus));
  document.querySelector('[data-chat-guard-incident-filters]')?.addEventListener('submit', loadChatGuardIncidents);
  document.querySelector('[data-chat-guard-incidents-prev]')?.addEventListener('click', previousChatGuardIncidents);
  document.querySelector('[data-chat-guard-incidents-next]')?.addEventListener('click', nextChatGuardIncidents);
  document.querySelector('[data-chat-guard-report]')?.addEventListener('click', downloadChatGuardReport);
  document.querySelector('[data-chat-guard-trust-form]')?.addEventListener('submit', addChatGuardTrustedViewer);
  document.querySelectorAll('[data-chat-guard-trust-remove]').forEach((button) => button.addEventListener('click', removeChatGuardTrustedViewer));
  document.querySelector('[data-chat-guard-clear]')?.addEventListener('click', clearChatGuardObservations);
  document.querySelector('[data-chat-guard-test-form]')?.addEventListener('submit', testChatGuardRules);
  document.querySelector('[data-chat-guard-permit-form]')?.addEventListener('submit', createChatGuardPermit);
  document.querySelector('[data-chat-guard-clear-permits]')?.addEventListener('click', clearChatGuardPermits);
  document.querySelector('[data-chat-guard-review-form]')?.addEventListener('submit', reviewChatGuardIncident);
  document.querySelectorAll('[data-village-draw-operation]').forEach((button) => button.addEventListener('click', runVillageDrawOperation));
}

async function stageOfficialAddOnUpdate(event) {
  const moduleId = event.currentTarget.dataset.stageAddonUpdate;
  const version = event.currentTarget.dataset.stageAddonVersion;
  if (!confirm(`Download and cryptographically verify ${moduleId} ${version}? This only stages the package for review; it will not install, enable, or restart anything.`)) return;
  const button = event.currentTarget;
  const status = byId('addon-update-state');
  button.disabled = true;
  status.setAttribute('aria-busy', 'true');
  status.textContent = `Downloading and verifying ${moduleId} ${version}...`;
  try {
    const publisherId = state.addOnUpdatePublisherId || '';
    const result = await api(publisherId ? '/wizard/api/addons/trusted-updates/stage' : '/wizard/api/addons/updates/stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ moduleId, version, approvedByCreator: true, ...(publisherId ? { publisherId } : {}) }),
    });
    await loadAddOns();
    status.textContent = `${result.moduleId} ${result.version} passed authenticated release provenance and package verification. Review it under Discovered packages, then choose Verify and install.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    status.removeAttribute('aria-busy');
    button.disabled = false;
  }
}

function acceptanceOptions(selected) {
  const labels = { pending: 'Pending', passed: 'Passed', failed: 'Failed', 'not-required': 'Not required' };
  return Object.entries(labels).map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderAddOnAcceptance(addOn, verificationStep = 4) {
  const entry = state.addOnAcceptance?.[addOn.moduleId] || { offlineStatus: 'pending', providerStatus: 'pending', evidence: '', updatedAt: '' };
  const updated = entry.updatedAt ? `Last updated ${new Date(entry.updatedAt).toLocaleString()}.` : 'No acceptance result has been recorded on this installation.';
  return `<details class="form-section addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:acceptance`)}"><summary><span><span class="step-number">${verificationStep}</span><strong>Record verification</strong><small>Keep simulated tests separate from a genuine provider result.</small></span></summary><div class="addon-step-body"><p class="notice"><strong>Published is not the same as provider accepted.</strong> Simulators and Test triggers may pass Offline/manual only. Record Provider as Passed only after the responsible service returned a genuine acknowledgement.</p><form class="addon-settings-grid" data-addon-acceptance-form="${safe(addOn.moduleId)}"><label>Offline/manual status<select name="offlineStatus">${acceptanceOptions(entry.offlineStatus)}</select></label><label>Genuine provider status<select name="providerStatus">${acceptanceOptions(entry.providerStatus)}</select></label><label class="full-row">Evidence note<textarea name="evidence" rows="3" maxlength="500" placeholder="Date, app/provider build, exact test, and observed result. Never paste secrets or viewer IDs.">${safe(entry.evidence || '')}</textarea><small>${safe(updated)} URLs, tokens, passwords, and webhook secrets are rejected. Do not enter raw viewer identifiers.</small></label><label class="check full-row"><input name="approved" type="checkbox" required> I confirm this status accurately distinguishes simulation from a genuine provider result.</label><div class="button-row full-row"><button type="submit">Save acceptance status</button><a href="https://github.com/surakage/THSV-StreamBridge/blob/main/docs/offline-acceptance.md" target="_blank" rel="noreferrer noopener">Open testing guide</a></div></form></div></details>`;
}

async function saveAddOnAcceptance(event) {
  event.preventDefault(); const form = event.currentTarget; const id = form.dataset.addonAcceptanceForm;
  if (!form.checkValidity()) return form.reportValidity();
  try {
    const result = await api(`/wizard/api/addons/${encodeURIComponent(id)}/acceptance`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offlineStatus: form.elements.offlineStatus.value, providerStatus: form.elements.providerStatus.value, evidence: form.elements.evidence.value.trim(), approvedByCreator: true }) });
    state.addOnAcceptance[id] = result; renderAddOns(); byId('addon-state').textContent = `Acceptance status saved for ${id}.`;
  } catch (error) { byId('addon-state').textContent = error.message; }
}

function viewerAdminOutput(value) {
  const output = document.querySelector('[data-viewer-admin-output]');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function viewerFoundationAdmin(request) {
  const result = await api('/wizard/api/viewer-foundation/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  viewerAdminOutput(result); return result;
}

async function refreshViewerFoundationStatus() {
  try { await viewerFoundationAdmin({ operation: 'status' }); } catch (error) { viewerAdminOutput(error.message); }
}

async function refreshViewerFoundationAudit() {
  try { await viewerFoundationAdmin({ operation: 'audit', limit: 25 }); } catch (error) { viewerAdminOutput(error.message); }
}

async function searchViewerFoundationId(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try { await viewerFoundationAdmin({ operation: 'search', viewerId: form.elements.viewerId.value.trim() }); } catch (error) { viewerAdminOutput(error.message); }
}

async function searchViewerFoundationAccount(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try { await viewerFoundationAdmin({ operation: 'search', platform: form.elements.platform.value, userId: form.elements.userId.value.trim() }); } catch (error) { viewerAdminOutput(error.message); }
}

function viewerFoundationAddOn() {
  return state.addOns.find((candidate) => candidate.moduleId === 'thsv.viewer-foundation');
}

async function saveViewerFoundationLinks(nextLinks, auditRequest) {
  const addOn = viewerFoundationAddOn();
  if (!addOn) throw new Error('Viewer Foundation is not installed.');
  const previousSettings = { ...addOn.settings, accountLinks: [...(addOn.settings?.accountLinks || [])] };
  const nextSettings = { ...addOn.settings, accountLinks: nextLinks };
  await api('/wizard/api/addons/thsv.viewer-foundation/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextSettings) });
  try {
    await viewerFoundationAdmin(auditRequest);
  } catch (error) {
    try {
      await api('/wizard/api/addons/thsv.viewer-foundation/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(previousSettings) });
    } catch (rollbackError) {
      throw new Error(`The link audit failed and the previous settings could not be restored. Do not restart StreamBridge; review Viewer Foundation links now. Audit: ${error.message} Rollback: ${rollbackError.message}`);
    }
    throw new Error(`The link audit failed, so the settings change was rolled back: ${error.message}`);
  }
  await loadAddOns();
  byId('addon-state').textContent = 'Verified account links were saved and audited. Restart StreamBridge to apply the new identity mapping.';
}

async function addViewerFoundationLink(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const viewerId = form.elements.viewerId.value.trim(); const platform = form.elements.platform.value; const userId = form.elements.userId.value.trim();
  if (/^(?:twitch|youtube|kick|tiktok)-[a-f0-9]{24}$/u.test(viewerId)) { viewerAdminOutput('Generated platform-scoped IDs cannot become shared link IDs. Choose a short creator-defined ID such as alex.'); return; }
  const link = `${viewerId}|${platform}|${userId}`;
  const existing = [...(viewerFoundationAddOn()?.settings?.accountLinks || [])];
  if (existing.includes(link)) { viewerAdminOutput('That exact account link already exists.'); return; }
  if (existing.some((value) => { const parts = String(value).split('|'); return parts[1] === platform && parts[2] === userId && parts[0] !== viewerId; })) { viewerAdminOutput('That stable platform account is already assigned to another Viewer Foundation ID.'); return; }
  if (existing.length >= 100) { viewerAdminOutput('Viewer Foundation supports at most 100 explicit account links.'); return; }
  if (!confirm(`Link ${platform} stable account ${userId} to ${viewerId}? Verify ownership before continuing.`)) return;
  try { await saveViewerFoundationLinks([...existing, link], { operation: 'link-audit', linkAction: 'add', viewerId, platform, userId, reason: form.elements.reason.value.trim(), approvedByCreator: true }); }
  catch (error) { viewerAdminOutput(error.message); }
}

async function removeViewerFoundationLink(event) {
  const link = event.currentTarget.dataset.viewerLinkRemove; const parts = String(link || '').split('|');
  if (parts.length !== 3) return;
  const [viewerId, platform, userId] = parts;
  if (!confirm(`Remove the ${platform} stable account link from ${viewerId}? The viewer may receive a separate platform-scoped identity after restart.`)) return;
  const existing = [...(viewerFoundationAddOn()?.settings?.accountLinks || [])];
  try { await saveViewerFoundationLinks(existing.filter((value) => value !== link), { operation: 'link-audit', linkAction: 'remove', viewerId, platform, userId, reason: 'Creator removed a verified account link', approvedByCreator: true }); }
  catch (error) { viewerAdminOutput(error.message); }
}

async function exportViewerFoundationRecord(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try { await viewerFoundationAdmin({ operation: 'export', viewerId: form.elements.viewerId.value.trim() }); } catch (error) { viewerAdminOutput(error.message); }
}

async function correctViewerFoundationRecord(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const adjustment = form.elements.adjustment.value; const viewerId = form.elements.viewerId.value.trim();
  if (!confirm(`Apply the ${adjustment} point correction to ${viewerId}? This changes live private progression state.`)) return;
  const request = { operation: 'correct', viewerId, adjustment, reason: form.elements.reason.value.trim(), approvedByCreator: true };
  if (adjustment !== 'reset') request.amount = Number(form.elements.amount.value);
  try { await viewerFoundationAdmin(request); } catch (error) { viewerAdminOutput(error.message); }
}

async function undoViewerFoundationCorrection(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const auditId = form.elements.auditId.value.trim();
  if (!confirm(`Undo correction ${auditId}? This succeeds only when no newer point activity changed the balance.`)) return;
  try { await viewerFoundationAdmin({ operation: 'undo-correction', auditId, reason: form.elements.reason.value.trim(), approvedByCreator: true }); form.reset(); }
  catch (error) { viewerAdminOutput(error.message); }
}

async function deleteViewerFoundationRecord(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const viewerId = form.elements.viewerId.value.trim();
  if (!confirm(`Permanently delete Viewer Foundation record ${viewerId}? This cannot be undone.`)) return;
  try {
    const result = await viewerFoundationAdmin({ operation: 'delete', viewerId, approvedByCreator: true });
    if (result.accountLinksRequireRemoval) viewerAdminOutput(`${JSON.stringify(result, null, 2)}\n\nRemove this viewer's entries from Explicit account links, save settings, and restart StreamBridge to complete link-data removal.`);
    form.reset();
  } catch (error) { viewerAdminOutput(error.message); }
}

let viewerMigrationPreview;

function viewerMigrationOutput(value) {
  const output = document.querySelector('[data-viewer-migration-output]');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function previewViewerFoundationMigration() {
  const apply = document.querySelector('[data-viewer-migration-apply]');
  if (apply) apply.disabled = true;
  viewerMigrationPreview = undefined;
  try {
    const result = await api('/wizard/api/viewer-foundation/migration');
    if (!result.found) {
      viewerMigrationOutput(`No preserved legacy state was found at ${result.source}.`);
      return;
    }
    viewerMigrationPreview = result;
    if (apply) apply.disabled = result.records.length === 0;
    viewerMigrationOutput({ source: result.source, digest: result.digest, recordCount: result.records.length, rejectedRecords: result.rejectedRecords, totalPoints: result.totalPoints, exactRecords: result.records });
  } catch (error) { viewerMigrationOutput(error.message); }
}

async function applyViewerFoundationMigration() {
  if (!viewerMigrationPreview?.digest || !viewerMigrationPreview.records?.length) return viewerMigrationOutput('Preview the legacy state before importing it.');
  if (!confirm(`Import the exact ${viewerMigrationPreview.records.length} previewed record(s) with ${viewerMigrationPreview.totalPoints} total points? Existing viewers keep the higher point total.`)) return;
  try {
    const result = await api('/wizard/api/viewer-foundation/migration', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ migrationDigest: viewerMigrationPreview.digest, approvedByCreator: true }) });
    viewerMigrationPreview = undefined;
    const apply = document.querySelector('[data-viewer-migration-apply]'); if (apply) apply.disabled = true;
    viewerMigrationOutput(result);
  } catch (error) { viewerMigrationOutput(error.message); }
}

function analyticsAdminOutput(value) {
  const output = document.querySelector('[data-analytics-admin-output]');
  if (!output) return;
  if (value && typeof value === 'object' && value.operation === 'status') {
    const current = value.current;
    const counters = current?.counters || {};
    const counterLabels = { messages: 'Chat messages', commands: 'Commands', follows: 'Follows', subscriptions: 'Subscriptions', memberships: 'Memberships', giftSubscriptions: 'Gift subscriptions', gifts: 'Gifts', cheers: 'Cheers / bits', superChats: 'Super Chats', raids: 'Raids', rewardRedemptions: 'Reward redemptions' };
    const counterCards = Object.entries(counterLabels).map(([key, label]) => `<article class="analytics-counter"><span>${safe(label)}</span><strong>${safe(Number(counters[key] || 0).toLocaleString())}</strong></article>`).join('');
    const platforms = Array.isArray(current?.livePlatforms) && current.livePlatforms.length > 0 ? current.livePlatforms.map(addOnOptionLabel).join(', ') : 'None detected';
    const recent = Array.isArray(value.recentSessions) ? value.recentSessions.slice().reverse().slice(0, 5) : [];
    const recentSessions = recent.length === 0 ? '<p class="analytics-empty">No completed sessions yet. The current session moves here after the final platform sends an offline event.</p>' : `<div class="analytics-session-list">${recent.map((session) => `<article class="analytics-session"><div><strong>${safe(new Date(session.startedAt).toLocaleString())}</strong><small>${safe(session.approximate ? 'Estimated session' : 'Confirmed stream session')} · ${safe(Number(session.uniqueViewers || 0).toLocaleString())} viewers</small></div><span>${safe(formatAnalyticsDuration(session.startedAt, session.endedAt))}</span></article>`).join('')}</div>`;
    output.innerHTML = `<div class="grid analytics-overview"><article class="stat"><span>Current session</span><strong>${current ? 'Active' : 'Not active'}</strong><small>${safe(current?.approximate ? 'Estimated from observed activity' : current ? 'Started by a live signal' : 'Waiting for activity')}</small></article><article class="stat"><span>Tracked viewers</span><strong>${safe(Number(value.trackedViewerCount || 0).toLocaleString())}</strong><small>Pseudonymous local records</small></article><article class="stat"><span>Completed sessions</span><strong>${safe(Number(value.retainedSessionCount || 0).toLocaleString())}</strong><small>Retained local summaries</small></article><article class="stat"><span>Participation score</span><strong>${value.engagementScoreEnabled ? 'On' : 'Off'}</strong><small>${safe(value.engagementScoreEnabled ? `${value.scoreSeason || 'Current season'} · ${Number(value.rankCohortSize || 0).toLocaleString()} ranked viewers` : 'Optional and disabled')}</small></article></div><section class="analytics-panel"><div class="analytics-panel-heading"><div><h4>Current activity</h4><p>${safe(current ? `${platforms} · started ${new Date(current.startedAt).toLocaleString()}` : 'No active session is being observed.')}</p></div><strong>${safe(Number(current?.uniqueViewers || 0).toLocaleString())} viewers</strong></div><div class="analytics-counter-grid">${counterCards}</div></section><section class="analytics-panel"><h4>Recent completed sessions</h4>${recentSessions}</section>`;
    return;
  }
  if (typeof value === 'string') output.innerHTML = `<p class="notice">${safe(value)}</p>`;
  else output.innerHTML = `<details class="analytics-record-preview" open><summary>Privacy-safe record details</summary><pre class="diagnostic">${safe(JSON.stringify(value, null, 2))}</pre></details>`;
}

function formatAnalyticsDuration(startedAt, endedAt) {
  const duration = Math.max(0, Number(endedAt || 0) - Number(startedAt || 0));
  const minutes = Math.floor(duration / 60000); const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
}

async function communityAnalyticsAdmin(request) {
  const result = await api('/wizard/api/community-analytics/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  analyticsAdminOutput(result); return result;
}

async function refreshCommunityAnalyticsStatus() {
  try { await communityAnalyticsAdmin({ operation: 'status' }); } catch (error) { analyticsAdminOutput(error.message); }
}

async function exportCommunityAnalyticsRecord(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try { await communityAnalyticsAdmin({ operation: 'export', viewerId: form.elements.viewerId.value.trim() }); } catch (error) { analyticsAdminOutput(error.message); }
}

async function deleteCommunityAnalyticsRecord(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const viewerId = form.elements.viewerId.value.trim();
  if (!confirm(`Permanently delete Community Analytics record ${viewerId}? Completed aggregate session totals will remain because they contain no viewer identity.`)) return;
  try { await communityAnalyticsAdmin({ operation: 'delete', viewerId, approvedByCreator: true }); form.reset(); } catch (error) { analyticsAdminOutput(error.message); }
}

async function downloadCommunityAnalyticsReport(event) {
  const reportKind = event.currentTarget.dataset.analyticsReport;
  try {
    const result = await api('/wizard/api/community-analytics/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'report', reportKind }) });
    const blob = new Blob([result.content], { type: `${result.mimeType};charset=utf-8` }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = result.filename; link.click(); URL.revokeObjectURL(url);
    analyticsAdminOutput(`Downloaded ${result.filename}. The file contains local, pseudonymous observations only.`);
  } catch (error) { analyticsAdminOutput(error.message); }
}

function spotlightAdminOutput(value) {
  const output = document.querySelector('[data-spotlight-admin-output]');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function viewerSpotlightAdmin(request) {
  const result = await api('/wizard/api/viewer-spotlight/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  spotlightAdminOutput(result); return result;
}

async function refreshViewerSpotlightStatus() {
  try { await viewerSpotlightAdmin({ operation: 'status' }); } catch (error) { spotlightAdminOutput(error.message); }
}

async function showViewerSpotlightStreamScore() {
  if (!confirm('Show the current local Stream Score on the Viewer Spotlight overlay?')) return;
  try { await viewerSpotlightAdmin({ operation: 'stream-score', approvedByCreator: true }); } catch (error) { spotlightAdminOutput(error.message); }
}

async function displayViewerSpotlightCard(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const displayName = form.elements.displayName.value.trim();
  if (!confirm(`Display a live Viewer Spotlight card for ${displayName}?`)) return;
  const avatarUrl = form.elements.avatarUrl.value.trim();
  const request = { operation: 'display', platform: form.elements.platform.value, userId: form.elements.userId.value.trim(), displayName, sendDiscord: form.elements.sendDiscord.checked, approvedByCreator: true };
  if (avatarUrl) request.avatarUrl = avatarUrl;
  try { await viewerSpotlightAdmin(request); } catch (error) { spotlightAdminOutput(error.message); }
}

function followerPulseOutput(value) {
  const output = document.querySelector('[data-follower-pulse-output]');
  if (!output) return;
  if (!value || typeof value !== 'object') { output.innerHTML = `<p class="notice">${safe(String(value || 'Follower Pulse status is unavailable.'))}</p>`; return; }
  const lastScan = value.lastCompleteScanAt ? new Date(value.lastCompleteScanAt).toLocaleString() : 'No complete scan yet';
  const lastAttempt = value.lastAttemptAt ? new Date(value.lastAttemptAt).toLocaleString() : 'No attempt yet';
  const nextScan = value.nextScanAt ? new Date(value.nextScanAt).toLocaleString() : (value.scanActive ? 'Waiting for Twitch' : 'Not scheduled');
  const changes = Array.isArray(value.recentChanges) ? value.recentChanges : [];
  const history = changes.length === 0
    ? '<p class="notice">No confirmed follower changes have been retained yet. The first complete scan creates a silent baseline.</p>'
    : `<div class="item-list">${changes.map((change) => { const display = change.displayName || change.login || 'Unknown Twitch account'; const login = change.login && change.login.toLowerCase() !== String(display).toLowerCase() ? ` @${change.login}` : ''; return `<article class="item"><strong>${change.type === 'unfollow' ? 'Unfollowed' : 'Followed'} · ${safe(display)}</strong><small>${safe(login)}${login ? ' · ' : ''}${safe(new Date(change.occurredAt).toLocaleString())}</small></article>`; }).join('')}</div>`;
  const error = value.lastError ? `<p class="notice"><strong>Last scan issue:</strong> ${safe(value.lastError)}</p>` : '';
  output.innerHTML = `<div class="grid"><article class="stat"><span>Baseline</span><strong>${value.baselineComplete ? 'Ready' : 'Not ready'}</strong><small>${value.baselineComplete ? 'Complete comparisons enabled' : 'Waiting for one complete scan'}</small></article><article class="stat"><span>Tracked followers</span><strong>${safe(Number(value.trackedFollowerCount || 0).toLocaleString())}</strong><small>Last Twitch total: ${safe(Number(value.lastApiTotal || 0).toLocaleString())}</small></article><article class="stat"><span>Pending confirmation</span><strong>${safe(Number(value.pendingConfirmationCount || 0).toLocaleString())}</strong><small>${safe(Number(value.confirmMissingScans || 2))} complete missing scans required</small></article><article class="stat"><span>Snapshot</span><strong>${value.scanActive ? 'Checking now' : 'Idle'}</strong><small>Last attempt: ${safe(lastAttempt)}<br>Last complete: ${safe(lastScan)}<br>Next check: ${safe(nextScan)}${Number(value.consecutiveFailures || 0) > 0 ? `<br>Retry level: ${safe(Number(value.consecutiveFailures))}` : ''}</small></article></div>${error}<h4>Recent confirmed changes</h4>${history}`;
}

async function followerPulseAdmin(request) {
  const result = await api('/wizard/api/follower-pulse/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  followerPulseOutput(result); return result;
}

async function refreshFollowerPulseStatus() {
  try { await followerPulseAdmin({ operation: 'status' }); } catch (error) { followerPulseOutput(error.message); }
}

let followerPulsePollToken = 0;
async function pollFollowerPulseUntilIdle(token, attempts = 0) {
  if (token !== followerPulsePollToken || attempts >= 24) return;
  try {
    const status = await followerPulseAdmin({ operation: 'status' });
    if (!status.scanActive) return;
  } catch (error) { followerPulseOutput(error.message); return; }
  window.setTimeout(() => void pollFollowerPulseUntilIdle(token, attempts + 1), 1500);
}

async function reconcileFollowerPulse() {
  if (!confirm('Start a private Twitch follower snapshot now? It will not post names anywhere.')) return;
  try { await followerPulseAdmin({ operation: 'reconcile', approvedByCreator: true }); followerPulsePollToken += 1; window.setTimeout(() => void pollFollowerPulseUntilIdle(followerPulsePollToken), 750); }
  catch (error) { followerPulseOutput(error.message); }
}

function chatGuardOutput(value) {
  const output = document.querySelector('[data-chat-guard-output]');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function chatGuardAdmin(request) {
  const result = await api('/wizard/api/chat-guard/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  chatGuardOutput(result); return result;
}

let chatGuardIncidentPage = { offset: 0, limit: 25, totalMatching: 0, hasMore: false, filters: {} };

function chatGuardIncidentRequest(offset = 0, limit = 25) {
  const form = document.querySelector('[data-chat-guard-incident-filters]');
  const request = { operation: 'incidents', offset, limit };
  if (!form) return request;
  for (const name of ['platform', 'rule', 'review', 'enforcementStatus']) {
    const value = form.elements[name].value;
    if (value) request[name] = value;
  }
  return request;
}

function renderChatGuardDashboardSummary(status) {
  const summary = document.querySelector('[data-chat-guard-dashboard-summary]');
  if (!summary) return;
  const failed = Number(status.enforcement?.failed || 0); const pending = Number(status.enforcement?.dispatched || 0);
  summary.innerHTML = `<article class="stat"><span>Mode</span><strong>${safe(status.mode || 'observe')}</strong></article><article class="stat"><span>Incidents</span><strong>${safe(status.incidentCount || 0)}</strong></article><article class="stat"><span>Needs review</span><strong>${safe(status.byReview?.unreviewed || 0)}</strong></article><article class="stat"><span>Failed / pending actions</span><strong>${safe(`${failed} / ${pending}`)}</strong></article>`;
}

function renderChatGuardIncidents(result) {
  const list = document.querySelector('[data-chat-guard-incident-list]'); const pageState = document.querySelector('[data-chat-guard-page-state]');
  const previous = document.querySelector('[data-chat-guard-incidents-prev]'); const next = document.querySelector('[data-chat-guard-incidents-next]');
  if (!list || !pageState || !previous || !next) return;
  const incidents = Array.isArray(result.incidents) ? result.incidents : [];
  list.innerHTML = incidents.length === 0 ? '<p class="notice">No retained incidents match these filters.</p>' : incidents.map((incident) => {
    const enforcement = incident.enforcement || { mode: 'observe', status: 'none', error: '' };
    const reviewActions = incident.review === 'unreviewed' ? `<div class="button-row"><button type="button" class="ghost compact" data-chat-guard-inline-review="confirmed" data-chat-guard-incident-id="${safe(incident.incidentId)}">Confirm match</button><button type="button" class="ghost compact" data-chat-guard-inline-review="false-positive" data-chat-guard-incident-id="${safe(incident.incidentId)}">Mark false positive</button></div>` : '';
    const error = enforcement.error ? `<small class="error">${safe(enforcement.error)}</small>` : '';
    return `<article class="item"><div class="title-row"><div><strong>${safe(addOnOptionLabel(incident.platform))} · ${safe(new Date(incident.at).toLocaleString())}</strong><small>Viewer fingerprint ${safe(incident.viewerFingerprint)} · ${incident.simulated ? 'simulated' : 'provider event'}</small></div><span class="status-chip ${incident.review === 'false-positive' ? 'status-warning' : incident.review === 'confirmed' ? 'status-ready' : 'status-neutral'}">${safe(incident.review)}</span></div><p><strong>Rules:</strong> ${safe((incident.rules || []).map(addOnOptionLabel).join(', ') || 'none')}</p><p><strong>Action:</strong> ${safe(enforcement.mode)} · ${safe(enforcement.status)}</p>${error}${reviewActions}<small>Incident ${safe(incident.incidentId)}</small></article>`;
  }).join('');
  list.querySelectorAll('[data-chat-guard-inline-review]').forEach((button) => button.addEventListener('click', reviewChatGuardIncidentInline));
  const start = result.totalMatching === 0 ? 0 : result.offset + 1; const end = Math.min(result.offset + incidents.length, result.totalMatching);
  pageState.textContent = `${start}-${end} of ${result.totalMatching}`; previous.disabled = result.offset <= 0; next.disabled = !result.hasMore;
}

async function refreshChatGuardDashboard(offset = 0) {
  const [status, incidents] = await Promise.all([
    api('/wizard/api/chat-guard/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'status' }) }),
    api('/wizard/api/chat-guard/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chatGuardIncidentRequest(offset, chatGuardIncidentPage.limit)) }),
  ]);
  chatGuardIncidentPage = { offset: incidents.offset, limit: incidents.limit, totalMatching: incidents.totalMatching, hasMore: incidents.hasMore, filters: chatGuardIncidentRequest(0, chatGuardIncidentPage.limit) };
  renderChatGuardDashboardSummary(status); renderChatGuardIncidents(incidents); renderChatGuardTrustedAccounts(status.trustedAccounts);
}

async function loadChatGuardIncidents(event) {
  event.preventDefault();
  try { await refreshChatGuardDashboard(0); } catch (error) { chatGuardOutput(error.message); }
}

async function previousChatGuardIncidents() {
  try { await refreshChatGuardDashboard(Math.max(0, chatGuardIncidentPage.offset - chatGuardIncidentPage.limit)); } catch (error) { chatGuardOutput(error.message); }
}

async function nextChatGuardIncidents() {
  if (!chatGuardIncidentPage.hasMore) return;
  try { await refreshChatGuardDashboard(chatGuardIncidentPage.offset + chatGuardIncidentPage.limit); } catch (error) { chatGuardOutput(error.message); }
}

async function reviewChatGuardIncidentInline(event) {
  const button = event.currentTarget; const decision = button.dataset.chatGuardInlineReview; const incidentId = button.dataset.chatGuardIncidentId;
  if (!confirm(`Mark this incident as ${decision === 'confirmed' ? 'a confirmed match' : 'a false positive'}? This changes only its private review label.`)) return;
  try { await chatGuardAdmin({ operation: 'review', incidentId, decision, approvedByCreator: true }); await refreshChatGuardDashboard(chatGuardIncidentPage.offset); }
  catch (error) { chatGuardOutput(error.message); }
}

async function downloadChatGuardReport() {
  try {
    const [status, incidents] = await Promise.all([
      api('/wizard/api/chat-guard/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'status' }) }),
      api('/wizard/api/chat-guard/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chatGuardIncidentRequest(0, 100)) }),
    ]);
    const privacySafeStatus = { ...status }; delete privacySafeStatus.trustedAccounts;
    const report = { generatedAt: new Date().toISOString(), privacy: incidents.privacy, boundedTo: 100, summary: privacySafeStatus, filteredIncidents: incidents };
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `thsv-chat-guard-report-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    chatGuardOutput('Downloaded a privacy-safe report containing at most 100 filtered incidents. It contains no chat text, display names, or raw account IDs.');
  } catch (error) { chatGuardOutput(error.message); }
}

async function refreshChatGuardStatus() {
  try { const result = await chatGuardAdmin({ operation: 'status' }); renderChatGuardTrustedAccounts(result.trustedAccounts); renderChatGuardDashboardSummary(result); } catch (error) { chatGuardOutput(error.message); }
}

function renderChatGuardTrustedAccounts(accounts) {
  const list = document.querySelector('[data-chat-guard-trusted-list]');
  if (!list) return;
  if (!Array.isArray(accounts) || accounts.length === 0) { list.innerHTML = '<p class="notice">No creator-managed trusted viewers are saved.</p>'; return; }
  list.innerHTML = accounts.map((account) => `<article class="item"><div><strong>${safe(account.label)}</strong><small>${safe(account.platform)} · stable ID ending ${safe(account.idSuffix)} · added ${safe(new Date(account.addedAt).toLocaleString())}</small></div><button type="button" class="danger compact" data-chat-guard-trust-remove="${safe(account.accountKey)}" data-chat-guard-trust-label="${safe(account.label)}">Remove</button></article>`).join('');
  list.querySelectorAll('[data-chat-guard-trust-remove]').forEach((button) => button.addEventListener('click', removeChatGuardTrustedViewer));
}

async function addChatGuardTrustedViewer(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try {
    await chatGuardAdmin({ operation: 'trust-add', platform: form.elements.platform.value, userId: form.elements.userId.value.trim(), label: form.elements.label.value.trim(), approvedByCreator: true });
    form.reset(); await refreshChatGuardStatus();
  } catch (error) { chatGuardOutput(error.message); }
}

async function removeChatGuardTrustedViewer(event) {
  const button = event.currentTarget; const label = button.dataset.chatGuardTrustLabel || 'this viewer';
  if (!confirm(`Remove ${label} from Chat Guard's trusted-viewer list?`)) return;
  try { await chatGuardAdmin({ operation: 'trust-remove', accountKey: button.dataset.chatGuardTrustRemove, approvedByCreator: true }); await refreshChatGuardStatus(); } catch (error) { chatGuardOutput(error.message); }
}

async function clearChatGuardObservations() {
  if (!confirm('Clear all retained Chat Guard incidents, repeat observations, and replay fingerprints? This cannot be undone.')) return;
  try { await chatGuardAdmin({ operation: 'clear', approvedByCreator: true }); await refreshChatGuardDashboard(0); } catch (error) { chatGuardOutput(error.message); }
}

async function testChatGuardRules(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try { await chatGuardAdmin({ operation: 'test', message: form.elements.message.value, priorMatchingMessages: Number(form.elements.priorMatchingMessages.value) }); } catch (error) { chatGuardOutput(error.message); }
}

async function createChatGuardPermit(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try {
    await chatGuardAdmin({ operation: 'permit', platform: form.elements.platform.value, userId: form.elements.userId.value.trim(), durationMinutes: Number(form.elements.durationMinutes.value), maximumUses: Number(form.elements.maximumUses.value), approvedByCreator: true });
    form.reset();
  } catch (error) { chatGuardOutput(error.message); }
}

async function clearChatGuardPermits() {
  if (!confirm('Clear every active Chat Guard temporary link permit?')) return;
  try { await chatGuardAdmin({ operation: 'clear-permits', approvedByCreator: true }); } catch (error) { chatGuardOutput(error.message); }
}

async function reviewChatGuardIncident(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try { await chatGuardAdmin({ operation: 'review', incidentId: form.elements.incidentId.value.trim(), decision: form.elements.decision.value, approvedByCreator: true }); form.reset(); await refreshChatGuardDashboard(chatGuardIncidentPage.offset); } catch (error) { chatGuardOutput(error.message); }
}

function villageDrawOutput(value) {
  const output = document.querySelector('[data-village-draw-output]');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function runVillageDrawOperation(event) {
  const operation = event.currentTarget.dataset.villageDrawOperation;
  const labels = { open: 'open entries for the saved giveaway', pause: 'pause new entries', resume: 'resume new entries', close: 'permanently close entries', draw: 'freeze the ticket snapshot and draw a winner', confirm: 'confirm and archive this winner', redraw: 'replace the unconfirmed winner', cancel: 'cancel this giveaway and refund every points purchase', reset: 'clear the completed or canceled active draw' };
  if (operation !== 'status' && !confirm(`Village Draw: ${labels[operation]}?`)) return;
  const request = operation === 'status' ? { operation } : { operation, approvedByCreator: true };
  try {
    const result = await api('/wizard/api/village-draw/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    villageDrawOutput(result);
  } catch (error) { villageDrawOutput(error.message); }
}

function renderDiscoveredAddOns() {
  const list = byId('addon-discovered-list');
  if (!state.discoveredAddOns.length) { list.innerHTML = '<p class="notice">No packages are waiting in the add-on inbox.</p>'; return; }
  list.innerHTML = state.discoveredAddOns.map((addOn) => addOn.health === 'rejected'
    ? `<article class="item muted"><strong>${safe(addOn.filename)}</strong><small>Rejected before installation</small><p class="error">${safe(addOn.error)}</p></article>`
    : `<article class="item"><strong>${safe(addOn.name)} ${safe(addOn.version)}</strong><small>${safe(addOn.filename)} - ${safe(addOn.author)} - ${safe(addOn.packageKind)}</small><p>${safe(addOn.description)}</p><small><strong>Permissions:</strong> ${safe(addOn.permissions.length ? addOn.permissions.join(', ') : 'none')} - integrity checked, publisher identity not authenticated</small>${renderAddOnTrustLinks(addOn.trustMetadata)}${addOn.permissions.includes('chat.send') ? '<p class="notice"><strong>Live chat permission:</strong> this package can automatically post messages after installation and enablement.</p>' : ''}${addOn.permissions.includes('provider.events.publish') ? '<p class="notice"><strong>Financial-event permission:</strong> this package can publish bounded donations for its assigned provider into core alerts.</p>' : ''}${addOn.permissions.some((permission) => permission.startsWith('viewer.foundation.') || permission.startsWith('community.analytics.')) ? '<p class="notice"><strong>Viewer-data permission:</strong> this package can provide or read optional pseudonymous viewer data according to its exact permission list.</p>' : ''}<label class="check"><input type="checkbox" data-approve-discovered="${safe(addOn.filename)}"> I reviewed and trust this publisher and permission request</label><button type="button" data-install-discovered="${safe(addOn.filename)}">Verify and install</button></article>`).join('');
  document.querySelectorAll('[data-install-discovered]').forEach((button) => button.addEventListener('click', installDiscoveredAddOn));
}

async function installDiscoveredAddOn(event) {
  const button = event.currentTarget;
  const filename = button.dataset.installDiscovered;
  const approval = [...document.querySelectorAll('[data-approve-discovered]')].find((input) => input.dataset.approveDiscovered === filename);
  if (!approval?.checked) { reportAddOnFeedback('Review the discovered package and approve it before installation.', 'error', button); return; }
  try {
    const discovered = state.discoveredAddOns.find((addOn) => addOn.filename === filename);
    if (!discovered?.sha256) { reportAddOnFeedback('Inspect this package again before installing it.', 'error', button); return; }
    const result = await api('/wizard/api/addons/install-discovered', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename, sha256: discovered.sha256, approvedByCreator: true }) });
    state.selectedAddOnId = result.moduleId;
    markAddOnRestartRequired(result.moduleId);
    await loadAddOns();
    reportAddOnFeedback(`Installed ${result.moduleId} ${result.version} from the inbox. Restart StreamBridge to activate it.`, 'success', button);
  } catch (error) { reportAddOnFeedback(`The discovered add-on was not installed: ${error.message}`, 'error', button); }
}

function renderAddOnOverlayTools(addOn) {
  const overlayPath = ADD_ON_OVERLAY_PATHS[addOn.moduleId] || `/overlay/addons/${addOn.moduleId}`;
  const url = `${location.origin}${overlayPath}`;
  if (addOn.moduleId === 'thsv.stream-labels') {
    const labels = [
      ['follower', 'Latest follower / YouTube subscriber'],
      ['member', 'Latest paid member / subscription'],
      ['gift-membership', 'Latest gift membership'],
      ['support', 'Latest support'],
      ['raid', 'Latest raid'],
      ['reward', 'Latest reward'],
      ['latest', 'Latest event'],
      ['all', 'Combined label panel'],
    ];
    const urls = labels.map(([key, name]) => {
      const labelUrl = `${url}?label=${key}`;
      return `<label>${safe(name)}<span class="inline-copy-field"><input readonly data-addon-overlay-url="${safe(`${addOn.moduleId}:${key}`)}" value="${safe(labelUrl)}"><button type="button" data-copy-addon-overlay="${safe(`${addOn.moduleId}:${key}`)}">Copy</button></span></label>`;
    }).join('');
    return `<p>Each URL is a persistent transparent browser source fed by the bridge's existing event stream. Individual labels are best for normal OBS layouts; the combined panel is useful for testing or a compact supporter panel.</p><div class="form-grid">${urls}</div><div class="button-row"><button type="button" data-preview-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Show exact all-label template</button><button type="button" class="ghost" data-hide-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Hide preview</button></div>${addOn.enabled ? '<small>The simulated preview uses the live label renderer and saved appearance.</small>' : '<small>Enable this add-on to send a preview.</small>'}`;
  }
  if (addOn.moduleId === 'thsv.viewer-lobby') return `<p>This is a persistent, read-only queue panel. Add it once as a browser source at <strong>900 x 700</strong> or <strong>1920 x 1080</strong>, then crop and position it without stretching the source.</p><label>Viewer Lobby browser source URL<input readonly data-addon-overlay-url="${safe(addOn.moduleId)}" value="${safe(url)}"></label><div class="button-row"><button type="button" data-copy-addon-overlay="${safe(addOn.moduleId)}">Copy overlay URL</button><button type="button" data-preview-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Show exact queue template</button><button type="button" class="ghost" data-hide-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Hide preview</button></div><small>The overlay shares StreamBridge's one browser connection and the preview uses its live queue renderer.</small>`;
  return `<p>This core-rendered source accepts scoped cards and media without loading package HTML or JavaScript. Add it to Meld, OBS, or Streamlabs, then show the real production template with bounded example data so you can size and crop the source accurately.</p><label>Browser source URL<input readonly data-addon-overlay-url="${safe(addOn.moduleId)}" value="${safe(url)}"></label><div class="button-row"><button type="button" data-copy-addon-overlay="${safe(addOn.moduleId)}">Copy overlay URL</button><button type="button" data-preview-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Show exact template</button><button type="button" class="ghost" data-hide-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Hide preview</button></div>${addOn.enabled ? '<small>The preview uses the saved layout, colors, typography, and live renderer. Example names and values are simulated.</small>' : '<small>Enable this add-on to send a live preview.</small>'}`;
}

function renderAddOnActionGrant(addOn) {
  const prohibited = new Set(['143fce1d-c5b0-4108-b766-ee2d0249e2d4', '18bdc91c-64eb-4787-8be9-6a921b272943']);
  const liveById = new Map(state.liveActions.map((action) => [action.id, action]));
  // Not yet inspected this session (state.liveActions resets on every wizard page load) reads
  // very differently from a genuinely missing action: the first just needs a fresh Inspect to
  // confirm, the second means the action was actually removed or renamed in Streamer.bot.
  const notYetInspected = state.liveActions.length === 0;
  if (!state.addOnActionNameCache) state.addOnActionNameCache = loadAddOnActionNameCache();
  rememberInspectedActionNames(state.liveActions);
  if (!state.addOnActionDrafts) state.addOnActionDrafts = {};
  if (!state.addOnActionDrafts[addOn.moduleId]) state.addOnActionDrafts[addOn.moduleId] = [...(addOn.approvedActionIds || [])];
  const draft = state.addOnActionDrafts[addOn.moduleId];
  const recommendedNames = RECOMMENDED_ADDON_ACTION_NAMES[addOn.moduleId] || [];
  const recommendedActions = recommendedNames.map((name) => state.liveActions.find((action) => action.name === name)).filter(Boolean);
  const recommendedMissing = recommendedNames.filter((name) => !state.liveActions.some((action) => action.name === name));
  const recommendedPending = recommendedActions.filter((action) => !draft.includes(action.id));

  const approvedEntries = draft.map((id) => {
    const live = liveById.get(id);
    if (live) {
      const currentGroup = actionGroupName(live);
      const changes = [...(state.addOnActionDrift?.[id] || [])];
      if (live.enabled === false) changes.push('disabled in Streamer.bot');
      return { id, name: live.name, group: currentGroup, suffix: changes.length ? ` · ${changes.join(' · ')}` : '' };
    }
    const remembered = state.addOnActionNameCache?.[id];
    if (remembered) return { id, name: remembered.name, group: remembered.group, suffix: ' · saved grant remains active; status not checked this session' };
    return { id, name: notYetInspected ? 'Approved action ID' : 'Approved action no longer found in Streamer.bot', group: '', suffix: notYetInspected ? ' · saved grant remains active' : ' · missing from Streamer.bot' };
  });
  const inspectHint = notYetInspected ? '<div class="notice full-row"><strong>Your saved action grants remain active.</strong> Refresh the action list to retrieve current names and status or add another action.<div class="button-row"><button type="button" class="ghost" data-inspect-addon-actions>Refresh action names</button></div></div>' : '';
  const list = approvedEntries.length
    ? `<div class="entity-list-group addon-approved-actions"><h3>Approved actions</h3><ul>${approvedEntries.map((entry) => `<li class="entity-row"><span class="entity-item"><strong>${safe(entry.name)}</strong><small>${entry.group ? `${safe(entry.group)} · ` : ''}${safe(entry.id)}${safe(entry.suffix)}</small></span><button type="button" class="entity-remove" data-remove-addon-action="${safe(entry.id)}" data-remove-addon-action-module="${safe(addOn.moduleId)}" aria-label="Remove ${safe(entry.name)}">✕</button></li>`).join('')}</ul></div>`
    : '<p class="notice full-row">No actions approved yet.</p>';

  const available = state.liveActions
    .filter((action) => !prohibited.has(action.id.toLowerCase()) && !draft.includes(action.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const groups = [...new Set(available.map(actionGroupName))].sort((left, right) => left.localeCompare(right));
  if (!state.addOnActionGroupDrafts) state.addOnActionGroupDrafts = {};
  const rememberedGroup = state.addOnActionGroupDrafts[addOn.moduleId];
  const selectedGroup = groups.includes(rememberedGroup) ? rememberedGroup : groups[0];
  if (selectedGroup) state.addOnActionGroupDrafts[addOn.moduleId] = selectedGroup;
  const groupActions = available.filter((action) => actionGroupName(action) === selectedGroup);
  const picker = available.length
    ? `<div class="addon-action-picker"><label>Streamer.bot group<select data-addon-action-group="${safe(addOn.moduleId)}">${groups.map((group) => `<option value="${safe(group)}" ${group === selectedGroup ? 'selected' : ''}>${safe(group)}</option>`).join('')}</select></label><label>Action<select data-addon-action-picker="${safe(addOn.moduleId)}"><option value="">Choose an action from this group…</option>${groupActions.map((action) => `<option value="${safe(action.id)}">${safe(action.name)}</option>`).join('')}</select></label><button type="button" data-add-addon-action="${safe(addOn.moduleId)}">Add selected action</button></div>`
    : (notYetInspected ? '' : '<p class="notice full-row">Every inspected action is already approved.</p>');

  const recommended = recommendedNames.length
    ? `<div class="addon-recommended-actions"><strong>Recommended for this add-on</strong><ul>${recommendedNames.map((name) => `<li>${safe(name)}${draft.some((id) => liveById.get(id)?.name === name || state.addOnActionNameCache?.[id]?.name === name) ? ' — selected' : ''}</li>`).join('')}</ul>${notYetInspected ? '<p>Refresh action names first so the wizard can match these actions safely and save their stable IDs.</p>' : ''}${recommendedMissing.length && !notYetInspected ? `<p class="error">Import or repair: ${recommendedMissing.map(safe).join(', ')}</p>` : ''}${recommendedPending.length ? `<button type="button" class="ghost" data-add-recommended-addon-actions="${safe(addOn.moduleId)}">Use recommended actions</button>` : ''}</div>`
    : '<p class="notice">This add-on has no fixed broker action. Approve a creator action only when its setup guide asks for one.</p>';

  return `<div class="addon-action-grants" data-addon-action-grants="${safe(addOn.moduleId)}"><p>Use the recommended list when available. The wizard saves stable IDs, so renamed actions remain safely scoped.</p>${recommended}${inspectHint}${list}<details data-disclosure-key="${safe(`addon:${addOn.moduleId}:custom-action-grant`)}"><summary>Advanced: approve a different action</summary>${picker}</details><button type="button" data-save-addon-action-grants="${safe(addOn.moduleId)}">Save action grants</button></div>`;
}

const ADDON_ACTION_NAME_CACHE_KEY = 'thsv.streambridge.addon-action-names.v1';

function loadAddOnActionNameCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADDON_ACTION_NAME_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function rememberInspectedActionNames(actions) {
  if (!actions.length) return;
  if (!state.addOnActionNameCache) state.addOnActionNameCache = loadAddOnActionNameCache();
  if (!state.addOnActionDrift) state.addOnActionDrift = {};
  const inspectedAt = new Date().toISOString();
  for (const action of actions) {
    const previous = state.addOnActionNameCache[action.id];
    const currentGroup = actionGroupName(action);
    const changes = [];
    if (previous?.name && previous.name !== action.name) changes.push(`renamed from ${previous.name}`);
    if (previous?.group && previous.group !== currentGroup) changes.push(`moved from ${previous.group}`);
    if (changes.length) state.addOnActionDrift[action.id] = changes;
    state.addOnActionNameCache[action.id] = { name: action.name, group: currentGroup, inspectedAt };
  }
  const newest = Object.entries(state.addOnActionNameCache)
    .sort((left, right) => String(right[1]?.inspectedAt || '').localeCompare(String(left[1]?.inspectedAt || '')))
    .slice(0, 500);
  state.addOnActionNameCache = Object.fromEntries(newest);
  try { localStorage.setItem(ADDON_ACTION_NAME_CACHE_KEY, JSON.stringify(state.addOnActionNameCache)); } catch { /* The live inspection still supplies names when browser storage is unavailable. */ }
}

function actionGroupName(action) {
  const group = typeof action.group === 'string' ? action.group.trim() : '';
  return group || 'Ungrouped';
}

function selectAddOnActionGroup(event) {
  const id = event.currentTarget.dataset.addonActionGroup;
  if (!state.addOnActionGroupDrafts) state.addOnActionGroupDrafts = {};
  state.addOnActionGroupDrafts[id] = event.currentTarget.value;
  renderAddOns();
}

async function toggleAddOn(event) {
  const button = event.currentTarget;
  const id = button.dataset.toggleAddon;
  const enabled = button.dataset.addonEnabled !== 'true';
  if (!confirm(`${enabled ? 'Enable' : 'Disable'} add-on ${id}? The change takes effect after StreamBridge restarts.`)) return;
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/enabled`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled, approvedByCreator: true }) });
    markAddOnRestartRequired(id);
    await loadAddOns();
    reportAddOnFeedback(`${id} was ${enabled ? 'enabled' : 'disabled'} in saved settings. Restart StreamBridge to apply the change.`, 'success', button);
  } catch (error) { reportAddOnFeedback(`${id} was not ${enabled ? 'enabled' : 'disabled'}: ${error.message}`, 'error', button); }
}

async function removeAddOn(event) {
  const button = event.currentTarget;
  const id = button.dataset.removeAddon;
  if (!confirm(`Uninstall ${id}? Its private settings will be preserved, and the change takes effect after StreamBridge restarts.`)) return;
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/remove`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvedByCreator: true }) });
    markAddOnRestartRequired(id);
    await loadAddOns();
    reportAddOnFeedback(`${id} was uninstalled from saved settings. Restart StreamBridge to unload its running module.`, 'success', button);
  } catch (error) { reportAddOnFeedback(`${id} was not uninstalled: ${error.message}`, 'error', button); }
}

async function saveAddOnSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const originalLabel = button?.textContent || 'Save all settings';
  const id = form.dataset.addonSettings;
  const addOn = state.addOns.find((candidate) => candidate.moduleId === id);
  const sceneEditor = form.querySelector('[data-scene-mapping-editor]');
  if (sceneEditor) {
    const mappings = syncSceneMappingEditor(sceneEditor);
    if (mappings.some((mapping) => !mapping.sceneName || !mapping.actionId)) { const message = 'Every scene mapping needs an exact scene name and a target action.'; byId('addon-state').textContent = message; showWizardFeedback(message, 'error', button); return; }
    if (new Set(mappings.map((mapping) => mapping.id)).size !== mappings.length) { const message = 'Every scene mapping needs a unique ID.'; byId('addon-state').textContent = message; showWizardFeedback(message, 'error', button); return; }
  }
  const settings = {};
  for (const [name, schema] of Object.entries(addOn.configurationSchema.properties || {})) {
    const field = form.elements.namedItem(name);
    if (schema.type === 'boolean') settings[name] = field.checked;
    else if (schema.type === 'array' && Array.isArray(schema.items?.enum)) settings[name] = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]:checked`)].map((input) => input.value);
    else if (schema.type === 'array') settings[name] = field.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    else if (schema.type === 'number' || schema.type === 'integer') settings[name] = Number(field.value);
    else settings[name] = field.value;
  }
  if (button) { button.disabled = true; button.textContent = 'Saving…'; }
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
    let raidStopGrantSaved = false;
    if (id === 'thsv.raid-scout' && settings.endBroadcastAfterRaid === true && settings.endBroadcastAcknowledged === true && settings.endBroadcastActionId) {
      const actionIds = [...new Set([...(addOn.approvedActionIds || []), RAID_SCOUT_CONTROLLER_ACTION_ID, RAID_SCOUT_RUN_ENDING_AD_ACTION_ID, settings.endBroadcastActionId])];
      await api(`/wizard/api/addons/${encodeURIComponent(id)}/action-grants`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionIds, approvedByCreator: true }) });
      raidStopGrantSaved = true;
    }
    markAddOnRestartRequired(id);
    await loadAddOns();
    const message = raidStopGrantSaved
      ? `Settings and the selected Stop Streaming action grant were saved for ${id}. Restart StreamBridge to apply them.`
      : `Settings saved for ${id}. Restart StreamBridge to apply them.`;
    reportAddOnFeedback(message, 'success', button);
  } catch (error) { const message = `Settings were not saved for ${id}: ${error.message}`; reportAddOnFeedback(message, 'error', button); }
  finally { if (button?.isConnected) { button.disabled = false; button.textContent = originalLabel; button.classList.remove('is-working'); button.removeAttribute('aria-busy'); } }
}

function addAddOnActionDraft(event) {
  const button = event.currentTarget;
  const id = button.dataset.addAddonAction;
  const select = document.querySelector(`[data-addon-action-picker="${CSS.escape(id)}"]`);
  const actionId = select?.value;
  if (!actionId) return;
  state.addOnActionDrafts[id] = [...(state.addOnActionDrafts[id] || []), actionId];
  renderAddOns();
  reportAddOnFeedback('Action selected. Save action grants to apply this draft.', 'success', button);
}

function addRecommendedAddOnActions(event) {
  const button = event.currentTarget;
  const id = button.dataset.addRecommendedAddonActions;
  const names = RECOMMENDED_ADDON_ACTION_NAMES[id] || [];
  const actionIds = state.liveActions.filter((action) => names.includes(action.name)).map((action) => action.id);
  state.addOnActionDrafts[id] = [...new Set([...(state.addOnActionDrafts[id] || []), ...actionIds])];
  renderAddOns();
  const message = actionIds.length
    ? `${actionIds.length} recommended action${actionIds.length === 1 ? '' : 's'} selected for ${id}. Save action grants to finish.`
    : `No matching recommended Streamer.bot actions were found for ${id}. Import its current package, refresh Streamer.bot status, and try again.`;
  reportAddOnFeedback(message, actionIds.length ? 'success' : 'error', button);
}

function removeAddOnActionDraft(event) {
  const button = event.currentTarget;
  const id = button.dataset.removeAddonActionModule;
  const actionId = button.dataset.removeAddonAction;
  state.addOnActionDrafts[id] = (state.addOnActionDrafts[id] || []).filter((candidate) => candidate !== actionId);
  renderAddOns();
  reportAddOnFeedback('Action removed from the draft. Save action grants to apply this change.', 'success', button);
}

async function saveAddOnActionGrants(event) {
  const button = event.currentTarget;
  const id = button.dataset.saveAddonActionGrants;
  const actionIds = state.addOnActionDrafts[id] || [];
  if (!confirm(`Allow ${id} to dispatch exactly ${actionIds.length} approved Streamer.bot action(s)? This takes effect after StreamBridge restarts.`)) return;
    try {
      await api(`/wizard/api/addons/${encodeURIComponent(id)}/action-grants`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionIds, approvedByCreator: true }) });
      markAddOnRestartRequired(id);
      delete state.addOnActionDrafts[id];
      await loadAddOns();
    reportAddOnFeedback(`Action grants saved for ${id}. Restart StreamBridge to apply them.`, 'success', button);
  } catch (error) { reportAddOnFeedback(`Action grants were not saved for ${id}: ${error.message}`, 'error', button); }
}

async function copyAddOnOverlayUrl(event) {
  const button = event.currentTarget;
  const id = button.dataset.copyAddonOverlay;
  const input = [...document.querySelectorAll('[data-addon-overlay-url]')].find((candidate) => candidate.dataset.addonOverlayUrl === id);
  if (!input) return;
  try { await navigator.clipboard.writeText(input.value); reportAddOnFeedback(`Overlay URL copied for ${id}.`, 'success', button); }
  catch { input.select(); reportAddOnFeedback('Clipboard access was unavailable. The overlay URL is selected for manual copy.', 'error', button); }
}

async function previewAddOnOverlay(event) {
  const button = event.currentTarget;
  const id = button.dataset.previewAddonOverlay;
  try {
    const clients = await waitForAddOnOverlayClient(id);
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/overlay-preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const message = clients > 0
      ? `Exact-template preview sent for ${id}. Confirm it is visible in the intended OBS source before going live.`
      : `Preview was accepted for ${id}, but its browser source was not connected. Open or refresh that exact OBS browser-source URL and try again.`;
    reportAddOnFeedback(message, clients > 0 ? 'success' : 'error', button);
  } catch (error) { reportAddOnFeedback(`Preview failed for ${id}: ${error.message}`, 'error', button); }
}

async function hideAddOnOverlayPreview(event) {
  const button = event.currentTarget;
  const id = button.dataset.hideAddonOverlay;
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/overlay-preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'hide' }) });
    reportAddOnFeedback(`Preview hidden for ${id}.`, 'success', button);
  } catch (error) { reportAddOnFeedback(`Preview could not be hidden for ${id}: ${error.message}`, 'error', button); }
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result).split(',', 2)[1] || ''), { once: true });
    reader.addEventListener('error', () => reject(new Error('The selected add-on package could not be read.')), { once: true });
    reader.readAsDataURL(file);
  });
}

byId('addon-install-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const file = form.elements.package.files?.[0];
  if (!file) return;
  const status = byId('addon-state');
  status.setAttribute('aria-busy', 'true');
  status.textContent = `Verifying ${file.name} before installation...`;
  try {
    const contentBase64 = await fileAsBase64(file);
    const result = await api('/wizard/api/addons/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentBase64, approvedByCreator: form.elements.approvedByCreator.checked }) });
    state.selectedAddOnId = result.moduleId;
    markAddOnRestartRequired(result.moduleId);
    form.reset();
    await loadAddOns();
    reportAddOnFeedback(`Installed ${result.moduleId} ${result.version}. Restart StreamBridge to activate it.`, 'success', form.querySelector('button[type="submit"]'));
  } catch (error) { reportAddOnFeedback(`The add-on was not installed: ${error.message}`, 'error', form.querySelector('button[type="submit"]')); }
  finally { status.removeAttribute('aria-busy'); }
});
byId('refresh-addons').addEventListener('click', loadAddOns);
byId('check-addon-updates').addEventListener('click', async () => {
  const button = byId('check-addon-updates');
  const status = byId('addon-update-state');
  button.disabled = true;
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Checking the official GitHub add-on index...';
  try {
    const result = await api('/wizard/api/addons/updates/check', { method: 'POST' });
    state.addOnUpdatePublisherId = '';
    state.addOnUpdates = result.available ? result : null;
    if (!result.available) status.textContent = `Add-on update check unavailable: ${result.error}`;
    else {
      const message = result.revokedCount > 0
        ? `Warning: ${result.revokedCount} installed add-on(s) are revoked. Disable them and review the official release before continuing.`
        : (result.updateCount > 0 ? `${result.updateCount} add-on update(s) are available. Review each result below; nothing was downloaded or installed.` : 'No compatible add-on updates were found. Nothing was downloaded or installed.');
      const releaseUrl = safeAddOnLink(result.releaseUrl);
      status.innerHTML = `${safe(message)}${releaseUrl ? ` <a href="${safe(releaseUrl)}" target="_blank" rel="noreferrer noopener">Open official release</a>` : ''}`;
    }
    renderAddOns();
  } catch (error) { status.textContent = error.message; }
  finally { status.removeAttribute('aria-busy'); button.disabled = false; }
});
byId('trusted-publisher-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  try {
    await api('/wizard/api/addons/trusted-publishers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publisherId: form.elements.publisherId.value.trim(), repository: form.elements.repository.value.trim(), approvedByCreator: form.elements.approvedByCreator.checked }) });
    form.reset(); await loadAddOns(); byId('addon-state').textContent = 'Trusted publisher saved. No package was downloaded or installed.';
  } catch (error) { byId('addon-state').textContent = error.message; }
});
document.querySelector('[data-view="addons"]').addEventListener('click', loadAddOns);
// If navigation persistence restores the Add-ons page after a reload, authentication loads its
// inventory without requiring the creator to leave the page and return.
document.addEventListener('wizard:authenticated', () => {
  if (document.querySelector('[data-view="addons"]').classList.contains('active')) void loadAddOns();
});
const ADD_ON_OVERLAY_PATHS = Object.freeze({
  'thsv.automated-shoutouts': '/overlay/shoutouts',
  'thsv.random-clip-player': '/overlay/clips',
  'thsv.subathon-timer': '/overlay/subathon',
  'thsv.starting-soon-countdown': '/overlay/countdown',
  'thsv.ad-break-companion': '/overlay/ad-break',
});
