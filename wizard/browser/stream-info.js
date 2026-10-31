'use strict';
// Stream info pop-out. It unlocks the same way as the Setup Wizard (a one-use link from the Wizard
// or tray, one click on this PC when chosen, or the Wizard password) and keeps the password only
// in this window's memory.
(() => {
  const byId = (id) => document.getElementById(id);
  const PLATFORM_LABELS = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };
  const CONSOLE_LABELS = { xbox: 'Xbox', playstation: 'PlayStation' };
  const tabId = (() => { try { const existing = sessionStorage.getItem('thsv.streambridge.stream-info.tab'); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem('thsv.streambridge.stream-info.tab', created); return created; } catch { return crypto.randomUUID(); } })();
  const state = { token: '', status: null, profileId: '', busy: false };
  try { const theme = localStorage.getItem('thsv.streambridge.wizard.theme.v1'); if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme; } catch { /* Uses the dark theme. */ }

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
    try { await refresh(); }
    catch (error) { state.token = ''; throw error.status === 401 ? new Error('That password did not work.') : error; }
    byId('login').classList.add('hidden');
    byId('workspace').classList.remove('hidden');
  }

  async function start() {
    const params = new URLSearchParams(location.hash.slice(1));
    const ticket = params.get('unlock');
    if (ticket) {
      history.replaceState(null, '', location.pathname);
      try { if (!/^[A-Za-z0-9_-]{43}$/u.test(ticket)) throw new Error('The unlock link is invalid.'); await authenticate(await unlockWith('/wizard/api/unlock', { ticket })); return; }
      catch (error) { byId('login-error').textContent = `${error.message} Open Stream info again from the Wizard or the tray.`; }
    }
    try {
      const access = await (await fetch('/wizard/api/access')).json();
      if (access.mode === 'this-pc') await authenticate(await unlockWith('/wizard/api/unlock-local', {}, { 'x-thsv-wizard-tab': tabId }));
    } catch (error) { byId('login-error').textContent = error.message; }
  }

  function selectedProfile() { return state.status?.creatorControls?.profiles?.find((profile) => profile.id === state.profileId); }

  function fillForm(profile) {
    if (!profile) return;
    state.profileId = profile.id;
    for (const box of document.querySelectorAll('input[name="platform"]')) box.checked = profile.platforms.includes(box.value);
    byId('title').value = profile.title;
    byId('twitch-category').value = profile.twitchCategoryId;
    byId('youtube-category').value = profile.youtubeCategoryName;
    byId('kick-category').value = profile.kickCategoryName;
    for (const button of byId('profiles').querySelectorAll('button')) button.setAttribute('aria-checked', String(button.dataset.profile === profile.id));
  }

  function blockers(status) {
    const items = [];
    const creator = status.creatorControls || {};
    if (!status.streamerBotConnected) items.push('Streamer.bot is not connected. Start Streamer.bot, then press Refresh.');
    if (!creator.installed) items.push('Creator Controls is not installed.');
    else if (!creator.enabled) items.push('Creator Controls is off. Turn it on in the Wizard, save, then restart StreamBridge.');
    else if (!creator.controllerApproved) items.push('Approve the Creator Controls Provider Controller in the Wizard first.');
    else if (!creator.profiles.some((profile) => profile.enabled)) items.push('Every profile is turned off in the Wizard.');
    return items;
  }

  function render() {
    const status = state.status;
    const problems = blockers(status);
    const box = byId('blockers');
    box.replaceChildren(...problems.map((text) => { const item = document.createElement('p'); item.className = 'blocker'; item.textContent = text; return item; }));
    const profiles = (status.creatorControls?.profiles || []).filter((profile) => profile.enabled);
    byId('profiles').replaceChildren(...profiles.map((profile) => {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'radio'); button.dataset.profile = profile.id; button.textContent = profile.name;
      button.addEventListener('click', () => fillForm(profile));
      return button;
    }));
    if (!profiles.some((profile) => profile.id === state.profileId)) fillForm(profiles[0]);
    else for (const button of byId('profiles').querySelectorAll('button')) button.setAttribute('aria-checked', String(button.dataset.profile === state.profileId));
    byId('apply').disabled = problems.length > 0 || state.busy;
    renderConsoles(status, problems.length > 0);
  }

  function renderConsoles(status, blocked) {
    const pilot = status.categoryPilot || {};
    const consoles = pilot.consoles || {};
    const rows = [];
    for (const platform of ['xbox', 'playstation']) {
      const entry = consoles[platform];
      const row = document.createElement('div'); row.className = 'console-row';
      const text = document.createElement('span');
      if (!pilot.enabled || !entry?.enabled) text.textContent = `${CONSOLE_LABELS[platform]}: detection is off.`;
      else if (!entry.saved) text.textContent = `${CONSOLE_LABELS[platform]}: save a sign-in in the Wizard first.`;
      else if (entry.error) text.textContent = `${CONSOLE_LABELS[platform]}: ${entry.error}`;
      else if (entry.titleName) text.textContent = `${CONSOLE_LABELS[platform]}: ${entry.titleName}`;
      else text.textContent = `${CONSOLE_LABELS[platform]}: ${entry.polling ? 'no game right now.' : 'checks only while live.'}`;
      row.append(text);
      if (entry?.titleName) {
        const profile = status.creatorControls?.profiles?.find((candidate) => candidate.id === entry.profileId && candidate.enabled);
        const button = document.createElement('button'); button.type = 'button';
        if (profile) { button.textContent = `Apply ${profile.name}`; button.disabled = blocked || state.busy; button.addEventListener('click', () => { fillForm(profile); void applyNow(); }); }
        else { button.textContent = 'No profile set'; button.disabled = true; button.title = 'Add this game under Category Pilot > Console games in the Wizard.'; }
        row.append(button);
      }
      rows.push(row);
    }
    byId('console-list').replaceChildren(...rows);
  }

  async function refresh() {
    state.status = await api('/wizard/api/stream-info');
    render();
  }

  function showResult(kind, text, results = []) {
    const box = byId('result');
    const heading = document.createElement('p'); heading.className = kind; heading.textContent = text;
    const list = document.createElement('ul');
    for (const item of results) { const line = document.createElement('li'); line.className = item.success ? 'ok' : 'bad'; line.textContent = `${PLATFORM_LABELS[item.platform] || item.platform}: ${item.success ? 'updated' : 'failed'}`; list.append(line); }
    box.replaceChildren(heading, ...(results.length ? [list] : []));
  }

  async function applyNow() {
    if (state.busy) return;
    const profile = selectedProfile();
    if (!profile) { showResult('bad', 'Choose a profile first.'); return; }
    state.busy = true; render();
    showResult('', 'Sending to Streamer.bot…');
    try {
      const body = {
        profileId: profile.id,
        platforms: [...document.querySelectorAll('input[name="platform"]:checked')].map((box) => box.value),
        title: byId('title').value, twitchCategoryId: byId('twitch-category').value.trim(),
        youtubeCategoryName: byId('youtube-category').value, kickCategoryName: byId('kick-category').value,
      };
      const started = await api('/wizard/api/stream-info/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const result = await api(`/wizard/api/stream-info/results/${encodeURIComponent(started.requestId)}`);
        if (result.state === 'pending') continue;
        if (result.state === 'timeout') { showResult('bad', 'Streamer.bot did not answer in 30 seconds. Check that the Provider Controller action is imported and enabled.'); break; }
        showResult(result.success ? 'ok' : 'bad', result.success ? 'Every platform was updated.' : 'Some platforms were not updated.', result.results);
        break;
      }
    } catch (error) { showResult('bad', error.message); }
    finally { state.busy = false; try { await refresh(); } catch { render(); } }
  }

  byId('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = byId('token'); const token = input.value.trim(); input.value = '';
    byId('login-error').textContent = '';
    if (token) authenticate(token).catch((error) => { byId('login-error').textContent = error.message; });
  });
  byId('apply-form').addEventListener('submit', (event) => { event.preventDefault(); void applyNow(); });
  byId('refresh').addEventListener('click', () => { refresh().catch((error) => showResult('bad', error.message)); });
  setInterval(() => { if (state.token && !state.busy && document.visibilityState === 'visible') refresh().catch(() => undefined); }, 20_000);
  void start();
})();
