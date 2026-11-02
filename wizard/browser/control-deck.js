'use strict';
// Control Deck pop-out: one tab per extension. A tab works only while that extension is turned on
// and running in StreamBridge; otherwise it is grey and cannot be chosen. Each extension sends a
// small description of its controls and this page draws it. The page unlocks the same way as the
// Setup Wizard (a one-use link from the Wizard, the tray or Streamer.bot, one click on this PC when
// chosen, or the Wizard password) and keeps the password only in this window's memory.
(() => {
  const byId = (id) => document.getElementById(id);
  const TAB_KEY = 'thsv.streambridge.control-deck.last-tab';
  const POLL_MS = 2_000;
  const tabId = (() => { try { const existing = sessionStorage.getItem('thsv.streambridge.control-deck.tab'); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem('thsv.streambridge.control-deck.tab', created); return created; } catch { return crypto.randomUUID(); } })();
  const state = { token: '', tabs: [], active: '', view: null, viewJson: '', busy: false, polling: false, polls: 0 };
  try { const theme = localStorage.getItem('thsv.streambridge.wizard.theme.v1'); if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme; } catch { /* Uses the dark theme. */ }

  function remember(moduleId) { try { localStorage.setItem(TAB_KEY, moduleId); } catch { /* Not remembered in a private window. */ } }
  function remembered() { try { return localStorage.getItem(TAB_KEY) || ''; } catch { return ''; } }

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${state.token}`, 'x-thsv-wizard-tab': tabId, ...(options.headers || {}) } });
    let body = {};
    try { body = await response.json(); } catch { /* An empty answer has no message. */ }
    if (!response.ok) { const error = new Error(body.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return body;
  }

  async function unlockWith(path, body, headers = {}) {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.controlToken !== 'string') throw new Error(result.error || `Unlock failed (${response.status})`);
    return result.controlToken;
  }

  async function authenticate(token) {
    state.token = token;
    try { await loadTabs(); }
    catch (error) { state.token = ''; throw error.status === 401 ? new Error('That password did not work.') : error; }
    byId('login').classList.add('hidden');
    byId('workspace').classList.remove('hidden');
    const requested = new URLSearchParams(location.search).get('tab') || '';
    const usable = (id) => state.tabs.some((tab) => tab.moduleId === id && tab.enabled);
    const first = [requested, remembered()].find(usable) || state.tabs.find((tab) => tab.enabled)?.moduleId || '';
    if (requested && !usable(requested)) {
      const tab = state.tabs.find((candidate) => candidate.moduleId === requested);
      showResult('bad', tab ? tab.reason || `${tab.name} is not available right now.` : 'That extension has no Control Deck tab.');
    }
    await selectTab(first);
  }

  async function start() {
    const params = new URLSearchParams(location.hash.slice(1));
    const ticket = params.get('unlock');
    if (ticket) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      try { if (!/^[A-Za-z0-9_-]{43}$/u.test(ticket)) throw new Error('The unlock link is invalid.'); await authenticate(await unlockWith('/wizard/api/unlock', { ticket })); return; }
      catch (error) { byId('login-error').textContent = `${error.message} Open the Control Deck again from the Wizard, the tray or Streamer.bot.`; }
    }
    try {
      const access = await (await fetch('/wizard/api/access')).json();
      if (access.mode === 'this-pc') await authenticate(await unlockWith('/wizard/api/unlock-local', {}, { 'x-thsv-wizard-tab': tabId }));
    } catch (error) { byId('login-error').textContent = error.message; }
  }

  async function loadTabs() {
    const result = await api('/wizard/api/control-deck/tabs');
    state.tabs = Array.isArray(result.tabs) ? result.tabs : [];
    renderTabs();
  }

  function renderTabs() {
    const strip = byId('tabs');
    strip.replaceChildren(...state.tabs.map((tab) => {
      const button = document.createElement('button');
      button.type = 'button'; button.setAttribute('role', 'tab'); button.dataset.tab = tab.moduleId; button.textContent = tab.name;
      const selected = tab.moduleId === state.active;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected || (!state.active && tab.enabled) ? 0 : -1;
      if (!tab.enabled) { button.setAttribute('aria-disabled', 'true'); button.title = tab.reason || `${tab.name} is not available right now.`; }
      else button.title = `Open ${tab.name}`;
      return button;
    }));
    strip.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  async function selectTab(moduleId) {
    const tab = state.tabs.find((candidate) => candidate.moduleId === moduleId);
    if (!tab || !tab.enabled) {
      state.active = ''; state.view = null; state.viewJson = ''; renderTabs();
      const panel = byId('panel');
      const note = document.createElement('p'); note.className = 'empty';
      note.textContent = state.tabs.some((candidate) => candidate.enabled) ? 'Choose a tab above.' : 'No extension with Control Deck controls is turned on. Turn one on in the Setup Wizard under Extensions, save, then restart StreamBridge.';
      panel.replaceChildren(note);
      return;
    }
    if (state.active !== moduleId) { state.view = null; state.viewJson = ''; showResult('', ''); }
    state.active = moduleId; remember(moduleId);
    const url = new URL(location.href); url.searchParams.set('tab', moduleId); history.replaceState(null, '', `${url.pathname}${url.search}`);
    renderTabs();
    byId('panel').setAttribute('aria-label', tab.name);
    await run('view', undefined, { quiet: true });
  }

  function showResult(kind, text) { const line = byId('result'); line.className = `result ${kind}`.trim(); line.textContent = text; }

  // Re-drawing every two seconds must not wipe what the creator is typing or move their focus.
  function snapshotInputs() {
    const values = new Map();
    for (const input of byId('panel').querySelectorAll('[data-key]')) values.set(input.dataset.key, input.value);
    const focused = document.activeElement?.dataset?.key || '';
    return { values, focused };
  }
  function restoreInputs(snapshot) {
    for (const input of byId('panel').querySelectorAll('[data-key]')) if (snapshot.values.has(input.dataset.key)) input.value = snapshot.values.get(input.dataset.key);
    if (snapshot.focused) byId('panel').querySelector(`[data-key="${CSS.escape(snapshot.focused)}"]`)?.focus();
  }

  function actionButton(action) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = action.label;
    button.className = `tone-${action.tone || 'default'}`;
    button.disabled = action.disabled === true || state.busy;
    button.addEventListener('click', () => {
      if (action.confirm && !window.confirm(action.confirm)) return;
      void run(action.operation, action.args, { button });
    });
    return button;
  }

  function inputFor(input, key) {
    const id = `input-${key.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;
    const label = document.createElement('label'); label.htmlFor = id; label.textContent = input.label;
    let control;
    if (input.type === 'select') {
      control = document.createElement('select');
      for (const option of input.options || []) { const element = document.createElement('option'); element.value = option.value; element.textContent = option.label; control.append(element); }
    } else {
      control = document.createElement('input');
      control.type = input.type === 'number' ? 'number' : input.type === 'url' ? 'url' : 'text';
      control.autocomplete = 'off';
      if (input.type === 'number') { if (typeof input.min === 'number') control.min = String(input.min); if (typeof input.max === 'number') control.max = String(input.max); control.step = 'any'; }
      if (typeof input.maxLength === 'number') control.maxLength = input.maxLength;
      if (input.placeholder) control.placeholder = input.placeholder;
    }
    control.id = id; control.name = input.name; control.dataset.key = key; control.dataset.kind = input.type;
    if (input.value !== undefined) control.value = String(input.value);
    const wrapper = document.createElement('div'); wrapper.append(label, control);
    return wrapper;
  }

  function formFor(form, sectionIndex) {
    const element = document.createElement('form'); element.className = 'section-form'; element.noValidate = false;
    const grid = document.createElement('div'); grid.className = 'form-grid';
    for (const input of form.inputs) grid.append(inputFor(input, `${String(sectionIndex)}:${form.operation}:${input.name}`));
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = form.submitLabel; submit.disabled = state.busy;
    element.append(grid, submit);
    element.addEventListener('submit', (event) => {
      event.preventDefault();
      const args = {};
      for (const control of element.querySelectorAll('[data-key]')) {
        if (control.dataset.kind === 'number') { if (control.value.trim() !== '') args[control.name] = Number(control.value); }
        else args[control.name] = control.value;
      }
      void run(form.operation, args, { button: submit, form: element });
    });
    return element;
  }

  function sectionFor(section, index) {
    const card = document.createElement('section'); card.className = 'card';
    const heading = document.createElement('h3'); heading.textContent = section.title; card.append(heading);
    if (section.fields?.length) {
      const list = document.createElement('dl'); list.className = 'fields';
      for (const field of section.fields) { const term = document.createElement('dt'); term.textContent = field.label; const value = document.createElement('dd'); value.textContent = field.value; list.append(term, value); }
      card.append(list);
    }
    if (section.items?.length) {
      const list = document.createElement('ul'); list.className = 'items';
      for (const item of section.items) {
        const row = document.createElement('li'); row.dataset.item = item.id;
        const textBox = document.createElement('span'); textBox.className = 'item-text';
        const label = document.createElement('span'); label.className = 'item-label'; label.textContent = item.label; textBox.append(label);
        if (item.detail) { const detail = document.createElement('span'); detail.className = 'item-detail'; detail.textContent = item.detail; textBox.append(detail); }
        row.append(textBox);
        if (item.actions?.length) { const actions = document.createElement('span'); actions.className = 'row-actions'; actions.append(...item.actions.map(actionButton)); row.append(actions); }
        list.append(row);
      }
      card.append(list);
    } else if (Array.isArray(section.items)) {
      const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Nothing here right now.'; card.append(empty);
    }
    if (section.actions?.length) { const actions = document.createElement('div'); actions.className = 'section-actions'; actions.append(...section.actions.map(actionButton)); card.append(actions); }
    if (section.form) card.append(formFor(section.form, index));
    return card;
  }

  function renderView() {
    const panel = byId('panel'); const view = state.view;
    if (!view) return;
    const snapshot = snapshotInputs();
    const head = document.createElement('div'); head.className = 'panel-head';
    const title = document.createElement('h2'); title.textContent = view.title; head.append(title);
    if (view.status) { const status = document.createElement('p'); status.className = 'panel-status'; status.textContent = view.status; head.append(status); }
    panel.replaceChildren(head, ...view.sections.map(sectionFor));
    restoreInputs(snapshot);
  }

  async function run(operation, args, options = {}) {
    const moduleId = state.active;
    if (!moduleId || (state.busy && !options.quiet)) return;
    if (!options.quiet) { state.busy = true; renderView(); showResult('', 'Working…'); }
    try {
      const result = await api('/wizard/api/control-deck/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ moduleId, operation, ...(args === undefined ? {} : { args }) }) });
      if (moduleId !== state.active) return;
      if (options.form) for (const control of options.form.querySelectorAll('[data-key]')) { control.value = ''; control.blur(); }
      const json = JSON.stringify(result.view);
      const changed = json !== state.viewJson;
      state.view = result.view; state.viewJson = json;
      if (!options.quiet) showResult('ok', result.view.message || 'Done.');
      else if (changed) renderView();
    } catch (error) {
      if (moduleId !== state.active) return;
      if (!options.quiet || !state.view) showResult('bad', error.message);
      // The extension may have been turned off or stopped since the tabs were loaded.
      if (error.status === 409 || error.status === 404) { try { await loadTabs(); if (!state.tabs.some((tab) => tab.moduleId === moduleId && tab.enabled)) await selectTab(''); } catch { /* Keeps the current tabs. */ } }
    } finally {
      if (!options.quiet) { state.busy = false; renderView(); }
    }
  }

  async function poll() {
    if (!state.token || state.busy || state.polling || document.visibilityState !== 'visible') return;
    state.polling = true;
    try {
      state.polls += 1;
      // Tabs are checked less often, so an extension turned on elsewhere shows up without a reload.
      if (state.polls % 5 === 0) { await loadTabs(); if (state.active && !state.tabs.some((tab) => tab.moduleId === state.active && tab.enabled)) await selectTab(''); }
      if (state.active) await run('view', undefined, { quiet: true });
    } catch { /* The next poll tries again. */ }
    finally { state.polling = false; }
  }

  byId('tabs').addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-tab]') : null;
    if (!button || button.getAttribute('aria-disabled') === 'true' || state.busy) return;
    void selectTab(button.dataset.tab);
  });
  byId('tabs').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const enabled = state.tabs.filter((tab) => tab.enabled);
    const index = enabled.findIndex((tab) => tab.moduleId === state.active);
    const next = enabled[(index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    if (next) { event.preventDefault(); void selectTab(next.moduleId).then(() => byId('tabs').querySelector(`[data-tab="${CSS.escape(next.moduleId)}"]`)?.focus()); }
  });
  byId('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = byId('token'); const token = input.value.trim(); input.value = '';
    byId('login-error').textContent = '';
    if (token) authenticate(token).catch((error) => { byId('login-error').textContent = error.message; });
  });
  byId('refresh').addEventListener('click', () => { loadTabs().then(() => selectTab(state.tabs.some((tab) => tab.moduleId === state.active && tab.enabled) ? state.active : (state.tabs.find((tab) => tab.enabled)?.moduleId || ''))).catch((error) => showResult('bad', error.message)); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void poll(); });
  setInterval(() => { void poll(); }, POLL_MS);
  void start();
})();
