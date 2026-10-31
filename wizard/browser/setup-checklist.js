// Setup checklist: one read-only list of what each enabled feature still needs before it works.
// buildSetupChecklist is pure (no DOM, no network) so it can be unit tested; everything below it
// only gathers data the wizard already loads and renders the result. Nothing here changes settings.

const SETUP_CHECKLIST_SCENE_ROLES = { starting: 'Starting', live: 'Main live', chatting: 'Just Chatting', break: 'Break', ending: 'Ending' };
const SETUP_CHECKLIST_ROLE_TOKEN = /^role:\s*(starting|live|chatting|break|ending)$/iu;
const SETUP_CHECKLIST_REWARD_FIELD = /(?:^r|R)ewardId$/u;
const SETUP_CHECKLIST_PLATFORM_LABELS = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', streamlabs: 'Streamlabs', kofi: 'Ko-fi', facebook: 'Facebook' };

// Recommended actions that only matter while a related setting is on, so a feature that does not
// use that part is not asked to approve it.
const SETUP_CHECKLIST_CONDITIONAL_ACTIONS = {
  'THSV Addon - Raid Scout - Run Ending Ad': (settings) => settings.endBroadcastAfterRaid !== false,
  'THSV Addon - Viewer Spotlight - Settle Reward': (settings) => settings.rewardRequestsEnabled === true,
  'THSV Addon - Village Jukebox - Settle Twitch Reward': (settings) => settings.rewardRequestsEnabled === true,
  'THSV Addon - Village Hydration Station - Speak': (settings) => settings.speakerEnabled === true,
};

function setupChecklistSettingValue(addOn, key) {
  const settings = addOn.settings && typeof addOn.settings === 'object' ? addOn.settings : {};
  if (Object.hasOwn(settings, key)) return settings[key];
  return addOn.configurationSchema?.properties?.[key]?.default;
}

/** A setting is in use when the settings form would show it (its visibleWhen rule, and its controller's, hold). */
function setupChecklistSettingInUse(addOn, key, depth = 0) {
  const condition = addOn.settingsUi?.fields?.[key]?.visibleWhen;
  if (!condition || typeof condition.field !== 'string') return true;
  if (depth > 4) return false;
  const current = setupChecklistSettingValue(addOn, condition.field);
  const matches = Object.hasOwn(condition, 'equals') ? current === condition.equals : Array.isArray(condition.in) ? condition.in.includes(current) : true;
  return matches && setupChecklistSettingInUse(addOn, condition.field, depth + 1);
}

function setupChecklistSettingLabel(addOn, key) {
  const title = addOn.configurationSchema?.properties?.[key]?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : key;
}

/** Scene roles a setting value uses, including rows saved as JSON text; rows switched off are skipped. */
function setupChecklistRolesIn(value, found = new Set(), depth = 0) {
  if (depth > 5) return found;
  if (typeof value === 'string') {
    const match = SETUP_CHECKLIST_ROLE_TOKEN.exec(value.trim());
    if (match) found.add(match[1].toLowerCase());
    else if (value.trim().startsWith('{')) {
      try { setupChecklistRolesIn(JSON.parse(value), found, depth + 1); } catch { /* Ordinary text, not a saved row. */ }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) setupChecklistRolesIn(item, found, depth + 1);
  } else if (value && typeof value === 'object' && value.enabled !== false) {
    for (const item of Object.values(value)) setupChecklistRolesIn(item, found, depth + 1);
  }
  return found;
}

function setupChecklistList(names) {
  return names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function setupChecklistFeatureItems(addOn, input) {
  const items = [];
  const name = addOn.name || addOn.moduleId;
  const settingsTarget = (field) => ({ kind: 'addon', moduleId: addOn.moduleId, tab: 'settings', section: 'configure', ...(field ? { field } : {}) });
  const properties = addOn.configurationSchema?.properties && typeof addOn.configurationSchema.properties === 'object' ? addOn.configurationSchema.properties : {};

  // The component is on, but its own "Enable" switch is off, so nothing else matters yet.
  if (Object.hasOwn(properties, 'enabled') && setupChecklistSettingValue(addOn, 'enabled') === false) {
    items.push({ id: 'switched-off', summary: `Turn on "${setupChecklistSettingLabel(addOn, 'enabled')}" in its settings.`, text: `${name} is installed and turned on, but its own "${setupChecklistSettingLabel(addOn, 'enabled')}" switch is off. Turn it on in its settings.`, action: { label: 'Open settings', target: settingsTarget('enabled') } });
    return items;
  }

  if ((input.restartPendingModuleIds || []).includes(addOn.moduleId)) {
    items.push({ id: 'restart', summary: 'Restart StreamBridge to apply saved changes.', text: `Saved changes for ${name} start working after StreamBridge restarts. Restart while you are offline.`, action: { label: 'Open restart', target: { kind: 'addon', moduleId: addOn.moduleId, focus: '.addon-pending-activation' } } });
  }

  const settings = addOn.settings && typeof addOn.settings === 'object' ? addOn.settings : {};
  const recommended = (input.recommendedActionNames?.[addOn.moduleId] || []).filter((actionName) => SETUP_CHECKLIST_CONDITIONAL_ACTIONS[actionName]?.(settings) ?? true);
  if (Array.isArray(input.actions)) {
    const approved = Array.isArray(addOn.approvedActionIds) ? addOn.approvedActionIds : [];
    // Features without this permission never run actions: their actions only send events in, so they need importing but no approval.
    const canRunActions = !Array.isArray(addOn.permissions) || addOn.permissions.includes('streamerbot.run-approved-action');
    const notImported = [];
    const notApproved = [];
    for (const actionName of recommended) {
      const live = input.actions.find((action) => action.name === actionName);
      if (!live) notImported.push(actionName);
      else if (canRunActions && !approved.includes(live.id)) notApproved.push(actionName);
    }
    const liveIds = new Set(input.actions.map((action) => action.id));
    const missingApproved = approved.filter((id) => !liveIds.has(id));
    if (notImported.length) items.push({ id: 'actions-not-imported', summary: `Import ${notImported.length === 1 ? '1 Streamer.bot action' : `${notImported.length} Streamer.bot actions`}.`, details: notImported, text: `Import ${name}'s Streamer.bot actions. Not found in Streamer.bot yet: ${setupChecklistList(notImported)}.`, action: { label: 'Open import', target: { kind: 'panel', panel: 'streamerbot', focus: '.universal-import-card' } } });
    if (notApproved.length) items.push({ id: 'actions-not-approved', summary: `Approve ${notApproved.length === 1 ? '1 Streamer.bot action' : `${notApproved.length} Streamer.bot actions`}.`, details: notApproved, text: `Approve ${notApproved.length === 1 ? 'the recommended Streamer.bot action' : `${notApproved.length} recommended Streamer.bot actions`} for ${name}: ${setupChecklistList(notApproved)}.`, action: { label: 'Approve actions', target: { kind: 'addon', moduleId: addOn.moduleId, tab: 'streamerbot', section: 'approved-actions' } } });
    if (missingApproved.length) items.push({ id: 'approved-actions-missing', summary: `${missingApproved.length === 1 ? '1 approved action is' : `${missingApproved.length} approved actions are`} missing. Import again.`, text: `${missingApproved.length === 1 ? 'An approved action' : `${missingApproved.length} approved actions`} for ${name} ${missingApproved.length === 1 ? 'is' : 'are'} missing from Streamer.bot. Import its Streamer.bot package again.`, action: { label: 'Open import', target: { kind: 'panel', panel: 'streamerbot', focus: '.universal-import-card' } } });
  }

  for (const key of Object.keys(properties).filter((property) => SETUP_CHECKLIST_REWARD_FIELD.test(property))) {
    const platform = /^kick/iu.test(key) ? 'kick' : 'twitch';
    if (input.platforms?.[platform]?.enabled !== true || !setupChecklistSettingInUse(addOn, key)) continue;
    const value = setupChecklistSettingValue(addOn, key);
    if (typeof value === 'string' && value.trim() !== '') continue;
    items.push({ id: `reward:${key}`, summary: `Add your ${SETUP_CHECKLIST_PLATFORM_LABELS[platform]} reward ID.`, details: [`Box: "${setupChecklistSettingLabel(addOn, key)}"`], text: `Paste your ${SETUP_CHECKLIST_PLATFORM_LABELS[platform]} reward ID into "${setupChecklistSettingLabel(addOn, key)}". ${name} uses this reward, but the box is empty.`, action: { label: 'Add reward ID', target: settingsTarget(key) } });
  }

  const roles = input.sceneRoles && typeof input.sceneRoles === 'object' ? input.sceneRoles : {};
  const unmapped = new Map();
  for (const key of Object.keys(settings)) {
    if (!setupChecklistSettingInUse(addOn, key)) continue;
    for (const role of setupChecklistRolesIn(settings[key])) {
      if (typeof roles[role] === 'string' && roles[role].trim() !== '') continue;
      if (!unmapped.has(role)) unmapped.set(role, []);
      unmapped.get(role).push(`"${setupChecklistSettingLabel(addOn, key)}"`);
    }
  }
  for (const [role, labels] of unmapped) {
    items.push({ id: `scene-role:${role}`, summary: `Pick your ${SETUP_CHECKLIST_SCENE_ROLES[role]} scene under Scene roles.`, details: labels, text: `Choose your ${SETUP_CHECKLIST_SCENE_ROLES[role]} scene under Scene roles. ${name} uses role:${role} in ${setupChecklistList(labels)}, but that role has no scene yet.`, action: { label: 'Map scene role', target: { kind: 'panel', panel: 'addons', focus: '#scene-roles' } } });
  }
  return items;
}

/**
 * Builds the checklist from data the wizard already has.
 * input: { addOns, actions (live Streamer.bot actions, or null when they could not be read),
 *   recommendedActionNames: { moduleId: names[] }, platforms, sceneRoles, restartRequired,
 *   restartPendingModuleIds, stagedChangeCount, connections: { streamerBot, platforms: [{ name, state }] } | null }
 */
function buildSetupChecklist(input = {}) {
  const general = [];
  if (input.stagedChangeCount > 0) general.push({ id: 'staged', summary: `Save ${input.stagedChangeCount === 1 ? '1 pending change' : `${input.stagedChangeCount} pending changes`} with backup.`, text: `You have ${input.stagedChangeCount === 1 ? 'a change' : `${input.stagedChangeCount} changes`} that ${input.stagedChangeCount === 1 ? 'is' : 'are'} not saved yet. Save it with backup on the Overview page.`, action: { label: 'Open pending changes', target: { kind: 'panel', panel: 'overview', focus: '#commit' } } });
  if (input.restartRequired === true) general.push({ id: 'restart', summary: 'Restart StreamBridge to apply saved settings.', text: 'Saved settings start working after StreamBridge restarts. Restart while you are offline.', action: { label: 'Open connection check', target: { kind: 'panel', panel: 'overview', focus: '#connection-center' } } });
  const connections = input.connections;
  if (connections && connections.streamerBot !== 'connected') general.push({ id: 'streamerbot', summary: 'Connect Streamer.bot (start it with its WebSocket server on).', text: 'StreamBridge is not connected to Streamer.bot. Start Streamer.bot and make sure its WebSocket server is on.', action: { label: 'Open Streamer.bot', target: { kind: 'panel', panel: 'streamerbot' } } });
  for (const platform of connections?.platforms || []) {
    if (platform.state === 'connected' || platform.state === 'disabled') continue;
    const label = SETUP_CHECKLIST_PLATFORM_LABELS[platform.name] || platform.name;
    general.push({ id: `platform:${platform.name}`, summary: `${label} is on but not connected.`, text: `${label} is turned on but not connected. Check that your ${label} account is connected in Streamer.bot.`, action: { label: 'Open connection check', target: { kind: 'panel', panel: 'overview', focus: '#connection-center' } } });
  }

  const enabled = (Array.isArray(input.addOns) ? input.addOns : []).filter((addOn) => addOn && addOn.enabled === true && addOn.health === 'installed');
  if (!Array.isArray(input.actions) && enabled.some((addOn) => (input.recommendedActionNames?.[addOn.moduleId] || []).length > 0)) {
    general.push({ id: 'actions-unchecked', text: 'Streamer.bot actions could not be checked. Start Streamer.bot, then press Inspect actions so this list can confirm your feature actions.', action: { label: 'Open Streamer.bot', target: { kind: 'panel', panel: 'streamerbot', focus: '#inspect' } } });
  }

  const features = enabled
    .map((addOn) => ({ moduleId: addOn.moduleId, name: addOn.name || addOn.moduleId, items: setupChecklistFeatureItems(addOn, input) }))
    .sort((left, right) => Number(right.items.length > 0) - Number(left.items.length > 0) || left.name.localeCompare(right.name));
  const openCount = general.length + features.reduce((total, feature) => total + feature.items.length, 0);
  return { general, features, openCount };
}

// ---------- Browser wiring (skipped when the pure logic is loaded by unit tests) ----------

const setupChecklistTargets = [];
let setupChecklistFamilies = [];
let setupChecklistLoading = null;

function renderSetupChecklistBadge(count) {
  const button = document.querySelector('[data-view="setup-checklist"]');
  if (!button) return;
  // The count is drawn by CSS and announced as the button's description, so its name stays "Setup checklist".
  if (Number.isInteger(count) && count > 0) {
    button.dataset.count = String(count);
    button.title = `${count} open item${count === 1 ? '' : 's'}`;
  } else {
    delete button.dataset.count;
    button.title = count === 0 ? 'Everything is ready' : '';
  }
}

function renderSetupChecklistItem(item) {
  const index = setupChecklistTargets.push(item.action.target) - 1;
  const details = Array.isArray(item.details) && item.details.length
    ? `<details class="setup-checklist-details"><summary>Show ${item.details.length === 1 ? 'details' : `all ${item.details.length}`}</summary><ul>${item.details.map((detail) => `<li>${safe(detail)}</li>`).join('')}</ul></details>`
    : '';
  // The short summary is shown; the full sentence stays available as a tooltip.
  return `<li class="setup-checklist-item" data-checklist-item="${safe(item.id)}"><span class="setup-checklist-summary" title="${safe(item.text)}">${safe(item.summary || item.text)}</span>${details}<button type="button" class="ghost compact" data-setup-checklist-go="${index}">${safe(item.action.label)}</button></li>`;
}

function renderSetupChecklist(result) {
  const content = byId('setup-checklist-content');
  if (!content) return;
  setupChecklistTargets.length = 0;
  const general = result.general.length
    ? `<article class="setup-checklist-card needs-attention" data-checklist-feature="general"><div class="setup-checklist-card-heading"><h3>Connections and saving</h3><span class="status-chip status-warning">${safe(String(result.general.length))} to do</span></div><ul>${result.general.map(renderSetupChecklistItem).join('')}</ul></article>`
    : '';
  const features = result.features.map((feature) => feature.items.length
    ? `<article class="setup-checklist-card needs-attention" data-checklist-feature="${safe(feature.moduleId)}"><div class="setup-checklist-card-heading"><h3>${safe(feature.name)}</h3><span class="status-chip status-warning">${safe(String(feature.items.length))} to do</span></div><ul>${feature.items.map(renderSetupChecklistItem).join('')}</ul></article>`
    : `<article class="setup-checklist-card is-ready" data-checklist-feature="${safe(feature.moduleId)}"><div class="setup-checklist-card-heading"><h3>${safe(feature.name)}</h3><span class="status-chip status-ready">Ready</span></div><p>Nothing missing.</p></article>`).join('');
  content.innerHTML = general || features
    ? `<div class="setup-checklist-grid">${general}${features}</div>`
    : '<p class="notice">No extensions or add-ons are turned on yet. Turn on the features you want under Extensions, then come back here.</p>';
}

async function loadSetupChecklist() {
  if (setupChecklistLoading) return setupChecklistLoading;
  const status = byId('setup-checklist-state');
  setupChecklistLoading = (async () => {
    status?.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Checking your setup…';
    try {
      const [addOnResult, inspection, readiness, runtime] = await Promise.all([
        api('/wizard/api/addons'),
        inspectStreamerBot().catch(() => null),
        api('/wizard/api/readiness').catch(() => null),
        fetchAddOnRuntimeDiagnostics(),
      ]);
      const actionsAvailable = inspection?.available === true && Array.isArray(inspection.actions);
      // Share the scan with the add-on approval step, exactly as its own automatic scan does.
      if (actionsAvailable && !state.liveActions.length) items('actions', inspection.actions, 'action');
      const addOns = Array.isArray(addOnResult.addOns) ? addOnResult.addOns : [];
      setupChecklistFamilies = Array.isArray(addOnResult.featureFamilies) ? addOnResult.featureFamilies : [];
      const pendingRestart = readAddOnRestartState();
      const restartIsStale = Boolean(pendingRestart.startedAt && runtime?.startedAt && pendingRestart.startedAt !== runtime.startedAt);
      const output = (readiness?.readiness?.outputs || []).find((candidate) => candidate.name === 'streamerbot');
      const result = buildSetupChecklist({
        addOns,
        actions: actionsAvailable ? inspection.actions : null,
        recommendedActionNames: Object.fromEntries(addOns.map((addOn) => [addOn.moduleId, recommendedActionNames(addOn)])),
        platforms: state.overview?.configuration?.platforms || {},
        sceneRoles: savedSceneRoles(),
        restartRequired: (readiness?.configuration || state.overview?.configuration?.activation)?.restartRequired === true,
        restartPendingModuleIds: restartIsStale ? [] : pendingRestart.moduleIds,
        stagedChangeCount: state.draft?.status === 'draft' ? (state.draft.stagedChanges || []).length : 0,
        connections: readiness ? { streamerBot: output?.state || 'unknown', platforms: (readiness.readiness?.adapters || []).filter((adapter) => connectionPlatformNames.has(adapter.name)) } : null,
      });
      renderSetupChecklist(result);
      renderSetupChecklistBadge(result.openCount);
      if (status) status.textContent = result.openCount ? `${result.openCount} thing${result.openCount === 1 ? '' : 's'} left to set up. Each button opens the exact place to fix it; nothing changes until you save there.` : result.features.length ? 'Everything you turned on is ready.' : 'Nothing to check yet.';
      return result;
    } catch (error) {
      renderSetupChecklistBadge(null);
      if (status) status.textContent = `The checklist could not load: ${error.message}. Nothing was changed. Confirm StreamBridge is running, then press Check again.`;
      return null;
    } finally {
      status?.removeAttribute('aria-busy');
      setupChecklistLoading = null;
    }
  })();
  return setupChecklistLoading;
}

function revealSetupChecklistTarget(element) {
  if (!element) return;
  for (let details = element.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (!element.matches('input, select, textarea, button, a[href], [tabindex]')) element.tabIndex = -1;
  element.focus({ preventScroll: true });
}

async function openSetupChecklistTarget(target) {
  if (!target) return;
  if (target.kind === 'panel') {
    if (!activatePanel(target.panel)) return;
    if (target.panel === 'addons' || target.panel === 'addon-marketplace') await loadAddOns();
    if (target.focus) revealSetupChecklistTarget(document.querySelector(`[data-panel="${CSS.escape(target.panel)}"] ${target.focus}`));
    return;
  }
  const extension = setupChecklistFamilies.some((family) => Array.isArray(family.modules) && family.modules.includes(target.moduleId));
  const panel = extension || !document.querySelector('[data-view="addon-marketplace"]') ? 'addons' : 'addon-marketplace';
  state.selectedAddOnId = target.moduleId;
  if (target.tab) rememberAddOnTab(target.moduleId, target.tab);
  activatePanel(panel);
  await loadAddOns();
  const root = document.querySelector(`[data-panel="${panel}"]`);
  if (target.focus) { revealSetupChecklistTarget(root?.querySelector(target.focus)); return; }
  const card = root?.querySelector(`[data-addon-id="${CSS.escape(target.moduleId)}"]`);
  if (!card) return;
  const section = target.section ? card.querySelector(`[data-disclosure-key="${CSS.escape(`addon:${target.moduleId}:${target.section}`)}"]`) : null;
  if (section) section.open = true;
  const field = target.field ? card.querySelector(`[name="${CSS.escape(target.field)}"]`) : null;
  revealSetupChecklistTarget(field || section?.querySelector('summary') || card);
}

if (typeof document !== 'undefined') {
  byId('refresh-setup-checklist')?.addEventListener('click', () => void loadSetupChecklist());
  document.querySelector('[data-view="setup-checklist"]')?.addEventListener('click', () => void loadSetupChecklist());
  byId('setup-checklist-content')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-setup-checklist-go]');
    if (button) void openSetupChecklistTarget(setupChecklistTargets[Number(button.dataset.setupChecklistGo)]);
  });
  document.addEventListener('wizard:authenticated', () => void loadSetupChecklist());
}
