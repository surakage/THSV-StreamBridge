async function loadAddOns() {
  const status = byId('addon-state');
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Verifying installed add-ons...';
  try {
    const result = await api('/wizard/api/addons');
    state.addOns = result.addOns;
    state.discoveredAddOns = result.discovered || [];
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

function renderAddOnField(name, schema, value) {
  const type = schema.type;
  const label = safe(schema.title || name);
  const help = schema.description ? `<small>${safe(schema.description)}</small>` : '';
  if (Array.isArray(schema.enum)) return `<label>${label}<select name="${safe(name)}">${schema.enum.map((entry) => `<option value="${safe(entry)}" ${entry === value ? 'selected' : ''}>${safe(entry)}</option>`).join('')}</select>${help}</label>`;
  if (type === 'boolean') return `<label class="check"><input name="${safe(name)}" type="checkbox" ${value === true ? 'checked' : ''}> ${label}</label>`;
  if (type === 'number' || type === 'integer') return `<label>${label}<input name="${safe(name)}" type="number" ${type === 'integer' ? 'step="1"' : 'step="any"'} value="${safe(value ?? '')}" ${Number.isFinite(schema.minimum) ? `min="${safe(schema.minimum)}"` : ''} ${Number.isFinite(schema.maximum) ? `max="${safe(schema.maximum)}"` : ''}>${help}</label>`;
  if (type === 'array') return `<label class="full-row">${label}<textarea name="${safe(name)}" rows="6" data-addon-string-list="true" placeholder="One item per line">${safe(Array.isArray(value) ? value.join('\n') : '')}</textarea>${help}<small>One item per line. Empty and duplicate entries are rejected.</small></label>`;
  if (schema.format === 'multiline') return `<label class="full-row">${label}<textarea name="${safe(name)}" rows="6" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 2000)}">${safe(value ?? '')}</textarea>${help}</label>`;
  if (schema.format === 'color') return `<label>${label}<input name="${safe(name)}" type="color" value="${safe(value || '#6f42c1')}">${help}</label>`;
  return `<label>${label}<input name="${safe(name)}" type="text" value="${safe(value ?? '')}" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 500)}">${help}</label>`;
}

function orderedAddOnProperties(addOn) {
  const properties = addOn.configurationSchema?.properties || {};
  const requested = Array.isArray(addOn.settingsUi?.order) ? addOn.settingsUi.order.filter((name) => typeof name === 'string' && Object.hasOwn(properties, name)) : [];
  const seen = new Set(requested);
  return [...requested.map((name) => [name, properties[name]]), ...Object.entries(properties).filter(([name]) => !seen.has(name))];
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
    const fields = rejected ? '' : orderedAddOnProperties(addOn).map(([name, schema]) => renderAddOnField(name, schema, addOn.settings[name])).join('');
    const permissions = addOn.permissions.length ? addOn.permissions.join(', ') : 'No optional permissions requested';
    const liveChatWarning = addOn.permissions.includes('chat.send') ? '<p class="notice"><strong>Live chat permission:</strong> this add-on can automatically post messages to creator-enabled platforms through StreamBridge. Review its settings and publisher before enabling it.</p>' : '';
    const settings = rejected ? '' : `<form class="filter-form addon-settings" data-addon-settings="${safe(addOn.moduleId)}">${fields || '<p class="notice full-row">This add-on has no configurable settings.</p>'}${fields ? '<button type="submit">Save settings</button>' : ''}</form>`;
    const actionGrant = rejected || !addOn.permissions.includes('streamerbot.run-approved-action') ? '' : renderAddOnActionGrant(addOn);
    const overlayTools = rejected || !addOn.permissions.includes('overlay.publish') ? '' : renderAddOnOverlayTools(addOn);
    const toggle = rejected ? '' : `<button type="button" data-toggle-addon="${safe(addOn.moduleId)}" data-addon-enabled="${String(addOn.enabled)}">${addOn.enabled ? 'Disable' : 'Enable'}</button>`;
    return `<article class="item addon-card ${rejected ? 'muted' : ''}" data-addon-id="${safe(addOn.moduleId)}"><div class="title-row"><div><strong>${safe(addOn.name)} ${safe(addOn.version)}</strong><small>${safe(addOn.moduleId)} - ${safe(addOn.author)} - ${safe(addOn.packageKind)}</small></div><span class="badge">${rejected ? 'Rejected' : (addOn.enabled ? 'Enabled' : 'Disabled')}</span></div><p>${safe(addOn.description)}</p>${rejected ? `<p class="error">${safe(addOn.error)}</p>` : `<small><strong>Permissions:</strong> ${safe(permissions)}</small>`}${liveChatWarning}${addOn.packageKind === 'executable' && !rejected ? '<p class="notice">Executable add-ons run with the same Windows account permissions as StreamBridge. The broker limits supported framework operations, but it is not an operating-system sandbox. Install executable packages only from publishers you trust.</p>' : ''}${addOn.changelog ? `<details><summary>Release notes</summary><p>${safe(addOn.changelog)}</p></details>` : ''}${settings}${actionGrant}${overlayTools}<div class="button-row">${toggle}<button type="button" class="danger" data-remove-addon="${safe(addOn.moduleId)}">Uninstall</button></div><small>Installed package changes require a bridge restart. Uninstall preserves private settings for a later reinstall.</small></article>`;
  }).join('');
  byId('addon-selector').addEventListener('change', (event) => { state.selectedAddOnId = event.target.value; renderAddOns(); });
  document.querySelectorAll('[data-toggle-addon]').forEach((button) => button.addEventListener('click', toggleAddOn));
  document.querySelectorAll('[data-remove-addon]').forEach((button) => button.addEventListener('click', removeAddOn));
  document.querySelectorAll('[data-addon-settings]').forEach((form) => form.addEventListener('submit', saveAddOnSettings));
  document.querySelectorAll('[data-addon-action-grants]').forEach((form) => form.addEventListener('submit', saveAddOnActionGrants));
  document.querySelectorAll('[data-copy-addon-overlay]').forEach((button) => button.addEventListener('click', copyAddOnOverlayUrl));
  document.querySelectorAll('[data-preview-addon-overlay]').forEach((button) => button.addEventListener('click', previewAddOnOverlay));
}

function renderDiscoveredAddOns() {
  const list = byId('addon-discovered-list');
  if (!state.discoveredAddOns.length) { list.innerHTML = '<p class="notice">No packages are waiting in the add-on inbox.</p>'; return; }
  list.innerHTML = state.discoveredAddOns.map((addOn) => addOn.health === 'rejected'
    ? `<article class="item muted"><strong>${safe(addOn.filename)}</strong><small>Rejected before installation</small><p class="error">${safe(addOn.error)}</p></article>`
    : `<article class="item"><strong>${safe(addOn.name)} ${safe(addOn.version)}</strong><small>${safe(addOn.filename)} - ${safe(addOn.author)} - ${safe(addOn.packageKind)}</small><p>${safe(addOn.description)}</p><small><strong>Permissions:</strong> ${safe(addOn.permissions.length ? addOn.permissions.join(', ') : 'none')} - integrity checked, publisher identity not authenticated</small>${addOn.permissions.includes('chat.send') ? '<p class="notice"><strong>Live chat permission:</strong> this package can automatically post messages after installation and enablement.</p>' : ''}<label class="check"><input type="checkbox" data-approve-discovered="${safe(addOn.filename)}"> I reviewed and trust this publisher and permission request</label><button type="button" data-install-discovered="${safe(addOn.filename)}">Verify and install</button></article>`).join('');
  document.querySelectorAll('[data-install-discovered]').forEach((button) => button.addEventListener('click', installDiscoveredAddOn));
}

async function installDiscoveredAddOn(event) {
  const filename = event.currentTarget.dataset.installDiscovered;
  const approval = [...document.querySelectorAll('[data-approve-discovered]')].find((input) => input.dataset.approveDiscovered === filename);
  if (!approval?.checked) { byId('addon-state').textContent = 'Review the discovered package and approve it before installation.'; return; }
  try {
    const result = await api('/wizard/api/addons/install-discovered', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename, approvedByCreator: true }) });
    state.selectedAddOnId = result.moduleId;
    await loadAddOns();
    byId('addon-state').textContent = `Installed ${result.moduleId} ${result.version} from the inbox. Restart StreamBridge to activate it.`;
  } catch (error) { byId('addon-state').textContent = error.message; }
}

function renderAddOnOverlayTools(addOn) {
  const url = `${location.origin}/overlay/addons/${addOn.moduleId}`;
  return `<section class="transaction full-row"><strong>Hosted add-on overlay</strong><p>This core-rendered source accepts scoped cards and media without loading package HTML or JavaScript. Add it to Meld, OBS, or Streamlabs.</p><label>Browser source URL<input readonly data-addon-overlay-url="${safe(addOn.moduleId)}" value="${safe(url)}"></label><div class="button-row"><button type="button" data-copy-addon-overlay="${safe(addOn.moduleId)}">Copy overlay URL</button><button type="button" data-preview-addon-overlay="${safe(addOn.moduleId)}" ${addOn.enabled ? '' : 'disabled'}>Send preview card</button></div></section>`;
}

function renderAddOnActionGrant(addOn) {
  const prohibited = new Set(['143fce1d-c5b0-4108-b766-ee2d0249e2d4']);
  const approved = new Set(addOn.approvedActionIds || []);
  const liveById = new Map(state.liveActions.map((action) => [action.id, action]));
  const actions = [...state.liveActions.filter((action) => !prohibited.has(action.id.toLowerCase())), ...(addOn.approvedActionIds || []).filter((id) => !liveById.has(id) && !prohibited.has(id.toLowerCase())).map((id) => ({ id, name: 'Previously approved action (not in latest inspection)', enabled: false }))];
  const choices = actions.length
    ? actions.map((action) => `<label class="check"><input type="checkbox" name="actionId" value="${safe(action.id)}" ${approved.has(action.id) ? 'checked' : ''}> ${safe(action.name)} <small>${safe(action.id)}${action.enabled === false ? ' · disabled or missing' : ''}</small></label>`).join('')
    : '<p class="notice full-row">Use Streamer.bot → Inspect first. No action can be granted by name or guessed ID.</p>';
  return `<form class="filter-form addon-action-grants" data-addon-action-grants="${safe(addOn.moduleId)}"><div class="full-row"><strong>Approved Streamer.bot actions</strong><p>Choose the exact action IDs this add-on may dispatch. It cannot run any other action through the capability broker.</p></div>${choices}<button type="submit">Save action grants</button></form>`;
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

async function saveAddOnActionGrants(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.addonActionGrants;
  const actionIds = [...form.querySelectorAll('input[name="actionId"]:checked')].map((input) => input.value);
  if (!confirm(`Allow ${id} to dispatch exactly ${actionIds.length} selected Streamer.bot action(s)? This takes effect after StreamBridge restarts.`)) return;
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(id)}/action-grants`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionIds, approvedByCreator: true }) });
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
document.querySelector('[data-view="addons"]').addEventListener('click', loadAddOns);
