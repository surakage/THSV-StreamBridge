(() => {
  'use strict';
  const moduleId = location.pathname.slice('/overlay/addons/'.length);
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId)) return;
  const card = document.getElementById('card');
  const cardImage = document.getElementById('card-image');
  const cardTitle = document.getElementById('card-title');
  const cardText = document.getElementById('card-text');
  const mediaShell = document.getElementById('media-shell');
  const media = document.getElementById('media');
  const mediaTitle = document.getElementById('media-title');
  const timerShell = document.getElementById('timer-shell');
  const timerLabel = document.getElementById('timer-label');
  const timerBadge = document.getElementById('timer-badge');
  const timerTime = document.getElementById('timer-time');
  const timerProgressTrack = document.getElementById('timer-progress-track');
  const timerProgress = document.getElementById('timer-progress');
  const timerReason = document.getElementById('timer-reason');
  const timerPlatforms = document.getElementById('timer-platforms');
  const status = document.getElementById('status');
  let cardTimer;
  let mediaTimer;
  let mediaFadeTimer;
  let pendingMediaDurationMs;
  let heartbeatTimer;
  let activePlaybackId = '';
  let sendTransport = () => undefined;
  const mediaFadeMs = 4_000;

  function safeUrl(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return undefined;
    try {
      const url = new URL(value, location.origin);
      return url.protocol === 'https:' || url.origin === location.origin ? url.href : undefined;
    } catch { return undefined; }
  }

  function boundedDuration(value, fallback) {
    return Number.isInteger(value) && value >= 1_000 && value <= 3_600_000 ? value : fallback;
  }

  function hideCard() {
    clearTimeout(cardTimer);
    card.classList.add('hidden');
    cardImage.classList.add('hidden');
    cardImage.removeAttribute('src');
    cardTitle.textContent = '';
    cardText.textContent = '';
  }

  function hideTimer() {
    timerShell.classList.add('hidden');
    timerShell.removeAttribute('style');
    timerShell.dataset.state = 'idle';
  }

  function boundedText(value, maximum, fallback = '') {
    return typeof value === 'string' ? [...value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim()].slice(0, maximum).join('') : fallback;
  }

  function safeColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
  }

  function colorWithOpacity(value, opacity, fallback, fallbackOpacity) {
    const color = safeColor(value, fallback);
    const alpha = typeof opacity === 'number' && Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : fallbackOpacity;
    return `rgb(${parseInt(color.slice(1, 3), 16)} ${parseInt(color.slice(3, 5), 16)} ${parseInt(color.slice(5, 7), 16)} / ${alpha})`;
  }

  function showTimer(payload) {
    hideCard();
    clearMedia(activePlaybackId ? 'stopped' : undefined);
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const remaining = Number.isInteger(payload.remainingSeconds) && payload.remainingSeconds >= 0 ? payload.remainingSeconds : 0;
    const maximum = Number.isInteger(payload.maximumSeconds) && payload.maximumSeconds > 0 ? payload.maximumSeconds : 1;
    const computedTime = `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    const livePlatforms = Array.isArray(payload.livePlatforms) ? payload.livePlatforms.filter((value) => typeof value === 'string').slice(0, 4) : [];
    timerLabel.textContent = boundedText(payload.label, 80, 'TIMER') || 'TIMER';
    timerTime.textContent = /^\d{2,4}:\d{2}:\d{2}$/u.test(payload.remainingText) ? payload.remainingText : computedTime;
    timerBadge.textContent = payload.running === true ? 'RUNNING' : payload.live === true ? 'PAUSED' : 'OFFLINE';
    timerReason.textContent = boundedText(payload.lastReason, 120, 'Waiting for an update').replace(/-/gu, ' ');
    timerPlatforms.textContent = livePlatforms.length > 0 ? livePlatforms.join(' + ') : 'No live platforms';
    timerProgress.style.width = `${Math.max(0, Math.min(100, remaining / maximum * 100)).toFixed(2)}%`;
    timerProgressTrack.classList.toggle('hidden', style.showProgressBar === false);
    const backgroundMode = ['glass', 'solid', 'none'].includes(style.backgroundMode) ? style.backgroundMode : 'glass';
    const fontFamily = ['display', 'broadcast', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'display';
    timerShell.dataset.state = payload.critical === true ? 'critical' : payload.warning === true ? 'warning' : payload.running === true ? 'running' : 'paused';
    timerShell.dataset.background = backgroundMode;
    timerShell.dataset.font = fontFamily;
    timerShell.style.setProperty('--timer-background', safeColor(style.backgroundColor, '#0b1017'));
    timerShell.style.setProperty('--timer-background-rendered', colorWithOpacity(style.backgroundColor, style.backgroundOpacity, '#0b1017', 0.88));
    timerShell.style.setProperty('--timer-accent', safeColor(style.accentColor, '#7ee0ff'));
    timerShell.style.setProperty('--timer-text', safeColor(style.textColor, '#eff7ff'));
    timerShell.style.setProperty('--timer-muted', safeColor(style.mutedColor, '#dfefff'));
    timerShell.style.setProperty('--timer-warning', safeColor(style.warningColor, '#f0c15a'));
    timerShell.style.setProperty('--timer-critical', safeColor(style.criticalColor, '#ff6b7d'));
    timerShell.style.setProperty('--timer-live', safeColor(style.liveColor, '#61f2a4'));
    timerShell.style.setProperty('--timer-border', safeColor(style.borderColor, '#85cbff'));
    timerShell.classList.remove('hidden');
  }

  function showCard(payload) {
    hideCard();
    hideTimer();
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 200) : '';
    const text = typeof payload.text === 'string' ? payload.text.slice(0, 1_000) : '';
    const imageUrl = safeUrl(payload.imageUrl);
    if (imageUrl) { cardImage.src = imageUrl; cardImage.classList.remove('hidden'); }
    cardTitle.textContent = title;
    cardText.textContent = text;
    card.classList.remove('hidden');
    cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 8_000));
  }

  function reportLifecycle(phase, error) {
    if (!activePlaybackId) return;
    sendTransport({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId, playbackId: activePlaybackId, phase, currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0, duration: Number.isFinite(media.duration) ? media.duration : 0, ...(error ? { error: String(error).slice(0, 300) } : {}) });
  }

  function clearMedia(phase) {
    clearTimeout(mediaTimer);
    clearTimeout(mediaFadeTimer);
    pendingMediaDurationMs = undefined;
    clearInterval(heartbeatTimer);
    if (phase) reportLifecycle(phase);
    media.pause();
    media.removeAttribute('src');
    media.load();
    mediaTitle.textContent = '';
    mediaTitle.classList.add('hidden');
    mediaShell.classList.remove('fading');
    mediaShell.classList.add('hidden');
    activePlaybackId = '';
  }

  function stopMedia() { clearMedia('stopped'); }

  function playMedia(payload) {
    const url = safeUrl(payload.url);
    const playbackId = typeof payload.playbackId === 'string' && /^[A-Za-z0-9._:-]{1,100}$/u.test(payload.playbackId) ? payload.playbackId : '';
    if (!url || !playbackId) return;
    clearMedia(activePlaybackId ? 'stopped' : undefined);
    hideCard();
    hideTimer();
    activePlaybackId = playbackId;
    media.src = url;
    media.muted = payload.muted !== false;
    media.volume = typeof payload.volume === 'number' && Number.isFinite(payload.volume) ? Math.max(0, Math.min(1, payload.volume)) : 1;
    const posterUrl = safeUrl(payload.posterUrl);
    if (posterUrl) media.poster = posterUrl; else media.removeAttribute('poster');
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 300) : '';
    mediaTitle.textContent = title;
    mediaTitle.classList.toggle('hidden', title.length === 0);
    mediaShell.classList.remove('fading');
    mediaShell.classList.remove('hidden');
    reportLifecycle('loading');
    void media.play().catch((error) => { status.textContent = 'PLAYBACK BLOCKED'; status.dataset.state = 'error'; reportLifecycle('failed', error?.message || 'Playback blocked'); clearMedia(); });
    pendingMediaDurationMs = payload.durationMs;
  }

  media.addEventListener('playing', () => {
    // A previous unmuted autoplay attempt may have left a visible failure badge. Once the
    // browser actually starts this playback, restore the normal transient LIVE state so the
    // stale warning does not cover a clip that is already running.
    transportState('live');
    reportLifecycle('started');
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => reportLifecycle('heartbeat'), 10_000);
    clearTimeout(mediaTimer);
    // Loading time must not consume the clip's playback budget. A small grace period covers
    // metadata differences while the native ended event remains the normal completion path.
    const durationWithGrace = Number.isInteger(pendingMediaDurationMs) ? pendingMediaDurationMs + 10_000 : undefined;
    mediaTimer = setTimeout(() => clearMedia('timeout'), boundedDuration(durationWithGrace, 70_000));
  });
  media.addEventListener('ended', () => {
    // Keep the final frame mounted while the whole card fades away. Report the clean ending at
    // once so the add-on can begin its creator pause plus matching four-second transition buffer.
    clearTimeout(mediaTimer);
    clearInterval(heartbeatTimer);
    reportLifecycle('ended');
    mediaShell.classList.add('fading');
    mediaFadeTimer = setTimeout(() => clearMedia(), mediaFadeMs);
  });
  media.addEventListener('error', () => { reportLifecycle('failed', media.error?.message || `Media error ${media.error?.code || 0}`); clearMedia(); });

  function receive(event) {
    if (event?.contractVersion !== 'thsv-addon-overlay-v1' || event.kind !== 'addon.publish' || event.moduleId !== moduleId || typeof event.topic !== 'string' || !event.payload || typeof event.payload !== 'object') return;
    if (event.topic === `${moduleId}.card.show`) showCard(event.payload);
    else if (event.topic === `${moduleId}.card.hide`) hideCard();
    else if (event.topic === `${moduleId}.media.play`) playMedia(event.payload);
    else if (event.topic === `${moduleId}.media.stop`) stopMedia();
    else if (event.topic === `${moduleId}.timer.update`) showTimer(event.payload);
    else if (event.topic === `${moduleId}.timer.hide`) hideTimer();
  }

  function transportState(state) {
    status.textContent = state === 'live' ? 'LIVE' : 'OFFLINE';
    status.dataset.state = state;
  }

  function connectDirectly() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/overlay/events`);
    sendTransport = (payload) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); };
    socket.addEventListener('open', () => transportState('live'));
    socket.addEventListener('message', (message) => { try { receive(JSON.parse(message.data)); } catch { /* Ignore malformed transport data. */ } });
    socket.addEventListener('close', () => { transportState('reconnecting'); setTimeout(connectDirectly, 1_500); });
  }

  if ('SharedWorker' in window) {
    try {
      const worker = new SharedWorker('/overlay/worker-1.3.1.js', 'thsv-browser-overlay-1.3.1');
      sendTransport = (payload) => worker.port.postMessage({ kind: 'transport.send', payload });
      worker.port.addEventListener('message', (message) => message.data?.kind === 'transport.status' ? transportState(message.data.state) : receive(message.data));
      worker.port.start();
      addEventListener('pagehide', () => worker.port.postMessage({ kind: 'disconnect' }), { once: true });
      return;
    } catch { /* Browser sources without SharedWorker use one direct connection. */ }
  }
  connectDirectly();
})();
