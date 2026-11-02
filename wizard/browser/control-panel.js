'use strict';
// Control Panel pop-out: one window with a tab per extension. A tab works only while its extension is on and
// running. Each tab shows the extension's live status and actions, plus a few settings that apply straight away.
// It unlocks like the Setup Wizard (a one-use link, one click on this PC when chosen, or the Wizard password) and
// keeps the password only in this window's memory. Only the newest window stays in charge.
(() => {
  const byId = (id) => document.getElementById(id);
  const TAB_KEY = 'thsv.streambridge.control-panel.tab';
  const tabId = (() => { try { const existing = sessionStorage.getItem('thsv.streambridge.control-panel.session'); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem('thsv.streambridge.control-panel.session', created); return created; } catch { return crypto.randomUUID(); } })();
  const state = { token: '', tabs: [], selected: '', status: null, message: '', messageBad: false, busy: false, editing: false, active: true };
  try { const theme = localStorage.getItem('thsv.streambridge.wizard.theme.v1'); if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme; } catch { /* Uses the dark theme. */ }

  // One panel in charge: a newly opened window tells older ones to stop.
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('thsv-control-panel') : undefined;
  channel?.addEventListener('message', (event) => {
    if (event.data?.type !== 'claim' || event.data.id === tabId || !state.active) return;
    state.active = false; byId('workspace').classList.add('hidden'); byId('login').classList.add('hidden'); byId('moved').classList.remove('hidden');
    try { window.close(); } catch { /* Only windows a script opened can close themselves. */ }
  });
  function claim() { state.active = true; channel?.postMessage({ type: 'claim', id: tabId }); }

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${state.token}`, 'x-thsv-wizard-tab': tabId, ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) } });
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
    claim();
    byId('login').classList.add('hidden'); byId('moved').classList.add('hidden'); byId('workspace').classList.remove('hidden');
  }
  async function start() {
    const params = new URLSearchParams(location.hash.slice(1)); const ticket = params.get('unlock'); const wanted = params.get('tab');
    if (wanted) state.selected = wanted;
    if (ticket) {
      history.replaceState(null, '', location.pathname);
      try { if (!/^[A-Za-z0-9_-]{43}$/u.test(ticket)) throw new Error('The unlock link is invalid.'); await authenticate(await unlockWith('/wizard/api/unlock', { ticket })); return; }
      catch (error) { byId('login-error').textContent = `${error.message} Open the Control Panel again from Streamer.bot, the tray or the Wizard.`; }
    }
    try {
      const access = await (await fetch('/wizard/api/access')).json();
      if (access.mode === 'this-pc') await authenticate(await unlockWith('/wizard/api/unlock-local', {}, { 'x-thsv-wizard-tab': tabId }));
    } catch (error) { byId('login-error').textContent = error.message; }
  }

  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = String(text); return node; }

  async function loadTabs() {
    const result = await api('/wizard/api/control-panel');
    state.tabs = Array.isArray(result.tabs) ? result.tabs : [];
    let remembered = state.selected; try { remembered = remembered || localStorage.getItem(TAB_KEY) || ''; } catch { /* Not remembered. */ }
    const usable = state.tabs.filter((tab) => tab.available);
    state.selected = usable.some((tab) => tab.moduleId === remembered) ? remembered : usable[0]?.moduleId || '';
    renderTabs(); renderPanel(); if (state.selected) await refreshStatus();
  }
  function renderTabs() {
    const nav = byId('tabs'); nav.replaceChildren();
    for (const tab of state.tabs) {
      const button = element('button', '', tab.title); button.type = 'button'; button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab.moduleId === state.selected)); button.disabled = !tab.available; button.dataset.tab = tab.moduleId;
      button.title = tab.available ? tab.summary : `${tab.title}: ${tab.reason}`;
      nav.append(button);
    }
  }
  function selectedTab() { return state.tabs.find((tab) => tab.moduleId === state.selected); }

  // ---------- Status and actions ----------
  function actionControl(action, wrapperClass = 'actions') {
    const style = action.style === 'primary' ? '' : action.style === 'danger' ? 'danger' : 'ghost';
    const button = element('button', `${style} small`.trim(), action.label); button.type = 'button';
    button.dataset.action = action.action; if (action.confirm) button.dataset.confirm = action.confirm;
    if (action.values) button.dataset.values = JSON.stringify(action.values);
    if (!Array.isArray(action.inputs) || action.inputs.length === 0) return button;
    const form = element('form', 'action-form'); form.dataset.action = action.action; if (action.confirm) form.dataset.confirm = action.confirm;
    for (const input of action.inputs) {
      const label = element('label', '', input.label); const field = element('input'); field.name = input.name;
      field.type = input.type === 'number' ? 'number' : 'text';
      if (input.minimum !== undefined) field.min = String(input.minimum); if (input.maximum !== undefined) field.max = String(input.maximum);
      if (input.maxLength !== undefined) field.maxLength = input.maxLength; if (input.defaultValue !== undefined) field.value = String(input.defaultValue);
      field.dataset.kind = input.type; field.required = true; label.append(field); form.append(label);
    }
    button.type = 'submit'; form.append(button); void wrapperClass; return form;
  }
  function renderStatus(container, tab) {
    const status = state.status || {};
    const card = element('section', 'card'); card.append(element('h3', '', 'Live'));
    if (state.message) { const message = element('p', `message${state.messageBad ? ' bad' : ''}`, state.message); message.setAttribute('role', 'status'); card.append(message); }
    if (status.notice) card.append(element('p', 'notice', status.notice));
    if (Array.isArray(status.summary) && status.summary.length) {
      const grid = element('div', 'summary');
      for (const entry of status.summary) { const box = element('div'); box.append(element('span', '', entry.label), element('strong', '', entry.value)); grid.append(box); }
      card.append(grid);
    }
    const actions = [...(Array.isArray(status.actions) ? status.actions : []), ...(Array.isArray(tab.actions) ? tab.actions : [])];
    if (actions.length) { const row = element('div', 'actions'); for (const action of actions) row.append(actionControl(action)); card.append(row); }
    if (!status.summary && !actions.length && !state.message) card.append(element('p', 'hint', 'This extension has nothing to control live. Change its settings below.'));
    container.append(card);
    for (const list of Array.isArray(status.lists) ? status.lists : []) {
      const section = element('section', 'card'); section.append(element('h3', '', list.title));
      const items = element('ul', 'items');
      if (!list.items?.length) items.append(element('li', 'empty', list.empty || 'Nothing here.'));
      for (const item of list.items || []) {
        const row = element('li', 'item');
        if (item.thumbnail && /^[A-Za-z0-9_-]{11}$/u.test(item.thumbnail)) { const image = element('img', 'thumb'); image.alt = ''; image.loading = 'lazy'; image.src = `https://i.ytimg.com/vi/${item.thumbnail}/mqdefault.jpg`; image.addEventListener('error', () => image.removeAttribute('src'), { once: true }); row.append(image); }
        if (item.swatch && /^#[0-9a-f]{6}$/iu.test(item.swatch)) { const swatch = element('span', 'swatch'); swatch.style.background = item.swatch; row.append(swatch); }
        const text = element('div', 'item-text');
        if (item.badge) text.append(element('span', 'badge', item.badge));
        if (item.link && /^https:\/\//u.test(item.link)) { const link = element('a', '', item.title); link.href = item.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; text.append(link); }
        else text.append(element('strong', '', item.title));
        if (item.detail) text.append(element('small', '', item.detail));
        row.append(text);
        if (item.actions?.length) { const buttons = element('div', 'actions'); for (const action of item.actions) buttons.append(actionControl(action)); row.append(buttons); }
        items.append(row);
      }
      section.append(items); container.append(section);
    }
  }

  // ---------- Settings, generated from the extension's own settings schema ----------
  function fieldControl(field) {
    const schema = field.schema || {}; const wrap = element('div', 'field'); wrap.dataset.field = field.name;
    const id = `field-${field.name}`; const label = element('label', '', schema.title || field.name); label.htmlFor = id;
    if (schema.type === 'boolean') {
      const check = element('label', 'check'); const box = element('input'); box.type = 'checkbox'; box.id = id; box.checked = field.value === true; box.dataset.kind = 'boolean';
      check.append(box, document.createTextNode(` ${schema.title || field.name}`)); wrap.append(check);
    } else if (schema.type === 'array') {
      wrap.append(label); const editor = element('div', 'list-editor'); editor.id = id; editor.dataset.kind = 'list'; editor.dataset.max = String(schema.maxItems || 50); editor.dataset.maxLength = String(schema.items?.maxLength || 300);
      const values = Array.isArray(field.value) ? field.value : [];
      for (const value of values) editor.append(listRow(String(value), editor.dataset.maxLength));
      const add = element('button', 'ghost small', '+ Add'); add.type = 'button'; add.dataset.addRow = 'true'; editor.append(add); wrap.append(editor);
    } else if (Array.isArray(schema.enum)) {
      wrap.append(label); const select = element('select'); select.id = id; select.dataset.kind = 'text';
      for (const option of schema.enum) { const node = element('option', '', option); node.value = option; node.selected = option === field.value; select.append(node); }
      wrap.append(select);
    } else {
      wrap.append(label); const input = element('input'); input.id = id;
      if (schema.type === 'integer' || schema.type === 'number') { input.type = 'number'; input.dataset.kind = schema.type; if (schema.minimum !== undefined) input.min = String(schema.minimum); if (schema.maximum !== undefined) input.max = String(schema.maximum); if (schema.type === 'number') input.step = 'any'; }
      else { input.type = 'text'; input.dataset.kind = 'text'; if (schema.maxLength) input.maxLength = schema.maxLength; }
      input.value = field.value === null || field.value === undefined ? '' : String(field.value); wrap.append(input);
    }
    if (schema.description) wrap.append(element('small', '', schema.description));
    return wrap;
  }
  function listRow(value, maxLength) {
    const row = element('div', 'list-row'); const input = element('input'); input.type = 'text'; input.value = value; input.maxLength = Number(maxLength) || 300; input.setAttribute('aria-label', 'List entry');
    const remove = element('button', 'danger small', 'Remove'); remove.type = 'button'; remove.dataset.removeRow = 'true'; row.append(input, remove); return row;
  }
  function renderSettings(container, tab) {
    if (!tab.fields?.length) return;
    const card = element('section', 'card'); card.append(element('h3', '', 'Settings'), element('p', 'hint', 'Changes apply straight away. The full settings stay in the Setup Wizard.'));
    const form = element('form', 'fields'); form.id = 'settings-form';
    for (const field of tab.fields) form.append(fieldControl(field));
    const save = element('div', 'save-row'); const button = element('button', '', 'Save changes'); button.type = 'submit'; const note = element('span', 'hint'); note.id = 'settings-note';
    save.append(button, note); form.append(save); card.append(form); container.append(card);
  }
  function readSettings(form) {
    const settings = {};
    for (const wrap of form.querySelectorAll('[data-field]')) {
      const name = wrap.dataset.field; const control = wrap.querySelector('[data-kind]'); if (!control) continue;
      const kind = control.dataset.kind;
      if (kind === 'boolean') settings[name] = control.checked;
      else if (kind === 'list') settings[name] = [...control.querySelectorAll('.list-row input')].map((input) => input.value.trim()).filter(Boolean);
      else if (kind === 'integer') settings[name] = Math.trunc(Number(control.value));
      else if (kind === 'number') settings[name] = Number(control.value);
      else settings[name] = control.value;
    }
    return settings;
  }

  function renderPanel() {
    const panel = byId('panel'); panel.replaceChildren();
    const tab = selectedTab();
    if (!tab) { panel.append(element('section', 'card', 'Turn on an extension in the Setup Wizard to control it here.')); return; }
    const head = element('section', 'card'); head.append(element('h2', '', tab.title), element('p', 'hint', tab.summary)); panel.append(head);
    renderStatus(panel, tab); renderSettings(panel, tab);
  }
  function renderLive() {
    // Redraws only the live parts so a half-typed setting is never lost.
    const tab = selectedTab(); if (!tab) return;
    const panel = byId('panel'); const settings = byId('settings-form')?.closest('.card');
    panel.replaceChildren(); const head = element('section', 'card'); head.append(element('h2', '', tab.title), element('p', 'hint', tab.summary)); panel.append(head);
    renderStatus(panel, tab); if (settings) panel.append(settings); else renderSettings(panel, tab);
  }

  async function refreshStatus() {
    if (!state.selected || !state.active) return;
    try { state.status = await api('/wizard/api/control-panel/status', { method: 'POST', body: JSON.stringify({ moduleId: state.selected }) }); }
    catch (error) { state.status = { notice: error.message }; if (error.status === 409) await loadTabs().catch(() => undefined); }
    renderLive();
  }
  async function run(action, values, source) {
    if (state.busy) return; state.busy = true; if (source) source.disabled = true;
    try {
      const result = await api('/wizard/api/control-panel/action', { method: 'POST', body: JSON.stringify({ moduleId: state.selected, action, values }) });
      if (result && (result.summary || result.lists || result.actions)) state.status = result;
      state.message = result.message || 'Done.'; state.messageBad = false;
      if (!(result.summary || result.lists)) setTimeout(() => void refreshStatus(), 600);
    } catch (error) { state.message = error.message; state.messageBad = true; }
    finally { state.busy = false; if (source) source.disabled = false; renderLive(); }
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    const tabButton = target.closest('[data-tab]');
    if (tabButton && !tabButton.disabled) {
      state.selected = tabButton.dataset.tab; state.status = null; state.message = '';
      try { localStorage.setItem(TAB_KEY, state.selected); } catch { /* Not remembered. */ }
      renderTabs(); renderPanel(); void refreshStatus(); return;
    }
    if (target.closest('[data-add-row]')) {
      const editor = target.closest('.list-editor'); const rows = editor.querySelectorAll('.list-row').length;
      if (rows >= Number(editor.dataset.max)) return;
      const row = listRow('', editor.dataset.maxLength); editor.insertBefore(row, target.closest('[data-add-row]')); row.querySelector('input').focus(); return;
    }
    if (target.closest('[data-remove-row]')) { target.closest('.list-row').remove(); return; }
    const button = target.closest('button[data-action]');
    if (button && !button.closest('form.action-form')) {
      if (button.dataset.confirm && !confirm(button.dataset.confirm)) return;
      void run(button.dataset.action, button.dataset.values ? JSON.parse(button.dataset.values) : undefined, button);
    }
  });
  document.addEventListener('submit', (event) => {
    const form = event.target; if (!(form instanceof HTMLFormElement)) return;
    if (form.id === 'login-form') {
      event.preventDefault(); const token = byId('token').value.trim(); byId('token').value = '';
      authenticate(token).then(() => { byId('login-error').textContent = ''; }, (error) => { byId('login-error').textContent = error.message; }); return;
    }
    if (form.classList.contains('action-form')) {
      event.preventDefault(); if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
      const values = {}; for (const input of form.querySelectorAll('input')) values[input.name] = input.dataset.kind === 'number' ? Number(input.value) : input.value.trim();
      void run(form.dataset.action, values, form.querySelector('button')); return;
    }
    if (form.id === 'settings-form') {
      event.preventDefault(); const note = byId('settings-note'); const button = form.querySelector('button[type=submit]'); button.disabled = true; note.textContent = 'Saving…';
      api('/wizard/api/control-panel/settings', { method: 'PUT', body: JSON.stringify({ moduleId: state.selected, settings: readSettings(form) }) })
        .then(async () => { note.textContent = 'Saved. It is live now.'; state.editing = false; const keep = state.selected; await loadTabs(); state.selected = keep; await refreshStatus(); })
        .catch((error) => { note.textContent = error.message; })
        .finally(() => { button.disabled = false; });
    }
  });
  // Typing in the settings pauses the automatic refresh, so nothing is overwritten.
  document.addEventListener('input', (event) => { if (event.target instanceof Element && event.target.closest('#settings-form')) state.editing = true; });
  byId('use-here').addEventListener('click', () => { claim(); byId('moved').classList.add('hidden'); if (state.token) { byId('workspace').classList.remove('hidden'); void loadTabs(); } else byId('login').classList.remove('hidden'); });
  setInterval(() => { if (state.token && state.active && !state.busy && document.visibilityState === 'visible' && !document.activeElement?.closest?.('.action-form')) void refreshStatus(); }, 3_000);
  void start();
})();
