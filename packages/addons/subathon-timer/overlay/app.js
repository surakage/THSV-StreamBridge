(() => {
  'use strict';

  const shell = document.querySelector('.timer-shell');
  const label = document.getElementById('label');
  const badge = document.getElementById('badge');
  const time = document.getElementById('time');
  const progress = document.getElementById('progress');
  const reason = document.getElementById('reason');
  const platforms = document.getElementById('platforms');

  const DEFAULT_CAP_SECONDS = 12 * 60 * 60;
  let maximumSeconds = DEFAULT_CAP_SECONDS;

  function setState(next) {
    shell.dataset.state = next;
  }

  function toText(value, fallback = '') {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  }

  function toNumber(value, fallback = 0) {
    return Number.isFinite(value) ? Number(value) : fallback;
  }

  function toColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  function toOpacity(value, fallback) {
    const next = toNumber(value, fallback);
    return Math.max(0, Math.min(1, next));
  }

  function setVariable(name, value) {
    document.documentElement.style.setProperty(name, value);
  }

  function hexToRgb(value) {
    const normalized = toColor(value, '#000000').slice(1);
    return `${parseInt(normalized.slice(0, 2), 16)} ${parseInt(normalized.slice(2, 4), 16)} ${parseInt(normalized.slice(4, 6), 16)}`;
  }

  function applyStyle(style) {
    const next = style && typeof style === 'object' ? style : {};
    const fontFamily = next.fontFamily === 'mono' ? 'var(--font-mono)' : next.fontFamily === 'broadcast' ? 'var(--font-broadcast)' : 'var(--font-display)';
    const backgroundMode = next.backgroundMode === 'none' ? 'none' : next.backgroundMode === 'solid' ? 'solid' : 'glass';
    const backgroundColor = toColor(next.backgroundColor, '#0b1017');
    const backgroundOpacity = toOpacity(next.backgroundOpacity, 0.88);
    const accent = toColor(next.accentColor, '#7ee0ff');
    const text = toColor(next.textColor, '#eff7ff');
    const muted = toColor(next.mutedColor, '#dfefff');
    const warning = toColor(next.warningColor, '#f0c15a');
    const critical = toColor(next.criticalColor, '#ff6b7d');
    const live = toColor(next.liveColor, '#61f2a4');
    const border = toColor(next.borderColor, '#85cbff');

    setVariable('--font-active', fontFamily);
    setVariable('--ink', text);
    setVariable('--muted', muted);
    setVariable('--accent', accent);
    setVariable('--warn', warning);
    setVariable('--critical', critical);
    setVariable('--live', live);
    setVariable('--line', `rgb(${hexToRgb(border)} / 0.22)`);
    setVariable('--bg', `rgb(${hexToRgb(backgroundColor)} / ${backgroundOpacity})`);
    setVariable('--card', `linear-gradient(145deg, rgb(${hexToRgb(backgroundColor)} / ${backgroundOpacity}), rgb(${hexToRgb(backgroundColor)} / ${Math.max(0, backgroundOpacity - 0.12)}))`);
    shell.dataset.background = backgroundMode;
    shell.dataset.progress = next.showProgressBar === false ? 'hidden' : 'shown';
  }

  function update(payload) {
    const remainingSeconds = Math.max(0, toNumber(payload.remainingSeconds, 0));
    maximumSeconds = Math.max(1, toNumber(payload.maximumSeconds, maximumSeconds));
    applyStyle(payload.style);
    label.textContent = toText(payload.label, 'SUBATHON');
    badge.textContent = payload.running === true ? 'LIVE' : (payload.live === true ? 'PAUSED' : 'OFFLINE');
    time.textContent = toText(payload.remainingText, '00:00:00');
    reason.textContent = toText(payload.lastReason, payload.running === true ? 'Timer running' : 'Waiting for StreamBridge');
    const livePlatforms = Array.isArray(payload.livePlatforms) ? payload.livePlatforms.map((item) => toText(item)).filter(Boolean) : [];
    platforms.textContent = livePlatforms.length > 0 ? `Live on ${livePlatforms.join(', ')}` : 'No live platforms';
    progress.style.width = `${Math.max(0, Math.min(100, (remainingSeconds / maximumSeconds) * 100))}%`;

    if (payload.critical === true) setState('critical');
    else if (payload.warning === true) setState('warning');
    else if (payload.running === true) setState('live');
    else setState('idle');
  }

  function receive(message) {
    if (!message || typeof message !== 'object') return;
    if (message.topic === 'thsv.subathon-timer.timer.update' && message.payload) update(message.payload);
    else if (message.kind === 'addon.overlay' && message.topic === 'thsv.subathon-timer.timer.update') update(message.payload || {});
    else if (message.kind === 'hub.ready') reason.textContent = 'Connected';
  }

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/overlay/events`);
    socket.addEventListener('message', (event) => {
      try { receive(JSON.parse(event.data)); } catch { /* Ignore malformed transport data. */ }
    });
    socket.addEventListener('open', () => { reason.textContent = 'Connected'; });
    socket.addEventListener('close', () => {
      reason.textContent = 'Reconnecting';
      setTimeout(connect, 1500);
    });
  }

  update({
    label: 'SUBATHON',
    remainingText: '00:00:00',
    remainingSeconds: 0,
    maximumSeconds,
    running: false,
    live: false,
    livePlatforms: [],
    lastReason: 'Waiting for StreamBridge',
    style: {}
  });

  connect();
})();
