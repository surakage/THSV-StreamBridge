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
  const status = document.getElementById('status');
  let cardTimer;
  let mediaTimer;

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

  function showCard(payload) {
    hideCard();
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 200) : '';
    const text = typeof payload.text === 'string' ? payload.text.slice(0, 1_000) : '';
    const imageUrl = safeUrl(payload.imageUrl);
    if (imageUrl) { cardImage.src = imageUrl; cardImage.classList.remove('hidden'); }
    cardTitle.textContent = title;
    cardText.textContent = text;
    card.classList.remove('hidden');
    cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 8_000));
  }

  function stopMedia() {
    clearTimeout(mediaTimer);
    media.pause();
    media.removeAttribute('src');
    media.load();
    mediaTitle.textContent = '';
    mediaTitle.classList.add('hidden');
    mediaShell.classList.add('hidden');
  }

  function playMedia(payload) {
    const url = safeUrl(payload.url);
    if (!url) return;
    stopMedia();
    hideCard();
    media.src = url;
    media.muted = payload.muted !== false;
    media.volume = typeof payload.volume === 'number' && Number.isFinite(payload.volume) ? Math.max(0, Math.min(1, payload.volume)) : 1;
    const posterUrl = safeUrl(payload.posterUrl);
    if (posterUrl) media.poster = posterUrl; else media.removeAttribute('poster');
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 300) : '';
    mediaTitle.textContent = title;
    mediaTitle.classList.toggle('hidden', title.length === 0);
    mediaShell.classList.remove('hidden');
    void media.play().catch(() => { status.textContent = 'PLAYBACK BLOCKED'; status.dataset.state = 'error'; });
    if (payload.durationMs !== undefined) mediaTimer = setTimeout(stopMedia, boundedDuration(payload.durationMs, 60_000));
  }

  function receive(event) {
    if (event?.contractVersion !== 'thsv-addon-overlay-v1' || event.kind !== 'addon.publish' || event.moduleId !== moduleId || typeof event.topic !== 'string' || !event.payload || typeof event.payload !== 'object') return;
    if (event.topic === `${moduleId}.card.show`) showCard(event.payload);
    else if (event.topic === `${moduleId}.card.hide`) hideCard();
    else if (event.topic === `${moduleId}.media.play`) playMedia(event.payload);
    else if (event.topic === `${moduleId}.media.stop`) stopMedia();
  }

  function transportState(state) {
    status.textContent = state === 'live' ? 'LIVE' : 'RECONNECTING';
    status.dataset.state = state;
    document.body.dataset.clean = state === 'live' ? 'true' : 'false';
  }

  function connectDirectly() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/overlay/events`);
    socket.addEventListener('open', () => transportState('live'));
    socket.addEventListener('message', (message) => { try { receive(JSON.parse(message.data)); } catch { /* Ignore malformed transport data. */ } });
    socket.addEventListener('close', () => { transportState('reconnecting'); setTimeout(connectDirectly, 1_500); });
  }

  if ('SharedWorker' in window) {
    try {
      const worker = new SharedWorker('/overlay/worker-1.3.0.js', 'thsv-browser-overlay-1.3.0');
      worker.port.addEventListener('message', (message) => message.data?.kind === 'transport.status' ? transportState(message.data.state) : receive(message.data));
      worker.port.start();
      addEventListener('pagehide', () => worker.port.postMessage({ kind: 'disconnect' }), { once: true });
      return;
    } catch { /* Browser sources without SharedWorker use one direct connection. */ }
  }
  connectDirectly();
})();
