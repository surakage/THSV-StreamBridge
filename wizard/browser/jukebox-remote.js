'use strict';
// Jukebox remote pop-out: runs Village Jukebox's video queue from its own small window (or an OBS dock). It unlocks
// like the Setup Wizard (a one-use link from the Wizard or tray, one click on this PC when chosen, or the Wizard
// password) and keeps the password only in this window's memory.
(() => {
  const byId = (id) => document.getElementById(id);
  const PLATFORM_LABELS = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok' };
  const STATUS_LABELS = { queued: 'Queued', playing: 'Playing', played: 'Played', skipped: 'Skipped', stopped: 'Stopped', removed: 'Removed', blocked: 'Blocked', failed: 'Could not play' };
  const tabId = (() => { try { const existing = sessionStorage.getItem('thsv.streambridge.jukebox-remote.tab'); if (existing) return existing; const created = crypto.randomUUID(); sessionStorage.setItem('thsv.streambridge.jukebox-remote.tab', created); return created; } catch { return crypto.randomUUID(); } })();
  const state = { token: '', status: null, receivedAt: 0, busy: false };
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
  async function control(request) {
    const result = await api('/wizard/api/village-jukebox/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    show(result.status); return result;
  }
  async function authenticate(token) {
    state.token = token;
    try { await control({ operation: 'status' }); }
    catch (error) { state.token = ''; throw error.status === 401 ? new Error('That password did not work.') : error; }
    byId('login').classList.add('hidden'); byId('workspace').classList.remove('hidden');
  }
  async function start() {
    const params = new URLSearchParams(location.hash.slice(1)); const ticket = params.get('unlock');
    if (ticket) {
      history.replaceState(null, '', location.pathname);
      try { if (!/^[A-Za-z0-9_-]{43}$/u.test(ticket)) throw new Error('The unlock link is invalid.'); await authenticate(await unlockWith('/wizard/api/unlock', { ticket })); return; }
      catch (error) { byId('login-error').textContent = `${error.message} Open the Jukebox remote again from the Wizard or the tray.`; }
    }
    try {
      const access = await (await fetch('/wizard/api/access')).json();
      if (access.mode === 'this-pc') await authenticate(await unlockWith('/wizard/api/unlock-local', {}, { 'x-thsv-wizard-tab': tabId }));
    } catch (error) { byId('login-error').textContent = error.message; }
  }

  const time = (seconds) => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60); const rest = String(value % 60).padStart(2, '0'); return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`; };
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function thumb(videoId) { const image = element('img', 'thumb'); image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => { image.removeAttribute('src'); image.classList.add('missing'); }, { once: true }); image.src = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`; return image; }
  function titleLink(item) { const link = element('a', 'title', item.title); link.href = item.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
  function button(label, request, className = 'ghost small', title = '') { const node = element('button', className, label); node.type = 'button'; node.dataset.request = JSON.stringify(request); if (title) node.title = title; return node; }

  function show(status) {
    if (!status) return; state.status = status; state.receivedAt = Date.now();
    const notice = byId('notice');
    const message = !status.enabled ? 'Village Jukebox is off. Turn it on in the Setup Wizard, then restart StreamBridge.' : !status.ready ? 'Tick the music-rights box in Village Jukebox\'s settings to start playing.' : '';
    notice.textContent = message; notice.classList.toggle('hidden', !message);
    const now = byId('now'); now.replaceChildren();
    if (status.current) {
      const row = element('div', 'now-row'); row.append(thumb(status.current.videoId));
      const text = element('div', 'now-text'); text.append(titleLink(status.current), element('small', '', `${status.current.channel} · requested by ${status.current.requesterName} on ${PLATFORM_LABELS[status.current.platform] || status.current.platform}`), element('small', 'clock', ''));
      row.append(text); now.append(row);
    } else now.append(element('p', 'hint', status.paused ? 'Stopped. Press Play to start the next video.' : 'Nothing playing. The next request starts by itself.'));
    // The next video to play: with reviewing on, the first approved one; videos still waiting are counted separately.
    const waiting = status.queue.filter((item) => !item.approved).length; const next = status.queue.find((item) => item.approved);
    byId('up-next').textContent = next ? `Up next: ${next.title} (${next.requesterName})` : waiting ? 'Up next: nothing approved yet.' : '';
    byId('up-next').append(...(waiting ? [element('span', 'waiting-count', ` · ${waiting} waiting for approval`)] : []));
    byId('approve-all').classList.toggle('hidden', waiting < 2); byId('review-hint').classList.toggle('hidden', !status.approveRequests);
    const toggle = byId('play-toggle'); const playing = !status.paused;
    toggle.textContent = playing ? 'Pause' : 'Play'; toggle.dataset.op = playing ? 'pause' : 'resume';
    const volume = byId('volume'); if (document.activeElement !== volume) volume.value = String(Math.round(status.volume * 100)); byId('volume-value').textContent = `${volume.value}%`;
    const queue = byId('queue'); queue.replaceChildren();
    if (!status.queue.length) queue.append(element('li', 'empty', 'The queue is empty. Viewers add videos with !sr and a YouTube link or title.'));
    status.queue.forEach((item, index) => {
      const row = element('li', 'video'); row.append(element('span', 'position', String(index + 1)), thumb(item.videoId));
      const text = element('div', 'video-text'); text.append(titleLink(item), element('small', '', `${item.channel} · ${item.requesterName} · ${PLATFORM_LABELS[item.platform] || item.platform} · ${time(item.durationSeconds)}`));
      if (!item.approved) { row.classList.add('waiting'); text.prepend(element('span', 'badge', 'Waiting for approval')); }
      const actions = element('div', 'actions');
      if (!item.approved) actions.append(button('Approve', { operation: 'approve', requestId: item.requestId }, 'small', 'Let this video play in its turn'));
      actions.append(button('Play now', { operation: 'play-now', requestId: item.requestId }, 'small', 'Start this video straight away'));
      if (index > 0) actions.append(button('Next', { operation: 'play-next', requestId: item.requestId }, 'ghost small', 'Play this one after the current video'));
      actions.append(button('Remove', { operation: 'remove', requestId: item.requestId }, 'ghost small', 'Take it out and refund the viewer'), button('Block', { operation: 'block', video: item.videoId, title: item.title }, 'ghost small danger', 'Remove it and block the video for good'));
      row.append(text, actions); queue.append(row);
    });
    const historyList = byId('history'); historyList.replaceChildren();
    if (!status.history.length) historyList.append(element('li', 'empty', 'No requests yet.'));
    for (const item of status.history) {
      const row = element('li', 'video'); row.append(thumb(item.videoId));
      const text = element('div', 'video-text'); text.append(titleLink(item), element('small', '', `${item.requesterName} · ${STATUS_LABELS[item.status] || item.status} · ${new Date(item.at).toLocaleTimeString()}`));
      const actions = element('div', 'actions');
      if (item.durationSeconds > 0 && !['queued', 'playing'].includes(item.status) && !status.blocked.some((blocked) => blocked.videoId === item.videoId)) actions.append(button('Play again', { operation: 'replay', requestId: item.requestId }));
      row.append(text, actions); historyList.append(row);
    }
    tick();
  }
  // The clock and progress bar move every second between refreshes.
  function tick() {
    const current = state.status?.current; const bar = byId('progress-bar'); const clock = document.querySelector('#now .clock');
    if (!current) { bar.style.width = '0%'; return; }
    const elapsed = Math.min(current.durationSeconds, current.elapsedSeconds + (state.status.paused ? 0 : (Date.now() - state.receivedAt) / 1000));
    bar.style.width = `${Math.min(100, (elapsed / Math.max(1, current.durationSeconds)) * 100)}%`;
    if (clock) clock.textContent = `${state.status.paused ? 'Paused · ' : ''}${time(elapsed)} / ${time(current.durationSeconds)}`;
  }

  async function run(request, source) {
    if (state.busy) return; state.busy = true; if (source) source.disabled = true;
    const result = byId('result');
    try {
      const answer = await control(request);
      const messages = { skip: 'Skipped.', stop: 'Stopped. Press Play to carry on.', pause: 'Paused.', resume: answer.reason === 'media-busy' ? 'Other media is playing right now. Try again in a moment.' : 'Playing.', 'play-now': `Playing ${answer.playing}.`, 'play-next': `${answer.moved} plays next.`, remove: `Removed ${answer.removed}; the viewer was refunded.`, block: 'Blocked. It can no longer be requested.', clear: `Cleared ${answer.cleared} video(s); everyone was refunded.`, replay: `${answer.queued} is up next.`, approve: `Approved ${answer.approved}.`, 'approve-all': `Approved ${answer.approved} video(s).` };
      result.textContent = messages[request.operation] || '';
    } catch (error) { result.textContent = error.message; }
    finally { state.busy = false; if (source) source.disabled = false; }
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    const transport = target.closest('[data-op]');
    if (transport) {
      const operation = transport.dataset.op;
      if (operation === 'clear' && !confirm('Clear the whole queue? Everyone in it gets their points back.')) return;
      void run({ operation }, transport); return;
    }
    const action = target.closest('[data-request]');
    if (action) {
      const request = JSON.parse(action.dataset.request);
      if (request.operation === 'block' && !confirm(`Block "${request.title}"? It is removed and can never be requested again.`)) return;
      void run(request, action); return;
    }
    if (target.closest('#copy-links')) {
      const links = [...new Set((state.status?.history || []).map((item) => item.link))];
      navigator.clipboard?.writeText(links.join('\n')).then(() => { byId('result').textContent = `Copied ${links.length} link(s).`; }, () => { byId('result').textContent = 'Copying is blocked in this window.'; });
    }
  });
  byId('volume').addEventListener('input', () => { byId('volume-value').textContent = `${byId('volume').value}%`; });
  byId('volume').addEventListener('change', () => { void run({ operation: 'volume', volume: Number(byId('volume').value) / 100 }); });
  byId('block-form').addEventListener('submit', (event) => {
    event.preventDefault(); const input = event.currentTarget.elements.video; const video = input.value.trim(); if (!video) return;
    void run({ operation: 'block', video }).then(() => { input.value = ''; });
  });
  byId('login-form').addEventListener('submit', (event) => {
    event.preventDefault(); const token = byId('token').value.trim(); byId('token').value = '';
    authenticate(token).then(() => { byId('login-error').textContent = ''; }, (error) => { byId('login-error').textContent = error.message; });
  });
  setInterval(tick, 1_000);
  setInterval(() => { if (state.token && !state.busy && document.visibilityState === 'visible') control({ operation: 'status' }).catch(() => undefined); }, 3_000);
  void start();
})();
