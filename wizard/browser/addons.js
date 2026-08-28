async function fetchAddOnRuntimeDiagnostics() {
  try {
    const response = await fetch('/diagnostics');
    if (!response.ok) throw new Error(`Runtime diagnostics failed (${response.status})`);
    return await response.json();
  } catch {
    return null;
  }
}

function counted(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
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

function prepareExtensionAndAddOnWorkspace() {
  const panel = document.querySelector('[data-panel="addons"]');
  const nav = document.querySelector('[data-view="addons"]');
  if (!panel) return;
  if (nav) nav.textContent = 'Extensions';
  const title = panel.querySelector('.title-row h2');
  const intro = panel.querySelector('.title-row .clamp-text');
  if (title) title.textContent = 'Extensions';
  if (intro) intro.textContent = 'Extensions are included feature groups in StreamBridge. Manage their components here; optional add-ons have a separate installation and maintenance page.';
  const sections = [...panel.querySelectorAll(':scope > section.transaction')];
  const inventoryHeading = sections.find((section) => section.querySelector('#addon-list'))?.querySelector('h3');
  if (inventoryHeading) inventoryHeading.textContent = 'Extension management';
}

function bindViewerFoundationPage() {
  const panel = document.querySelector('[data-panel="viewer-foundation"]');
  const form = panel?.querySelector('[data-addon-settings="thsv.viewer-foundation"]');
  if (form) {
    form.addEventListener('submit', saveAddOnSettings);
    form.querySelectorAll('[data-addon-sections]').forEach((button) => button.addEventListener('click', () => {
      const open = button.dataset.addonSections === 'expand';
      form.querySelectorAll('.addon-settings-section').forEach((section) => { section.open = open; });
    }));
    form.addEventListener('change', () => updateAddOnFieldVisibility(form));
    updateAddOnFieldVisibility(form);
  }
  panel?.querySelector('[data-viewer-admin-status]')?.addEventListener('click', refreshViewerFoundationStatus);
  panel?.querySelector('[data-viewer-admin-audit]')?.addEventListener('click', refreshViewerFoundationAudit);
  panel?.querySelector('[data-viewer-search-id-form]')?.addEventListener('submit', searchViewerFoundationId);
  panel?.querySelector('[data-viewer-search-account-form]')?.addEventListener('submit', searchViewerFoundationAccount);
  panel?.querySelector('[data-viewer-link-form]')?.addEventListener('submit', addViewerFoundationLink);
  panel?.querySelectorAll('[data-viewer-link-remove]').forEach((button) => button.addEventListener('click', removeViewerFoundationLink));
  panel?.querySelector('[data-viewer-export-form]')?.addEventListener('submit', exportViewerFoundationRecord);
  panel?.querySelector('[data-viewer-correction-form]')?.addEventListener('submit', correctViewerFoundationRecord);
  panel?.querySelector('[data-viewer-undo-form]')?.addEventListener('submit', undoViewerFoundationCorrection);
  panel?.querySelector('[data-viewer-delete-form]')?.addEventListener('submit', deleteViewerFoundationRecord);
  panel?.querySelector('[data-viewer-migration-preview]')?.addEventListener('click', previewViewerFoundationMigration);
  panel?.querySelector('[data-viewer-migration-apply]')?.addEventListener('click', applyViewerFoundationMigration);
}

function renderViewerFoundationPage() {
  const content = byId('viewer-foundation-content');
  const integration = state.viewerFoundation;
  if (!content) return;
  if (!integration) { content.innerHTML = '<p class="notice">Viewer Foundation information is unavailable. Refresh after confirming StreamBridge is running.</p>'; return; }
  const fields = renderAddOnSettings(integration);
  const settingsIntro = typeof integration.settingsUi?.intro === 'string' && integration.settingsUi.intro.trim()
    ? integration.settingsUi.intro : 'Choose how viewer identity, activity, progression, and commands work across the Bridge.';
  content.innerHTML = `<article class="item addon-card viewer-foundation-integration"><div class="addon-card-header"><div><p class="addon-kicker">Required Bridge integration</p><h3>${safe(integration.name)} <small>${safe(integration.version)}</small></h3><p class="addon-version">Installed and updated with THSV StreamBridge</p></div><div class="addon-card-status"><span class="status-chip status-ready">Always installed</span>${renderAddOnRuntimeStatus(integration)}</div></div><p class="addon-description">${safe(integration.description)}</p><div class="foundation-principles"><span><strong>One identity</strong><small>Stable account IDs across enabled platforms</small></span><span><strong>One balance</strong><small>Shared points authority for Bridge features</small></span><span><strong>Private by design</strong><small>No chat text, display names, avatars, or OAuth data</small></span></div><details class="form-section addon-settings-shell addon-step" data-disclosure-key="integration:viewer-foundation:settings" open><summary><span><strong>Foundation settings</strong><small>Configure the shared identity and progression rules used throughout StreamBridge.</small></span></summary><form class="addon-settings" data-addon-settings="thsv.viewer-foundation"><div class="addon-settings-heading"><p class="addon-settings-intro">${safe(settingsIntro)}</p><div class="button-row"><button type="button" class="ghost compact" data-addon-sections="expand">Expand all</button><button type="button" class="ghost compact" data-addon-sections="collapse">Collapse all</button></div></div>${fields}<div class="addon-settings-save"><button type="submit">Save foundation settings</button><small>Settings and existing viewer data are preserved. Restart StreamBridge once to apply changes.</small></div></form></details>${renderViewerFoundationAdmin(integration)}</article>`;
  restoreDisclosureStates(content);
  bindViewerFoundationPage();
}

async function loadViewerFoundation() {
  const status = byId('viewer-foundation-state');
  if (!status) return;
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Loading the built-in viewer foundation…';
  try {
    const result = await api('/wizard/api/viewer-foundation');
    state.viewerFoundation = result.integration;
    renderViewerFoundationPage();
    status.textContent = 'Viewer Foundation is installed with StreamBridge. Existing points, links, privacy history, and command settings are preserved.';
  } catch (error) {
    state.viewerFoundation = null;
    renderViewerFoundationPage();
    status.textContent = `Viewer Foundation is unavailable: ${error.message}`;
  } finally { status.removeAttribute('aria-busy'); }
}

function bindCommunityAnalyticsPage() {
  const panel = document.querySelector('[data-panel="community-analytics"]');
  const form = panel?.querySelector('[data-addon-settings="thsv.community-analytics"]');
  if (form) {
    form.addEventListener('submit', saveAddOnSettings);
    form.querySelectorAll('[data-addon-sections]').forEach((button) => button.addEventListener('click', () => {
      const open = button.dataset.addonSections === 'expand';
      form.querySelectorAll('.addon-settings-section').forEach((section) => { section.open = open; });
    }));
    form.addEventListener('change', () => updateAddOnFieldVisibility(form));
    updateAddOnFieldVisibility(form);
  }
  panel?.querySelector('[data-analytics-admin-status]')?.addEventListener('click', refreshCommunityAnalyticsStatus);
  panel?.querySelector('[data-analytics-export-form]')?.addEventListener('submit', exportCommunityAnalyticsRecord);
  panel?.querySelector('[data-analytics-delete-form]')?.addEventListener('submit', deleteCommunityAnalyticsRecord);
  panel?.querySelectorAll('[data-analytics-report]').forEach((button) => button.addEventListener('click', downloadCommunityAnalyticsReport));
  if (panel?.querySelector('[data-analytics-admin-output]')) void refreshCommunityAnalyticsStatus();
}

function renderCommunityAnalyticsPage() {
  const content = byId('community-analytics-content');
  const integration = state.communityAnalytics;
  if (!content) return;
  if (!integration) { content.innerHTML = '<p class="notice">Community Analytics information is unavailable. Refresh after confirming StreamBridge is running.</p>'; return; }
  const fields = renderAddOnSettings(integration);
  const settingsIntro = typeof integration.settingsUi?.intro === 'string' && integration.settingsUi.intro.trim()
    ? integration.settingsUi.intro : 'Choose which private cross-platform activity is counted and retained locally.';
  content.innerHTML = `<article class="item addon-card community-analytics-integration"><div class="addon-card-header"><div><p class="addon-kicker">Built-in Bridge integration</p><h3>${safe(integration.name)} <small>${safe(integration.version)}</small></h3><p class="addon-version">Installed and updated with THSV StreamBridge</p></div><div class="addon-card-status"><span class="status-chip status-ready">Always installed</span>${renderAddOnRuntimeStatus(integration)}</div></div><p class="addon-description">${safe(integration.description)}</p><div class="foundation-principles"><span><strong>Private counts</strong><small>No names, chat text, avatars, or financial amounts</small></span><span><strong>Shared insight</strong><small>Viewer Spotlight and future features use one provider</small></span><span><strong>Bounded history</strong><small>Automatic limits prevent unbounded local growth</small></span></div><details class="form-section addon-settings-shell addon-step" data-disclosure-key="integration:community-analytics:settings" open><summary><span><strong>Analytics settings</strong><small>Configure the private activity and retention rules shared throughout StreamBridge.</small></span></summary><form class="addon-settings" data-addon-settings="thsv.community-analytics"><div class="addon-settings-heading"><p class="addon-settings-intro">${safe(settingsIntro)}</p><div class="button-row"><button type="button" class="ghost compact" data-addon-sections="expand">Expand all</button><button type="button" class="ghost compact" data-addon-sections="collapse">Collapse all</button></div></div>${fields}<div class="addon-settings-save"><button type="submit">Save analytics settings</button><small>Existing private history stays preserved. Restart StreamBridge once to apply changes.</small></div></form></details>${renderCommunityAnalyticsAdmin(integration)}</article>`;
  restoreDisclosureStates(content);
  bindCommunityAnalyticsPage();
}

async function loadCommunityAnalytics() {
  const status = byId('community-analytics-state');
  if (!status) return;
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Loading built-in Community Analytics…';
  try {
    const result = await api('/wizard/api/community-analytics');
    state.communityAnalytics = result.integration;
    renderCommunityAnalyticsPage();
    status.textContent = 'Community Analytics is installed with StreamBridge. Existing private counters, sessions, exclusions, and reports are preserved.';
  } catch (error) {
    state.communityAnalytics = null;
    renderCommunityAnalyticsPage();
    status.textContent = `Community Analytics is unavailable: ${error.message}`;
  } finally { status.removeAttribute('aria-busy'); }
}

function bindKofiDonationsIntegration() {
  const content = byId('kofi-integration-content');
  const form = content?.querySelector('[data-addon-settings="thsv.kofi-donations"]');
  if (!form) return;
  form.addEventListener('submit', saveAddOnSettings);
  form.querySelectorAll('[data-addon-sections]').forEach((button) => button.addEventListener('click', () => {
    const open = button.dataset.addonSections === 'expand';
    form.querySelectorAll('.addon-settings-section').forEach((section) => { section.open = open; });
  }));
  form.addEventListener('change', () => updateAddOnFieldVisibility(form));
  updateAddOnFieldVisibility(form);
}

function renderKofiDonationsIntegration() {
  const content = byId('kofi-integration-content');
  const integration = state.kofiDonations;
  if (!content) return;
  if (!integration) { content.innerHTML = '<p class="notice">Ko-fi provider information is unavailable. Refresh after confirming StreamBridge is running.</p>'; return; }
  const fields = renderAddOnSettings(integration);
  const settingsIntro = typeof integration.settingsUi?.intro === 'string' && integration.settingsUi.intro.trim()
    ? integration.settingsUi.intro : 'Connect Ko-fi through Streamer.bot, then choose the public information its alerts may display.';
  const enabled = integration.settings?.enabled === true;
  content.innerHTML = `<article class="item addon-card kofi-donations-integration"><div class="addon-card-header"><div><p class="addon-kicker">Built-in donation provider</p><h3>${safe(integration.name)} <small>${safe(integration.version)}</small></h3><p class="addon-version">Installed and updated with THSV StreamBridge</p></div><div class="addon-card-status"><span class="status-chip ${enabled ? 'status-ready' : 'status-neutral'}">${enabled ? 'Intake enabled' : 'Intake off'}</span>${renderAddOnRuntimeStatus(integration)}</div></div><p class="addon-description">${safe(integration.description)}</p><details class="form-section addon-settings-shell addon-step" data-disclosure-key="integration:kofi-donations:settings" open><summary><span><strong>Ko-fi connection and privacy</strong><small>Enable intake only after Streamer.bot has received the verified Ko-fi webhook.</small></span></summary><form class="addon-settings" data-addon-settings="thsv.kofi-donations"><div class="addon-settings-heading"><p class="addon-settings-intro">${safe(settingsIntro)}</p><div class="button-row"><button type="button" class="ghost compact" data-addon-sections="expand">Expand all</button><button type="button" class="ghost compact" data-addon-sections="collapse">Collapse all</button></div></div>${fields}<div class="addon-settings-save"><button type="submit">Save Ko-fi provider settings</button><small>The verification token remains in Streamer.bot. Restart StreamBridge once to apply changes.</small></div></form></details></article>`;
  restoreDisclosureStates(content);
  bindKofiDonationsIntegration();
}

async function loadKofiDonationsIntegration() {
  const content = byId('kofi-integration-content');
  if (!content) return;
  try {
    const result = await api('/wizard/api/kofi-donations');
    state.kofiDonations = result.integration;
  } catch {
    state.kofiDonations = null;
  }
  renderKofiDonationsIntegration();
}

async function loadAddOns() {
  prepareExtensionAndAddOnWorkspace();
  const status = byId('addon-state');
  const marketplaceStatus = byId('addon-marketplace-state');
  status.setAttribute('aria-busy', 'true');
  status.textContent = 'Verifying installed add-ons...';
  marketplaceStatus?.setAttribute('aria-busy', 'true');
  if (marketplaceStatus) marketplaceStatus.textContent = 'Verifying optional add-ons...';
  try {
    const [result, runtime, sceneCatalog] = await Promise.all([
      api('/wizard/api/addons'),
      fetchAddOnRuntimeDiagnostics(),
      api('/wizard/api/scene-catalog').catch(() => null),
    ]);
    state.sceneCatalog = sceneCatalog;
    let acceptanceResult = { acceptance: {} };
    try { acceptanceResult = await api('/wizard/api/addons/acceptance'); }
    catch (error) {
      // A 2.5 wizard can be hot-updated over a 2.4 service. Inventory and settings remain usable;
      // only the newer creator-facing acceptance ledger stays unavailable until the core updates.
      if (!/not found/iu.test(String(error?.message || error))) throw error;
    }
    state.addOns = result.addOns;
    if (typeof setOverlaySetupInventory === 'function') setOverlaySetupInventory(state.addOns);
    state.addOnFeatureFamilies = Array.isArray(result.featureFamilies) ? result.featureFamilies : Array.isArray(runtime?.mainFeatures?.catalog) ? runtime.mainFeatures.catalog : [];
    state.featureMigrations = Array.isArray(result.featureMigrations) ? result.featureMigrations : [];
    state.addOnRuntime = runtime;
    const activatedModuleIds = syncAddOnRestartState(runtime?.startedAt);
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
    void refreshSceneCatalogOnOpen();
    renderDiscoveredAddOns();
    renderTrustedPublishers();
    const pending = state.addOnRestartRequiredIds.size;
    const runtimeSummary = runtime ? `${runtime.ready ? 'Runtime ready' : 'Runtime needs attention'}; ${counted(runtime.browserOverlay?.clients || 0, 'shared overlay client')} connected.` : 'Runtime diagnostics are unavailable; saved settings remain usable.';
    const managed = managedExtensionIds();
    const extensionCount = state.addOns.filter((addOn) => managed.has(addOn.moduleId)).length;
    const installedAddOnCount = state.addOns.length - extensionCount;
    status.textContent = `${counted(state.addOnFeatureFamilies.length, 'built-in extension group')} use ${counted(extensionCount, 'installed component package')}. ${counted(installedAddOnCount, 'optional add-on')} installed; ${counted(state.discoveredAddOns.length, 'package')} awaiting review. ${runtimeSummary}${pending ? ` Restart StreamBridge to apply ${counted(pending, 'pending component change')}.` : ''}`;
    if (marketplaceStatus) marketplaceStatus.textContent = `${counted(installedAddOnCount, 'optional add-on')} installed; ${counted(state.discoveredAddOns.length, 'package')} awaiting review. ${runtimeSummary}${pending ? ` Restart StreamBridge to apply ${counted(pending, 'pending package change')}.` : ''}`;
    if (activatedModuleIds.length > 0) void verifyActivatedAddOnChanges(activatedModuleIds);
  } catch (error) {
    state.addOns = [];
    state.addOnFeatureFamilies = [];
    state.featureMigrations = [];
    state.discoveredAddOns = [];
    state.addOnRuntime = null;
    renderAddOns();
    renderDiscoveredAddOns();
    status.textContent = `Inventory unavailable: ${error.message}. Nothing was changed. Confirm StreamBridge is running, then press Refresh.`;
    if (marketplaceStatus) marketplaceStatus.textContent = status.textContent;
  } finally {
    status.removeAttribute('aria-busy');
    marketplaceStatus?.removeAttribute('aria-busy');
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
    return pending.moduleIds;
  }
  state.addOnRestartRequiredIds = new Set(pending.moduleIds);
  return [];
}

async function verifyActivatedAddOnChanges(moduleIds) {
  try {
    const result = await api('/wizard/api/preflight');
    const actionIssues = (result.addOnActionReadiness?.actions || []).filter((item) => moduleIds.includes(item.moduleId) && !item.ready);
    const sceneIssues = (result.sceneConfiguration?.checks || []).filter((item) => moduleIds.includes(item.moduleId) && !item.ready);
    const ready = actionIssues.length === 0 && sceneIssues.length === 0;
    reportAddOnFeedback(ready
      ? `Applied and verified ${moduleIds.length} changed feature${moduleIds.length === 1 ? '' : 's'} without sending visible overlay, chat, raid, ad, or broadcast commands.`
      : `Changes are active, but verification found ${actionIssues.length} action issue${actionIssues.length === 1 ? '' : 's'} and ${sceneIssues.length} scene issue${sceneIssues.length === 1 ? '' : 's'}. Open Test & finish before streaming.`, ready ? 'success' : 'warning');
  } catch (error) { reportAddOnFeedback(`Changes are active, but the post-restart verification could not finish: ${error.message}`, 'warning'); }
}

function markAddOnRestartRequired(moduleId) {
  state.addOnRestartRequiredIds.add(moduleId);
  sessionStorage.setItem(ADD_ON_RESTART_STORAGE_KEY, JSON.stringify({
    startedAt: state.addOnRuntime?.startedAt || readAddOnRestartState().startedAt || '',
    moduleIds: [...state.addOnRestartRequiredIds],
  }));
}

function renderPendingAddOnChanges() {
  if (state.addOnRestartRequiredIds.size === 0) return '';
  const affected = [...state.addOnRestartRequiredIds].map((moduleId) => state.addOns.find((item) => item.moduleId === moduleId)?.name || moduleId);
  return `<section class="notice addon-pending-activation" role="status"><strong>Restart required</strong><p>Saved changes are waiting for: ${affected.map(safe).join(', ')}. The active runtime and your current settings stay unchanged until an offline restart.</p><button type="button" data-apply-addon-changes>Apply changes and verify</button></section>`;
}

function reportAddOnFeedback(message, kind = 'success', button) {
  const status = button?.closest?.('[data-panel="viewer-foundation"]') ? byId('viewer-foundation-state') : byId('addon-state');
  if (status) status.textContent = message;
  const marketplaceStatus = byId('addon-marketplace-state');
  if (marketplaceStatus) marketplaceStatus.textContent = message;
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
  byId('update-all-compatible-addons')?.classList.add('hidden');
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
    ? `<div class="button-row"><button type="button" class="compact" data-install-addon-update="${safe(update.moduleId)}" data-install-addon-version="${safe(update.latestVersion)}">Update safely</button><button type="button" class="ghost compact" data-stage-addon-update="${safe(update.moduleId)}" data-stage-addon-version="${safe(update.latestVersion)}">Download for review</button></div><small><strong>Update safely</strong> verifies both release layers, publisher identity, compatibility, and package hashes before replacing only this component's code. Saved settings and private state remain intact; restart StreamBridge once after all chosen updates. Download for review keeps the two-step inbox workflow.</small>`
    : '';
  return `<div class="notice addon-update-result" data-addon-update-state="${safe(update.state)}"><strong>${safe(labels[update.state] || update.state)}.</strong>${safe(version + warning)}${archive}${checksum}${download}</div>`;
}

function renderAddOnField(name, schema, value, ui = {}) {
  const type = schema.type;
  const label = safe(schema.title || name);
  const help = schema.description ? `<small>${safe(schema.description)}</small>` : '';
  const visualTarget = addOnVisualSettingTarget(name, schema);
  const visualHelp = visualTarget ? `<small class="overlay-field-target"><span aria-hidden="true">&#9678;</span><strong>Overlay area:</strong> ${safe(visualTarget)}</small>` : '';
  const fullRow = type === 'array' || schema.format === 'multiline' || ui.fullRow === true;
  const wrapper = (content) => `<div class="addon-setting ${fullRow ? 'full-row' : ''}${visualTarget ? ' overlay-visual-setting' : ''}"${visualTarget ? ` data-overlay-visual-target="${safe(visualTarget)}"` : ''}${addOnVisibilityAttributes(ui)}>${content}${visualHelp}</div>`;
  if (ui.control === 'scene-mappings') return wrapper(renderSceneMappingEditor(name, value, help));
  if (ui.control === 'scene-list') return wrapper(renderSceneListPicker(name, label, value, help));
  if (ui.control === 'scene-name') return wrapper(renderSceneNamePicker(name, label, value, help, ui));
  if (ui.control === 'streamerbot-action') return wrapper(`<label>${label}<select name="${safe(name)}">${inspectedActionOptions(value || '')}</select>${help}<small>Refresh Streamer.bot actions first. The selected action must also be approved in this add-on's action-grants section.</small></label>`);
  if (type === 'array' && Array.isArray(schema.items?.enum)) {
    const selected = new Set(Array.isArray(value) ? value : []);
    return wrapper(`<fieldset class="addon-choice-field"><legend>${label}</legend><div class="addon-choice-grid">${schema.items.enum.map((entry) => `<label class="addon-choice"><input name="${safe(name)}" type="checkbox" value="${safe(entry)}" data-addon-enum-list="true" ${selected.has(entry) ? 'checked' : ''}><span>${safe(ui.labels?.[entry] || addOnOptionLabel(entry))}</span></label>`).join('')}</div>${help}</fieldset>`);
  }
  if (Array.isArray(schema.enum)) {
    const entries = ['autoStartProvider', 'endBroadcastProvider'].includes(name) ? schema.enum.filter((entry) => enabledSceneProviders(value).includes(entry)) : schema.enum;
    return wrapper(`<label>${label}<select name="${safe(name)}">${entries.map((entry) => `<option value="${safe(entry)}" ${entry === value ? 'selected' : ''}>${safe(ui.labels?.[entry] || addOnOptionLabel(entry))}</option>`).join('')}</select>${help}</label>`);
  }
  if (type === 'boolean') return wrapper(`<label class="addon-toggle"><span><strong>${label}</strong>${help}</span><input name="${safe(name)}" type="checkbox" role="switch" ${value === true ? 'checked' : ''}><i aria-hidden="true"></i></label>`);
  if (type === 'number' || type === 'integer') return wrapper(`<label>${label}<input name="${safe(name)}" type="number" ${type === 'integer' ? 'step="1"' : 'step="any"'} value="${safe(value ?? '')}" ${Number.isFinite(schema.minimum) ? `min="${safe(schema.minimum)}"` : ''} ${Number.isFinite(schema.maximum) ? `max="${safe(schema.maximum)}"` : ''}>${help}</label>`);
  if (type === 'array') return wrapper(`<label>${label}<textarea name="${safe(name)}" rows="${safe(Number.isInteger(ui.rows) ? ui.rows : 4)}" data-addon-string-list="true" placeholder="One item per line">${safe(Array.isArray(value) ? value.join('\n') : '')}</textarea>${help}<small>Enter one item per line. Empty and duplicate entries are rejected.</small></label>`);
  if (schema.format === 'multiline') return wrapper(`<label>${label}<textarea name="${safe(name)}" rows="${safe(Number.isInteger(ui.rows) ? ui.rows : 4)}" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 2000)}">${safe(value ?? '')}</textarea>${help}</label>`);
  if (schema.format === 'color') return wrapper(`<label>${label}<input name="${safe(name)}" type="color" value="${safe(value || '#6f42c1')}">${help}</label>`);
  return wrapper(`<label>${label}<input name="${safe(name)}" type="text" value="${safe(value ?? '')}" maxlength="${safe(Number.isInteger(schema.maxLength) ? schema.maxLength : 500)}">${help}</label>`);
}

async function refreshSceneCatalogOnOpen() {
  if (state.sceneCatalogRefreshRequested || state.sceneCatalog?.refreshAvailable !== true) return;
  state.sceneCatalogRefreshRequested = true;
  try {
    await api('/wizard/api/scene-catalog/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'obs', connectionIndex: 0 }) });
    await new Promise((resolve) => setTimeout(resolve, 500));
    state.sceneCatalog = await api('/wizard/api/scene-catalog'); populateSceneCatalogControls(document);
  } catch { /* Existing observations and manual entry remain available. */ }
}

const sceneProviderLabels = { obs: 'OBS Studio', streamlabs: 'Streamlabs Desktop', meld: 'Meld Studio' };
function decorativeSceneName(scene){const compact=String(scene).replace(/[\s\d._-]/gu,'');return compact.length>0&&/^[━─═—–│┃┄┅┈┉┊┋┌┐└┘├┤┬┴┼]+$/u.test(compact)}
function currentScenes(provider){return new Set((state.sceneCatalog?.providers?.[provider]?.connections||[]).map((connection)=>connection.currentScene).filter(Boolean))}
function catalogScenes(provider) { return (Array.isArray(state.sceneCatalog?.providers?.[provider]?.scenes) ? state.sceneCatalog.providers[provider].scenes : []).filter((scene)=>!decorativeSceneName(scene)); }
function categorizedScenes(provider,selected='',query=''){const current=currentScenes(provider);const normalized=query.trim().toLocaleLowerCase();const groups={Current:[],Used:[],Likely:[],Other:[]};for(const scene of catalogScenes(provider)){if(normalized&&!scene.toLocaleLowerCase().includes(normalized))continue;const group=current.has(scene)?'Current':scene===selected?'Used':/(start|soon|brb|break|end|raid|game|chat|ad|countdown)/iu.test(scene)?'Likely':'Other';groups[group].push(scene)}return groups}
function catalogSceneOptions(provider, selected = '',query='') { const groups=categorizedScenes(provider,selected,query);const count=Object.values(groups).flat().length;return `<option value="">${count ? 'Choose a detected scene…' : query?'No matching scenes':'No scenes detected yet'}</option>${Object.entries(groups).filter(([,scenes])=>scenes.length).map(([label,scenes])=>`<optgroup label="${label}">${scenes.map((scene)=>`<option value="${safe(scene)}" ${scene === selected ? 'selected' : ''}>${safe(scene)}</option>`).join('')}</optgroup>`).join('')}`; }
function enabledSceneProviders(selected = '') {
  const enabled = new Set(['obs', selected]);
  for (const connection of state.broadcastConnections?.connections || []) if (connection.enabled === true) enabled.add(connection.provider);
  return [...enabled].filter((provider) => sceneProviderLabels[provider]);
}
function sceneProviderOptions(selected = 'obs') { return enabledSceneProviders(selected).map((provider) => `<option value="${provider}" ${provider === selected ? 'selected' : ''}>${sceneProviderLabels[provider]}</option>`).join(''); }
function renderSceneListPicker(name, label, value, help) {
  return `<fieldset class="scene-catalog-picker" data-scene-list-picker><legend>${label}</legend><textarea name="${safe(name)}" rows="4" data-addon-string-list="true" placeholder="One exact scene name per line">${safe(Array.isArray(value) ? value.join('\n') : '')}</textarea>${help}<div class="scene-catalog-controls"><label>Broadcast app<select data-scene-catalog-provider>${sceneProviderOptions()}</select></label><label>Detected scene<select data-scene-catalog-select>${catalogSceneOptions('obs')}</select></label><button type="button" class="ghost compact" data-add-catalog-scene>Add scene</button><button type="button" class="ghost compact" data-refresh-scene-catalog>Refresh scenes</button></div><small data-scene-catalog-status>Manual entry stays available. OBS supports a full read-only refresh; Meld and Streamlabs learn exact names as scene changes are observed.</small></fieldset>`;
}
function renderSceneNamePicker(name, label, value, help, ui) {
  return `<fieldset class="scene-name-picker" data-scene-name-picker><legend>${label}</legend><label>Filter list<input type="search" data-scene-catalog-search placeholder="Search current, used, likely, or other scenes"></label><label>Detected scene<select data-scene-catalog-select>${catalogSceneOptions('obs', value ?? '')}</select></label><label>Exact scene name<input name="${safe(name)}" type="text" value="${safe(value ?? '')}" maxlength="500" data-scene-name-input data-provider-field="${safe(ui.providerField || '')}"></label>${help}<span class="button-row"><button type="button" class="ghost compact" data-refresh-scene-catalog>Refresh scenes</button></span><small data-scene-catalog-status>Select a categorized exact name above, or keep the manual value for a scene that has not been observed yet. Decorative separators are hidden.</small></fieldset>`;
}
function providerForSceneInput(input) {
  const form = input.closest('form'); const providerField = input.dataset.providerField;
  return (providerField && form?.elements.namedItem(providerField)?.value) || input.closest('[data-scene-mapping-row]')?.querySelector('[data-scene-mapping-field="provider"]')?.value || 'obs';
}
function populateSceneCatalogControls(root = document) {
  root.querySelectorAll('[data-scene-list-picker]').forEach((picker) => { const provider = picker.querySelector('[data-scene-catalog-provider]').value; picker.querySelector('[data-scene-catalog-select]').innerHTML = catalogSceneOptions(provider); });
  root.querySelectorAll('[data-scene-name-input]').forEach((input) => { const picker = input.closest('[data-scene-name-picker]'); const select = picker?.querySelector('[data-scene-catalog-select]'); const query=picker?.querySelector('[data-scene-catalog-search]')?.value||'';if (select) select.innerHTML = catalogSceneOptions(providerForSceneInput(input), input.value,query); });
}
async function refreshSceneCatalog(button) {
  const picker = button.closest('[data-scene-list-picker]'); const input = button.closest('label')?.querySelector('[data-scene-name-input]');
  const provider = picker?.querySelector('[data-scene-catalog-provider]')?.value || (input ? providerForSceneInput(input) : 'obs');
  const status = button.closest('.addon-setting, [data-scene-mapping-row]')?.querySelector('[data-scene-catalog-status]');
  button.disabled = true; if (status) status.textContent = `Requesting ${sceneProviderLabels[provider]} scenes without changing the active scene…`;
  try {
    await api('/wizard/api/scene-catalog/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, connectionIndex: 0 }) });
    await new Promise((resolve) => setTimeout(resolve, 500));
    state.sceneCatalog = await api('/wizard/api/scene-catalog'); populateSceneCatalogControls(button.closest('form') || document);
    const count = catalogScenes(provider).length; if (status) status.textContent = `${count} exact ${sceneProviderLabels[provider]} scene name${count === 1 ? '' : 's'} available. Manual entry remains available.`;
  } catch (error) { if (status) status.textContent = `${error.message} Previously detected scenes and manual entry are unchanged.`; }
  finally { button.disabled = false; }
}
function attachSceneCatalogPickers(form) {
  form.querySelectorAll('[data-scene-catalog-search]:not([data-scene-catalog-attached])').forEach((input)=>{input.dataset.sceneCatalogAttached='true';input.addEventListener('input',()=>populateSceneCatalogControls(form))});
  form.querySelectorAll('[data-scene-catalog-provider]:not([data-scene-catalog-attached])').forEach((select) => { select.dataset.sceneCatalogAttached = 'true'; select.addEventListener('change', () => populateSceneCatalogControls(form)); });
  form.querySelectorAll('[data-scene-name-picker] [data-scene-catalog-select]:not([data-scene-catalog-attached])').forEach((select) => { select.dataset.sceneCatalogAttached = 'true'; select.addEventListener('change', () => { const input = select.closest('[data-scene-name-picker]')?.querySelector('[data-scene-name-input]'); if (!input || !select.value) return; input.value = select.value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }); });
  form.querySelectorAll('[data-refresh-scene-catalog]:not([data-scene-catalog-attached])').forEach((button) => { button.dataset.sceneCatalogAttached = 'true'; button.addEventListener('click', () => refreshSceneCatalog(button)); });
  form.querySelectorAll('[data-add-catalog-scene]:not([data-scene-catalog-attached])').forEach((button) => { button.dataset.sceneCatalogAttached = 'true'; button.addEventListener('click', () => {
    const picker = button.closest('[data-scene-list-picker]'); const selected = picker.querySelector('[data-scene-catalog-select]').value; const textarea = picker.querySelector('textarea'); if (!selected) return;
    const values = textarea.value.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean); if (!values.includes(selected)) textarea.value = [...values, selected].join('\n'); textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }); });
  if (form.dataset.sceneCatalogChangeAttached !== 'true') { form.dataset.sceneCatalogChangeAttached = 'true'; form.addEventListener('change', (event) => { if (event.target.matches('[data-scene-mapping-field="provider"]') || form.querySelector(`[data-provider-field="${CSS.escape(event.target.name || '')}"]`)) populateSceneCatalogControls(form); }); }
  populateSceneCatalogControls(form);
}

function addOnVisualSettingTarget(name, schema = {}) {
  const normalized = String(name).toLocaleLowerCase();
  const exact = {
    watercolor: 'Water fill inside the bottle or glass',
    waterhighlightcolor: 'Water surface, wave, and bubble highlights',
    warningcolor: 'Warning state, countdown emphasis, and warning badge',
    criticalcolor: 'Final countdown and critical-status emphasis',
    livecolor: 'Live state badge and active status accent',
    bordercolor: 'Outer card border and divider lines',
    overlaybordercolor: 'Outer card border and divider lines',
    overlaybackgroundcolor: 'Main overlay card background',
    backgroundcolor: 'Main overlay card background',
    overlaybackgroundopacity: 'Transparency of the main overlay card background',
    backgroundopacity: 'Transparency of the main overlay card background',
    overlayaccentcolor: 'Borders, progress bars, badges, and highlighted details',
    accentcolor: 'Borders, progress bars, badges, and highlighted details',
    overlaytextcolor: 'Primary headings, names, timers, and numbers',
    textcolor: 'Primary headings, names, timers, and numbers',
    overlaymutedcolor: 'Secondary labels, captions, and supporting text',
    mutedcolor: 'Secondary labels, captions, and supporting text',
    overlayfontfamily: 'All text in this overlay',
    fontfamily: 'All text in this overlay',
    overlayfontsize: 'Primary overlay text size',
    fontsize: 'Primary overlay text size',
    containerstyle: 'Shape of the main visual container',
    backgroundmode: 'Background treatment behind the overlay content',
    overlaybackgroundmode: 'Background treatment behind the overlay content',
    layout: 'Arrangement of the overlay content',
    alignment: 'Position and alignment of the overlay content',
    textalignment: 'Alignment of headings, names, and supporting text',
    shownumbers: 'Water total, goal, and percentage numbers',
    shownextreminder: 'Next-reminder status line',
    showprogress: 'Progress bar and completion amount',
  };
  if (exact[normalized]) return exact[normalized];
  if (/background.*color|color.*background/u.test(normalized)) return 'Background of the matching card, panel, or surface';
  if (/accent.*color|color.*accent/u.test(normalized)) return 'Matching borders, badges, progress, and highlighted details';
  if (/title.*color|heading.*color/u.test(normalized)) return 'Title and heading text';
  if (/text.*color|color.*text/u.test(normalized)) return 'Matching text in the rendered overlay';
  if (/border.*color|outline.*color/u.test(normalized)) return 'Matching border or outline';
  if (/progress.*color/u.test(normalized)) return 'Progress bar or completion indicator';
  if (schema.format === 'color') return `${String(schema.title || name)} elements in the rendered overlay`;
  if (/opacity/u.test(normalized)) return 'Transparency of the matching overlay surface';
  if (/font.*size|size.*font/u.test(normalized)) return 'Size of the matching overlay text';
  if (/font/u.test(normalized)) return 'Typography used by the rendered overlay';
  if (/color/u.test(normalized)) return 'The matching color in the rendered overlay';
  return '';
}

function addOnSupportsVisualEditor(addOn) {
  if (!addOn.enabled || addOn.health !== 'installed' || !addOn.permissions?.includes('overlay.publish')) return false;
  return orderedAddOnProperties(addOn).some(([name, schema]) => Boolean(addOnVisualSettingTarget(name, schema)));
}

function renderAddOnVisualEditor(addOn) {
  if (!addOnSupportsVisualEditor(addOn)) return '';
  const overlayPath = ADD_ON_OVERLAY_PATHS[addOn.moduleId] || `/overlay/addons/${addOn.moduleId}`;
  const portrait = ['thsv.village-hydration-station', 'thsv.viewer-spotlight'].includes(addOn.moduleId);
  return `<section class="overlay-live-editor${portrait ? ' is-portrait' : ''}" data-overlay-live-editor="${safe(addOn.moduleId)}"><div class="overlay-editor-heading"><div><span class="preview-label">Live appearance editor</span><strong>See each change on the real overlay</strong><small>Draft preview only. Nothing is saved, staged, or sent to OBS until you use the controls below.</small></div><span class="status-chip status-neutral" data-overlay-draft-state>Loading preview...</span></div><div class="overlay-editor-frame-shell"><iframe data-overlay-editor-frame="${safe(addOn.moduleId)}" title="${safe(addOn.name)} appearance preview" src="${safe(overlayPath)}?editor=wizard" loading="eager"></iframe></div><p class="overlay-editor-note"><strong>Tip:</strong> fields marked <span aria-hidden="true">&#9678;</span> name the exact overlay area they control. Change a value to update this preview immediately, then choose <strong>Save all settings</strong> when it looks right.</p></section>`;
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
  return `<article class="scene-mapping-row" data-scene-mapping-row data-scene-mapping-id="${safe(id)}"><div class="title-row"><label class="addon-toggle"><span><strong>Mapping enabled</strong></span><input type="checkbox" role="switch" data-scene-mapping-field="enabled" ${mapping.enabled !== false ? 'checked' : ''}><i aria-hidden="true"></i></label><button type="button" class="danger ghost" data-remove-scene-mapping>Remove</button></div><div class="scene-mapping-grid"><label>Provider<select data-scene-mapping-field="provider"><option value="obs" ${provider === 'obs' ? 'selected' : ''}>OBS Studio</option><option value="streamlabs" ${provider === 'streamlabs' ? 'selected' : ''}>Streamlabs Desktop</option><option value="meld" ${provider === 'meld' ? 'selected' : ''}>Meld Studio</option></select></label><label>Exact scene name<input type="text" maxlength="256" required data-scene-mapping-field="sceneName" data-scene-name-input value="${safe(mapping.sceneName || '')}" placeholder="Starting Soon" list="scene-mapping-catalog-${safe(id)}"><datalist id="scene-mapping-catalog-${safe(id)}" data-scene-catalog-list>${catalogScenes(provider).map((scene) => `<option value="${safe(scene)}"></option>`).join('')}</datalist><span class="button-row"><button type="button" class="ghost compact" data-refresh-scene-catalog>Refresh scenes</button></span><small data-scene-catalog-status>Choose a detected exact name or keep typing a custom one.</small></label><label>Connection name (optional)<input type="text" maxlength="256" data-scene-mapping-field="connectionName" value="${safe(mapping.connectionName || '')}" placeholder="Any connection"></label><label>Wait before action (seconds)<input type="number" min="0" max="60" step="1" data-scene-mapping-field="delaySeconds" value="${safe(delay)}"></label><label class="full-row">Streamer.bot target action<select required data-scene-mapping-field="actionId">${sceneActionOptions(mapping.actionId || '')}</select><small>Approve this same action in the section below before restarting StreamBridge.</small></label></div></article>`;
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
  editor.querySelector('[data-add-scene-mapping]').addEventListener('click', () => { const list = editor.querySelector('[data-scene-mapping-list]'); if (list.children.length >= 50) { byId('addon-state').textContent = 'Scene Actions supports at most 50 mappings.'; return; } list.insertAdjacentHTML('beforeend', renderSceneMappingRow()); attachSceneCatalogPickers(editor.closest('form')); syncSceneMappingEditor(editor); });
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
  const editor = renderAddOnVisualEditor(addOn);
  if (!sections) return `${editor}<details class="addon-settings-section" data-disclosure-key="${safe(`addon:${addOn.moduleId}:settings:general`)}" open><summary><span>General settings<small>The essential settings supplied by this add-on.</small></span></summary><div class="addon-settings-grid">${remaining}</div></details>`;
  return `${editor}${sections}${remaining ? `<details class="addon-settings-section" data-disclosure-key="${safe(`addon:${addOn.moduleId}:settings:other`)}"><summary><span>Other settings<small>Less commonly changed options</small></span></summary><div class="addon-settings-grid">${remaining}</div></details>` : ''}`;
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

function rememberAddOnSettingsDraft(form) {
  const id = form.dataset.addonSettings;
  const addOn = id === 'thsv.viewer-foundation' ? state.viewerFoundation : id === 'thsv.community-analytics' ? state.communityAnalytics : id === 'thsv.kofi-donations' ? state.kofiDonations : state.addOns.find((candidate) => candidate.moduleId === id);
  const draft = collectAddOnSettings(form, addOn);
  if (addOn && draft !== null) addOn.settings = draft;
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
  'thsv.quote-vault': ['THSV Addon - Quote Vault - Native Quote Sync'],
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
  if (addOn.moduleId === 'thsv.free-game-check') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.free-game-check:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect redemption-only checks</strong><small>One matching reward or points command starts one GamerPower lookup.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings before using YouTube or TikTok points.</li><li>Import <strong>THSV StreamBridge - Free Game Check</strong>. Leave Refresh, Discord Deliver, and Settle Twitch Reward triggerless.</li><li>Approve <strong>Refresh</strong> and <strong>Settle Twitch Reward</strong> below. Approve <strong>Discord Deliver</strong> only when Discord posting is enabled.</li><li>Create a pending <strong>Free Games</strong> Twitch reward and a Kick reward, then paste their stable IDs. Keep one Reward Redemption trigger on each existing intake.</li><li>Choose the YouTube and TikTok command and points cost. Save and restart; no separate Streamer.bot Command object is needed.</li></ol><p class="notice"><strong>No timer:</strong> the add-on checks only after a valid live redemption. Available games produce one source-chat Discord guide; no games or lookup failures refund Twitch and Viewer Foundation points. Kick remains accepted because Streamer.bot does not currently expose an equivalent refund method.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-jukebox') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-jukebox:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect the jukebox safely</strong><small>One private resolver validates YouTube tracks; the main intakes receive viewer commands.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings first if YouTube or TikTok viewers will spend Bridge points.</li><li>Import <strong>THSV StreamBridge - Village Jukebox</strong> in Streamer.bot.</li><li>Open <strong>Resolve YouTube Track</strong>, replace the private <code>villageJukeboxYouTubeApiKey</code> Set Argument value, then Save and Compile. Leave both imported actions triggerless.</li><li>Approve <strong>Resolve YouTube Track</strong> below. Approve <strong>Settle Twitch Reward</strong> only when the Twitch reward path is enabled.</li><li>Choose which jukebox commands are enabled in this wizard. Save and restart; the existing main chat intakes register them automatically without Command Sync packages.</li><li>Add the browser-source URL below at <strong>640 x 460</strong>, save, restart StreamBridge, and request a track with <code>!sr song or YouTube link</code>.</li></ol><p class="notice"><strong>Keep the API key private:</strong> it stays in Streamer.bot and must never be pasted into the wizard, logs, or support messages. Spotify playback is intentionally excluded; only use music you are permitted to broadcast.</p></div></details>`;
  if (addOn.moduleId === 'thsv.first-five') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.first-five:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect each platform once</strong><small>Rewards use the main intakes; one controller changes Twitch rewards safely.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings before using YouTube or TikTok points.</li><li>Import the First Five Streamer.bot package. Leave <strong>Controller</strong> triggerless and approve only that action below.</li><li>Keep one Twitch and one Kick Reward Redemption trigger on their existing main THSV intake actions. Paste the five stable reward IDs for each platform in placement order.</li><li>Choose the no-response command name in this wizard. It registers automatically for YouTube and TikTok after save and restart.</li><li>Save, restart StreamBridge, then test each path separately. Never attach reward triggers to the controller.</li></ol><p class="notice"><strong>One claim path per platform:</strong> duplicate intake triggers can process the same claim twice. Twitch can settle pending rewards; Kick claims are accepted directly because equivalent refund methods are unavailable.</p></div></details>`;
  if (addOn.moduleId === 'thsv.fan-crown') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.fan-crown:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect the crown safely</strong><small>Twitch uses its controller; Kick rewards and point commands stay on the main intakes.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings before enabling YouTube or TikTok crown claims.</li><li>Import the Fan Crown package. Leave <strong>Controller</strong> triggerless and approve only that action below.</li><li>Create the Twitch reward inside Streamer.bot and paste its stable ID. Paste the Kick reward ID only if Kick claims are enabled.</li><li>Choose the no-response command name in this wizard. It registers automatically for YouTube and TikTok after save and restart.</li><li>Save, restart StreamBridge, test one claim, and use the imported Reset action only as a creator control.</li></ol><p class="notice"><strong>Do not duplicate reward triggers:</strong> both native rewards arrive through the existing platform intakes. Twitch supports fulfillment and rollback; Kick does not expose the same settlement controls.</p></div></details>`;
  if (addOn.moduleId === 'thsv.stream-labels') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.stream-labels:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing platform intakes</strong><small>Stream Labels listens to events the main bridge already receives.</small></span><span class="status-chip status-ready">No import or extra trigger</span></summary><div class="addon-step-body"><ol><li>Keep the main THSV Twitch, YouTube, Kick, TikTok, Streamlabs, and Ko-fi intake triggers in Streamer.bot.</li><li>Do not attach duplicate triggers to this add-on. It receives normalized follows, subscriptions, gifts, cheers, donations, and other configured events internally.</li><li>Save the label layout, restart StreamBridge, then copy the browser-source URL below into OBS, Meld, or Streamlabs Desktop.</li><li>Send a simulated preview and confirm the source updates before relying on it live.</li></ol><p class="notice"><strong>One connection:</strong> the labels share StreamBridge's existing overlay connection and never open another Streamer.bot WebSocket.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-roll-call') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-roll-call:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Choose rewards or points</strong><small>Twitch and Kick use native rewards; YouTube and TikTok use Viewer Foundation points.</small></span><span class="status-chip status-ready">Command automatic</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings before enabling YouTube or TikTok check-ins.</li><li>Create the Twitch check-in reward inside Streamer.bot, enable Skip Reward Queue, and paste its stable ID. Paste a stable Kick reward ID if Kick is enabled.</li><li>Keep one Reward Redemption trigger on each existing main platform intake. Do not attach a trigger directly to Village Roll Call.</li><li>Choose the check-in command name in this wizard. It registers automatically for YouTube and TikTok after save and restart.</li><li>Save the time zone and points cost, restart StreamBridge, then test each enabled platform once.</li></ol><p class="notice"><strong>One daily check-in per stable platform account:</strong> duplicates do not score twice. Twitch/Kick rewards and YouTube/TikTok point commands share the same bounded monthly leaderboard.</p></div></details>`;
  if (addOn.moduleId === 'thsv.viewer-spotlight') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.viewer-spotlight:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect card requests</strong><small>Viewer Foundation and Community Analytics supply the card; the overlay stores no identity history.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Viewer Foundation is built in. Enable <strong>Community Analytics</strong> before using identity-backed cards.</li><li>Import Viewer Spotlight. Approve <strong>Settle Reward</strong> only for Twitch reward requests and <strong>Discord Snapshot</strong> only when Discord delivery is enabled.</li><li>Keep Twitch/Kick reward triggers on their existing main intakes. The saved YouTube/TikTok request command registers automatically after restart.</li><li>Add the browser-source URL below, accept the public-field disclosure, save, and restart StreamBridge.</li><li>Use Manual cards and Stream Score below for a safe offline check before enabling viewer requests.</li></ol><p class="notice"><strong>Fail closed:</strong> missing viewer projections, queue limits, cooldowns, stream-end cleanup, or overlay failures reject the card and refund supported pending payment paths.</p></div></details>`;
  if (addOn.moduleId === 'thsv.voice-relay') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.voice-relay:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect Village Voice</strong><small>One bounded queue serves alert speech and optional viewer TTS.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Create and test the exact voice alias in Speaker.bot, then connect Speaker.bot inside Streamer.bot.</li><li>Import Village Voice. Leave <strong>Speak</strong> triggerless, approve only Speak below, and attach Pause/Resume/Stop only to creator controls.</li><li>For Twitch/Kick viewer TTS, keep native reward triggers on the existing main platform intakes and paste their stable reward IDs.</li><li>For YouTube/TikTok, choose the request command in this wizard and enable Viewer Foundation points. The command registers automatically after restart.</li><li>Add the browser-source URL below if the speaking card is enabled. Save, restart, and test a harmless short phrase.</li></ol><p class="notice"><strong>Safety first:</strong> links and control characters are removed, text and queue sizes are bounded, cooldown memory is capped, and failures refund supported Viewer Foundation point requests.</p></div></details>`;
  if (addOn.moduleId === 'thsv.prize-wheel') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.prize-wheel:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Enable the wheel command</strong><small>The saved command uses the existing platform chat intakes automatically.</small></span><span class="status-chip status-ready">Command automatic</span></summary><div class="addon-step-body"><ol><li>Enter 2–10 unique choices and choose the command name.</li><li>Save and restart StreamBridge. No Command Sync package or separate Streamer.bot Command object is needed.</li><li>Keep chat-message triggers on the existing main THSV platform intake actions. Do not add duplicate triggers to the wheel.</li><li>Add the browser-source URL below and send a preview before running <code>!spinwheel</code>.</li></ol><p class="notice"><strong>Server-selected result:</strong> StreamBridge chooses and records the winner before the animation starts. A second spin is rejected until the first finishes.</p></div></details>`;
  if (addOn.moduleId === 'thsv.chat-play-pack') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.chat-play-pack:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect optional game providers</strong><small>Game commands already use the main chat intakes and one Viewer Foundation balance.</small></span><span class="status-chip status-neutral">Provider import optional</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings first.</li><li>Import <strong>THSV StreamBridge - Chat Play Pack</strong> only when using the OpenTDB or Dictionary provider actions.</li><li>Leave those provider actions triggerless. The existing platform chat intakes deliver every game command automatically.</li><li>Enable or disable each game in this wizard. No separate Streamer.bot Command objects or Command Sync package is needed.</li><li>Approve only the OpenTDB or Dictionary fetch action(s) you enabled. Creator-only Trivia and Unscramble require no approved provider action.</li><li>After the automatic intake path passes, disable legacy game Command objects to keep Streamer.bot tidy.</li><li>Keep creator fallback questions and words filled in when using Mixed mode. Add the browser-source URL only when you want result cards.</li></ol><p class="notice"><strong>One intake path:</strong> Chat Play reads normalized public chat directly, ignores the bridge's derived command copy, and opens no additional WebSocket connection. Losing never removes points; persistent caps, cooldowns, serialized rounds, and idempotent awards prevent farming and replay problems.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-polls') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-polls:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>No separate Streamer.bot commands or poll triggers are needed.</small></span><span class="status-chip status-ready">Direct chat commands</span></summary><div class="addon-step-body"><ol><li>Keep chat-message triggers on the existing main THSV Twitch, YouTube, Kick, and TikTok intake actions.</li><li>Do not generate Village Polls commands in Command Sync and do not attach separate poll triggers in Streamer.bot.</li><li>Restart StreamBridge after saving the enabled setting.</li><li>Open a poll with <code>!poll open Question | First choice | Second choice</code>, vote with <code>!vote 1</code>, and close it with <code>!poll close</code>.</li></ol><p class="notice"><strong>One universal total:</strong> Village Polls reads normalized chat directly and combines Twitch, YouTube, Kick, and TikTok votes. Native Twitch and YouTube polls are not mixed in because Kick and TikTok votes cannot be inserted into those provider totals. Opening and closing are announced to all four chats; the result also appears for 12 seconds on the Village Polls overlay.</p></div></details>`;
  if (addOn.moduleId === 'thsv.viewer-foundation') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.viewer-foundation:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>Points and lurk commands register automatically from the saved names.</small></span><span class="status-chip status-ready">Commands automatic</span></summary><div class="addon-step-body"><ol><li>Keep chat, follow, subscription, membership, gift, cheer, Super Chat, raid, and reward triggers on the existing main THSV platform intake actions.</li><li>Choose the balance and lurk command names in this wizard, save, and restart StreamBridge.</li><li>Viewers can then use <code>!points</code> and <code>!lurk</code> without separate Streamer.bot Command objects or Command Sync packages.</li><li>Use local test events before going live. Disable legacy duplicate Command objects only after this intake-owned path passes.</li></ol><p class="notice"><strong>Time tracking is observation-based:</strong> platforms do not expose a dependable cross-platform silent-viewer list. Active time is settled when a viewer continues chatting; lurk time settles on their next message or when the final observed platform goes offline.</p></div></details>`;
  if (addOn.moduleId === 'thsv.village-draw') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.village-draw:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Use the existing chat intakes</strong><small>No separate Streamer.bot commands or giveaway triggers are needed.</small></span><span class="status-chip status-ready">Direct chat commands</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings first.</li><li>Keep chat-message triggers on the existing main THSV Twitch, YouTube, Kick, and TikTok intake actions.</li><li>Do not generate Village Draw commands in Command Sync and do not attach duplicate triggers in Streamer.bot.</li><li>Save the prize and entry settings, restart StreamBridge, then use the authenticated controls below to open entries.</li><li>Viewers use <code>!enter</code>, <code>!tickets 3</code>, and <code>!mytickets</code> directly in chat.</li></ol><p class="notice"><strong>Management stays protected:</strong> <code>!giveaway</code> shows public status, while management arguments still require Moderator or Broadcaster. Pending point purchases must settle before entries can close or a winner can be drawn.</p></div></details>`;
  if (addOn.moduleId === 'thsv.clip-library-cache') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.clip-library-cache:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect the Clip Engine library</strong><small>One internal action supplies every Clip Engine experience.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Import <strong>THSV StreamBridge - Clip Library Cache</strong> in Streamer.bot.</li><li>Leave <strong>Refresh</strong> enabled and triggerless. Do not attach a timer or platform trigger.</li><li>Approve only Refresh in the next wizard step, enable the shared clip list, save, and restart StreamBridge.</li><li>Use the Clip Engine cards above to configure Random Clip Player, Clip Courier, or Raid Scout playback.</li></ol><p class="notice"><strong>Clip Engine foundation:</strong> this component owns the shared bounded Twitch lookup. It stays optional for creators who do not use clips, while every enabled clip experience shares the same records and avoids duplicate API requests.</p><p>It has no overlay and never plays, posts, or downloads a clip by itself.</p></div></details>`;
  if (addOn.moduleId === 'thsv.clip-courier') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.clip-courier:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Connect !clip and Discord</strong><small>The main Twitch intake owns the command; two private helpers create and deliver the clip.</small></span><span class="status-chip status-neutral">Package import required</span></summary><div class="addon-step-body"><ol><li>Import <strong>THSV StreamBridge - Clip Courier</strong> in Streamer.bot. Leave Create Clip and Deliver triggerless.</li><li>Open <strong>Create Clip</strong>. Set <code>clipCourierDurationSeconds</code> to <strong>30</strong> or <strong>60</strong>, then Save and Compile.</li><li>Open <strong>Deliver</strong>, replace <code>clipCourierWebhookUrl</code> with a private webhook for the Discord channel or forum selected above, then Save and Compile.</li><li>Approve <strong>Create Clip</strong> and <strong>Deliver</strong> below, enable Clip Courier, save, and restart StreamBridge.</li><li>Test <code>!clip</code> from Twitch through the main intake. Disable any older Streamer.bot <code>!clip</code> Command object so only the intake-owned route responds.</li><li>Optional: install Clip Library Cache and enable current-stream discovery if clips made without <code>!clip</code> should also be sent.</li></ol><p class="notice"><strong>No old-library posting:</strong> automatic discovery accepts only Twitch clip timestamps inside the stream session observed by StreamBridge. If the session boundary is unknown, it sends nothing. Never paste the webhook into the wizard or a support message.</p></div></details>`;
  if (addOn.moduleId === 'thsv.community-analytics') return `<details class="form-section addon-trigger-readiness addon-step" data-disclosure-key="addon:thsv.community-analytics:trigger-readiness"><summary><span><span class="step-number">3</span><strong>Confirm the data path</strong><small>Community Analytics listens to the existing Bridge intakes.</small></span><span class="status-chip status-ready">No add-on import needed</span></summary><div class="addon-step-body"><ol><li>Review the built-in <strong>Viewer Foundation</strong> settings first.</li><li>Keep Twitch, YouTube, Kick, and TikTok triggers attached to their main <strong>THSV &lt;Platform&gt; - Intake</strong> actions.</li><li>Do not create a Community Analytics action or attach duplicate chat triggers.</li><li>Save the selected platforms and restart StreamBridge. Local counters update when normalized events arrive.</li><li>Use the Reports section below to refresh the session summary or export bounded reports.</li></ol><p class="notice">This is a private local observation tool, not official platform analytics. It stores no chat text, display names, avatars, raw events, or financial amounts.</p></div></details>`;
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
  return `<details class="form-section addon-step analytics-admin" data-disclosure-key="addon:thsv.community-analytics:administration" open><summary><span><strong>Community snapshot</strong><small>See what is happening now and review recent streams in one place.</small></span></summary><div class="addon-step-body"><div class="analytics-toolbar"><p><strong>Private local counts.</strong> No names, chat text, account IDs, financial amounts, or raw events are shown.</p><button type="button" class="ghost" data-analytics-admin-status>Refresh snapshot</button></div><div class="analytics-dashboard" data-analytics-admin-output aria-live="polite"><p class="notice">Loading your community snapshot…</p></div><details class="addon-settings-section analytics-secondary" data-disclosure-key="addon:thsv.community-analytics:downloads"><summary><span><strong>Download detailed reports</strong><small>Export aggregate stream summaries or pseudonymous viewer counters.</small></span></summary><div class="addon-settings-section-body"><div class="button-row analytics-downloads"><button type="button" class="ghost" data-analytics-report="session-json">Download stream summaries</button><button type="button" class="ghost" data-analytics-report="viewers-csv">Download viewer counters</button></div><p class="addon-settings-notice">These files contain local StreamBridge observations only. They are not official platform, revenue, payout, or tax reports.</p></div></details><details class="addon-settings-section analytics-secondary" data-disclosure-key="addon:thsv.community-analytics:privacy-tools"><summary><span><strong>Privacy tools</strong><small>Preview or permanently erase one pseudonymous viewer record.</small></span></summary><div class="addon-settings-section-body"><form class="addon-settings-grid" data-analytics-export-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64" placeholder="twitch-…"></label><div class="button-row full-row"><button type="submit" class="ghost">Preview viewer record</button></div></form><form class="addon-settings-grid" data-analytics-delete-form><label>Viewer Foundation ID<input name="viewerId" required pattern="[a-z][a-z0-9-]{0,63}" maxlength="64"></label><label class="check full-row"><input name="approved" type="checkbox" required> Permanently erase this viewer's analytics record and active-session attendance.</label><div class="button-row full-row"><button type="submit" class="danger">Erase viewer record</button></div></form></div></details></div></details>`;
}

function renderQuoteVaultAdmin(addOn) {
  if (addOn.moduleId !== 'thsv.quote-vault' || !addOn.enabled) return '';
  return `<details class="form-section addon-step quote-vault-admin" data-disclosure-key="addon:thsv.quote-vault:library" open><summary><span><strong>Quote library</strong><small>Add, review, edit, delete, restore, and synchronize quotes without chat commands.</small></span></summary><div class="addon-step-body"><p class="notice"><strong>One cross-platform library:</strong> viewer submissions wait here for review, while broadcaster and moderator submissions are accepted automatically. Changes are saved locally as soon as they succeed.</p><form class="addon-settings-grid quote-vault-add" data-quote-vault-add-form><label>Quoted person<input name="quotedName" required maxlength="100" autocomplete="off" placeholder="Display name"></label><label>Source platform<select name="sourcePlatform"><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option><option value="tiktok">TikTok</option></select></label><label class="full-row">Quote text<textarea name="text" required maxlength="400" rows="3" placeholder="What was said?"></textarea></label><div class="button-row full-row"><button type="submit">Add approved quote</button><button type="button" class="ghost" data-quote-vault-refresh>Refresh library</button></div></form><div data-quote-vault-output aria-live="polite"><p class="notice">Loading the local quote library...</p></div><details class="addon-settings-section" data-disclosure-key="addon:thsv.quote-vault:streamerbot-sync"><summary><span><strong>Streamer.bot quote synchronization</strong><small>Import existing native quotes or mirror compatible approved records.</small></span></summary><div class="addon-settings-section-body"><p>Quote Vault remains authoritative. Import reads native Streamer.bot quotes without deleting them. Mirroring supports Twitch, YouTube, and Kick; TikTok and pending submissions remain Quote Vault-only.</p><div class="button-row"><button type="button" class="ghost" data-quote-vault-sync-import>Import existing Streamer.bot quotes</button></div><p class="notice" data-quote-vault-sync-status>Enable sync in settings, import the current Quote Vault Streamer.bot package, approve <strong>Native Quote Sync</strong>, and restart StreamBridge.</p></div></details></div></details>`;
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

function mainFeatureFamilies() { return Array.isArray(state.addOnFeatureFamilies) ? state.addOnFeatureFamilies : []; }

function mainFeatureForModule(moduleId) {
  return mainFeatureFamilies().find((feature) => [...(feature.modules || []), ...(feature.relatedModules || [])].includes(moduleId));
}

function featureFamilyStatus(feature) {
  const installed = [...feature.modules, ...(feature.relatedModules || [])].map((id) => state.addOns.find((addOn) => addOn.moduleId === id)).filter(Boolean);
  const enabled = installed.filter((addOn) => addOn.enabled);
  const requiredInstalled = feature.modules.map((id) => state.addOns.find((addOn) => addOn.moduleId === id)).filter(Boolean);
  const requiredEnabled = requiredInstalled.filter((addOn) => addOn.enabled);
  const missing = Math.max(0, feature.modules.length - requiredInstalled.length);
  const incomplete = missing > 0 || (requiredInstalled.length > 0 && requiredEnabled.length < requiredInstalled.length);
  const attention = enabled.some((addOn) => state.addOnRestartRequiredIds.has(addOn.moduleId) || (state.addOnRuntime && addOnRuntimeModule(addOn.moduleId)?.status !== 'healthy'));
  const status = installed.length === 0 ? 'Not installed' : attention ? 'Needs attention' : missing > 0 ? 'Incomplete' : requiredEnabled.length === 0 ? 'Disabled' : incomplete ? 'Partially enabled' : 'Ready';
  return { installed, enabled, attention, incomplete, status };
}

function safeFeatureCount(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }

function runtimeMainFeature(feature, runtime) {
  const keys = {
    'broadcast-director': 'broadcastDirector',
    'clip-engine': 'clipEngine',
    'community-rewards': 'communityRewards',
    'community-messaging': 'communityMessaging',
    'community-insights': 'communityInsights',
    'community-play': 'communityPlay',
    'voice-language': 'voiceLanguage',
  };
  return runtime?.[keys[feature.id]] || null;
}

function featureComponentState(addOn) {
  if (!addOn.enabled) return { label: 'Disabled', statusClass: 'status-neutral' };
  if (state.addOnRestartRequiredIds.has(addOn.moduleId)) return { label: 'Restart required', statusClass: 'status-warning' };
  const runtime = addOnRuntimeModule(addOn.moduleId);
  if (!state.addOnRuntime) return { label: 'Runtime unknown', statusClass: 'status-neutral' };
  if (!runtime) return { label: 'Not active', statusClass: 'status-warning' };
  if (runtime.status === 'healthy') return { label: 'Healthy', statusClass: 'status-ready' };
  return { label: addOnOptionLabel(typeof runtime.status === 'string' ? runtime.status : 'Needs attention'), statusClass: 'status-warning' };
}

function featureMetrics(feature, runtimeFeature) {
  if (!runtimeFeature || typeof runtimeFeature !== 'object') return [];
  const queue = state.addOnRuntime?.browserOverlay?.presentationQueue;
  const policy = state.addOnRuntime?.browserOverlay?.presentationPolicy;
  const policyReady = policy?.contractVersion === '1.0.0';
  const queued = Array.isArray(queue?.queued) ? queue.queued.length : 0;
  if (feature.id === 'broadcast-director') return [
    ['Stage', addOnOptionLabel(typeof runtimeFeature.stage === 'string' ? runtimeFeature.stage : 'offline')],
    ['Live platforms', String(Array.isArray(runtimeFeature.livePlatforms) ? runtimeFeature.livePlatforms.length : 0)],
    ['Ad', addOnOptionLabel(typeof runtimeFeature.ad?.state === 'string' ? runtimeFeature.ad.state : 'idle')],
    ['Raid Scout', addOnOptionLabel(typeof runtimeFeature.raid?.state === 'string' ? runtimeFeature.raid.state : 'idle')],
    ['Presentation', policyReady ? 'Timers independent; raid cards queued' : 'Runtime policy unavailable'],
  ];
  if (feature.id === 'clip-engine') return [
    ['Cached clips', String(safeFeatureCount(runtimeFeature.librarySize))],
    ['Clip responses', String(safeFeatureCount(runtimeFeature.randomClipResponses))],
    ['Media owner', typeof runtimeFeature.media?.ownerModuleId === 'string' && runtimeFeature.media.ownerModuleId ? runtimeFeature.media.ownerModuleId : 'Idle'],
    ['Last result', runtimeFeature.lastError ? 'Needs review' : 'Healthy'],
    ['Presentation', policyReady ? 'Media plays independently' : 'Runtime policy unavailable'],
  ];
  if (feature.id === 'community-rewards') return [
    ['Session', runtimeFeature.sessionActive ? 'Live' : 'Offline'],
    ['Redemptions', String(safeFeatureCount(runtimeFeature.redemptions))],
    ['Component operations', String(safeFeatureCount(runtimeFeature.operations))],
    ['Queued overlays', String(queued)],
    ['Reported issues', String(safeFeatureCount(runtimeFeature.failures) + safeFeatureCount(runtimeFeature.capabilityFailures))],
    ['Presentation', policyReady ? 'Foreground queue' : 'Runtime policy unavailable'],
  ];
  if (feature.id === 'community-messaging') return [
    ['Session', runtimeFeature.sessionActive ? 'Live' : 'Offline'],
    ['Chat events', String(safeFeatureCount(runtimeFeature.messagesObserved))],
    ['Component operations', String(safeFeatureCount(runtimeFeature.operations))],
    ['Pending sends', String(safeFeatureCount(runtimeFeature.outboundPending))],
    ['Reported issues', String(safeFeatureCount(runtimeFeature.failures) + safeFeatureCount(runtimeFeature.capabilityFailures))],
    ['Presentation', policyReady ? 'Shoutouts queued; delivery background' : 'Runtime policy unavailable'],
  ];
  if (['community-insights', 'community-play', 'voice-language'].includes(feature.id)) return [
    ['Session', runtimeFeature.sessionActive ? 'Live' : 'Offline'],
    ['Component operations', String(safeFeatureCount(runtimeFeature.operations))],
    ['Pending sends', String(safeFeatureCount(runtimeFeature.outboundPending))],
    ['Reported issues', String(safeFeatureCount(runtimeFeature.failures) + safeFeatureCount(runtimeFeature.capabilityFailures))],
    ['Last component', typeof runtimeFeature.lastComponent === 'string' && runtimeFeature.lastComponent ? runtimeFeature.lastComponent : 'No activity yet'],
  ];
  return [];
}

function renderFeatureDetails(feature, result, runtimeFeature) {
  const metrics = featureMetrics(feature, runtimeFeature);
  const metricsHtml = metrics.length ? `<dl class="main-feature-metrics">${metrics.map(([label, value]) => `<div><dt>${safe(label)}</dt><dd>${safe(value)}</dd></div>`).join('')}</dl>` : '<p class="notice">Runtime metrics will appear after StreamBridge connects.</p>';
  const componentHtml = result.installed.length
    ? `<ul class="main-feature-component-list">${result.installed.map((addOn) => { const component = featureComponentState(addOn); return `<li><button type="button" class="ghost compact" data-select-feature-addon="${safe(addOn.moduleId)}">${safe(addOn.name)}</button><span class="status-chip ${component.statusClass}">${safe(component.label)}</span></li>`; }).join('')}</ul>`
    : '<p class="notice">No components from this feature are installed. Core services continue without them.</p>';
  return `<details class="main-feature-details" name="main-feature-system-details" data-disclosure-key="${safe(`extension-group:${feature.id}:details`)}"><summary>System details</summary><div class="main-feature-details-body">${metricsHtml}${componentHtml}</div></details>`;
}

function renderBroadcastAppCompatibility() {
  return `<section class="broadcast-app-compatibility" aria-label="Broadcast application compatibility"><header><div><p class="addon-kicker">One Bridge, three broadcast apps</p><h3>OBS, Meld, and Streamlabs support</h3><p>Chat, commands, rewards, timers, Discord delivery, analytics, and saved state do not depend on a broadcast app. Visual features use the same local browser-source URL in all three apps. Scene automation uses Streamer.bot's normalized Scene Changed relay for the app you choose.</p></div><span class="status-chip status-ready">Provider neutral</span></header><div class="broadcast-app-grid"><article class="broadcast-app-card"><span class="status-chip status-ready">Supported</span><h4>OBS Studio</h4><p>Browser sources and scene automation are supported. OBS/Aitum output helpers remain intentionally OBS-specific.</p></article><article class="broadcast-app-card"><span class="status-chip status-ready">Supported</span><h4>Meld Studio</h4><p>Use a Meld Browser layer and Meld Scene Changed, Streaming Started, and Streaming Stopped triggers in Streamer.bot.</p></article><article class="broadcast-app-card"><span class="status-chip status-ready">Supported</span><h4>Streamlabs Desktop</h4><p>Use a Browser Source and Streamlabs Desktop scene and streaming triggers in Streamer.bot.</p></article></div><p class="notice"><strong>Important:</strong> connect and relay only the broadcast app that owns each scene or stop-stream action. An unavailable unselected app never blocks chat, overlays, or another selected provider.</p></section>`;
}

function renderMainFeatureHub() {
  const families = mainFeatureFamilies();
  if (!families.length) return '<section class="main-feature-hub"><p class="notice">Bridge feature ownership is unavailable until the service and wizard versions match.</p></section>';
  const runtime = state.addOnRuntime?.mainFeatures || {};
  return `${renderBroadcastAppCompatibility()}<section class="main-feature-hub" aria-label="Built-in StreamBridge extension groups"><div class="main-feature-heading"><div><p class="addon-kicker">Included with StreamBridge</p><h3>Built-in extension groups</h3><p>These ${safe(String(families.length))} groups organize the individual StreamBridge components shown elsewhere on this page. Enable a group once to install and activate its included components together.</p></div><span class="status-chip status-ready">${safe(String(families.length))} groups</span></div>${renderFeatureMigrationHub()}<div class="main-feature-grid">${families.map((feature) => {
    const result = featureFamilyStatus(feature);
    const runtimeFeature = runtimeMainFeature(feature, runtime);
    const overlayQueue = state.addOnRuntime?.browserOverlay?.presentationQueue;
    const queuedOverlays = Array.isArray(overlayQueue?.queued) ? overlayQueue.queued.length : 0;
    const detail = feature.id === 'broadcast-director' && runtimeFeature
      ? `${addOnOptionLabel(runtimeFeature.stage || 'offline')} · ${counted((runtimeFeature.livePlatforms || []).length, 'live platform')}`
      : feature.id === 'clip-engine' && runtimeFeature
        ? counted(runtimeFeature.librarySize || 0, 'cached clip record')
        : feature.id === 'community-rewards' && runtimeFeature
          ? `${counted(safeFeatureCount(runtimeFeature.redemptions), 'redemption event')} · ${counted(queuedOverlays, 'queued overlay')}`
          : feature.id === 'community-messaging' && runtimeFeature
            ? `${counted(safeFeatureCount(runtimeFeature.messagesObserved), 'chat event')} · ${counted(safeFeatureCount(runtimeFeature.failures) + safeFeatureCount(runtimeFeature.capabilityFailures), 'reported issue')}`
            : runtimeFeature
              ? `${counted(safeFeatureCount(runtimeFeature.operations), 'component operation')} · ${counted(safeFeatureCount(runtimeFeature.failures) + safeFeatureCount(runtimeFeature.capabilityFailures), 'reported issue')}`
            : `${result.enabled.length} of ${counted(result.installed.length, 'installed component')} enabled`;
    const groupEnabled = feature.modules.length > 0 && feature.modules.every((moduleId) => result.enabled.some((addOn) => addOn.moduleId === moduleId));
    const configure = result.installed.length
      ? `<button type="button" class="ghost compact" data-select-feature-addon="${safe(result.installed[0].moduleId)}" aria-label="Configure ${safe(feature.name)}">Configure</button>`
      : '';
    return `<article class="main-feature-card" data-main-feature="${safe(feature.id)}"><div class="main-feature-card-title"><div><h4 title="${safe(feature.name)}">${safe(feature.name)}</h4><small>${safe(detail)}</small></div><div class="main-feature-card-actions"><span class="status-chip ${result.attention || result.incomplete ? 'status-warning' : result.enabled.length ? 'status-ready' : 'status-neutral'}">${safe(result.status)}</span>${configure}<button type="button" class="compact ${groupEnabled ? 'ghost' : ''}" data-toggle-feature-family="${safe(feature.id)}" data-feature-enabled="${String(groupEnabled)}" aria-label="${groupEnabled ? 'Disable' : 'Enable'} ${safe(feature.name)}">${groupEnabled ? 'Disable group' : 'Enable group'}</button></div></div><p>${safe(feature.description)}</p>${renderFeatureDetails(feature, result, runtimeFeature)}</article>`;
  }).join('')}</div></section>`;
}

function migrationSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'No saved data';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function friendlyMigrationName(candidate) {
  const supplied = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (supplied && supplied !== candidate.moduleId && !/^[a-z0-9]+(?:[.-][a-z0-9-]+)+$/u.test(supplied)) return supplied;
  const slug = String(candidate.moduleId || '').replace(/^thsv[.-]/u, '').split('.').at(-1) || 'Bridge feature';
  const words = slug.split(/[-_]+/u).filter(Boolean).map((word) => {
    const known = { api: 'API', brb: 'BRB', obs: 'OBS', tts: 'TTS', tiktok: 'TikTok', kofi: 'Ko-fi' };
    return known[word] || `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  });
  return words.join(' ') || 'Bridge feature';
}

function migrationDataSummary(candidate) {
  const files = Number(candidate.stagedFiles);
  if (!Number.isFinite(files) || files <= 0) return 'No saved data found';
  return `${files} saved file${files === 1 ? '' : 's'} · ${migrationSize(candidate.stagedBytes)}`;
}

function renderFeatureMigrationHub() {
  const candidates = Array.isArray(state.featureMigrations) ? state.featureMigrations : [];
  if (!candidates.length) return '';
  const pending = candidates.filter((candidate) => candidate.status === 'pending').length;
  return `<section class="feature-migration-hub" aria-label="Migrated component data"><div class="feature-migration-heading"><div><p class="addon-kicker">Private migration inbox</p><h4>Choose what comes into the full Bridge</h4><p>Saved component data stays local and inactive here until you import it. Importing data and enabling its component are separate choices.</p></div><span class="status-chip ${pending ? 'status-warning' : 'status-ready'}">${pending ? `${pending} decision${pending === 1 ? '' : 's'} pending` : 'Reviewed'}</span></div><div class="feature-migration-list">${candidates.map((candidate) => {
    const feature = mainFeatureForModule(candidate.moduleId);
    const decided = candidate.status !== 'pending';
    const unavailable = !candidate.installed;
    return `<form class="feature-migration-row" data-feature-migration="${safe(candidate.moduleId)}"><div class="feature-migration-copy"><strong>${safe(friendlyMigrationName(candidate))}</strong><small>${safe(feature?.name || 'Bridge feature')} · Previous version ${safe(candidate.sourceVersion)} · ${safe(migrationDataSummary(candidate))}</small><span class="status-chip ${candidate.status === 'imported' ? 'status-ready' : candidate.status === 'skipped' ? 'status-neutral' : 'status-warning'}">${safe(candidate.status === 'pending' ? 'Needs your review' : candidate.status === 'imported' ? 'Imported' : 'Not imported')}</span></div><div class="feature-migration-options"><label class="check"><input type="checkbox" name="importData" ${candidate.dataImported || candidate.stagedData ? 'checked' : ''} ${candidate.dataImported || !candidate.stagedData ? 'disabled' : ''}> Import saved settings and history</label>${candidate.dataImported ? '<small>Imported data stays preserved. Disable the component below if you do not want it to run.</small>' : ''}<label class="check"><input type="checkbox" name="enabled" ${candidate.currentlyEnabled || (!decided && candidate.originalEnabled) ? 'checked' : ''}> Enable component after restart</label>${candidate.activeData && candidate.stagedData && !candidate.dataImported ? '<label class="check migration-replace"><input type="checkbox" name="replaceExistingData"> Replace current component data</label>' : ''}<button type="submit" ${unavailable ? 'disabled' : ''}>${decided ? 'Update migration choice' : 'Apply this migration'}</button>${unavailable ? '<small class="error">Install or repair the current component package first.</small>' : ''}</div></form>`;
  }).join('')}</div><p class="notice"><strong>Nothing is deleted:</strong> skipped migration data remains in the private local inbox so you can return later. Replacing current data requires its separate checkbox.</p></section>`;
}

function managedExtensionIds() {
  return new Set(mainFeatureFamilies().flatMap((feature) => feature.modules || []));
}

function addOnSelectorOptions(selected, bridgeManaged) {
  const managed = managedExtensionIds();
  if (!bridgeManaged) return state.addOns.filter((addOn) => !managed.has(addOn.moduleId)).sort((left, right) => left.name.localeCompare(right.name)).map((addOn) => `<option value="${safe(addOn.moduleId)}" ${addOn.moduleId === selected.moduleId ? 'selected' : ''}>${safe(addOn.name)} ${safe(addOn.version)}</option>`).join('');
  return mainFeatureFamilies().map((feature) => {
    const options = feature.modules.map((id) => state.addOns.find((addOn) => addOn.moduleId === id)).filter(Boolean);
    return options.length ? `<optgroup label="${safe(feature.name)}">${options.map((addOn) => `<option value="${safe(addOn.moduleId)}" ${addOn.moduleId === selected.moduleId ? 'selected' : ''}>${safe(addOn.name)} ${safe(addOn.version)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}

function renderInstalledAddOnCatalog(selected) {
  const managed = managedExtensionIds();
  const addOns = state.addOns.filter((addOn) => !managed.has(addOn.moduleId)).sort((left, right) => left.name.localeCompare(right.name));
  const cards = addOns.length ? `<div class="installed-addon-grid">${addOns.map((addOn) => {
    const component = featureComponentState(addOn);
    return `<article class="installed-addon-card ${addOn.moduleId === selected?.moduleId ? 'is-selected' : ''}"><div><p class="addon-kicker">Optional add-on</p><h4 title="${safe(addOn.name)}">${safe(addOn.name)}</h4><p>${safe(addOn.description)}</p></div><div class="installed-addon-card-footer"><span class="status-chip ${component.statusClass}">${safe(component.label)}</span><button type="button" class="ghost compact" data-select-installed-addon="${safe(addOn.moduleId)}">Manage</button></div></article>`;
  }).join('')}</div>` : '<p class="notice">No optional add-ons are installed. Add one from the verified package area above when you need it.</p>';
  return `${renderBroadcastAppCompatibility()}<section class="installed-addon-catalog" aria-label="Installed optional add-ons"><div class="catalog-heading"><div><p class="addon-kicker">Optional and separately installed</p><h3>Installed add-ons</h3><p>Add-ons are independent features you choose to add. They are not required by the seven built-in extensions.</p></div><span class="status-chip status-neutral">${safe(String(addOns.length))} installed</span></div>${cards}</section>`;
}

function renderAddOns() {
  const list = byId('addon-list');
  const marketplaceList = byId('addon-marketplace-list');
  if (!state.addOns.length) {
    list.innerHTML = renderPendingAddOnChanges() + renderMainFeatureHub() + (marketplaceList ? '' : renderInstalledAddOnCatalog()) + '<p class="notice">No extension component packages are installed. Core chat, commands, alerts, timers, and rewards continue to work.</p>';
    if (marketplaceList) marketplaceList.innerHTML = renderInstalledAddOnCatalog();
    document.querySelectorAll('[data-feature-migration]').forEach((form) => form.addEventListener('submit', applyFeatureMigration));
    document.querySelectorAll('[data-toggle-feature-family]').forEach((button) => button.addEventListener('click', toggleFeatureFamily));
    return;
  }
  const selected = state.addOns.find((addOn) => addOn.moduleId === state.selectedAddOnId) || state.addOns[0];
  state.selectedAddOnId = selected.moduleId;
  const selectedFeature = mainFeatureForModule(selected.moduleId);
  const selectedIsExtension = selectedFeature?.managementMode === 'bridge-managed-components';
  const selector = `<label class="addon-selector">${selectedIsExtension ? 'Manage a built-in extension component' : 'Manage an installed add-on'}<select id="addon-selector">${addOnSelectorOptions(selected, selectedIsExtension)}</select></label>`;
  const selectedCard = [selected].map((addOn) => {
    const feature = mainFeatureForModule(addOn.moduleId);
    const bridgeManaged = feature?.managementMode === 'bridge-managed-components';
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
    const settings = rejected || !fields ? '' : `<details class="form-section addon-settings-shell addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:configure`)}" open><summary><span><span class="step-number">2</span><strong>${bridgeManaged ? `Configure this ${safe(feature.name)} component` : 'Configure this add-on'}</strong><small>Change only the sections you need; saved collapsed sections stay collapsed.</small></span></summary><form class="addon-settings" data-addon-settings="${safe(addOn.moduleId)}"><div class="addon-settings-heading"><p class="addon-settings-intro">${safe(settingsIntro)}</p><div class="button-row"><button type="button" class="ghost compact" data-addon-sections="expand">Expand all</button><button type="button" class="ghost compact" data-addon-sections="collapse">Collapse all</button></div></div>${fields}<div class="addon-settings-save"><button type="submit">Save all settings</button><small>Settings are preserved now and become active after StreamBridge restarts.</small></div></form></details>`;
    let nextWorkflowStep = 4;
    const chatGuardGrantHelp = addOn.moduleId === 'thsv.chat-guard'
      ? '<p class="notice"><strong>Observation-only users can leave this empty.</strong> For automatic moderation, approve only <strong>THSV Addon - Chat Guard - Moderate</strong>. The main chat intake now handles <code>!guardtrust</code> locally; the older Trust Viewer helper does not need approval.</p>'
      : '';
    const actionGrant = rejected || !addOn.permissions.includes('streamerbot.run-approved-action') ? '' : `<details class="form-section addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:approved-actions`)}"><summary><span><span class="step-number">${nextWorkflowStep++}</span><strong>Approve Streamer.bot actions</strong><small>${addOn.moduleId === 'thsv.chat-guard' ? 'Optional: required only for automatic moderation.' : 'Grant only the actions this add-on is allowed to run.'}</small></span></summary><div class="addon-step-body">${chatGuardGrantHelp}${renderAddOnActionGrant(addOn)}</div></details>`;
    const overlayTools = rejected || !addOn.permissions.includes('overlay.publish') ? '' : `<details class="form-section addon-step" data-disclosure-key="${safe(`addon:${addOn.moduleId}:overlay-tools`)}"><summary><span><span class="step-number">${nextWorkflowStep++}</span><strong>Open overlay &amp; test</strong><small>Open the hosted overlay and send a safe preview before going live.</small></span></summary><div class="addon-step-body">${renderAddOnOverlayTools(addOn)}</div></details>`;
    const viewerAdministration = rejected ? '' : `${renderViewerFoundationAdmin(addOn)}${renderCommunityAnalyticsAdmin(addOn)}${renderQuoteVaultAdmin(addOn)}${renderViewerSpotlightAdmin(addOn)}${renderFollowerPulseAdmin(addOn)}${renderChatGuardAdmin(addOn)}${renderVillageDrawAdmin(addOn)}`;
    const setupGuide = renderAddOnSetupGuide(addOn);
    if (addOn.moduleId === 'thsv.chat-guard' && addOn.enabled) nextWorkflowStep = Math.max(nextWorkflowStep, 7);
    if (addOn.moduleId === 'thsv.village-draw' && addOn.enabled) nextWorkflowStep = Math.max(nextWorkflowStep, 6);
    const acceptance = rejected ? '' : renderAddOnAcceptance(addOn, nextWorkflowStep);
    const toggle = rejected ? '' : `<button type="button" data-toggle-addon="${safe(addOn.moduleId)}" data-addon-enabled="${String(addOn.enabled)}">${addOn.enabled ? 'Disable' : 'Enable'}</button>`;
    const packageDetails = rejected ? '' : `<details class="form-section addon-package-details" data-disclosure-key="${safe(`addon:${addOn.moduleId}:package-details`)}"><summary><span><strong>Package and publisher details</strong><small>Permissions, source, updates, release notes, and security information.</small></span></summary><div class="addon-step-body"><p><strong>Publisher:</strong> ${safe(addOn.author)}</p><p><strong>Package type:</strong> ${safe(addOn.packageKind)}</p><p><strong>Permissions:</strong> ${safe(permissions)}</p>${trustLinks}${liveChatWarning}${providerWarning}${viewerWarning}${addOn.packageKind === 'executable' ? '<p class="notice">Executable add-ons run with the same Windows account permissions as StreamBridge. The broker limits supported framework operations, but it is not an operating-system sandbox. Install executable packages only from publishers you trust.</p>' : ''}${addOn.changelog ? `<details data-disclosure-key="${safe(`addon:${addOn.moduleId}:release-notes`)}"><summary>Release notes</summary><p>${safe(addOn.changelog)}</p></details>` : ''}</div></details>`;
    const maintenance = rejected ? '' : `<details class="form-section addon-maintenance" data-disclosure-key="${safe(`addon:${addOn.moduleId}:maintenance`)}"><summary><span><strong>${bridgeManaged ? 'Advanced component maintenance' : 'Enable, disable, or uninstall'}</strong><small>${bridgeManaged ? `This component normally stays managed inside ${safe(feature.name)}.` : 'Routine maintenance and removal controls.'}</small></span></summary><div class="addon-step-body">${bridgeManaged ? `<p class="notice"><strong>Bridge-managed component:</strong> disabling or uninstalling this package degrades ${safe(feature.name)} but does not erase its private settings.</p>` : ''}<div class="button-row">${toggle}<button type="button" class="danger" data-remove-addon="${safe(addOn.moduleId)}">Uninstall</button></div><small>Enable and disable changes require a bridge restart. Uninstall preserves private settings for a later reinstall.</small></div></details>`;
    return `<article class="item addon-card ${rejected ? 'muted' : ''}" data-addon-id="${safe(addOn.moduleId)}"><div class="addon-card-header"><div><p class="addon-kicker">${bridgeManaged ? `${safe(feature.name)} component` : 'Installed add-on'}</p><h3 title="${safe(`${addOn.name} ${addOn.version}`)}"><span>${safe(addOn.name)}</span> <small>${safe(addOn.version)}</small></h3><p class="addon-version">${safe(addOn.moduleId)}</p></div><div class="addon-card-status"><span class="badge">${rejected ? 'Rejected' : (addOn.enabled ? 'Enabled' : 'Disabled')}</span>${renderAddOnRuntimeStatus(addOn)}</div></div><p class="addon-description">${safe(addOn.description)}</p>${renderAddOnRuntimeSummary(addOn)}${rejected ? '' : renderAddOnQuickSummary(addOn, Boolean(fields))}${updateNotice}${rejected ? `<p class="error">${safe(addOn.error)}</p>` : ''}<div class="addon-flow">${setupGuide}${!rejected && !fields ? '<p class="notice">This component has no creator-editable settings. Continue to its connection and testing steps.</p>' : ''}${settings}${triggerReadiness}${actionGrant}${overlayTools}${viewerAdministration}${acceptance}</div>${packageDetails}${maintenance}</article>`;
  }).join('');
  const selectedArea = `<section class="selected-package-area ${selectedIsExtension ? 'selected-extension-area' : 'selected-addon-area'}"><div class="catalog-heading"><div><p class="addon-kicker">${selectedIsExtension ? 'Built-in extension settings' : 'Optional add-on settings'}</p><h3>${selectedIsExtension ? safe(selectedFeature.name) : 'Manage installed add-on'}</h3></div></div>${selector}${selectedCard}</section>`;
  const addOnArea = renderInstalledAddOnCatalog(selected) + (selectedIsExtension ? '' : selectedArea);
  list.innerHTML = renderPendingAddOnChanges() + renderMainFeatureHub() + (selectedIsExtension ? selectedArea : '') + (marketplaceList ? '' : addOnArea);
  if (marketplaceList) marketplaceList.innerHTML = renderPendingAddOnChanges() + addOnArea;
  // Saving settings and other add-on operations rebuild this subtree. Restore both open and
  // closed choices immediately so sections never flash or return to their package defaults.
  restoreDisclosureStates(list);
  if (marketplaceList) restoreDisclosureStates(marketplaceList);
  byId('addon-selector')?.addEventListener('change', (event) => { state.selectedAddOnId = event.target.value; renderAddOns(); });
  document.querySelectorAll('[data-select-feature-addon]').forEach((button) => button.addEventListener('click', () => { state.selectedAddOnId = button.dataset.selectFeatureAddon; renderAddOns(); byId('addon-selector')?.focus(); }));
  document.querySelectorAll('[data-select-installed-addon]').forEach((button) => button.addEventListener('click', () => { state.selectedAddOnId = button.dataset.selectInstalledAddon; renderAddOns(); byId('addon-selector')?.focus(); }));
  document.querySelectorAll('[data-feature-migration]').forEach((form) => form.addEventListener('submit', applyFeatureMigration));
  document.querySelectorAll('[data-toggle-feature-family]').forEach((button) => button.addEventListener('click', toggleFeatureFamily));
  document.querySelectorAll('[data-toggle-addon]').forEach((button) => button.addEventListener('click', toggleAddOn));
  document.querySelectorAll('[data-remove-addon]').forEach((button) => button.addEventListener('click', removeAddOn));
  document.querySelectorAll('[data-stage-addon-update]').forEach((button) => button.addEventListener('click', stageOfficialAddOnUpdate));
  document.querySelectorAll('[data-install-addon-update]').forEach((button) => button.addEventListener('click', installOfficialAddOnUpdate));
  document.querySelectorAll('[data-addon-settings]').forEach((form) => {
    form.addEventListener('submit', saveAddOnSettings);
    form.addEventListener('input', () => scheduleAddOnOverlayDraftPreview(form));
    form.addEventListener('change', () => { rememberAddOnSettingsDraft(form); updateAddOnFieldVisibility(form); scheduleAddOnOverlayDraftPreview(form); });
    form.querySelector('[data-overlay-editor-frame]')?.addEventListener('load', () => scheduleAddOnOverlayDraftPreview(form, true));
    form.querySelectorAll('[data-addon-sections]').forEach((button) => button.addEventListener('click', () => {
      const open = button.dataset.addonSections === 'expand';
      form.querySelectorAll('.addon-settings-section').forEach((section) => { section.open = open; });
    }));
    updateAddOnFieldVisibility(form);
    attachSceneCatalogPickers(form);
    scheduleAddOnOverlayDraftPreview(form, true);
  });
  document.querySelectorAll('[data-scene-mapping-editor]').forEach(attachSceneMappingEditor);
  document.querySelectorAll('[data-inspect-addon-actions]').forEach((button) => button.addEventListener('click', runInspection));
  document.querySelectorAll('[data-addon-action-group]').forEach((select) => select.addEventListener('change', selectAddOnActionGroup));
  document.querySelectorAll('[data-add-addon-action]').forEach((button) => button.addEventListener('click', addAddOnActionDraft));
  document.querySelectorAll('[data-add-recommended-addon-actions]').forEach((button) => button.addEventListener('click', addRecommendedAddOnActions));
  document.querySelectorAll('[data-remove-addon-action]').forEach((button) => button.addEventListener('click', removeAddOnActionDraft));
  document.querySelectorAll('[data-save-addon-action-grants]').forEach((button) => button.addEventListener('click', saveAddOnActionGrants));
  document.querySelectorAll('[data-apply-addon-changes]').forEach((button) => button.addEventListener('click', () => restartStreamBridge(button)));
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
  document.querySelector('[data-quote-vault-add-form]')?.addEventListener('submit', addQuoteVaultQuote);
  document.querySelector('[data-quote-vault-refresh]')?.addEventListener('click', refreshQuoteVaultStatus);
  document.querySelector('[data-quote-vault-sync-import]')?.addEventListener('click', importQuoteVaultFromStreamerBot);
  if (document.querySelector('[data-quote-vault-output]')) void refreshQuoteVaultStatus();
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
    status.textContent = `${result.moduleId} ${result.version} passed authenticated release provenance and package verification. Review it under Discovered packages, then choose Verify and install.${result.streamerBotImportRequired ? ` Its matching Streamer.bot import was also verified and saved in ${result.streamerBotImportDirectory}.` : ''}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    status.removeAttribute('aria-busy');
    button.disabled = false;
  }
}

async function installOfficialAddOnUpdate(event) {
  const moduleId = event.currentTarget.dataset.installAddonUpdate;
  const version = event.currentTarget.dataset.installAddonVersion;
  if (!confirm(`Update ${moduleId} to ${version}? StreamBridge will verify the authenticated release, publisher, compatibility, checksums, and inner package before installing it. Saved settings and state are preserved. Restart StreamBridge after finishing your selected updates.`)) return;
  const button = event.currentTarget;
  const status = byId('addon-update-state');
  button.disabled = true;
  status.setAttribute('aria-busy', 'true');
  status.textContent = `Verifying and updating ${moduleId} to ${version}...`;
  try {
    const publisherId = state.addOnUpdatePublisherId || '';
    const result = await api(publisherId ? '/wizard/api/addons/trusted-updates/install' : '/wizard/api/addons/updates/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ moduleId, version, approvedByCreator: true, ...(publisherId ? { publisherId } : {}) }),
    });
    markAddOnRestartRequired(result.moduleId);
    await loadAddOns();
    state.selectedAddOnId = result.moduleId;
    renderAddOns();
    activatePanel(mainFeatureForModule(result.moduleId) ? 'addons' : 'addon-marketplace');
    reportAddOnFeedback(`${result.moduleId} ${result.version} was verified and installed. Saved settings and state were preserved.${result.streamerBotImportRequired ? ` Re-import ${result.streamerBotImports.join(', ')} from ${result.streamerBotImportDirectory} in Streamer.bot so its actions match this add-on.` : ''} Restart StreamBridge once after finishing all updates.`, 'success', button);
  } catch (error) {
    reportAddOnFeedback(`The update was not installed: ${error.message}`, 'error', button);
  } finally {
    status.removeAttribute('aria-busy');
    button.disabled = false;
  }
}

async function installAllCompatibleAddOnUpdates(event) {
  const updates = (state.addOnUpdates?.addOns || []).filter((entry) => entry.state === 'update-available' && entry.latestVersion);
  if (!updates.length || state.addOnUpdatePublisherId) return;
  const summary = updates.map((entry) => `${entry.moduleId} -> ${entry.latestVersion}`).join('\n');
  if (!confirm(`Update these ${updates.length} compatible official add-on(s)?\n\n${summary}\n\nEvery package will be independently authenticated and verified. Saved settings and state are preserved. StreamBridge will need one restart after the batch finishes.`)) return;
  const button = event.currentTarget;
  const status = byId('addon-update-state');
  button.disabled = true;
  status.setAttribute('aria-busy', 'true');
  const installed = [];
  const failed = [];
  try {
    for (const update of updates) {
      status.textContent = `Updating ${update.moduleId} to ${update.latestVersion} (${installed.length + failed.length + 1} of ${updates.length})...`;
      try {
        const result = await api('/wizard/api/addons/updates/install', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ moduleId: update.moduleId, version: update.latestVersion, approvedByCreator: true }),
        });
        installed.push(`${result.moduleId} ${result.version}${result.streamerBotImportRequired ? ' (Streamer.bot re-import staged)' : ''}`);
        markAddOnRestartRequired(result.moduleId);
      } catch (error) {
        failed.push(`${update.moduleId}: ${error.message}`);
      }
    }
    await loadAddOns();
    state.addOnUpdates = null;
    button.classList.add('hidden');
    const resultText = `${installed.length} add-on(s) updated and verified.${installed.some((entry) => entry.includes('re-import staged')) ? ' Matching Streamer.bot imports were verified under data/addons/inbox/streamerbot; re-import those before testing.' : ''}${installed.length ? ' Restart StreamBridge once to activate them.' : ''}${failed.length ? ` ${failed.length} failed safely: ${failed.join(' | ')}` : ''}`;
    reportAddOnFeedback(resultText, failed.length ? 'error' : 'success', button);
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
  return state.viewerFoundation || state.addOns.find((candidate) => candidate.moduleId === 'thsv.viewer-foundation');
}

async function saveViewerFoundationLinks(nextLinks, auditRequest) {
  const addOn = viewerFoundationAddOn();
  if (!addOn) throw new Error('Viewer Foundation is not installed.');
  const previousSettings = { ...addOn.settings, accountLinks: [...(addOn.settings?.accountLinks || [])] };
  const nextSettings = { ...addOn.settings, accountLinks: nextLinks };
  await api('/wizard/api/viewer-foundation/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextSettings) });
  try {
    await viewerFoundationAdmin(auditRequest);
  } catch (error) {
    try {
      await api('/wizard/api/viewer-foundation/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(previousSettings) });
    } catch (rollbackError) {
      throw new Error(`The link audit failed and the previous settings could not be restored. Do not restart StreamBridge; review Viewer Foundation links now. Audit: ${error.message} Rollback: ${rollbackError.message}`);
    }
    throw new Error(`The link audit failed, so the settings change was rolled back: ${error.message}`);
  }
  await loadViewerFoundation();
  byId('viewer-foundation-state').textContent = 'Verified account links were saved and audited. Restart StreamBridge to apply the new identity mapping.';
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
    const counterLabels = { messages: 'Chat messages', commands: 'Commands used', follows: 'New followers', subscriptions: 'Subscriptions', memberships: 'Memberships', giftSubscriptions: 'Gift subscriptions', gifts: 'Platform gifts', cheers: 'Cheers / Bits', superChats: 'Super Chats', raids: 'Raids', rewardRedemptions: 'Reward redemptions' };
    const counterCards = Object.entries(counterLabels).map(([key, label]) => `<article class="analytics-counter"><span>${safe(label)}</span><strong>${safe(Number(counters[key] || 0).toLocaleString())}</strong></article>`).join('');
    const platformList = Array.isArray(current?.livePlatforms) ? current.livePlatforms : [];
    const platformChips = platformList.length > 0 ? platformList.map((platform) => `<span class="analytics-platform">${safe(addOnOptionLabel(platform))}</span>`).join('') : '<span class="analytics-platform analytics-platform-muted">No live platform detected</span>';
    const messageCount = Number(counters.messages || 0); const commandCount = Number(counters.commands || 0);
    const communityActions = Object.entries(counters).filter(([key]) => key !== 'messages' && key !== 'commands').reduce((total, [, count]) => total + Number(count || 0), 0);
    const recent = Array.isArray(value.recentSessions) ? value.recentSessions.slice().reverse().slice(0, 4) : [];
    const recentSessions = recent.length === 0 ? '<p class="analytics-empty">No completed streams yet. A summary appears here after every live platform goes offline.</p>' : `<div class="analytics-session-list">${recent.map((session) => { const total = Object.values(session.counters || {}).reduce((sum, count) => sum + Number(count || 0), 0); return `<article class="analytics-session"><div><strong>${safe(new Date(session.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }))}</strong><small>${safe(new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))} · ${safe(session.approximate ? 'Estimated' : 'Confirmed')}</small></div><dl><div><dt>Viewers</dt><dd>${safe(Number(session.uniqueViewers || 0).toLocaleString())}</dd></div><div><dt>Activity</dt><dd>${safe(total.toLocaleString())}</dd></div><div><dt>Length</dt><dd>${safe(formatAnalyticsDuration(session.startedAt, session.endedAt))}</dd></div></dl></article>`; }).join('')}</div>`;
    const scoreLine = value.engagementScoreEnabled ? `<span>Participation score: <strong>On</strong> · ${safe(value.scoreSeason || 'Current month')} · ${safe(Number(value.rankCohortSize || 0).toLocaleString())} ranked viewers</span>` : '<span>Participation score is off</span>';
    output.innerHTML = `<section class="analytics-now ${current ? 'is-live' : 'is-idle'}"><div><span class="analytics-live-state">${current ? 'Live now' : 'Between streams'}</span><h4>${current ? 'Current community activity' : 'Ready for the next stream'}</h4><p>${safe(current?.approximate ? 'Activity was detected without a live-start signal.' : current ? `Counting since ${new Date(current.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'Counts begin automatically when an enabled platform goes live.')}</p></div><div class="analytics-platforms">${platformChips}</div></section><div class="analytics-key-metrics"><article><span>Viewers now</span><strong>${safe(Number(current?.uniqueViewers || 0).toLocaleString())}</strong><small>Unique local identities</small></article><article><span>Chat activity</span><strong>${safe((messageCount + commandCount).toLocaleString())}</strong><small>${safe(messageCount.toLocaleString())} messages · ${safe(commandCount.toLocaleString())} commands</small></article><article><span>Community actions</span><strong>${safe(communityActions.toLocaleString())}</strong><small>Follows, support, raids, and rewards</small></article></div><details class="analytics-panel analytics-details"><summary><span><strong>All activity counters</strong><small>Open for the full platform event breakdown.</small></span></summary><div class="analytics-counter-grid">${counterCards}</div></details><section class="analytics-panel analytics-recent"><div class="analytics-panel-heading"><div><h4>Recent streams</h4><p>The latest four completed local summaries.</p></div></div>${recentSessions}</section><footer class="analytics-footnote"><span>${safe(Number(value.trackedViewerCount || 0).toLocaleString())} tracked viewers · ${safe(Number(value.retainedSessionCount || 0).toLocaleString())} retained streams</span>${scoreLine}</footer>`;
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

const quoteVaultView = { data: null, error: '', tab: 'approved', query: '', platform: 'all', sort: 'newest', page: 1, pageSize: 12, editingId: 0, searchTimer: 0 };

function quoteVaultCompactRow(quote, kind) {
  const date = quote.approvedAt || quote.submittedAt || quote.deletedAt;
  const edit = kind === 'deleted' ? '' : `<button type="button" class="ghost compact" data-quote-vault-edit="${safe(quote.id)}">Edit</button>`;
  const action = kind === 'pending'
    ? `<button type="button" class="compact" data-quote-vault-action="approve" data-quote-id="${safe(quote.id)}">Approve</button><button type="button" class="danger compact" data-quote-vault-action="delete" data-quote-id="${safe(quote.id)}">Delete</button>`
    : kind === 'deleted'
      ? `<button type="button" class="compact" data-quote-vault-action="restore" data-quote-id="${safe(quote.id)}">Restore</button>`
      : `<button type="button" class="danger compact" data-quote-vault-action="delete" data-quote-id="${safe(quote.id)}">Delete</button>`;
  const native = quote.streamerBotQuoteId ? ` · Streamer.bot #${safe(quote.streamerBotQuoteId)}` : '';
  const game = quote.gameName ? ` · ${safe(quote.gameName)}` : '';
  return `<article class="quote-vault-row" data-quote-vault-row="${safe(quote.id)}"><div class="quote-vault-row-id">#${safe(quote.id)}</div><div class="quote-vault-row-copy"><div class="quote-vault-row-heading"><strong>${safe(quote.quotedName)}</strong><span class="quote-vault-platform">${safe(addOnOptionLabel(quote.sourcePlatform))}</span></div><p>${safe(quote.text)}</p><small>${kind === 'deleted' ? 'Removed' : kind === 'pending' ? 'Submitted' : 'Added'} ${safe(date ? new Date(date).toLocaleString() : 'recently')} · ${safe(quote.submittedBy || 'Viewer')}${game}${native}</small></div><div class="quote-vault-row-actions">${edit}${action}</div></article>`;
}

function quoteVaultEditor(quote) {
  if (!quote || quote.status === 'deleted') return '';
  return `<form class="quote-vault-editor" data-quote-vault-edit-form><input type="hidden" name="quoteId" value="${safe(quote.id)}"><div class="quote-vault-editor-heading"><strong>Editing quote #${safe(quote.id)}</strong><button type="button" class="ghost compact" data-quote-vault-edit-cancel>Cancel</button></div><div class="addon-settings-grid"><label>Quoted person<input name="quotedName" required maxlength="100" value="${safe(quote.quotedName)}"></label><label class="full-row">Quote text<textarea name="text" required maxlength="400" rows="3">${safe(quote.text)}</textarea></label></div><div class="button-row"><button type="submit">Save changes</button></div></form>`;
}

function quoteVaultFilteredRows() {
  const value = quoteVaultView.data;
  if (!value) return [];
  const source = quoteVaultView.tab === 'pending' ? value.pending : quoteVaultView.tab === 'deleted' ? value.deleted : value.approved;
  const query = quoteVaultView.query.trim().toLocaleLowerCase('en-US');
  const rows = source.filter((quote) => {
    if (quoteVaultView.platform !== 'all' && quote.sourcePlatform !== quoteVaultView.platform) return false;
    if (!query) return true;
    return [quote.id, quote.quotedName, quote.text, quote.submittedBy, quote.sourcePlatform, quote.gameName, quote.streamerBotQuoteId].some((item) => String(item || '').toLocaleLowerCase('en-US').includes(query));
  });
  rows.sort((left, right) => quoteVaultView.sort === 'oldest' ? left.id - right.id : quoteVaultView.sort === 'name' ? String(left.quotedName).localeCompare(String(right.quotedName), undefined, { sensitivity: 'base' }) : right.id - left.id);
  return rows;
}

function renderQuoteVaultLibrary() {
  const output = document.querySelector('[data-quote-vault-output]');
  if (!output) return;
  const value = quoteVaultView.data;
  if (!value || typeof value !== 'object' || !value.counts) { output.innerHTML = `<p class="notice">${safe(String(value || 'Quote Vault is unavailable.'))}</p>`; return; }
  const pending = Array.isArray(value.pending) ? value.pending : [];
  const approved = Array.isArray(value.approved) ? value.approved : [];
  const deleted = Array.isArray(value.deleted) ? value.deleted : [];
  const rows = quoteVaultFilteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / quoteVaultView.pageSize));
  quoteVaultView.page = Math.min(Math.max(1, quoteVaultView.page), pages);
  const start = (quoteVaultView.page - 1) * quoteVaultView.pageSize;
  const visible = rows.slice(start, start + quoteVaultView.pageSize);
  const activeSource = quoteVaultView.tab === 'pending' ? pending : quoteVaultView.tab === 'deleted' ? deleted : approved;
  const editorQuote = [...pending, ...approved].find((quote) => quote.id === quoteVaultView.editingId);
  const empty = activeSource.length === 0 ? (quoteVaultView.tab === 'pending' ? 'No viewer quotes are waiting for approval.' : quoteVaultView.tab === 'deleted' ? 'Recoverable trash is empty.' : 'No approved quotes yet. Add one above or let viewers submit one.') : 'No quotes match the current search and platform filters.';
  const range = rows.length ? `${start + 1}–${Math.min(start + quoteVaultView.pageSize, rows.length)} of ${rows.length}` : '0 results';
  output.innerHTML = `<div class="quote-vault-counts" role="tablist" aria-label="Quote library sections"><button type="button" role="tab" aria-selected="${quoteVaultView.tab === 'pending'}" data-quote-vault-tab="pending"><span>Needs review</span><strong>${safe(value.counts.pending || 0)}</strong><small>Viewer submissions</small></button><button type="button" role="tab" aria-selected="${quoteVaultView.tab === 'approved'}" data-quote-vault-tab="approved"><span>Approved</span><strong>${safe(value.counts.approved || 0)}</strong><small>of ${safe(value.capacity?.approved || 0)}</small></button><button type="button" role="tab" aria-selected="${quoteVaultView.tab === 'deleted'}" data-quote-vault-tab="deleted"><span>Recoverable</span><strong>${safe(value.counts.recoverable || 0)}</strong><small>Recently removed</small></button></div><div class="quote-vault-toolbar"><label class="quote-vault-search">Search quotes<input type="search" data-quote-vault-search value="${safe(quoteVaultView.query)}" placeholder="Person, text, ID, or submitter"></label><label>Platform<select data-quote-vault-platform><option value="all">All platforms</option>${['twitch', 'youtube', 'kick', 'tiktok'].map((platform) => `<option value="${platform}"${quoteVaultView.platform === platform ? ' selected' : ''}>${safe(addOnOptionLabel(platform))}</option>`).join('')}</select></label><label>Sort<select data-quote-vault-sort><option value="newest"${quoteVaultView.sort === 'newest' ? ' selected' : ''}>Newest first</option><option value="oldest"${quoteVaultView.sort === 'oldest' ? ' selected' : ''}>Oldest first</option><option value="name"${quoteVaultView.sort === 'name' ? ' selected' : ''}>Quoted person</option></select></label><label>Per page<select data-quote-vault-page-size>${[12, 25, 50].map((size) => `<option value="${size}"${quoteVaultView.pageSize === size ? ' selected' : ''}>${size}</option>`).join('')}</select></label></div>${quoteVaultView.error ? `<p class="notice quote-vault-error" role="alert">${safe(quoteVaultView.error)}</p>` : ''}${quoteVaultEditor(editorQuote)}<section class="quote-vault-section" role="tabpanel"><div class="quote-vault-section-heading"><div><h4>${quoteVaultView.tab === 'pending' ? 'Needs review' : quoteVaultView.tab === 'deleted' ? 'Recoverable trash' : 'Approved library'}</h4><small>${safe(range)}</small></div>${quoteVaultView.query || quoteVaultView.platform !== 'all' ? '<button type="button" class="ghost compact" data-quote-vault-clear>Clear filters</button>' : ''}</div>${visible.length ? `<div class="quote-vault-list">${visible.map((quote) => quoteVaultCompactRow(quote, quoteVaultView.tab)).join('')}</div>` : `<p class="notice">${safe(empty)}</p>`}<nav class="quote-vault-pagination" aria-label="Quote pages"><button type="button" class="ghost compact" data-quote-vault-page="previous"${quoteVaultView.page <= 1 ? ' disabled' : ''}>Previous</button><span>Page ${safe(quoteVaultView.page)} of ${safe(pages)}</span><button type="button" class="ghost compact" data-quote-vault-page="next"${quoteVaultView.page >= pages ? ' disabled' : ''}>Next</button></nav></section>`;
  output.querySelectorAll('[data-quote-vault-edit-form]').forEach((form) => form.addEventListener('submit', editQuoteVaultQuote));
  output.querySelectorAll('[data-quote-vault-action]').forEach((button) => button.addEventListener('click', runQuoteVaultAction));
  output.querySelectorAll('[data-quote-vault-tab]').forEach((button) => button.addEventListener('click', () => { quoteVaultView.tab = button.dataset.quoteVaultTab; quoteVaultView.page = 1; quoteVaultView.editingId = 0; renderQuoteVaultLibrary(); }));
  output.querySelectorAll('[data-quote-vault-edit]').forEach((button) => button.addEventListener('click', () => { quoteVaultView.editingId = Number(button.dataset.quoteVaultEdit); renderQuoteVaultLibrary(); output.querySelector('[data-quote-vault-edit-form] input[name="quotedName"]')?.focus(); }));
  output.querySelector('[data-quote-vault-edit-cancel]')?.addEventListener('click', () => { quoteVaultView.editingId = 0; renderQuoteVaultLibrary(); });
  output.querySelector('[data-quote-vault-clear]')?.addEventListener('click', () => { quoteVaultView.query = ''; quoteVaultView.platform = 'all'; quoteVaultView.page = 1; renderQuoteVaultLibrary(); });
  output.querySelector('[data-quote-vault-search]')?.addEventListener('input', (event) => { quoteVaultView.query = event.currentTarget.value; quoteVaultView.page = 1; clearTimeout(quoteVaultView.searchTimer); quoteVaultView.searchTimer = setTimeout(() => { renderQuoteVaultLibrary(); const search = output.querySelector('[data-quote-vault-search]'); search?.focus(); if (search) search.setSelectionRange(search.value.length, search.value.length); }, 120); });
  output.querySelector('[data-quote-vault-platform]')?.addEventListener('change', (event) => { quoteVaultView.platform = event.currentTarget.value; quoteVaultView.page = 1; renderQuoteVaultLibrary(); });
  output.querySelector('[data-quote-vault-sort]')?.addEventListener('change', (event) => { quoteVaultView.sort = event.currentTarget.value; quoteVaultView.page = 1; renderQuoteVaultLibrary(); });
  output.querySelector('[data-quote-vault-page-size]')?.addEventListener('change', (event) => { quoteVaultView.pageSize = Number(event.currentTarget.value) || 12; quoteVaultView.page = 1; renderQuoteVaultLibrary(); });
  output.querySelectorAll('[data-quote-vault-page]').forEach((button) => button.addEventListener('click', () => { quoteVaultView.page += button.dataset.quoteVaultPage === 'next' ? 1 : -1; renderQuoteVaultLibrary(); output.querySelector('.quote-vault-section-heading')?.scrollIntoView({ block: 'nearest' }); }));
  const syncStatus = document.querySelector('[data-quote-vault-sync-status]');
  if (syncStatus && value.streamerBotSync) syncStatus.textContent = value.streamerBotSync.enabled ? `${value.streamerBotSync.mirrored || 0} approved quote(s) currently map to Streamer.bot native IDs.` : 'Synchronization is disabled. Enable it in Quote Vault settings before importing or mirroring.';
}

function quoteVaultOutput(value) {
  if (value && typeof value === 'object' && value.counts) { quoteVaultView.data = value; quoteVaultView.error = ''; }
  else quoteVaultView.error = String(value || 'Quote Vault is unavailable.');
  renderQuoteVaultLibrary();
}

async function quoteVaultAdmin(request) {
  const result = await api('/wizard/api/quote-vault/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  quoteVaultOutput(result);
  return result;
}

async function refreshQuoteVaultStatus() {
  try { await quoteVaultAdmin({ operation: 'status' }); } catch (error) { quoteVaultOutput(error.message); }
}

async function importQuoteVaultFromStreamerBot() {
  if (!confirm('Import compatible Streamer.bot native quotes into Quote Vault? Existing quotes remain in Streamer.bot and duplicates are linked instead of copied twice.')) return;
  try {
    await quoteVaultAdmin({ operation: 'sync-import', approvedByCreator: true });
    const status = document.querySelector('[data-quote-vault-sync-status]');
    if (status) status.textContent = 'Import requested. Refresh the library in a moment after Streamer.bot returns the native quote list.';
    setTimeout(() => void refreshQuoteVaultStatus(), 1200);
  } catch (error) { quoteVaultOutput(error.message); }
}

async function addQuoteVaultQuote(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try {
    quoteVaultView.tab = 'approved'; quoteVaultView.page = 1; quoteVaultView.sort = 'newest';
    await quoteVaultAdmin({ operation: 'add', quotedName: form.elements.quotedName.value.trim(), text: form.elements.text.value.trim(), sourcePlatform: form.elements.sourcePlatform.value, approvedByCreator: true });
    form.reset();
  } catch (error) { quoteVaultOutput(error.message); }
}

async function editQuoteVaultQuote(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  try { quoteVaultView.editingId = 0; await quoteVaultAdmin({ operation: 'edit', quoteId: Number(form.elements.quoteId.value), quotedName: form.elements.quotedName.value.trim(), text: form.elements.text.value.trim(), approvedByCreator: true }); }
  catch (error) { quoteVaultOutput(error.message); }
}

async function runQuoteVaultAction(event) {
  const operation = event.currentTarget.dataset.quoteVaultAction;
  const quoteId = Number(event.currentTarget.dataset.quoteId);
  if (operation === 'delete' && !confirm(`Move quote #${quoteId} to recoverable trash?`)) return;
  try { await quoteVaultAdmin({ operation, quoteId, approvedByCreator: true }); }
  catch (error) { quoteVaultOutput(error.message); }
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
  const permissionBlocked = /moderator:read:followers|active Twitch OAuth token/iu.test(String(value.lastError || ''));
  const error = value.lastError ? `<p class="notice"><strong>Last scan issue:</strong> ${safe(value.lastError)}${permissionBlocked ? '<br><br><strong>Fix:</strong> Open Streamer.bot &rarr; Platforms &rarr; Twitch &rarr; Accounts, reconnect the <strong>Broadcaster Account</strong> (not the Bot Account), approve every requested permission, then return here and click <strong>Check Twitch now</strong>.' : ''}</p>` : '';
  output.innerHTML = `<div class="grid"><article class="stat"><span>Baseline</span><strong>${value.baselineComplete ? 'Ready' : permissionBlocked ? 'Permission needed' : 'Not ready'}</strong><small>${value.baselineComplete ? 'Complete comparisons enabled' : permissionBlocked ? 'Reconnect the Twitch broadcaster account' : 'Waiting for one complete scan'}</small></article><article class="stat"><span>Tracked followers</span><strong>${safe(Number(value.trackedFollowerCount || 0).toLocaleString())}</strong><small>Last Twitch total: ${safe(Number(value.lastApiTotal || 0).toLocaleString())}</small></article><article class="stat"><span>Pending confirmation</span><strong>${safe(Number(value.pendingConfirmationCount || 0).toLocaleString())}</strong><small>${safe(Number(value.confirmMissingScans || 2))} complete missing scans required</small></article><article class="stat"><span>Snapshot</span><strong>${value.scanActive ? 'Checking now' : permissionBlocked ? 'Waiting for permission' : 'Idle'}</strong><small>Last attempt: ${safe(lastAttempt)}<br>Last complete: ${safe(lastScan)}<br>Next check: ${safe(nextScan)}${Number(value.consecutiveFailures || 0) > 0 && !permissionBlocked ? `<br>Retry level: ${safe(Number(value.consecutiveFailures))}` : ''}</small></article></div>${error}<h4>Recent confirmed changes</h4>${history}`;
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
    markAddOnRestartRequired(result.moduleId);
    await loadAddOns();
    if (state.addOns.some((addOn) => addOn.moduleId === result.moduleId)) {
      state.selectedAddOnId = result.moduleId;
      renderAddOns();
      activatePanel(mainFeatureForModule(result.moduleId) ? 'addons' : 'addon-marketplace');
    }
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

async function toggleFeatureFamily(event) {
  const button = event.currentTarget;
  const featureId = button.dataset.toggleFeatureFamily;
  const feature = mainFeatureFamilies().find((candidate) => candidate.id === featureId);
  if (!feature) return reportAddOnFeedback('That extension group is no longer available. Refresh the wizard and try again.', 'error', button);
  const enabled = button.dataset.featureEnabled !== 'true';
  const verb = enabled ? 'enable' : 'disable';
  const detail = enabled
    ? 'StreamBridge will install any missing included components and enable the whole group. Existing settings stay preserved.'
    : 'Every installed component owned by this group will be disabled. Saved settings and history stay preserved.';
  if (!confirm(`${enabled ? 'Enable' : 'Disable'} ${feature.name}? ${detail} One StreamBridge restart is required.`)) return;
  button.disabled = true;
  button.textContent = enabled ? 'Enabling group…' : 'Disabling group…';
  try {
    const result = await api(`/wizard/api/extensions/${encodeURIComponent(featureId)}/enabled`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled, approvedByCreator: true }) });
    for (const moduleId of result.modules || feature.modules || []) markAddOnRestartRequired(moduleId);
    await loadAddOns();
    const installed = Array.isArray(result.installed) && result.installed.length ? ` ${result.installed.length} missing component${result.installed.length === 1 ? ' was' : 's were'} added from this verified installation.` : '';
    reportAddOnFeedback(`${feature.name} was ${enabled ? 'enabled' : 'disabled'} as one group.${installed} Restart StreamBridge once to apply the group.`, 'success', button);
  } catch (error) {
    button.disabled = false;
    button.textContent = enabled ? 'Enable group' : 'Disable group';
    reportAddOnFeedback(`${feature.name} was not ${verb}d: ${error.message}`, 'error', button);
  }
}

async function applyFeatureMigration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const moduleId = form.dataset.featureMigration;
  const button = form.querySelector('button[type="submit"]');
  const importData = form.elements.importData?.checked === true;
  const enabled = form.elements.enabled?.checked === true;
  const replaceExistingData = form.elements.replaceExistingData?.checked === true;
  const dataWarning = replaceExistingData ? ' Existing component data will be replaced by the retained migration copy.' : '';
  if (!confirm(`Apply the migration choice for ${moduleId}? Saved migration data will ${importData ? 'be imported' : 'remain in the private inbox'} and the component will ${enabled ? 'be enabled' : 'stay disabled'} after restart.${dataWarning}`)) return;
  try {
    await api(`/wizard/api/addons/${encodeURIComponent(moduleId)}/feature-migration`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ importData, enabled, replaceExistingData, approvedByCreator: true }) });
    markAddOnRestartRequired(moduleId);
    await loadAddOns();
    reportAddOnFeedback(`${moduleId} migration choice was saved. ${importData ? 'Migrated data was imported.' : 'Migrated data remains available but was not imported.'} Restart StreamBridge to apply the component state.`, 'success', button);
  } catch (error) { reportAddOnFeedback(`${moduleId} migration was not applied: ${error.message}`, 'error', button); }
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
  const isViewerFoundation = id === 'thsv.viewer-foundation';
  const isCommunityAnalytics = id === 'thsv.community-analytics';
  const isKofiDonations = id === 'thsv.kofi-donations';
  const addOn = isViewerFoundation ? state.viewerFoundation : isCommunityAnalytics ? state.communityAnalytics : isKofiDonations ? state.kofiDonations : state.addOns.find((candidate) => candidate.moduleId === id);
  const sceneEditor = form.querySelector('[data-scene-mapping-editor]');
  if (sceneEditor) {
    const mappings = syncSceneMappingEditor(sceneEditor);
    if (mappings.some((mapping) => !mapping.sceneName || !mapping.actionId)) { const message = 'Every scene mapping needs an exact scene name and a target action.'; byId('addon-state').textContent = message; showWizardFeedback(message, 'error', button); return; }
    if (new Set(mappings.map((mapping) => mapping.id)).size !== mappings.length) { const message = 'Every scene mapping needs a unique ID.'; byId('addon-state').textContent = message; showWizardFeedback(message, 'error', button); return; }
  }
  const settings = collectAddOnSettings(form, addOn);
  if (settings === null) { reportAddOnFeedback(`Settings were not saved for ${id}: the form is incomplete.`, 'error', button); return; }
  if (button) { button.disabled = true; button.textContent = 'Saving…'; }
  try {
    const settingsEndpoint = isViewerFoundation ? '/wizard/api/viewer-foundation/settings' : isCommunityAnalytics ? '/wizard/api/community-analytics/settings' : isKofiDonations ? '/wizard/api/kofi-donations/settings' : `/wizard/api/addons/${encodeURIComponent(id)}/settings`;
    await api(settingsEndpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
    let raidStopGrantSaved = false;
    if (id === 'thsv.raid-scout' && settings.endBroadcastAfterRaid === true && settings.endBroadcastAcknowledged === true && settings.endBroadcastActionId) {
      const actionIds = [...new Set([...(addOn.approvedActionIds || []), RAID_SCOUT_CONTROLLER_ACTION_ID, RAID_SCOUT_RUN_ENDING_AD_ACTION_ID, settings.endBroadcastActionId])];
      await api(`/wizard/api/addons/${encodeURIComponent(id)}/action-grants`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionIds, approvedByCreator: true }) });
      raidStopGrantSaved = true;
    }
    markAddOnRestartRequired(id);
    if (isViewerFoundation) await loadViewerFoundation(); else if (isCommunityAnalytics) await loadCommunityAnalytics(); else if (isKofiDonations) await loadKofiDonationsIntegration(); else await loadAddOns();
    const message = raidStopGrantSaved
      ? `Settings and the selected Stop Streaming action grant were saved for ${id}. Restart StreamBridge to apply them.`
      : isViewerFoundation
        ? 'Viewer Foundation settings saved. Restart StreamBridge to apply them.'
        : isCommunityAnalytics
          ? 'Community Analytics settings saved. Restart StreamBridge to apply them.'
          : isKofiDonations
            ? 'Ko-fi provider settings saved. Restart StreamBridge to apply them.'
        : `Settings saved for ${id}. Restart StreamBridge to apply them.`;
    reportAddOnFeedback(message, 'success', button);
  } catch (error) { const message = `Settings were not saved for ${id}: ${error.message}`; reportAddOnFeedback(message, 'error', button); }
  finally { if (button?.isConnected) { button.disabled = false; button.textContent = originalLabel; button.classList.remove('is-working'); button.removeAttribute('aria-busy'); } }
}

const addOnOverlayDraftPreviewState = new WeakMap();

function collectAddOnSettings(form, addOn) {
  if (!addOn?.configurationSchema?.properties) return null;
  const settings = {};
  for (const [name, schema] of Object.entries(addOn.configurationSchema.properties)) {
    const field = form.elements.namedItem(name);
    if (!field) return null;
    if (schema.type === 'boolean') settings[name] = field.checked;
    else if (schema.type === 'array' && Array.isArray(schema.items?.enum)) settings[name] = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]:checked`)].map((input) => input.value);
    else if (schema.type === 'array') settings[name] = field.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    else if (schema.type === 'number' || schema.type === 'integer') settings[name] = Number(field.value);
    else settings[name] = field.value;
  }
  return settings;
}

function scheduleAddOnOverlayDraftPreview(form, immediate = false) {
  const frame = form.querySelector('[data-overlay-editor-frame]');
  if (!frame) return;
  const prior = addOnOverlayDraftPreviewState.get(form) || { timer: 0, revision: 0 };
  clearTimeout(prior.timer);
  prior.revision += 1;
  const revision = prior.revision;
  prior.timer = setTimeout(() => void updateAddOnOverlayDraftPreview(form, revision), immediate ? 0 : 140);
  addOnOverlayDraftPreviewState.set(form, prior);
}

async function updateAddOnOverlayDraftPreview(form, revision) {
  if (!form.isConnected) return;
  const moduleId = form.dataset.addonSettings;
  const addOn = state.addOns.find((candidate) => candidate.moduleId === moduleId);
  const frame = form.querySelector('[data-overlay-editor-frame]');
  const status = form.querySelector('[data-overlay-draft-state]');
  const settings = collectAddOnSettings(form, addOn);
  if (!frame || !status || settings === null) return;
  status.textContent = 'Updating preview...';
  status.className = 'status-chip status-neutral';
  try {
    const mode = moduleId === 'thsv.ad-break-companion' ? 'active' : '';
    const result = await api(`/wizard/api/addons/${encodeURIComponent(moduleId)}/overlay-preview-draft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings, mode }) });
    const current = addOnOverlayDraftPreviewState.get(form);
    if (!form.isConnected || current?.revision !== revision) return;
    frame.contentWindow?.postMessage({ kind: 'thsv.overlay-editor.preview', event: result.event }, location.origin);
    status.textContent = 'Draft preview - not saved';
    status.className = 'status-chip status-ready';
    status.removeAttribute('title');
  } catch (error) {
    const current = addOnOverlayDraftPreviewState.get(form);
    if (!form.isConnected || current?.revision !== revision) return;
    status.textContent = 'Preview paused';
    status.className = 'status-chip status-warning';
    status.title = error.message;
  }
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
  let live = false;
  try { live = Boolean((await api('/wizard/api/operations/health')).activeSession); } catch { /* Restart remains offline-gated by the service. */ }
  const warning = live
    ? `You are currently live. Save ${actionIds.length} approved action grant(s) for ${id}? The active Bridge will not change, and Apply changes and verify will remain blocked until every platform is offline.`
    : `Allow ${id} to dispatch exactly ${actionIds.length} approved Streamer.bot action(s)? This takes effect after StreamBridge restarts.`;
  if (!confirm(warning)) return;
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
    markAddOnRestartRequired(result.moduleId);
    form.reset();
    await loadAddOns();
    if (state.addOns.some((addOn) => addOn.moduleId === result.moduleId)) {
      state.selectedAddOnId = result.moduleId;
      renderAddOns();
      activatePanel(mainFeatureForModule(result.moduleId) ? 'addons' : 'addon-marketplace');
    }
    reportAddOnFeedback(`Installed ${result.moduleId} ${result.version}. Restart StreamBridge to activate it.`, 'success', form.querySelector('button[type="submit"]'));
  } catch (error) { reportAddOnFeedback(`The add-on was not installed: ${error.message}`, 'error', form.querySelector('button[type="submit"]')); }
  finally { status.removeAttribute('aria-busy'); }
});
byId('refresh-addons').addEventListener('click', loadAddOns);
byId('refresh-addon-marketplace')?.addEventListener('click', loadAddOns);
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
    const updateAllButton = byId('update-all-compatible-addons');
    updateAllButton?.classList.toggle('hidden', !result.available || result.updateCount < 1);
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
byId('update-all-compatible-addons')?.addEventListener('click', installAllCompatibleAddOnUpdates);
byId('trusted-publisher-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  try {
    await api('/wizard/api/addons/trusted-publishers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publisherId: form.elements.publisherId.value.trim(), repository: form.elements.repository.value.trim(), approvedByCreator: form.elements.approvedByCreator.checked }) });
    form.reset(); await loadAddOns(); byId('addon-state').textContent = 'Trusted publisher saved. No package was downloaded or installed.';
  } catch (error) { byId('addon-state').textContent = error.message; }
});
document.querySelector('[data-view="addons"]').addEventListener('click', loadAddOns);
byId('refresh-viewer-foundation')?.addEventListener('click', loadViewerFoundation);
document.querySelector('[data-view="viewer-foundation"]')?.addEventListener('click', loadViewerFoundation);
byId('refresh-community-analytics')?.addEventListener('click', loadCommunityAnalytics);
document.querySelector('[data-view="community-analytics"]')?.addEventListener('click', loadCommunityAnalytics);
document.querySelector('[data-view="alerts"]')?.addEventListener('click', loadKofiDonationsIntegration);
// If navigation persistence restores the Add-ons page after a reload, authentication loads its
// inventory without requiring the creator to leave the page and return.
document.addEventListener('wizard:authenticated', () => {
  if (document.querySelector('[data-view="addons"]').classList.contains('active')) void loadAddOns();
  if (document.querySelector('[data-view="viewer-foundation"]')?.classList.contains('active')) void loadViewerFoundation();
  if (document.querySelector('[data-view="community-analytics"]')?.classList.contains('active')) void loadCommunityAnalytics();
  if (document.querySelector('[data-view="alerts"]')?.classList.contains('active')) void loadKofiDonationsIntegration();
});
const ADD_ON_OVERLAY_PATHS = Object.freeze({
  'thsv.automated-shoutouts': '/overlay/shoutouts',
  'thsv.random-clip-player': '/overlay/clips',
  'thsv.subathon-timer': '/overlay/subathon',
  'thsv.starting-soon-countdown': '/overlay/countdown',
  'thsv.ad-break-companion': '/overlay/ad-break',
});
