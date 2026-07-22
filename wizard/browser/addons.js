async function loadAddOns() {
  const status = byId('addon-state');
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Verifying installed add-ons...';
  try {
    const result = await api('/wizard/api/addons');
    state.addOns = result.addOns;
    state.discoveredAddOns = result.discovered || [];
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
  return `<div class="notice addon-update-result" data-addon-update-state="${safe(update.state)}"><strong>${safe(labels[update.state] || update.state)}.</strong>${safe(version + warning)}${archive}${checksum}</div>`;
}

function renderAddOnField(name, schema, value, ui = {}) {
  const type = schema.type;
  const label = safe(schema.title || name);
  const help = schema.description ? `<small>${safe(schema.description)}</small>` : '';
  const fullRow = type === 'array' || schema.format === 'multiline' || ui.fullRow === true;
  const wrapper = (content) => `<div class="addon-setting ${fullRow ? 'full-row' : ''}"${addOnVisibilityAttributes(ui)}>${content}</div>`;
  if (type === 'array' && Array.isArray(schema.items?.enum)) {
    const selected = new Set(Array.isArray(value) ? value : []);
    return wrapper(`<fieldset class="addon-choice-field"><legend>${label}</legend><div class="addon-choice-grid">${schema.items.enum.map((entry) => `<label class="addon-choice"><input name="${safe(name)}" type="checkbox" value="${safe(entry)}" data-addon-enum-list="true" ${selected.has(entry) ? 'checked' : ''}><span>${safe(addOnOptionLabel(entry))}</span></label>`).join('')}</div>${help}</fieldset>`);
  }
  if (Array.isArray(schema.enum)) return wrapper(`<label>${label}<select name="${safe(name)}">${schema.enum.map((entry) => `<option value="${safe(entry)}" ${entry === value ? 'selected' : ''}>${safe(ui.labels?.[entry] || addOnOptionLabel(entry))}</option>`).join('')}</select>${help}</label>`);
  if (type === 'boolean') return wrapper(`<label class="addon-toggle"><span><strong>${label}</strong>${help}</span><input name="${safe(name)}" type="checkbox" role="switch" ${value === true ? 'checked' : ''}><i aria-hidden="true"></i></label>`);
  if (type === 'number' || type === 'integer') return wrapper(`<label>${label}<input name="${safe(name)}" type="number" ${type === 'integer' ? 'step="1"' : 'step="any"'} value="${safe(value ?? '')}" ${Number.isFinite(schema.minimum) ? `min="${safe(schema.minimum)}"` : ''} ${Number.isFinite(schema.maximum) ? `max="${safe(schema.maximum)}"` : ''}>${help}</label>`);
  if (type === 'array') return wrapper(`<label>${label}<textarea name="${safe(name)}" rows="${safe(Number.isInteger(ui.rows) ? ui.rows : 4)}" data-addon-string-list="true" placeholder="One item per line">${safe(Array.isArray(value) ? value.join('\n') : '')}</textarea>${help}<small>Enter one item per line. Empty and duplicate entries are rejected.</small></label>`);
  if (schema.format === 'multiline') return wrapper(`<label>${label}<textarea name="${safe(name)}" rows="${safe(Number.isInteger(ui.rows) ? ui.rows : 4)}" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 2000)}">${safe(value ?? '')}</textarea>${help}</label>`);
  if (schema.format === 'color') return wrapper(`<label>${label}<input name="${safe(name)}" type="color" value="${safe(value || '#6f42c1')}">${help}</label>`);
  return wrapper(`<label>${label}<input name="${safe(name)}" type="text" value="${safe(value ?? '')}" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 500)}">${help}</label>`);
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
  const sections = requestedSections.filter((section) => section && typeof section.title === 'string' && Array.isArray(section.fields)).map((section) => {
    const fields = renderNames(section.fields);
    const notice = typeof section.notice === 'string' && section.notice.trim() ? `<p class="addon-settings-notice">${safe(section.notice)}</p>` : '';
    const links = Array.isArray(section.links) ? section.links.map((link) => {
      const href = safeAddOnLink(link?.url);
      return href && typeof link?.label === 'string' ? `<a href="${safe(href)}" target="_blank" rel="noreferrer noopener">${safe(link.label)}</a>` : '';
    }).filter(Boolean).join('') : '';
    if (!fields && !notice && !links) return '';
    const body = `${notice}${links ? `<div class="addon-settings-links">${links}</div>` : ''}${fields ? `<div class="addon-settings-grid">${fields}</div>` : ''}`;
    return `<details class="addon-settings-section" ${section.open === true ? 'open' : ''}><summary><span>${safe(section.title)}${section.description ? `<small>${safe(section.description)}</small>` : ''}</span></summary><div class="addon-settings-section-body">${body}</div></details>`;
  }).join('');
  const remaining = renderNames(entries.map(([name]) => name).filter((name) => !rendered.has(name)));
  if (!sections) return `<div class="addon-settings-grid">${remaining}</div>`;
  return `${sections}${remaining ? `<details class="addon-settings-section"><summary><span>Other settings<small>Less commonly changed options</small></span></summary><div class="addon-settings-grid">${remaining}</div></details>` : ''}`;
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

function renderAddOns() {
  const list = byId('addon-list');
  if (!state.addOns.length) {
    list.innerHTML = '<p class="notice">No add-ons are installed. Core chat, commands, alerts, timers, and rewards continue to work without add-ons.</p>';
    return;
  }
  // Re-rendering (for example after Add/Remove on the approved-actions list) would otherwise
  // reset every <details> section back to its default open/closed state on each click.
  const openSummaries = new Set([...list.querySelectorAll('details[open] summary')].map((summary) => summary.textContent));
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
    const settingsIntro = typeof addOn.settingsUi?.intro === 'string' && addOn.settingsUi.intro.trim() ? addOn.settingsUi.intro : 'Open only the section you want to change. Hidden options keep their saved values.';
    const settings = rejected || !fields ? '' : `<details class="form-section addon-settings-shell" open><summary>Configure add-on</summary><form class="addon-settings" data-addon-settings="${safe(addOn.moduleId)}"><p class="addon-settings-intro">${safe(settingsIntro)}</p>${fields}<div class="addon-settings-save"><button type="submit">Save all settings</button><small>Changes take effect after StreamBridge restarts.</small></div></form></details>`;
    const actionGrant = rejected || !addOn.permissions.includes('streamerbot.run-approved-action') ? '' : `<details class="form-section"><summary>Approved Streamer.bot actions</summary>${renderAddOnActionGrant(addOn)}</details>`;
    const overlayTools = rejected || !addOn.permissions.includes('overlay.publish') ? '' : `<details class="form-section"><summary>Hosted overlay &amp; testing</summary>${renderAddOnOverlayTools(addOn)}</details>`;
    const toggle = rejected ? '' : `<button type="button" data-toggle-addon="${safe(addOn.moduleId)}" data-addon-enabled="${String(addOn.enabled)}">${addOn.enabled ? 'Disable' : 'Enable'}</button>`;
    return `<article class="item addon-card ${rejected ? 'muted' : ''}" data-addon-id="${safe(addOn.moduleId)}"><div class="title-row"><div><strong>${safe(addOn.name)} ${safe(addOn.version)}</strong><small>${safe(addOn.moduleId)} - ${safe(addOn.author)} - ${safe(addOn.packageKind)}</small></div><span class="badge">${rejected ? 'Rejected' : (addOn.enabled ? 'Enabled' : 'Disabled')}</span></div><p>${safe(addOn.description)}</p>${updateNotice}${rejected ? `<p class="error">${safe(addOn.error)}</p>` : `<small><strong>Permissions:</strong> ${safe(permissions)}</small>${trustLinks}`}${liveChatWarning}${providerWarning}${addOn.packageKind === 'executable' && !rejected ? '<p class="notice">Executable add-ons run with the same Windows account permissions as StreamBridge. The broker limits supported framework operations, but it is not an operating-system sandbox. Install executable packages only from publishers you trust.</p>' : ''}${addOn.changelog ? `<details><summary>Release notes</summary><p>${safe(addOn.changelog)}</p></details>` : ''}${!rejected && !fields ? '<p class="notice">This add-on has no configurable settings.</p>' : ''}${settings}${actionGrant}${overlayTools}<div class="button-row">${toggle}<button type="button" class="danger" data-remove-addon="${safe(addOn.moduleId)}">Uninstall</button></div><small>Installed package changes require a bridge restart. Uninstall preserves private settings for a later reinstall.</small></article>`;
  }).join('');
  list.querySelectorAll('details summary').forEach((summary) => { if (openSummaries.has(summary.textContent)) summary.parentElement.open = true; });
  byId('addon-selector').addEventListener('change', (event) => { state.selectedAddOnId = event.target.value; renderAddOns(); });
  document.querySelectorAll('[data-toggle-addon]').forEach((button) => button.addEventListener('click', toggleAddOn));
  document.querySelectorAll('[data-remove-addon]').forEach((button) => button.addEventListener('click', removeAddOn));
  document.querySelectorAll('[data-addon-settings]').forEach((form) => {
    form.addEventListener('submit', saveAddOnSettings);
    form.addEventListener('change', () => updateAddOnFieldVisibility(form));
    updateAddOnFieldVisibility(form);
  });
  document.querySelectorAll('[data-inspect-addon-actions]').forEach((button) => button.addEventListener('click', runInspection));
  document.querySelectorAll('[data-addon-action-group]').forEach((select) => select.addEventListener('change', selectAddOnActionGroup));
  document.querySelectorAll('[data-add-addon-action]').forEach((button) => button.addEventListener('click', addAddOnActionDraft));
  document.querySelectorAll('[data-remove-addon-action]').forEach((button) => button.addEventListener('click', removeAddOnActionDraft));
  document.querySelectorAll('[data-save-addon-action-grants]').forEach((button) => button.addEventListener('click', saveAddOnActionGrants));
  document.querySelectorAll('[data-copy-addon-overlay]').forEach((button) => button.addEventListener('click', copyAddOnOverlayUrl));
  document.querySelectorAll('[data-preview-addon-overlay]').forEach((button) => button.addEventListener('click', previewAddOnOverlay));
}

function renderDiscoveredAddOns() {
  const list = byId('addon-discovered-list');
  if (!state.discoveredAddOns.length) { list.innerHTML = '<p class="notice">No packages are waiting in the add-on inbox.</p>'; return; }
  list.innerHTML = state.discoveredAddOns.map((addOn) => addOn.health === 'rejected'
    ? `<article class="item muted"><strong>${safe(addOn.filename)}</strong><small>Rejected before installation</small><p class="error">${safe(addOn.error)}</p></article>`
    : `<article class="item"><strong>${safe(addOn.name)} ${safe(addOn.version)}</strong><small>${safe(addOn.filename)} - ${safe(addOn.author)} - ${safe(addOn.packageKind)}</small><p>${safe(addOn.description)}</p><small><strong>Permissions:</strong> ${safe(addOn.permissions.length ? addOn.permissions.join(', ') : 'none')} - integrity checked, publisher identity not authenticated</small>${renderAddOnTrustLinks(addOn.trustMetadata)}${addOn.permissions.includes('chat.send') ? '<p class="notice"><strong>Live chat permission:</strong> this package can automatically post messages after installation and enablement.</p>' : ''}${addOn.permissions.includes('provider.events.publish') ? '<p class="notice"><strong>Financial-event permission:</strong> this package can publish bounded donations for its assigned provider into core alerts.</p>' : ''}<label class="check"><input type="checkbox" data-approve-discovered="${safe(addOn.filename)}"> I reviewed and trust this publisher and permission request</label><button type="button" data-install-discovered="${safe(addOn.filename)}">Verify and install</button></article>`).join('');
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
  const url = `${location.origin}/overlay/addons/${addOn.moduleId}`;
  return `<p>This core-rendered source accepts scoped cards and media without loading package HTML or JavaScript. Add it to Meld, OBS, or Streamlabs, then send a preview card to confirm the connection before relying on it live.</p><label>Browser source URL<input readonly data-addon-overlay-url="${safe(addOn.moduleId)}" value="${safe(url)}"></label><div class="button-row"><button type="button" data-copy-addon-overlay="${safe(addOn.moduleId)}">Copy overlay URL</button><button type="button" data-preview-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Send preview card</button></div>${addOn.enabled ? '' : '<small>Enable this add-on to send a live preview.</small>'}`;
}

function renderAddOnActionGrant(addOn) {
  const prohibited = new Set(['143fce1d-c5b0-4108-b766-ee2d0249e2d4']);
  const liveById = new Map(state.liveActions.map((action) => [action.id, action]));
  // Not yet inspected this session (state.liveActions resets on every wizard page load) reads
  // very differently from a genuinely missing action: the first just needs a fresh Inspect to
  // confirm, the second means the action was actually removed or renamed in Streamer.bot.
  const notYetInspected = state.liveActions.length === 0;
  rememberInspectedActionNames(state.liveActions);
  if (!state.addOnActionDrafts) state.addOnActionDrafts = {};
  if (!state.addOnActionDrafts[addOn.moduleId]) state.addOnActionDrafts[addOn.moduleId] = [...(addOn.approvedActionIds || [])];
  const draft = state.addOnActionDrafts[addOn.moduleId];

  const approvedEntries = draft.map((id) => {
    const live = liveById.get(id);
    if (live) return { id, name: live.name, group: actionGroupName(live), suffix: live.enabled === false ? ' · disabled in Streamer.bot' : '' };
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
  const inspectedAt = new Date().toISOString();
  for (const action of actions) state.addOnActionNameCache[action.id] = { name: action.name, group: actionGroupName(action), inspectedAt };
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
    byId('addon-state').textContent = `Settings saved for ${id}. Restart StreamBridge to apply them.`;
    await loadAddOns();
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
