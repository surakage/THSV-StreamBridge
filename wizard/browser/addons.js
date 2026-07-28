async function loadAddOns() {
  const status = byId('addon-state');
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Verifying installed add-ons...';
  try {
    const result = await api('/wizard/api/addons');
    let acceptanceResult = { acceptance: {} };
    try { acceptanceResult = await api('/wizard/api/addons/acceptance'); }
    catch (error) {
      // A 2.5 wizard can be hot-updated over a 2.4 service. Inventory and settings remain usable;
      // only the newer creator-facing acceptance ledger stays unavailable until the core updates.
      if (!/not found/iu.test(String(error?.message || error))) throw error;
    }
    state.addOns = result.addOns;
    state.discoveredAddOns = result.discovered || [];
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
    status.textContent = `${state.addOns.length} installed and ${state.discoveredAddOns.length} discovered add-on package(s) inspected. Changes take effect after StreamBridge restarts.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    status.removeAttribute('aria-busy');
  }
}

function addOnOptionLabel(value) {
  const knownLabels = { youtube: 'YouTube', tiktok: 'TikTok', tikfinity: 'TikFinity', streamerbot: 'Streamer.bot' };
  const normalized = String(value).toLowerCase();
  return knownLabels[normalized] || String(value).replaceAll('-', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function addOnVisibilityAttributes(ui) {
  const condition = ui?.visibleWhen;
  if (!condition || typeof condition.field !== 'string' || !Object.hasOwn(condition, 'equals')) return '';
  return ` data-addon-visible-field="${safe(condition.field)}" data-addon-visible-value="${safe(JSON.stringify(condition.equals))}"`;
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
  const version = update.latestVersion ? ` Latest official version: ${update.latestVersion}.` : '';
  const warning = update.warning ? ` ${update.warning}` : '';
  const archive = update.archiveName ? `<small><strong>Official package:</strong> ${safe(update.archiveName)}</small>` : '';
  const checksum = update.sha256 ? `<small><strong>Published SHA-256:</strong> <code>${safe(update.sha256)}</code></small>` : '';
  const downloadUrl = safeAddOnLink(update.downloadUrl);
  const download = update.state === 'update-available' && downloadUrl
    ? `<div class="button-row"><a class="button-link compact" href="${safe(downloadUrl)}" target="_blank" rel="noreferrer noopener">Download verified update</a></div>`
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

function renderAddOnSettings(addOn) {
  const entries = orderedAddOnProperties(addOn);
  if (!entries.length) return '';
  const byName = new Map(entries);
  const rendered = new Set();
  const fieldUi = addOn.settingsUi?.fields && typeof addOn.settingsUi.fields === 'object' ? addOn.settingsUi.fields : {};
  const renderNames = (names) => names.filter((name) => byName.has(name)).map((name) => {
    rendered.add(name);
    return renderAddOnField(name, byName.get(name), addOn.settings[name], fieldUi[name]);
  }).join('');
  const requestedSections = Array.isArray(addOn.settingsUi?.sections) ? addOn.settingsUi.sections : [];
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
    return `<details class="addon-settings-section" data-disclosure-key="${safe(`addon:${addOn.moduleId}:settings:${disclosureId}`)}" ${section.open === true ? 'open' : ''}><summary><span>${safe(section.title)}${section.description ? `<small>${safe(section.description)}</small>` : ''}</span></summary><div class="addon-settings-section-body">${body}</div></details>`;
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
  return `<details class="form-section addon-setup-guide addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:setup-guide`)}" open><summary><span><span class="step-number">1</span><strong>Start here</strong><small>Follow the required installation steps before changing advanced settings.</small></span></summary><div class="addon-step-body"><p>Complete these steps in order. The same versioned guide is included in the add-on release ZIP.</p><ol class="setup-checklist">${steps.map((step) => `<li>${safe(step)}</li>`).join('') || '<li>No extra installation step is declared.</li>'}</ol>${checks.length ? `<h4>How to verify it</h4><ul>${checks.map((check) => `<li><strong>${safe(check.id)}</strong>: ${safe(check.description)}</li>`).join('')}</ul>` : ''}${removals.length ? `<details data-disclosure-key="${safe(`addon:${addOn.moduleId}:repair`)}"><summary>Repair or remove this add-on</summary><ul>${removals.map((step) => `<li>${safe(step)}</li>`).join('')}</ul></details>` : ''}<div class="button-row"><a class="button-link ghost compact" href="${safe(onlineGuide)}" target="_blank" rel="noreferrer noopener">Open full setup guide</a></div></div></details>`;
}

function updateAddOnFieldVisibility(form) {
  form.querySelectorAll('[data-addon-visible-field]').forEach((container) => {
    const controller = form.elements.namedItem(container.dataset.addonVisibleField);
    let current;
    if (controller instanceof RadioNodeList) current = controller.value;
    else if (controller?.type === 'checkbox') current = controller.checked;
    else current = controller?.value;
    let expected;
    try { expected = JSON.parse(container.dataset.addonVisibleValue); } catch { expected = container.dataset.addonVisibleValue; }
    container.hidden = current !== expected;
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
  'thsv.auto-translate', 'thsv.automated-shoutouts', 'thsv.discord-chat-archive', 'thsv.fan-crown',
  'thsv.first-five', 'thsv.quote-vault', 'thsv.raid-scout', 'thsv.random-clip-player',
  'thsv.subathon-timer', 'thsv.user-translate', 'thsv.chat-guard', 'thsv.community-analytics', 'thsv.viewer-foundation', 'thsv.viewer-spotlight',
  'thsv.creator-controls',
  'thsv.category-pilot',
  'thsv.live-beacon',
  'thsv.clip-courier',
  'thsv.viewer-lobby',
  'thsv.voice-relay',
  'thsv.follower-pulse',
]);

function renderAddOnTriggerReadiness(addOn) {
  const requirement = DIRECT_ADDON_TRIGGER_REQUIREMENTS[addOn.moduleId];
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
  return `<details class="form-section" data-disclosure-key="addon:thsv.viewer-foundation:administration"><summary>Identity, points &amp; privacy administration</summary><p class="notice">These live operations use the active Viewer Foundation provider and its serialized state queue. Account links are edited in Configure add-on above and require a bridge restart.</p><div class="button-row"><button type="button" class="ghost" data-viewer-admin-status>Refresh private-state summary</button></div><pre class="diagnostic" data-viewer-admin-output>Choose an operation. Viewer records are identified only by their lowercase Viewer Foundation ID.</pre><form class="addon-settings-grid" data-viewer-export-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64" placeholder="alex"></label><div class="button-row full-row"><button type="submit" class="ghost">Prepare privacy export</button></div></form><form class="addon-settings-grid" data-viewer-correction-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64"></label><label>Correction<select name="adjustment"><option value="add">Add points</option><option value="remove">Remove points</option><option value="reset">Reset to zero</option></select></label><label>Amount<input name="amount" type="number" min="1" max="1000000" step="1" value="1"></label><label>Audit reason<input name="reason" required minlength="3" maxlength="200" placeholder="Creator correction"></label><div class="button-row full-row"><button type="submit">Apply correction</button></div></form><form class="addon-settings-grid" data-viewer-delete-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64"></label><label class="check full-row"><input name="approved" type="checkbox" required> I understand this permanently erases the viewer record and its mutation history.</label><div class="button-row full-row"><button type="submit" class="danger">Delete viewer record</button></div></form><details data-disclosure-key="addon:thsv.viewer-foundation:legacy-migration"><summary>Import preserved Viewer Progression state</summary><p class="notice">Preview reads the preserved local data/state/viewer-progression.json file without changing it. Import keeps the higher point total when an ID already exists and records the file digest so the same snapshot cannot run twice.</p><div class="button-row"><button type="button" class="ghost" data-viewer-migration-preview>Preview legacy records</button><button type="button" data-viewer-migration-apply disabled>Import exact preview</button></div><pre class="diagnostic" data-viewer-migration-output>No legacy file has been previewed.</pre></details></details>`;
}

function renderCommunityAnalyticsAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.community-analytics' || !addOn.enabled) return '';
  return `<details class="form-section" data-disclosure-key="addon:thsv.community-analytics:administration"><summary>Reports, session summary &amp; privacy</summary><p class="notice">Reports contain local StreamBridge observations only—not official platform analytics, revenue, payout, or tax data. They exclude names, account IDs, chat text, raw events, and financial amounts.</p><div class="button-row"><button type="button" class="ghost" data-analytics-admin-status>Refresh session summary</button><button type="button" class="ghost" data-analytics-report="session-json">Download session JSON</button><button type="button" class="ghost" data-analytics-report="viewers-csv">Download viewer CSV</button></div><pre class="diagnostic" data-analytics-admin-output>Choose an operation. Viewer records use lowercase Viewer Foundation IDs.</pre><form class="addon-settings-grid" data-analytics-export-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64" placeholder="alex"></label><div class="button-row full-row"><button type="submit" class="ghost">Prepare one-viewer privacy export</button></div></form><form class="addon-settings-grid" data-analytics-delete-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64"></label><label class="check full-row"><input name="approved" type="checkbox" required> I understand this permanently erases this viewer's private analytics record and active-session attendance.</label><div class="button-row full-row"><button type="submit" class="danger">Delete analytics record</button></div></form></details>`;
}

function renderViewerSpotlightAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.viewer-spotlight' || !addOn.enabled) return '';
  return `<details class="form-section" data-disclosure-key="addon:thsv.viewer-spotlight:manual-display"><summary>Manual cards and Stream Score</summary><p class="notice">These creator-only tools use bounded Viewer Foundation and Community Analytics projections. Display names and optional HTTPS avatars exist only in the in-memory request and overlay message.</p><div class="button-row"><button type="button" class="ghost" data-spotlight-admin-status>Refresh queue status</button><button type="button" class="ghost" data-spotlight-stream-score>Show current Stream Score</button></div><pre class="diagnostic" data-spotlight-admin-output>Enter the stable platform account ID, not the display name or channel URL.</pre><form class="addon-settings-grid" data-spotlight-display-form><label>Platform<select name="platform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok / TikFinity</option></select></label><label>Stable platform user ID<input name="userId" required maxlength="256" autocomplete="off" placeholder="Provider account ID"></label><label>Display name<input name="displayName" required maxlength="80" autocomplete="off" placeholder="Name shown on the card"></label><label>Profile picture URL (optional)<input name="avatarUrl" type="url" maxlength="2048" pattern="https://.*" placeholder="https://..."></label><label class="check full-row"><input name="sendDiscord" type="checkbox"> Also send this card as a Discord snapshot (requires configured approved action).</label><label class="check full-row"><input name="approved" type="checkbox" required> Display this viewer's selected public fields on the live Viewer Spotlight overlay.</label><div class="button-row full-row"><button type="submit">Queue manual card</button></div></form></details>`;
}

function renderChatGuardAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.chat-guard' || !addOn.enabled) return '';
  return [
    '<details class="form-section" data-disclosure-key="addon:thsv.chat-guard:observations"><summary>Observe-only results &amp; rule tester</summary>',
    '<p class="notice">This view contains aggregate counts and salted identifiers only. Chat text, names, avatars, and platform account IDs are never returned.</p>',
    '<div class="button-row"><button type="button" class="ghost" data-chat-guard-status>Refresh observation summary</button><button type="button" class="danger" data-chat-guard-clear>Clear retained observations</button></div>',
    '<pre class="diagnostic" data-chat-guard-output>Refresh to inspect rule counts and confirm every provider remains observe-only.</pre>',
    '<form class="addon-settings-grid" data-chat-guard-test-form><label class="full-row">Sample public-chat message<textarea name="message" required minlength="1" maxlength="2000" rows="4" placeholder="Paste a safe test sample. It will not be saved."></textarea></label><label>Prior matching messages<input name="priorMatchingMessages" type="number" min="0" max="9" step="1" value="0"></label><div class="button-row full-row"><button type="submit" class="ghost">Test current rules</button></div><small class="full-row">Only the character count and matched rule IDs are returned. The sample is not persisted or echoed back.</small></form>',
    '<details data-disclosure-key="addon:thsv.chat-guard:temporary-permit"><summary>Temporary link permit</summary><p class="notice">A permit bypasses blocked/unapproved-domain signals only. Other spam rules continue to observe the message.</p><form class="addon-settings-grid" data-chat-guard-permit-form><label>Platform<select name="platform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok / TikFinity</option></select></label><label>Stable platform user ID<input name="userId" required maxlength="256" autocomplete="off" placeholder="Provider account ID"></label><label>Expires after (minutes)<input name="durationMinutes" type="number" min="1" max="1440" step="1" value="15"></label><label>Maximum uses<input name="maximumUses" type="number" min="1" max="20" step="1" value="1"></label><label class="check full-row"><input name="approved" type="checkbox" required> I approve this time- and use-bounded domain exception.</label><div class="button-row full-row"><button type="submit">Create permit</button><button type="button" class="danger" data-chat-guard-clear-permits>Clear all permits</button></div></form></details>',
    '<details data-disclosure-key="addon:thsv.chat-guard:incident-review"><summary>Review a recent incident</summary><p class="notice">Copy an incident ID from the observation summary. Review labels measure false positives without retaining the message or viewer identity.</p><form class="addon-settings-grid" data-chat-guard-review-form><label class="full-row">Incident ID<input name="incidentId" required pattern="[a-f0-9]{64}" maxlength="64" autocomplete="off"></label><label>Decision<select name="decision"><option value="confirmed">Confirmed match</option><option value="false-positive">False positive</option></select></label><label class="check full-row"><input name="approved" type="checkbox" required> Save this review label to the private incident record.</label><div class="button-row full-row"><button type="submit">Save review</button></div></form></details>',
    '</details>',
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
    const actionGrant = rejected || !addOn.permissions.includes('streamerbot.run-approved-action') ? '' : `<details class="form-section addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:approved-actions`)}"><summary><span><strong>Approved Streamer.bot actions</strong><small>Grant only the actions this add-on is allowed to run.</small></span></summary><div class="addon-step-body">${renderAddOnActionGrant(addOn)}</div></details>`;
    const overlayTools = rejected || !addOn.permissions.includes('overlay.publish') ? '' : `<details class="form-section addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:overlay-tools`)}"><summary><span><span class="step-number">4</span><strong>Hosted overlay &amp; testing</strong><small>Open the hosted overlay and send a safe preview before going live.</small></span></summary><div class="addon-step-body">${renderAddOnOverlayTools(addOn)}</div></details>`;
    const viewerAdministration = rejected ? '' : `${renderViewerFoundationAdmin(addOn)}${renderCommunityAnalyticsAdmin(addOn)}${renderViewerSpotlightAdmin(addOn)}${renderChatGuardAdmin(addOn)}`;
    const setupGuide = renderAddOnSetupGuide(addOn);
    const acceptance = rejected ? '' : renderAddOnAcceptance(addOn);
    const toggle = rejected ? '' : `<button type="button" data-toggle-addon="${safe(addOn.moduleId)}" data-addon-enabled="${String(addOn.enabled)}">${addOn.enabled ? 'Disable' : 'Enable'}</button>`;
    const packageDetails = rejected ? '' : `<details class="form-section addon-package-details" data-disclosure-key="${safe(`addon:${addOn.moduleId}:package-details`)}"><summary><span><strong>Package and publisher details</strong><small>Permissions, source, updates, release notes, and security information.</small></span></summary><div class="addon-step-body"><p><strong>Publisher:</strong> ${safe(addOn.author)}</p><p><strong>Package type:</strong> ${safe(addOn.packageKind)}</p><p><strong>Permissions:</strong> ${safe(permissions)}</p>${trustLinks}${liveChatWarning}${providerWarning}${viewerWarning}${addOn.packageKind === 'executable' ? '<p class="notice">Executable add-ons run with the same Windows account permissions as StreamBridge. The broker limits supported framework operations, but it is not an operating-system sandbox. Install executable packages only from publishers you trust.</p>' : ''}${addOn.changelog ? `<details data-disclosure-key="${safe(`addon:${addOn.moduleId}:release-notes`)}"><summary>Release notes</summary><p>${safe(addOn.changelog)}</p></details>` : ''}</div></details>`;
    const maintenance = rejected ? '' : `<details class="form-section addon-maintenance" data-disclosure-key="${safe(`addon:${addOn.moduleId}:maintenance`)}"><summary><span><strong>Enable, disable, or uninstall</strong><small>Routine maintenance and removal controls.</small></span></summary><div class="addon-step-body"><div class="button-row">${toggle}<button type="button" class="danger" data-remove-addon="${safe(addOn.moduleId)}">Uninstall</button></div><small>Enable and disable changes require a bridge restart. Uninstall preserves private settings for a later reinstall.</small></div></details>`;
    return `<article class="item addon-card ${rejected ? 'muted' : ''}" data-addon-id="${safe(addOn.moduleId)}"><div class="addon-card-header"><div><p class="addon-kicker">Installed add-on</p><h3>${safe(addOn.name)} ${safe(addOn.version)}</h3><p class="addon-version">${safe(addOn.moduleId)}</p></div><span class="badge">${rejected ? 'Rejected' : (addOn.enabled ? 'Enabled' : 'Disabled')}</span></div><p class="addon-description">${safe(addOn.description)}</p>${updateNotice}${rejected ? `<p class="error">${safe(addOn.error)}</p>` : ''}<div class="addon-flow">${setupGuide}${!rejected && !fields ? '<p class="notice">This add-on has no creator-editable settings. Continue to its connection and testing steps.</p>' : ''}${settings}${triggerReadiness}${actionGrant}${overlayTools}${viewerAdministration}${acceptance}</div>${packageDetails}${maintenance}</article>`;
  }).join('');
  // Saving settings and other add-on operations rebuild this subtree. Restore both open and
  // closed choices immediately so sections never flash or return to their package defaults.
  restoreDisclosureStates(list);
  byId('addon-selector').addEventListener('change', (event) => { state.selectedAddOnId = event.target.value; renderAddOns(); });
  document.querySelectorAll('[data-toggle-addon]').forEach((button) => button.addEventListener('click', toggleAddOn));
  document.querySelectorAll('[data-remove-addon]').forEach((button) => button.addEventListener('click', removeAddOn));
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
  document.querySelectorAll('[data-remove-addon-action]').forEach((button) => button.addEventListener('click', removeAddOnActionDraft));
  document.querySelectorAll('[data-save-addon-action-grants]').forEach((button) => button.addEventListener('click', saveAddOnActionGrants));
  document.querySelectorAll('[data-copy-addon-overlay]').forEach((button) => button.addEventListener('click', copyAddOnOverlayUrl));
  document.querySelectorAll('[data-preview-addon-overlay]').forEach((button) => button.addEventListener('click', previewAddOnOverlay));
  document.querySelector('[data-addon-acceptance-form]')?.addEventListener('submit', saveAddOnAcceptance);
  document.querySelector('[data-viewer-admin-status]')?.addEventListener('click', refreshViewerFoundationStatus);
  document.querySelector('[data-viewer-export-form]')?.addEventListener('submit', exportViewerFoundationRecord);
  document.querySelector('[data-viewer-correction-form]')?.addEventListener('submit', correctViewerFoundationRecord);
  document.querySelector('[data-viewer-delete-form]')?.addEventListener('submit', deleteViewerFoundationRecord);
  document.querySelector('[data-viewer-migration-preview]')?.addEventListener('click', previewViewerFoundationMigration);
  document.querySelector('[data-viewer-migration-apply]')?.addEventListener('click', applyViewerFoundationMigration);
  document.querySelector('[data-analytics-admin-status]')?.addEventListener('click', refreshCommunityAnalyticsStatus);
  document.querySelector('[data-analytics-export-form]')?.addEventListener('submit', exportCommunityAnalyticsRecord);
  document.querySelector('[data-analytics-delete-form]')?.addEventListener('submit', deleteCommunityAnalyticsRecord);
  document.querySelectorAll('[data-analytics-report]').forEach((button) => button.addEventListener('click', downloadCommunityAnalyticsReport));
  document.querySelector('[data-spotlight-admin-status]')?.addEventListener('click', refreshViewerSpotlightStatus);
  document.querySelector('[data-spotlight-stream-score]')?.addEventListener('click', showViewerSpotlightStreamScore);
  document.querySelector('[data-spotlight-display-form]')?.addEventListener('submit', displayViewerSpotlightCard);
  document.querySelector('[data-chat-guard-status]')?.addEventListener('click', refreshChatGuardStatus);
  document.querySelector('[data-chat-guard-clear]')?.addEventListener('click', clearChatGuardObservations);
  document.querySelector('[data-chat-guard-test-form]')?.addEventListener('submit', testChatGuardRules);
  document.querySelector('[data-chat-guard-permit-form]')?.addEventListener('submit', createChatGuardPermit);
  document.querySelector('[data-chat-guard-clear-permits]')?.addEventListener('click', clearChatGuardPermits);
  document.querySelector('[data-chat-guard-review-form]')?.addEventListener('submit', reviewChatGuardIncident);
}

function acceptanceOptions(selected) {
  const labels = { pending: 'Pending', passed: 'Passed', failed: 'Failed', 'not-required': 'Not required' };
  return Object.entries(labels).map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderAddOnAcceptance(addOn) {
  const entry = state.addOnAcceptance?.[addOn.moduleId] || { offlineStatus: 'pending', providerStatus: 'pending', evidence: '', updatedAt: '' };
  const updated = entry.updatedAt ? `Last updated ${new Date(entry.updatedAt).toLocaleString()}.` : 'No acceptance result has been recorded on this installation.';
  const verificationStep = addOn.permissions.includes('overlay.publish') ? 5 : 4;
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
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
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

function chatGuardOutput(value) {
  const output = document.querySelector('[data-chat-guard-output]');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function chatGuardAdmin(request) {
  const result = await api('/wizard/api/chat-guard/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  chatGuardOutput(result); return result;
}

async function refreshChatGuardStatus() {
  try { await chatGuardAdmin({ operation: 'status' }); } catch (error) { chatGuardOutput(error.message); }
}

async function clearChatGuardObservations() {
  if (!confirm('Clear all retained Chat Guard incidents, repeat observations, and replay fingerprints? This cannot be undone.')) return;
  try { await chatGuardAdmin({ operation: 'clear', approvedByCreator: true }); } catch (error) { chatGuardOutput(error.message); }
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
  try { await chatGuardAdmin({ operation: 'review', incidentId: form.elements.incidentId.value.trim(), decision: form.elements.decision.value, approvedByCreator: true }); form.reset(); } catch (error) { chatGuardOutput(error.message); }
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
  const filename = event.currentTarget.dataset.installDiscovered;
  const approval = [...document.querySelectorAll('[data-approve-discovered]')].find((input) => input.dataset.approveDiscovered === filename);
  if (!approval?.checked) { byId('addon-state').textContent = 'Review the discovered package and approve it before installation.'; return; }
  try {
    const discovered = state.discoveredAddOns.find((addOn) => addOn.filename === filename);
    if (!discovered?.sha256) { byId('addon-state').textContent = 'Inspect this package again before installing it.'; return; }
    const result = await api('/wizard/api/addons/install-discovered', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename, sha256: discovered.sha256, approvedByCreator: true }) });
    state.selectedAddOnId = result.moduleId;
    await loadAddOns();
    byId('addon-state').textContent = `Installed ${result.moduleId} ${result.version} from the inbox. Restart StreamBridge to activate it.`;
  } catch (error) { byId('addon-state').textContent = error.message; }
}

function renderAddOnOverlayTools(addOn) {
  const overlayPath = ADD_ON_OVERLAY_PATHS[addOn.moduleId] || `/overlay/addons/${addOn.moduleId}`;
  const url = `${location.origin}${overlayPath}`;
  return `<p>This core-rendered source accepts scoped cards and media without loading package HTML or JavaScript. Add it to Meld, OBS, or Streamlabs, then send a preview card to confirm the connection before relying on it live.</p><label>Browser source URL<input readonly data-addon-overlay-url="${safe(addOn.moduleId)}" value="${safe(url)}"></label><div class="button-row"><button type="button" data-copy-addon-overlay="${safe(addOn.moduleId)}">Copy overlay URL</button><button type="button" data-preview-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Send preview card</button></div>${addOn.enabled ? '' : '<small>Enable this add-on to send a live preview.</small>'}`;
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

  return `<div class="addon-action-grants" data-addon-action-grants="${safe(addOn.moduleId)}"><p>Choose the exact action IDs this add-on may dispatch. It cannot run any other action through the capability broker.</p>${inspectHint}${list}${picker}<button type="button" data-save-addon-action-grants="${safe(addOn.moduleId)}">Save action grants</button></div>`;
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
    await loadAddOns();
  } catch (error) { byId('addon-state').textContent = error.message; }
}

async function removeAddOn(event) {
  const id = event.currentTarget.dataset.removeAddon;
  if (!confirm(`Uninstall ${id}? Its private settings will be preserved, and the change takes effect after StreamBridge restarts.`)) return;
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/remove`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvedByCreator: true }) });
    await loadAddOns();
  } catch (error) { byId('addon-state').textContent = error.message; }
}

async function saveAddOnSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.addonSettings;
  const addOn = state.addOns.find((candidate) => candidate.moduleId === id);
  const sceneEditor = form.querySelector('[data-scene-mapping-editor]');
  if (sceneEditor) {
    const mappings = syncSceneMappingEditor(sceneEditor);
    if (mappings.some((mapping) => !mapping.sceneName || !mapping.actionId)) { byId('addon-state').textContent = 'Every scene mapping needs an exact scene name and a target action.'; return; }
    if (new Set(mappings.map((mapping) => mapping.id)).size !== mappings.length) { byId('addon-state').textContent = 'Every scene mapping needs a unique ID.'; return; }
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
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
    await loadAddOns();
    byId('addon-state').textContent = `Settings saved for ${id}. Restart StreamBridge to apply them.`;
  } catch (error) { byId('addon-state').textContent = error.message; }
}

function addAddOnActionDraft(event) {
  const id = event.currentTarget.dataset.addAddonAction;
  const select = document.querySelector(`[data-addon-action-picker="${CSS.escape(id)}"]`);
  const actionId = select?.value;
  if (!actionId) return;
  state.addOnActionDrafts[id] = [...(state.addOnActionDrafts[id] || []), actionId];
  renderAddOns();
}

function removeAddOnActionDraft(event) {
  const id = event.currentTarget.dataset.removeAddonActionModule;
  const actionId = event.currentTarget.dataset.removeAddonAction;
  state.addOnActionDrafts[id] = (state.addOnActionDrafts[id] || []).filter((candidate) => candidate !== actionId);
  renderAddOns();
}

async function saveAddOnActionGrants(event) {
  const id = event.currentTarget.dataset.saveAddonActionGrants;
  const actionIds = state.addOnActionDrafts[id] || [];
  if (!confirm(`Allow ${id} to dispatch exactly ${actionIds.length} approved Streamer.bot action(s)? This takes effect after StreamBridge restarts.`)) return;
    try {
      await api(`/wizard/api/addons/${encodeURIComponent(id)}/action-grants`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionIds, approvedByCreator: true }) });
      delete state.addOnActionDrafts[id];
      await loadAddOns();
    byId('addon-state').textContent = `Action grants saved for ${id}. Restart StreamBridge to apply them.`;
  } catch (error) { byId('addon-state').textContent = error.message; }
}

async function copyAddOnOverlayUrl(event) {
  const id = event.currentTarget.dataset.copyAddonOverlay;
  const input = [...document.querySelectorAll('[data-addon-overlay-url]')].find((candidate) => candidate.dataset.addonOverlayUrl === id);
  if (!input) return;
  try { await navigator.clipboard.writeText(input.value); byId('addon-state').textContent = `Overlay URL copied for ${id}.`; }
  catch { input.select(); byId('addon-state').textContent = 'Clipboard access was unavailable. The overlay URL is selected for manual copy.'; }
}

async function previewAddOnOverlay(event) {
  const id = event.currentTarget.dataset.previewAddonOverlay;
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/overlay-preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    byId('addon-state').textContent = `Preview sent to the ${id} hosted overlay.`;
  } catch (error) { byId('addon-state').textContent = error.message; }
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
    status.textContent = `Installed ${result.moduleId} ${result.version}. Restart StreamBridge to activate it.`;
    form.reset();
    await loadAddOns();
  } catch (error) { status.textContent = error.message; }
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
});
