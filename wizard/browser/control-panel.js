'use strict';
// Control Panel pop-out: one window with a tab per extension. A tab works only while its extension is on and
// running. Each tab shows the extension's live status and actions, plus a few settings that apply straight away.
// It unlocks like the Setup Wizard (a one-use link, one click on this PC when chosen, or the Wizard password) and
// keeps the password only in this window's memory. Only the newest window stays in charge.
(() => {
  const byId = (id) => document.getElementById(id);
  const TAB_KEY = 'thsv.streambridge.control-panel.tab';
  const tabId = (() => { try { const existing = sessionStorage.getItem('thsv.streambridge.control-panel.session'); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem('thsv.streambridge.control-panel.session', created); return created; } catch { return crypto.randomUUID(); } })();
  const state = { token: '', tabs: [], selected: '', status: null, message: '', messageBad: false, busy: false, editing: false, active: true, openFolds: new Set(), closedFolds: new Set() };
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
    // Extensions that are on come first; turned-off ones fold away under one line so the list stays short.
    const nav = byId('tabs'); const wasOpen = nav.querySelector('.off-tabs')?.open === true; nav.replaceChildren();
    const off = element('details', 'off-tabs'); off.open = wasOpen; const offList = element('div', 'off-list');
    // Running extensions sit under their group's heading (Broadcast Director, Community Play…) so a long list stays easy to scan.
    const groups = new Map();
    for (const tab of state.tabs) {
      const button = element('button', '', tab.title); button.type = 'button'; button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab.moduleId === state.selected)); button.disabled = !tab.available; button.dataset.tab = tab.moduleId;
      button.title = tab.available ? tab.summary : `${tab.title}: ${tab.reason}`;
      if (!tab.available) { offList.append(button); continue; }
      const name = typeof tab.group === 'string' && tab.group ? tab.group : 'More extensions';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(button);
    }
    const named = [...groups.keys()].filter((name) => name !== 'More extensions');
    const showHeadings = named.length > 0 && groups.size > 1;
    for (const name of [...named, ...(groups.has('More extensions') ? ['More extensions'] : [])]) {
      if (showHeadings) { const heading = element('p', 'tab-group', name); heading.setAttribute('role', 'presentation'); nav.append(heading); }
      for (const button of groups.get(name)) nav.append(button);
    }
    if (offList.childElementCount) { off.append(element('summary', '', `Turned off (${String(offList.childElementCount)})`), offList); nav.append(off); }
    filterTabs(byId('tab-filter')?.value);
  }
  function filterTabs(query) {
    const words = String(query || '').trim().toLowerCase();
    for (const button of byId('tabs').querySelectorAll('[data-tab]')) button.hidden = words !== '' && !button.textContent.toLowerCase().includes(words);
    const off = byId('tabs').querySelector('.off-tabs'); if (off && words !== '' && off.querySelector('[data-tab]:not([hidden])')) off.open = true;
    for (const heading of byId('tabs').querySelectorAll('.tab-group')) {
      let next = heading.nextElementSibling; let visible = false;
      while (next && next.matches('[data-tab]')) { if (!next.hidden) visible = true; next = next.nextElementSibling; }
      heading.hidden = !visible;
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
  // A fold (live list or list setting) remembers being open through the 3-second refresh.
  function foldOpen(key, fallback) { return state.openFolds.has(key) ? true : state.closedFolds.has(key) ? false : fallback; }
  function renderStatus(container, tab) {
    const status = state.status || {};
    const card = element('section', 'card now-card');
    if (state.message) { const message = element('p', `message${state.messageBad ? ' bad' : ''}`, state.message); message.setAttribute('role', 'status'); card.append(message); }
    if (status.notice) card.append(element('p', 'notice', status.notice));
    if (Array.isArray(status.summary) && status.summary.length) {
      const strip = element('div', 'status-strip');
      for (const entry of status.summary) { const chipNode = element('div', 'stat'); chipNode.append(element('span', '', entry.label), element('strong', '', entry.value)); chipNode.title = `${entry.label}: ${entry.value}`; strip.append(chipNode); }
      card.append(strip);
    }
    const actions = [...(Array.isArray(status.actions) ? status.actions : []), ...(Array.isArray(tab.actions) ? tab.actions : [])];
    // Plain buttons form one even pad of controls; buttons that need a value sit in a compact row under it.
    const plain = actions.filter((action) => !action.inputs?.length); const valued = actions.filter((action) => action.inputs?.length);
    if (plain.length) { const pad = element('div', 'pad'); for (const action of plain) pad.append(actionControl(action)); card.append(pad); }
    if (valued.length) { const row = element('div', 'actions'); for (const action of valued) row.append(actionControl(action)); card.append(row); }
    if (card.childElementCount) container.append(card);
    for (const list of Array.isArray(status.lists) ? status.lists : []) {
      const items = Array.isArray(list.items) ? list.items : []; const key = `${state.selected}:list:${list.title}`;
      const fold = element('details', 'fold live-fold'); fold.dataset.foldKey = key; fold.open = foldOpen(key, items.length > 0 && items.length <= 5);
      const summary = element('summary'); summary.append(element('span', 'fold-title', list.title), element('span', 'fold-count', String(items.length))); fold.append(summary);
      const body = element('div', 'fold-body'); const ul = element('ul', 'items');
      if (!items.length) ul.append(element('li', 'empty', list.empty || 'Nothing here.'));
      for (const item of items) {
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
        ul.append(row);
      }
      body.append(ul); fold.append(body); container.append(fold);
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

  // Quick controls change one setting and save it straight away, like a switch on a mixer.
  function fieldControl(field) {
    const schema = field.schema || {}; const wrap = element('div', 'control'); wrap.dataset.quick = field.name;
    const id = `field-${field.name}`; const title = field.title || schema.title || field.name; if (schema.description) wrap.title = schema.description;
    const labels = field.labels && typeof field.labels === 'object' ? field.labels : {};
    if (schema.type === 'boolean') {
      wrap.classList.add('control-switch');
      const check = element('label', 'switch'); const box = element('input'); box.type = 'checkbox'; box.id = id; box.checked = field.value === true; box.dataset.kind = 'boolean'; box.setAttribute('role', 'switch');
      check.append(box, element('span', 'switch-track'), element('span', 'switch-label', title)); wrap.append(check);
    } else if (schema.type === 'array' && Array.isArray(schema.items?.enum)) {
      // Pick from a list (scoreboard rows): pills that switch on and off.
      wrap.classList.add('control-wide'); wrap.append(element('span', 'control-label', title)); const group = element('div', 'choice-group'); group.dataset.kind = 'choices';
      const chosen = new Set(Array.isArray(field.value) ? field.value : []);
      for (const option of schema.items.enum) { const choice = element('label', 'pill'); const box = element('input'); box.type = 'checkbox'; box.value = option; box.checked = chosen.has(option); choice.append(box, element('span', '', labels[option] || optionLabel(option))); group.append(choice); }
      wrap.append(group);
    } else if (Array.isArray(schema.enum) && schema.enum.length <= 4 && schema.enum.every((option) => String(labels[option] || optionLabel(option)).length <= 14)) {
      // A few choices: a segmented control, one tap each.
      wrap.append(element('span', 'control-label', title)); const group = element('div', 'segmented'); group.dataset.kind = 'segment'; group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', title);
      for (const option of schema.enum) { const choice = element('label'); const radio = element('input'); radio.type = 'radio'; radio.name = id; radio.value = option; radio.checked = option === field.value; choice.append(radio, element('span', '', labels[option] || optionLabel(option))); group.append(choice); }
      wrap.append(group);
    } else if (Array.isArray(schema.enum)) {
      const label = element('label', 'control-label', title); label.htmlFor = id; wrap.append(label);
      const select = element('select'); select.id = id; select.dataset.kind = 'text';
      for (const option of schema.enum) { const node = element('option', '', labels[option] || optionLabel(option)); node.value = option; node.selected = option === field.value; select.append(node); }
      wrap.append(select);
    } else if (schema.type === 'integer' || schema.type === 'number') {
      // A number: − value + stepper.
      const label = element('label', 'control-label', title); label.htmlFor = id; wrap.append(label);
      const stepper = element('div', 'stepper'); const input = element('input'); input.id = id; input.type = 'number'; input.dataset.kind = schema.type;
      if (schema.minimum !== undefined) input.min = String(schema.minimum); if (schema.maximum !== undefined) input.max = String(schema.maximum); input.step = schema.type === 'number' ? 'any' : '1';
      input.value = field.value === null || field.value === undefined ? '' : String(field.value);
      const down = element('button', 'ghost step', '−'); down.type = 'button'; down.dataset.step = '-1'; down.setAttribute('aria-label', `Less ${title}`);
      const up = element('button', 'ghost step', '+'); up.type = 'button'; up.dataset.step = '1'; up.setAttribute('aria-label', `More ${title}`);
      stepper.append(down, input, up); wrap.append(stepper);
    } else {
      const label = element('label', 'control-label', title); label.htmlFor = id; wrap.append(label); const input = element('input'); input.id = id;
      input.type = 'text'; input.dataset.kind = 'text'; if (schema.maxLength) input.maxLength = schema.maxLength; input.placeholder = 'Press Enter to save';
      input.value = field.value === null || field.value === undefined ? '' : String(field.value);
      // A colour setting gets a colour picker; it saves as the usual #rrggbb text.
      if (/^\^#\[0-9a-fA-F\]\{6\}\$$/u.test(String(schema.pattern || '').replace('A-Fa-f', 'a-fA-F')) && /^#[0-9a-f]{6}$/iu.test(input.value)) { input.type = 'color'; input.classList.add('color-input'); input.removeAttribute('placeholder'); }
      wrap.append(input);
    }
    wrap.append(element('span', 'saved-tick', 'Saved'));
    return wrap;
  }
  function quickValue(wrap) {
    const control = wrap.querySelector('[data-kind]'); if (!control) return undefined;
    const kind = control.dataset.kind;
    if (kind === 'boolean') return control.checked;
    if (kind === 'choices') return [...control.querySelectorAll('input:checked')].map((input) => input.value);
    if (kind === 'segment') return control.querySelector('input:checked')?.value;
    if (kind === 'integer') return Math.trunc(Number(control.value));
    if (kind === 'number') return Number(control.value);
    return control.value;
  }
  // Saves one quick control right away; a refused value goes back to what was saved.
  async function saveQuick(wrap) {
    const name = wrap.dataset.quick; const value = quickValue(wrap); if (value === undefined) return;
    const field = selectedTab()?.fields.find((entry) => entry.name === name); if (!field || JSON.stringify(field.value) === JSON.stringify(value)) return;
    wrap.classList.remove('saved', 'failed'); wrap.classList.add('saving');
    try {
      const result = await api('/wizard/api/control-panel/settings', { method: 'PUT', body: JSON.stringify({ moduleId: state.selected, settings: { [name]: value } }) });
      field.value = result.settings && Object.hasOwn(result.settings, name) ? result.settings[name] : value;
      wrap.classList.remove('saving'); wrap.classList.add('saved'); setTimeout(() => wrap.classList.remove('saved'), 1_600);
      void refreshStatus();
    } catch (error) {
      wrap.classList.remove('saving'); wrap.classList.add('failed'); state.message = error.message; state.messageBad = true;
      const replacement = fieldControl(field); wrap.replaceWith(replacement); replacement.classList.add('failed'); renderLive();
    }
  }

  function listFold(field) {
    const schema = field.schema || {}; const values = Array.isArray(field.value) ? field.value.map(String) : [];
    const fold = element('details', 'fold'); fold.dataset.field = field.name; fold.dataset.foldKey = `${state.selected}:${field.name}`; fold.open = foldOpen(fold.dataset.foldKey, false);
    const summary = element('summary'); const count = element('span', 'fold-count', String(values.length)); count.dataset.count = 'true';
    summary.append(element('span', 'fold-title', schema.title || field.name), count); fold.append(summary);
    const body = element('div', 'fold-body');
    if (schema.description) body.append(element('p', 'hint', schema.description));
    body.append(field.layout?.columns?.length ? rowTable(field, values) : chipList(field, values));
    const bar = element('div', 'fold-save'); const save = element('button', 'small', 'Save'); save.type = 'button'; save.dataset.saveFold = 'true';
    const discard = element('button', 'ghost small', 'Discard'); discard.type = 'button'; discard.dataset.discardFold = 'true'; const note = element('span', 'hint fold-note'); note.setAttribute('role', 'status');
    bar.append(save, discard, note); body.append(bar);
    fold.append(body); return fold;
  }

  function rowTable(field, values) {
    const { columns, itemLabel = 'item', legacyColumnOrder } = field.layout; const schema = field.schema || {};
    const place = (cells) => { if (!Array.isArray(legacyColumnOrder) || cells.length !== legacyColumnOrder.length || cells.length === columns.length) return cells; const placed = columns.map(() => ''); legacyColumnOrder.forEach((position, index) => { placed[position] = cells[index]; }); return placed; };
    const rows = values.map((line) => place(line.split('|').map((part) => part.trim())));
    const colors = columns.map((column, position) => colorColumn(column, rows, position));
    const table = element('div', 'row-table'); table.dataset.kind = 'rows'; table.dataset.max = String(schema.maxItems || 50); table.dataset.item = itemLabel; if (typeof schema.items?.pattern === 'string') table.dataset.pattern = schema.items.pattern;
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
    if (existing.length >= Number(list.dataset.max)) { setNote(`You can add at most ${list.dataset.max}.`, list); return; }
    if (existing.includes(value)) { setNote(`"${value}" is already in the list.`, list); return; }
    box.append(chip(value, input.type === 'color')); if (input.type !== 'color') input.value = ''; input.focus(); changed(list);
  }

  function optionLabel(value) { const words = String(value).replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/-/gu, ' ').toLowerCase(); return words.charAt(0).toUpperCase() + words.slice(1); }
  function setNote(text, node) { const note = node?.closest?.('.fold')?.querySelector('.fold-note'); if (note) note.textContent = text; }
  function changed(node) {
    state.editing = true; node?.closest?.('.fold')?.classList.add('dirty'); setNote('Unsaved changes', node);
    const fold = node?.closest?.('.fold'); const count = fold?.querySelector('[data-count]');
    if (count) count.textContent = String(fold.querySelectorAll('.row-body .row, .chip-box .chip').length);
    const table = node?.closest?.('.row-table'); if (table) table.querySelector('.row-empty').hidden = table.querySelector('.row-body .row') !== null;
  }

  function renderSettings(container, tab) {
    if (!tab.fields?.length) return;
    const quick = tab.fields.filter((field) => !isList(field)); const lists = tab.fields.filter(isList);
    const settings = element('div', 'settings-area'); settings.id = 'settings-area';
    if (quick.length) {
      const card = element('section', 'card quick-card'); const top = element('div', 'card-top');
      top.append(element('h3', '', 'Quick controls'), element('span', 'hint', 'Changes save the moment you make them.')); card.append(top);
      const grid = element('div', 'controls'); for (const field of quick) grid.append(fieldControl(field)); card.append(grid); settings.append(card);
    }
    if (lists.length) {
      const group = element('section', 'lists-area'); group.append(element('h3', 'lists-title', 'Lists'));
      for (const field of lists) group.append(listFold(field));
      settings.append(group);
    }
    container.append(settings);
  }
  function itemPattern(table) { try { return table.dataset.pattern ? new RegExp(table.dataset.pattern, 'u') : undefined; } catch { return undefined; } }
  function readSettings(form) {
    const settings = {};
    for (const wrap of form.querySelectorAll('[data-field]')) {
      const name = wrap.dataset.field; const control = wrap.querySelector('[data-kind]'); if (!control) continue;
      const kind = control.dataset.kind;
      if (kind === 'boolean') settings[name] = control.checked;
      else if (kind === 'chips') settings[name] = [...control.querySelectorAll('.chip')].map((node) => node.dataset.value);
      else if (kind === 'rows') { const pattern = itemPattern(control); settings[name] = [...control.querySelectorAll('.row-body .row')].map((row) => {
        const cells = [...row.querySelectorAll('[data-cell]')];
        if (!cells.some((cell) => cell.tagName === 'INPUT' && cell.type !== 'color' && cell.value.trim() !== '')) return '';
        let extra = []; try { extra = row.dataset.extra ? JSON.parse(row.dataset.extra) : []; } catch { extra = []; }
        const parts = [...cells.map((cell) => cell.value), ...extra].map((value) => String(value).replace(/[|\r\n]+/gu, ' ').trim());
        // A list whose entries must match a pattern (Chat Play Pack's "Word | Hint") drops empty optional boxes at the end.
        if (!pattern) return parts.join(' | ');
        while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
        return parts.join(' | ');
      }).filter(Boolean); }
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
    const head = element('section', 'tab-head'); head.append(element('h2', '', tab.title), element('p', 'hint', tab.summary));
    const live = element('div', 'live-area'); live.id = 'live-area';
    panel.append(head, live); renderStatus(live, tab); renderSettings(panel, tab);
  }
  function renderLive() {
    // Redraws only the live part, so a half-typed list or setting is never lost.
    const tab = selectedTab(); const live = byId('live-area'); if (!tab || !live) return;
    live.replaceChildren(); renderStatus(live, tab);
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
      if (document.querySelector('.fold.dirty') && !confirm('A list in this tab has unsaved changes. Leave without saving?')) return;
      state.selected = tabButton.dataset.tab; state.status = null; state.message = '';
      try { localStorage.setItem(TAB_KEY, state.selected); } catch { /* Not remembered. */ }
      renderTabs(); renderPanel(); void refreshStatus(); return;
    }
    const summary = target.closest('.fold > summary');
    if (summary) { const fold = summary.parentElement; const key = fold.dataset.foldKey; setTimeout(() => { if (fold.open) { state.openFolds.add(key); state.closedFolds.delete(key); } else { state.openFolds.delete(key); state.closedFolds.add(key); } }, 0); return; }
    const step = target.closest('[data-step]');
    if (step) { const input = step.parentElement.querySelector('input'); const next = (Number(input.value) || 0) + Number(step.dataset.step); const min = input.min === '' ? -Infinity : Number(input.min); const max = input.max === '' ? Infinity : Number(input.max); input.value = String(Math.min(max, Math.max(min, next))); scheduleQuick(step.closest('[data-quick]')); return; }
    if (target.closest('[data-save-fold]')) { void saveFold(target.closest('.fold')); return; }
    if (target.closest('[data-discard-fold]')) { const fold = target.closest('.fold'); const field = selectedTab()?.fields.find((entry) => entry.name === fold.dataset.field); if (field) { const fresh = listFold(field); fresh.open = true; fold.replaceWith(fresh); } state.editing = document.querySelector('.fold.dirty') !== null; return; }
    if (target.closest('[data-add-row]')) {
      const table = target.closest('.row-table'); const body = table.querySelector('.row-body');
      if (body.children.length >= Number(table.dataset.max)) { setNote(`You can add at most ${table.dataset.max} ${table.dataset.item}s.`, table); return; }
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
    if (event.key === 'Enter' && event.target instanceof Element && event.target.closest('[data-quick]') && event.target.matches('input:not([type=checkbox]):not([type=radio])')) { event.preventDefault(); scheduleQuick(event.target.closest('[data-quick]'), 0); return; }
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
  });
  // Saves one list fold on its own.
  async function saveFold(fold) {
    const note = fold.querySelector('.fold-note'); const button = fold.querySelector('[data-save-fold]'); button.disabled = true; note.textContent = 'Saving…';
    try {
      const settings = readSettings(fold);
      const result = await api('/wizard/api/control-panel/settings', { method: 'PUT', body: JSON.stringify({ moduleId: state.selected, settings }) });
      const field = selectedTab()?.fields.find((entry) => entry.name === fold.dataset.field);
      if (field) field.value = result.settings && Object.hasOwn(result.settings, field.name) ? result.settings[field.name] : settings[field.name];
      fold.classList.remove('dirty'); state.editing = document.querySelector('.fold.dirty') !== null; note.textContent = 'Saved. It is live now.'; void refreshStatus();
    } catch (error) { note.textContent = error.message; }
    finally { button.disabled = false; }
  }
  // Numbers and text save shortly after you stop changing them (or at once on Enter); switches and choices at once.
  const quickTimers = new WeakMap();
  function scheduleQuick(wrap, delay = 700) { if (!wrap) return; clearTimeout(quickTimers.get(wrap)); quickTimers.set(wrap, setTimeout(() => void saveQuick(wrap), delay)); }
  document.addEventListener('change', (event) => {
    const wrap = event.target instanceof Element ? event.target.closest('[data-quick]') : null; if (!wrap) return;
    const kind = wrap.querySelector('[data-kind]')?.dataset.kind; scheduleQuick(wrap, kind === 'text' || kind === 'integer' || kind === 'number' ? 300 : 0);
  });
  // Typing in the settings pauses the automatic refresh, so nothing is overwritten.
  document.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    if (target.id === 'tab-filter') { filterTabs(target.value); return; }
    if (target.closest('.lists-area') && !target.matches('[data-chip-input]')) { if (target.dataset.cell !== undefined) target.title = target.value; changed(target); }
  });
  byId('use-here').addEventListener('click', () => { claim(); byId('moved').classList.add('hidden'); if (state.token) { byId('workspace').classList.remove('hidden'); void loadTabs(); } else byId('login').classList.remove('hidden'); });
  setInterval(() => { if (state.token && state.active && !state.busy && document.visibilityState === 'visible' && !document.activeElement?.closest?.('.action-form')) void refreshStatus(); }, 3_000);
  void start();
})();
