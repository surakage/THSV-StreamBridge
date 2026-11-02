'use strict';
// Control Panel pop-out: one window with a tab per extension. A tab works only while its extension is on and
// running. Each tab shows the extension's live status and actions, plus a few settings that apply straight away.
// It unlocks like the Setup Wizard (a one-use link, one click on this PC when chosen, or the Wizard password) and
// keeps the password only in this window's memory. Only the newest window stays in charge.
(() => {
  const byId = (id) => document.getElementById(id);
  const TAB_KEY = 'thsv.streambridge.control-panel.tab';
  const tabId = (() => { try { const existing = sessionStorage.getItem('thsv.streambridge.control-panel.session'); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem('thsv.streambridge.control-panel.session', created); return created; } catch { return crypto.randomUUID(); } })();
  const state = { token: '', tabs: [], selected: '', status: null, message: '', messageBad: false, busy: false, editing: false, active: true, openFolds: new Set() };
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
    filterTabs(byId('tab-filter')?.value);
  }
  function filterTabs(query) {
    const words = String(query || '').trim().toLowerCase();
    for (const button of byId('tabs').querySelectorAll('[data-tab]')) button.hidden = words !== '' && !button.textContent.toLowerCase().includes(words);
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
  // Short settings sit side by side in a grid; each list is its own fold you open and close. A list the extension
  // describes with columns (ui/settings.json) gets one equal-width box per column instead of one long "a | b" line,
  // and a plain list is a row of chips with one box to add more.
  const COLOR = /^#[0-9a-f]{6}$/iu;
  function isList(field) { const schema = field.schema || {}; return schema.type === 'array' && !Array.isArray(schema.items?.enum); }
  function isColorList(schema) { return /#\[0-9a-fA-F\]\{6\}/u.test(String(schema.items?.pattern || '')); }
  function colorColumn(column, rows, position) { return /colou?r/iu.test(column.label || '') && rows.every((cells) => !cells[position] || COLOR.test(cells[position])); }

  function fieldControl(field) {
    const schema = field.schema || {}; const wrap = element('div', 'field'); wrap.dataset.field = field.name;
    const id = `field-${field.name}`; const title = schema.title || field.name;
    if (schema.type === 'boolean') {
      wrap.classList.add('field-switch');
      const check = element('label', 'switch'); const box = element('input'); box.type = 'checkbox'; box.id = id; box.checked = field.value === true; box.dataset.kind = 'boolean'; box.setAttribute('role', 'switch');
      check.append(box, element('span', 'switch-track'), element('span', 'switch-label', title)); wrap.append(check);
    } else if (schema.type === 'array' && Array.isArray(schema.items?.enum)) {
      // A pick-from-a-list setting (scoreboard rows, goal sources): one pill per choice.
      wrap.classList.add('field-wide'); wrap.append(element('p', 'field-title', title)); const group = element('div', 'choice-group'); group.dataset.kind = 'choices';
      const chosen = new Set(Array.isArray(field.value) ? field.value : []);
      for (const option of schema.items.enum) { const choice = element('label', 'pill'); const box = element('input'); box.type = 'checkbox'; box.value = option; box.checked = chosen.has(option); choice.append(box, element('span', '', optionLabel(option))); group.append(choice); }
      wrap.append(group);
    } else if (Array.isArray(schema.enum)) {
      const label = element('label', '', title); label.htmlFor = id; wrap.append(label);
      const select = element('select'); select.id = id; select.dataset.kind = 'text';
      for (const option of schema.enum) { const node = element('option', '', optionLabel(option)); node.value = option; node.selected = option === field.value; select.append(node); }
      wrap.append(select);
    } else {
      const label = element('label', '', title); label.htmlFor = id; wrap.append(label); const input = element('input'); input.id = id;
      if (schema.type === 'integer' || schema.type === 'number') { input.type = 'number'; input.dataset.kind = schema.type; if (schema.minimum !== undefined) input.min = String(schema.minimum); if (schema.maximum !== undefined) input.max = String(schema.maximum); input.step = schema.type === 'number' ? 'any' : '1'; }
      else { input.type = 'text'; input.dataset.kind = 'text'; if (schema.maxLength) input.maxLength = schema.maxLength; if ((schema.maxLength || 0) > 120) wrap.classList.add('field-wide'); }
      input.value = field.value === null || field.value === undefined ? '' : String(field.value); wrap.append(input);
    }
    if (schema.description) { const help = element('small', '', schema.description); help.title = schema.description; wrap.append(help); }
    return wrap;
  }

  function listFold(field) {
    const schema = field.schema || {}; const values = Array.isArray(field.value) ? field.value.map(String) : [];
    const fold = element('details', 'fold'); fold.dataset.field = field.name; fold.open = state.openFolds.has(`${state.selected}:${field.name}`);
    const summary = element('summary'); const count = element('span', 'fold-count', String(values.length)); count.dataset.count = 'true';
    summary.append(element('span', 'fold-title', schema.title || field.name), count); fold.append(summary);
    const body = element('div', 'fold-body');
    if (schema.description) body.append(element('p', 'hint', schema.description));
    body.append(field.layout?.columns?.length ? rowTable(field, values) : chipList(field, values));
    fold.append(body); return fold;
  }

  function rowTable(field, values) {
    const { columns, itemLabel = 'item', legacyColumnOrder } = field.layout; const schema = field.schema || {};
    const place = (cells) => { if (!Array.isArray(legacyColumnOrder) || cells.length !== legacyColumnOrder.length || cells.length === columns.length) return cells; const placed = columns.map(() => ''); legacyColumnOrder.forEach((position, index) => { placed[position] = cells[index]; }); return placed; };
    const rows = values.map((line) => place(line.split('|').map((part) => part.trim())));
    const colors = columns.map((column, position) => colorColumn(column, rows, position));
    const table = element('div', 'row-table'); table.dataset.kind = 'rows'; table.dataset.max = String(schema.maxItems || 50); table.dataset.item = itemLabel;
    table.style.setProperty('--columns', String(columns.length)); table._columns = columns; table._colors = colors;
    const head = element('div', 'row-head');
    for (const column of columns) { const cell = element('span'); cell.append(element('strong', '', column.label)); if (column.hint) cell.append(element('small', '', column.hint)); head.append(cell); }
    head.append(element('span')); table.append(head);
    const body = element('div', 'row-body'); for (const cells of rows) body.append(tableRow(columns, colors, cells, itemLabel)); table.append(body);
    const empty = element('p', 'hint row-empty', `No ${itemLabel}s yet.`); empty.hidden = rows.length > 0; table.append(empty);
    const add = element('button', 'ghost small', `+ Add ${itemLabel}`); add.type = 'button'; add.dataset.addRow = 'true'; table.append(add);
    return table;
  }
  function tableRow(columns, colors, cells, itemLabel) {
    const row = element('div', 'row');
    columns.forEach((column, position) => {
      const value = String(cells[position] ?? ''); const cell = element('label', 'row-cell'); cell.append(element('span', 'row-cell-label', column.label));
      let control;
      if (column.type === 'select') {
        control = element('select');
        if (value && !column.options.some((option) => option.value === value)) { const extra = element('option', '', value); extra.value = value; control.append(extra); }
        for (const option of column.options) { const node = element('option', '', option.label); node.value = option.value; control.append(node); }
        control.value = value || column.options[0]?.value || '';
      } else if (colors[position]) {
        control = element('input'); control.type = 'color'; control.value = COLOR.test(value) ? value : '#7ff5cc';
      } else {
        control = element('input'); control.type = column.type === 'number' ? 'number' : 'text'; control.value = value; control.placeholder = column.placeholder || '';
        if (column.type === 'number') { if (column.min !== undefined) control.min = String(column.min); if (column.max !== undefined) control.max = String(column.max); control.step = '1'; }
        else control.maxLength = column.maxLength || 120;
      }
      control.dataset.cell = String(position); control.setAttribute('aria-label', column.label); control.title = value; cell.append(control); row.append(cell);
    });
    const extra = cells.slice(columns.length); if (extra.some((part) => part !== '')) row.dataset.extra = JSON.stringify(extra);
    const remove = element('button', 'icon-button danger', '×'); remove.type = 'button'; remove.dataset.removeRow = 'true'; remove.setAttribute('aria-label', `Remove this ${itemLabel}`); remove.title = `Remove this ${itemLabel}`;
    row.append(remove); return row;
  }

  function chipList(field, values) {
    const schema = field.schema || {}; const color = isColorList(schema);
    const list = element('div', 'chips'); list.dataset.kind = 'chips'; list.dataset.max = String(schema.maxItems || 50);
    const box = element('div', 'chip-box'); for (const value of values) box.append(chip(value, color)); list.append(box);
    const adder = element('div', 'chip-add'); const input = element('input'); input.type = color ? 'color' : 'text'; input.dataset.chipInput = 'true';
    if (color) input.value = '#7ff5cc'; else { input.maxLength = schema.items?.maxLength || 300; input.placeholder = 'Type and press Enter'; }
    input.setAttribute('aria-label', `Add to ${schema.title || field.name}`);
    const add = element('button', 'ghost small', 'Add'); add.type = 'button'; add.dataset.addChip = 'true'; adder.append(input, add); list.append(adder);
    return list;
  }
  function chip(value, color) {
    const node = element('span', 'chip'); node.dataset.value = value; node.title = value;
    if (color) { const swatch = element('span', 'swatch'); if (COLOR.test(value)) swatch.style.background = value; node.append(swatch); }
    node.append(element('span', 'chip-text', value));
    const remove = element('button', 'chip-remove', '×'); remove.type = 'button'; remove.dataset.removeChip = 'true'; remove.setAttribute('aria-label', `Remove ${value}`); node.append(remove);
    return node;
  }
  function addChip(list) {
    const input = list.querySelector('[data-chip-input]'); const value = input.value.trim(); if (!value) return;
    const box = list.querySelector('.chip-box'); const existing = [...box.querySelectorAll('.chip')].map((node) => node.dataset.value);
    if (existing.length >= Number(list.dataset.max)) { setNote(`You can add at most ${list.dataset.max}.`); return; }
    if (existing.includes(value)) { setNote(`"${value}" is already in the list.`); return; }
    box.append(chip(value, input.type === 'color')); if (input.type !== 'color') input.value = ''; input.focus(); changed(list);
  }

  function optionLabel(value) { const words = String(value).replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/-/gu, ' ').toLowerCase(); return words.charAt(0).toUpperCase() + words.slice(1); }
  function setNote(text) { const note = byId('settings-note'); if (note) note.textContent = text; }
  function changed(node) {
    state.editing = true; const form = byId('settings-form'); form?.classList.add('dirty'); setNote('Unsaved changes');
    const fold = node?.closest?.('.fold'); const count = fold?.querySelector('[data-count]');
    if (count) count.textContent = String(fold.querySelectorAll('.row-body .row, .chip-box .chip').length);
    const table = node?.closest?.('.row-table'); if (table) table.querySelector('.row-empty').hidden = table.querySelector('.row-body .row') !== null;
  }

  function renderSettings(container, tab) {
    if (!tab.fields?.length) return;
    const card = element('section', 'card settings-card'); const top = element('div', 'card-top');
    top.append(element('h3', '', 'Settings'), element('span', 'hint', 'Applies live when saved. Everything else is in the Setup Wizard.')); card.append(top);
    const form = element('form', 'settings'); form.id = 'settings-form';
    const grid = element('div', 'fields'); const folds = element('div', 'folds');
    for (const field of tab.fields) (isList(field) ? folds : grid).append(isList(field) ? listFold(field) : fieldControl(field));
    if (grid.childElementCount) form.append(grid); if (folds.childElementCount) form.append(folds);
    const save = element('div', 'save-row'); const button = element('button', '', 'Save changes'); button.type = 'submit'; const note = element('span', 'hint'); note.id = 'settings-note'; note.setAttribute('role', 'status');
    save.append(button, note); form.append(save); card.append(form); container.append(card);
  }
  function readSettings(form) {
    const settings = {};
    for (const wrap of form.querySelectorAll('[data-field]')) {
      const name = wrap.dataset.field; const control = wrap.querySelector('[data-kind]'); if (!control) continue;
      const kind = control.dataset.kind;
      if (kind === 'boolean') settings[name] = control.checked;
      else if (kind === 'chips') settings[name] = [...control.querySelectorAll('.chip')].map((node) => node.dataset.value);
      else if (kind === 'rows') settings[name] = [...control.querySelectorAll('.row-body .row')].map((row) => {
        const cells = [...row.querySelectorAll('[data-cell]')];
        if (!cells.some((cell) => cell.tagName === 'INPUT' && cell.type !== 'color' && cell.value.trim() !== '')) return '';
        let extra = []; try { extra = row.dataset.extra ? JSON.parse(row.dataset.extra) : []; } catch { extra = []; }
        return [...cells.map((cell) => cell.value), ...extra].map((value) => String(value).replace(/[|\r\n]+/gu, ' ').trim()).join(' | ');
      }).filter(Boolean);
      else if (kind === 'choices') settings[name] = [...control.querySelectorAll('input:checked')].map((input) => input.value);
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
    const head = element('section', 'card tab-head'); head.append(element('h2', '', tab.title), element('p', 'hint', tab.summary)); panel.append(head);
    renderStatus(panel, tab); renderSettings(panel, tab);
  }
  function renderLive() {
    // Redraws only the live parts so a half-typed setting is never lost.
    const tab = selectedTab(); if (!tab) return;
    const panel = byId('panel'); const settings = byId('settings-form')?.closest('.card');
    const scroll = panel.scrollTop; panel.replaceChildren(); const head = element('section', 'card tab-head'); head.append(element('h2', '', tab.title), element('p', 'hint', tab.summary)); panel.append(head);
    renderStatus(panel, tab); if (settings) panel.append(settings); else renderSettings(panel, tab);
    panel.scrollTop = scroll;
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
    const summary = target.closest('.fold > summary');
    if (summary) { const fold = summary.parentElement; const key = `${state.selected}:${fold.dataset.field}`; setTimeout(() => { if (fold.open) state.openFolds.add(key); else state.openFolds.delete(key); }, 0); return; }
    if (target.closest('[data-add-row]')) {
      const table = target.closest('.row-table'); const body = table.querySelector('.row-body');
      if (body.children.length >= Number(table.dataset.max)) { setNote(`You can add at most ${table.dataset.max} ${table.dataset.item}s.`); return; }
      const row = tableRow(table._columns, table._colors, [], table.dataset.item); body.append(row); row.querySelector('input,select')?.focus(); changed(table); return;
    }
    if (target.closest('[data-remove-row]')) { const table = target.closest('.row-table'); target.closest('.row').remove(); changed(table); return; }
    if (target.closest('[data-add-chip]')) { addChip(target.closest('.chips')); return; }
    if (target.closest('[data-remove-chip]')) { const list = target.closest('.chips'); target.closest('.chip').remove(); changed(list); return; }
    const button = target.closest('button[data-action]');
    if (button && !button.closest('form.action-form')) {
      if (button.dataset.confirm && !confirm(button.dataset.confirm)) return;
      void run(button.dataset.action, button.dataset.values ? JSON.parse(button.dataset.values) : undefined, button);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof Element && event.target.matches('[data-chip-input]')) { event.preventDefault(); addChip(event.target.closest('.chips')); }
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
        .then(async () => { state.editing = false; form.classList.remove('dirty'); const keep = state.selected; await loadTabs(); state.selected = keep; await refreshStatus(); setNote('Saved. It is live now.'); })
        .catch((error) => { note.textContent = error.message; })
        .finally(() => { button.disabled = false; });
    }
  });
  // Typing in the settings pauses the automatic refresh, so nothing is overwritten.
  document.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    if (target.id === 'tab-filter') { filterTabs(target.value); return; }
    if (target.closest('#settings-form') && !target.matches('[data-chip-input]')) { if (target.title !== undefined && target.dataset.cell !== undefined) target.title = target.value; changed(target); }
  });
  byId('use-here').addEventListener('click', () => { claim(); byId('moved').classList.add('hidden'); if (state.token) { byId('workspace').classList.remove('hidden'); void loadTabs(); } else byId('login').classList.remove('hidden'); });
  setInterval(() => { if (state.token && state.active && !state.busy && document.visibilityState === 'visible' && !document.activeElement?.closest?.('.action-form')) void refreshStatus(); }, 3_000);
  void start();
})();
