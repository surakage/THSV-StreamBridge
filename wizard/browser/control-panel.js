'use strict';
// Control Panel pop-out: one window with a tab per extension. A tab works only while its extension is on and
// running. Each tab shows the extension's live status and actions, plus a few settings that apply straight away.
// It unlocks like the Setup Wizard (a one-use link, one click on this PC when chosen, or the Wizard password) and
// keeps the password only in this window's memory. Only the newest window stays in charge.
(() => {
  const byId = (id) => document.getElementById(id);
  const TAB_KEY = 'thsv.streambridge.control-panel.tab';
  const tabId = (() => { try { const existing = sessionStorage.getItem('thsv.streambridge.control-panel.session'); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem('thsv.streambridge.control-panel.session', created); return created; } catch { return crypto.randomUUID(); } })();
  const state = { token: '', tabs: [], selected: '', status: null, message: '', messageBad: false, busy: false, active: true, dirty: false, search: '', folds: new Map(), offOpen: false };
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
  function selectedTab() { return state.tabs.find((tab) => tab.moduleId === state.selected); }

  // ---------- Extension list ----------
  async function loadTabs(keepSelection = false) {
    const result = await api('/wizard/api/control-panel');
    state.tabs = Array.isArray(result.tabs) ? result.tabs : [];
    let remembered = state.selected; try { remembered = remembered || localStorage.getItem(TAB_KEY) || ''; } catch { /* Not remembered. */ }
    const usable = state.tabs.filter((tab) => tab.available);
    state.selected = usable.some((tab) => tab.moduleId === remembered) ? remembered : usable[0]?.moduleId || '';
    renderTabs();
    if (!keepSelection) { renderPanel(); if (state.selected) await refreshStatus(); }
  }
  function tabButton(tab) {
    const button = element('button', '', tab.title); button.type = 'button'; button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.moduleId === state.selected)); button.disabled = !tab.available; button.dataset.tab = tab.moduleId;
    button.title = tab.available ? tab.summary : `${tab.title}: ${tab.reason}`;
    return button;
  }
  function renderTabs() {
    const nav = byId('tabs'); nav.replaceChildren();
    const query = state.search.trim().toLowerCase();
    const matching = state.tabs.filter((tab) => !query || tab.title.toLowerCase().includes(query));
    const on = matching.filter((tab) => tab.available); const off = matching.filter((tab) => !tab.available);
    for (const tab of on) nav.append(tabButton(tab));
    if (off.length) {
      const group = element('details'); group.open = state.offOpen || Boolean(query); group.dataset.offGroup = 'true';
      group.append(element('summary', '', `Turned off (${off.length})`));
      for (const tab of off) group.append(tabButton(tab));
      nav.append(group);
    }
    if (!matching.length) nav.append(element('p', 'no-match', 'No extension matches.'));
  }

  // ---------- Live status and actions ----------
  function actionControl(action) {
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
    button.type = 'submit'; form.append(button); return form;
  }
  // A collapsible section that remembers whether it was open, so the 3-second refresh never folds it back.
  function fold(key, title, count, openByDefault) {
    const details = element('details', 'fold'); details.dataset.fold = key;
    details.open = state.folds.has(key) ? state.folds.get(key) : openByDefault;
    const summary = element('summary', '', title); if (count !== undefined) summary.append(element('span', 'count', String(count)));
    const body = element('div', 'fold-body'); details.append(summary, body);
    return { details, body };
  }
  function renderLive(container, tab) {
    container.replaceChildren();
    const status = state.status || {};
    const card = element('section', 'card');
    if (state.message) { const message = element('p', `message${state.messageBad ? ' bad' : ''}`, state.message); message.setAttribute('role', 'status'); card.append(message); }
    if (status.notice) card.append(element('p', 'notice', status.notice));
    if (Array.isArray(status.summary) && status.summary.length) {
      const grid = element('div', 'summary');
      for (const entry of status.summary) { const box = element('div'); box.append(element('span', '', entry.label), element('strong', '', entry.value)); grid.append(box); }
      card.append(grid);
    }
    const actions = [...(Array.isArray(status.actions) ? status.actions : []), ...(Array.isArray(tab.actions) ? tab.actions : [])];
    if (actions.length) { const row = element('div', 'actions'); for (const action of actions) row.append(actionControl(action)); card.append(row); }
    if (!status.summary && !actions.length && !state.message && !status.notice) card.append(element('p', 'hint', 'Nothing to control live here. Change the settings below.'));
    if (card.childElementCount) container.append(card);
    for (const list of Array.isArray(status.lists) ? status.lists : []) {
      const items = Array.isArray(list.items) ? list.items : [];
      const { details, body } = fold(`${tab.moduleId}:list:${list.title}`, list.title, items.length, items.length <= 6);
      const ul = element('ul', 'items');
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
      body.append(ul); container.append(details);
    }
  }

  // ---------- Settings, generated from the extension's own settings schema and layout ----------
  function optionLabel(value, labels) {
    if (labels && typeof labels[value] === 'string') return labels[value];
    const words = String(value).replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/[-_]/gu, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const isHexPattern = (pattern) => /#\[0-9a-fA-F\]\{6\}/u.test(String(pattern || ''));
  function columnsFor(field) {
    const ui = field.ui || {}; const schema = field.schema || {};
    if (ui.control === 'row-list' && Array.isArray(ui.columns) && ui.columns.length) {
      return ui.columns.slice(0, 8).map((column) => ({
        label: String(column?.label || ''), hint: String(column?.hint || ''), placeholder: String(column?.placeholder || ''),
        type: column?.type === 'number' ? 'number' : (String(column?.hint || '') === '#hex' || (column?.maxLength === 7 && String(column?.placeholder || '').startsWith('#'))) ? 'color' : 'text',
        maxLength: Number.isInteger(column?.maxLength) ? column.maxLength : 240, min: column?.min, max: column?.max,
        width: /^[0-9.]+(fr|rem)$/u.test(String(column?.width || '')) ? column.width : '1fr',
      }));
    }
    const item = String(ui.itemLabel || 'entry');
    return [{ label: item.charAt(0).toUpperCase() + item.slice(1), hint: '', placeholder: '', type: 'text', maxLength: schema.items?.maxLength || 300, width: '1fr' }];
  }
  function cellInput(column, value) {
    const input = element('input'); input.dataset.cell = 'true'; input.setAttribute('aria-label', column.label);
    if (column.type === 'color') { input.type = 'color'; input.value = /^#[0-9a-f]{6}$/iu.test(value) ? value : '#7ff5cc'; return input; }
    input.type = column.type; input.value = value ?? ''; input.placeholder = column.placeholder;
    if (column.type === 'number') { if (column.min !== undefined) input.min = String(column.min); if (column.max !== undefined) input.max = String(column.max); input.step = '1'; }
    else input.maxLength = column.maxLength;
    return input;
  }
  function tableRow(columns, values) {
    const cells = columns.map((column, index) => cellInput(column, values[index] ?? ''));
    const remove = element('button', 'icon', '×'); remove.type = 'button'; remove.dataset.removeRow = 'true'; remove.title = 'Remove'; remove.setAttribute('aria-label', 'Remove this row');
    return { nodes: [...cells, remove] };
  }
  function listEditor(field) {
    const schema = field.schema || {}; const columns = columnsFor(field);
    const editor = element('div', 'rows-table'); editor.dataset.kind = 'rows'; editor.dataset.max = String(schema.maxItems || 50); editor.dataset.columns = JSON.stringify(columns);
    const grid = element('div', 'rows-grid'); grid.style.setProperty('--columns', `${columns.map((column) => column.width).join(' ')} auto`);
    if (columns.length > 1) { for (const column of columns) { const head = element('div', 'rows-head', column.label); if (column.hint) head.append(element('small', '', column.hint)); head.title = column.hint || column.label; grid.append(head); } grid.append(element('div', 'rows-head')); }
    for (const line of Array.isArray(field.value) ? field.value : []) grid.append(...tableRow(columns, columns.length > 1 ? String(line).split('|').map((part) => part.trim()) : [String(line)]).nodes);
    editor.append(grid);
    return editor;
  }
  function colorEditor(field) {
    const editor = element('div', 'colors'); editor.dataset.kind = 'colors'; editor.dataset.max = String(field.schema?.maxItems || 10);
    for (const value of Array.isArray(field.value) ? field.value : []) editor.append(colorCell(String(value)));
    return editor;
  }
  function colorCell(value) {
    const cell = element('span', 'color-cell'); const input = element('input'); input.type = 'color'; input.value = /^#[0-9a-f]{6}$/iu.test(value) ? value : '#7ff5cc'; input.setAttribute('aria-label', 'Colour');
    const remove = element('button', 'icon', '×'); remove.type = 'button'; remove.dataset.removeColor = 'true'; remove.title = 'Remove'; cell.append(input, remove); return cell;
  }
  function countOf(field) { return Array.isArray(field.value) ? field.value.length : 0; }
  function renderSettings(container, tab) {
    if (!tab.fields?.length) return;
    const card = element('section', 'card settings-card');
    card.append(element('h3', '', 'Settings'), element('p', 'hint', 'Changes apply straight away when you save. Everything else stays in the Setup Wizard.'));
    const form = element('form'); form.id = 'settings-form'; form.noValidate = true;
    const quick = element('div', 'quick-grid'); const folds = [];
    for (const field of tab.fields) {
      const schema = field.schema || {}; const ui = field.ui || {}; const title = schema.title || field.name;
      const wrap = element('div', 'field'); wrap.dataset.field = field.name; if (ui.visibleWhen) wrap.dataset.visibleWhen = JSON.stringify(ui.visibleWhen);
      if (schema.type === 'array') {
        const options = Array.isArray(schema.items?.enum) ? schema.items.enum : undefined;
        let editor;
        if (options) {
          editor = element('div', 'chips'); editor.dataset.kind = 'choices'; const chosen = new Set(Array.isArray(field.value) ? field.value : []);
          for (const option of options) { const chip = element('label'); const box = element('input'); box.type = 'checkbox'; box.value = option; box.checked = chosen.has(option); chip.append(box, document.createTextNode(optionLabel(option, ui.labels))); editor.append(chip); }
        } else editor = isHexPattern(schema.items?.pattern) ? colorEditor(field) : listEditor(field);
        const { details, body } = fold(`${tab.moduleId}:setting:${field.name}`, title, options ? `${(field.value || []).length} chosen` : countOf(field), false);
        body.append(editor);
        if (!options) { const tools = element('div', 'list-tools'); const add = element('button', 'ghost small', `+ Add ${ui.itemLabel || (editor.dataset.kind === 'colors' ? 'colour' : 'row')}`); add.type = 'button'; add.dataset.addRow = 'true'; tools.append(add, element('small', '', `Up to ${editor.dataset.max}`)); body.append(tools); }
        if (schema.description) body.append(element('small', '', schema.description));
        wrap.classList.add('wide'); wrap.append(details); folds.push(wrap); continue;
      }
      if (schema.type === 'boolean') {
        const label = element('label', 'switch'); const box = element('input'); box.type = 'checkbox'; box.checked = field.value === true; box.dataset.kind = 'boolean'; box.setAttribute('role', 'switch');
        label.append(box, document.createTextNode(title)); wrap.append(label);
      } else if (Array.isArray(schema.enum)) {
        const label = element('label', '', title); const select = element('select'); select.dataset.kind = 'text'; select.id = `field-${field.name}`; label.htmlFor = select.id;
        for (const option of schema.enum) { const node = element('option', '', optionLabel(option, ui.labels)); node.value = option; node.selected = option === field.value; select.append(node); }
        wrap.append(label, select);
      } else {
        const label = element('label', '', title); const input = element('input'); input.id = `field-${field.name}`; label.htmlFor = input.id;
        if (schema.type === 'integer' || schema.type === 'number') { input.type = 'number'; input.dataset.kind = schema.type; if (schema.minimum !== undefined) input.min = String(schema.minimum); if (schema.maximum !== undefined) input.max = String(schema.maximum); input.step = schema.type === 'number' ? 'any' : '1'; }
        else { input.type = 'text'; input.dataset.kind = 'text'; if (schema.maxLength) input.maxLength = schema.maxLength; if ((schema.maxLength || 0) > 100) wrap.classList.add('wide'); }
        input.value = field.value === null || field.value === undefined ? '' : String(field.value); wrap.append(label, input);
      }
      if (schema.description) { const help = element('small', '', schema.description); help.title = schema.description; wrap.append(help); }
      quick.append(wrap);
    }
    if (quick.childElementCount) form.append(quick);
    form.append(...folds);
    const bar = element('div', 'save-bar'); const save = element('button', '', 'Save changes'); save.type = 'submit'; save.setAttribute('form', 'settings-form'); save.disabled = true;
    const discard = element('button', 'ghost', 'Discard'); discard.type = 'button'; discard.dataset.discard = 'true'; discard.disabled = true;
    const note = element('span', 'hint', 'No changes.'); note.id = 'settings-note'; bar.append(save, discard, note);
    card.append(form, bar); container.append(card);
    applyVisibility(form); state.dirty = false;
  }
  function currentValue(form, name) {
    const wrap = form.querySelector(`[data-field="${CSS.escape(name)}"]`); const control = wrap?.querySelector('[data-kind]');
    if (!control) return selectedTab()?.fields.find((field) => field.name === name)?.value;
    return control.dataset.kind === 'boolean' ? control.checked : control.value;
  }
  function applyVisibility(form) {
    for (const wrap of form.querySelectorAll('[data-visible-when]')) {
      let rule; try { rule = JSON.parse(wrap.dataset.visibleWhen); } catch { continue; }
      const value = currentValue(form, rule.field);
      wrap.hidden = Array.isArray(rule.in) ? !rule.in.includes(value) : Object.hasOwn(rule, 'equals') ? value !== rule.equals : false;
    }
  }
  function readSettings(form) {
    const settings = {};
    for (const wrap of form.querySelectorAll('[data-field]')) {
      const name = wrap.dataset.field; const control = wrap.querySelector('[data-kind]'); if (!control) continue;
      const kind = control.dataset.kind;
      if (kind === 'boolean') settings[name] = control.checked;
      else if (kind === 'choices') settings[name] = [...control.querySelectorAll('input:checked')].map((input) => input.value);
      else if (kind === 'colors') settings[name] = [...control.querySelectorAll('input[type=color]')].map((input) => input.value);
      else if (kind === 'rows') {
        const columns = JSON.parse(control.dataset.columns || '[]'); const cells = [...control.querySelectorAll('[data-cell]')]; const lines = [];
        for (let index = 0; index < cells.length; index += columns.length) {
          const row = cells.slice(index, index + columns.length);
          if (!row.some((input, position) => columns[position]?.type !== 'color' && input.value.trim() !== '')) continue;
          lines.push(row.map((input) => input.value.replace(/[|\r\n]+/gu, ' ').trim()).join(' | '));
        }
        settings[name] = lines;
      } else if (kind === 'integer') settings[name] = Math.trunc(Number(control.value));
      else if (kind === 'number') settings[name] = Number(control.value);
      else settings[name] = control.value;
    }
    return settings;
  }
  function markDirty(dirty) {
    state.dirty = dirty; const bar = document.querySelector('.save-bar'); if (!bar) return;
    bar.classList.toggle('dirty', dirty); bar.querySelector('button[type=submit]').disabled = !dirty; bar.querySelector('[data-discard]').disabled = !dirty;
    byId('settings-note').textContent = dirty ? 'Unsaved changes.' : 'No changes.';
  }

  // ---------- The open tab ----------
  function renderPanel() {
    const panel = byId('panel'); panel.replaceChildren();
    const tab = selectedTab();
    if (!tab) { panel.append(element('section', 'card', 'Turn on an extension in the Setup Wizard to control it here.')); return; }
    const head = element('section', 'tab-head'); head.append(element('h2', '', tab.title), element('p', '', tab.summary));
    const live = element('div', 'live-area'); live.id = 'live'; live.style.display = 'contents';
    panel.append(head, live); renderLive(live, tab); renderSettings(panel, tab);
  }
  async function refreshStatus() {
    if (!state.selected || !state.active) return;
    try { state.status = await api('/wizard/api/control-panel/status', { method: 'POST', body: JSON.stringify({ moduleId: state.selected }) }); }
    catch (error) { state.status = { notice: error.message }; if (error.status === 409) await loadTabs(true).catch(() => undefined); }
    const live = byId('live'); const tab = selectedTab(); if (live && tab) renderLive(live, tab);
  }
  async function run(action, values, source) {
    if (state.busy) return; state.busy = true; if (source) source.disabled = true;
    try {
      const result = await api('/wizard/api/control-panel/action', { method: 'POST', body: JSON.stringify({ moduleId: state.selected, action, values }) });
      if (result && (result.summary || result.lists || result.actions)) state.status = result;
      state.message = result.message || 'Done.'; state.messageBad = false;
      if (!(result.summary || result.lists)) setTimeout(() => void refreshStatus(), 600);
    } catch (error) { state.message = error.message; state.messageBad = true; }
    finally { state.busy = false; if (source) source.disabled = false; const live = byId('live'); const tab = selectedTab(); if (live && tab) renderLive(live, tab); }
  }

  document.addEventListener('toggle', (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (details.dataset.fold) state.folds.set(details.dataset.fold, details.open);
    if (details.dataset.offGroup) state.offOpen = details.open;
  }, true);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    const tabButtonNode = target.closest('[data-tab]');
    if (tabButtonNode && !tabButtonNode.disabled) {
      if (state.dirty && !confirm('You have unsaved settings in this tab. Leave without saving?')) return;
      state.selected = tabButtonNode.dataset.tab; state.status = null; state.message = '';
      try { localStorage.setItem(TAB_KEY, state.selected); } catch { /* Not remembered. */ }
      renderTabs(); renderPanel(); byId('panel').scrollTop = 0; void refreshStatus(); return;
    }
    const add = target.closest('[data-add-row]');
    if (add) {
      const body = add.closest('.fold-body'); const editor = body.querySelector('[data-kind="rows"], [data-kind="colors"]');
      if (editor.dataset.kind === 'colors') { if (editor.children.length < Number(editor.dataset.max)) editor.append(colorCell('#7ff5cc')); }
      else {
        const columns = JSON.parse(editor.dataset.columns || '[]'); const grid = editor.querySelector('.rows-grid');
        if (grid.querySelectorAll('[data-remove-row]').length < Number(editor.dataset.max)) { const { nodes } = tableRow(columns, []); grid.append(...nodes); nodes[0].focus(); }
      }
      markDirty(true); return;
    }
    const removeRow = target.closest('[data-remove-row]');
    if (removeRow) {
      const editor = removeRow.closest('[data-kind="rows"]'); const columns = JSON.parse(editor.dataset.columns || '[]');
      for (let index = 0; index < columns.length; index += 1) removeRow.previousElementSibling?.remove();
      removeRow.remove(); markDirty(true); return;
    }
    const removeColor = target.closest('[data-remove-color]');
    if (removeColor) { removeColor.closest('.color-cell').remove(); markDirty(true); return; }
    if (target.closest('[data-discard]')) {
      const tab = selectedTab(); const card = document.querySelector('.settings-card'); if (!tab || !card) return;
      const holder = element('div'); renderSettings(holder, tab); card.replaceWith(holder.firstElementChild); return;
    }
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
      event.preventDefault(); const note = byId('settings-note'); const button = document.querySelector('.save-bar button[type=submit]'); button.disabled = true; note.textContent = 'Saving…';
      const panel = byId('panel'); const scroll = panel.scrollTop;
      api('/wizard/api/control-panel/settings', { method: 'PUT', body: JSON.stringify({ moduleId: state.selected, settings: readSettings(form) }) })
        .then(async () => {
          state.dirty = false; await loadTabs(true);
          const tab = selectedTab(); const card = document.querySelector('.settings-card');
          if (tab && card) { const holder = element('div'); renderSettings(holder, tab); card.replaceWith(holder.firstElementChild); }
          panel.scrollTop = scroll; byId('settings-note').textContent = 'Saved. It is live now.'; void refreshStatus();
        })
        .catch((error) => { note.textContent = error.message; button.disabled = false; });
    }
  });
  document.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    if (target.id === 'tab-search') { state.search = target.value; renderTabs(); return; }
    const form = target.closest('#settings-form'); if (form) { markDirty(true); applyVisibility(form); }
  });
  document.addEventListener('change', (event) => { const form = event.target instanceof Element ? event.target.closest('#settings-form') : null; if (form) { markDirty(true); applyVisibility(form); } });
  addEventListener('beforeunload', (event) => { if (state.dirty) event.preventDefault(); });
  byId('use-here').addEventListener('click', () => { claim(); byId('moved').classList.add('hidden'); if (state.token) { byId('workspace').classList.remove('hidden'); void loadTabs(); } else byId('login').classList.remove('hidden'); });
  setInterval(() => { if (state.token && state.active && !state.busy && document.visibilityState === 'visible' && !document.activeElement?.closest?.('.action-form')) void refreshStatus(); }, 3_000);
  void start();
})();
