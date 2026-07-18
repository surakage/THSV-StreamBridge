import { AlertPresentationController } from '/overlay/alert-queue-1.2.0.js';

// Compatible with standard Chromium/CEF browser sources.
(() => {
  'use strict';
  const chat = document.getElementById('chat');
  const alerts = document.getElementById('alerts');
  const status = document.getElementById('status');
  const brandLabel = document.getElementById('brand-label');
  const mode = location.pathname.endsWith('/chat') ? 'chat' : location.pathname.endsWith('/alerts') ? 'alerts' : 'combined';
  const requestedLayout = new URLSearchParams(location.search).get('layout');
  document.body.dataset.mode = mode;
  document.body.dataset.layout = requestedLayout === 'compact' ? 'compact' : 'canvas';

  const chatFadeMs = 240;
  let clientConfig = { brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7000 };
  brandLabel.textContent = clientConfig.brandLabel;
  const alertController = new AlertPresentationController({
    capacity: clientConfig.maxAlertQueue,
    defaultDurationMs: clientConfig.alertDurationMs,
    render: (alert) => alerts.replaceChildren(buildAlertCard(alert)),
    clear: () => alerts.replaceChildren(),
    playSound: playAlertSound,
    onError: (error) => console.warn('Skipped an alert that could not be rendered.', error),
  });

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function receive(event) {
    if (event.kind === 'chat.add' && (mode === 'chat' || mode === 'combined')) addChat(event.payload);
    else if (event.kind === 'chat.remove' && (mode === 'chat' || mode === 'combined')) removeChat(event.payload.targetEventId);
    else if (event.kind === 'alert.show' && (mode === 'alerts' || mode === 'combined')) enqueueAlert(event.payload);
  }

  function transportStatus(state) {
    status.textContent = state === 'live' ? 'LIVE' : 'RECONNECTING';
    status.dataset.state = state;
  }

  function connectDirectly() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/overlay/events`);
    let reconnectTimer;
    socket.addEventListener('open', () => transportStatus('live'));
    socket.addEventListener('message', (message) => {
      try { receive(JSON.parse(message.data)); } catch { /* Ignore malformed transport data. */ }
    });
    socket.addEventListener('close', () => {
      transportStatus('reconnecting');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectDirectly, 1500);
    });
  }

  function connect() {
    if ('SharedWorker' in window) {
      try {
        const worker = new SharedWorker('/overlay/worker-1.2.0.js', 'thsv-browser-overlay-1.2.0');
        worker.port.addEventListener('message', (message) => {
          if (message.data && message.data.kind === 'transport.status') transportStatus(message.data.state);
          else receive(message.data);
        });
        worker.port.start();
        addEventListener('pagehide', () => worker.port.postMessage({ kind: 'disconnect' }), { once: true });
        return;
      } catch { /* Isolated browser sources fall back to a direct connection. */ }
    }
    connectDirectly();
  }

  function addChat(message) {
    const item = element('li', `message platform-${safeClass(message.platform)}`);
    item.dataset.eventId = message.eventId;
    const identity = element('div', 'identity');
    if (message.presentation.avatarUrl) {
      const avatar = element('img', 'avatar');
      avatar.src = message.presentation.avatarUrl;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
      avatar.addEventListener('error', () => avatar.remove(), { once: true });
      identity.append(avatar);
    }
    identity.append(element('span', 'platform', message.platform.toUpperCase()));
    const displayName = element('strong', 'display-name', message.user.displayName);
    if (message.presentation.nameColor) displayName.style.color = message.presentation.nameColor;
    identity.append(displayName);
    if (message.user.isBroadcaster) identity.append(element('span', 'role', 'HOST'));
    else if (message.user.isModerator) identity.append(element('span', 'role', 'MOD'));
    else if (message.user.isSubscriber) identity.append(element('span', 'role', 'MEMBER'));
    if (message.user.isBot) identity.append(element('span', 'role bot', 'BOT'));
    for (const badge of message.presentation.badges) identity.append(element('span', 'role badge', badge.label));
    item.append(identity, element('p', 'body', message.message));
    chat.append(item);
    trimChat();
  }

  function trimChat() {
    const visible = [...chat.children].filter((item) => !item.classList.contains('message-expiring'));
    while (visible.length > clientConfig.maxChatMessages) {
      const oldest = visible.shift();
      if (!oldest) return;
      oldest.classList.add('message-expiring');
      setTimeout(() => oldest.remove(), chatFadeMs);
    }
  }

  function removeChat(eventId) {
    for (const item of chat.children) if (item.dataset.eventId === eventId) { item.remove(); break; }
  }

  function enqueueAlert(alert) {
    alertController.enqueue(alert);
  }

  function buildAlertCard(alert) {
    const card = element('article', `alert priority-${alert.priority}`);
    card.append(element('span', 'alert-platform', alert.platform.toUpperCase()));
    card.append(element('h2', '', alert.display ? alert.display.title : alertTitle(alert)));
    const detail = alert.display ? alert.display.detail : alertDetail(alert);
    if (detail) card.append(element('p', '', detail));
    if (alert.aggregateCount > 1) card.append(element('span', 'aggregated', `${alert.aggregateCount} EVENTS COMBINED${alert.quantity ? ` · ${alert.quantity} TOTAL` : ''}`));
    if (alert.simulated) card.append(element('span', 'simulated', 'TEST EVENT'));
    return card;
  }

  function alertTitle(alert) {
    const actor = alert.actor ? alert.actor.displayName : 'The community';
    return `${actor} · ${alert.alertType.replaceAll('-', ' ')}`;
  }

  function alertDetail(alert) {
    if (alert.subscription) {
      const parts = [alert.subscription.kind, alert.subscription.months ? `${alert.subscription.months} months` : '', alert.subscription.streakMonths ? `${alert.subscription.streakMonths} month streak` : '', alert.subscription.gifterName ? `gifted by ${alert.subscription.gifterName}` : ''].filter(Boolean);
      if (parts.length) return parts.join(' · ');
    }
    if (alert.amount && alert.currency) return `${alert.amount} ${alert.currency}${alert.message ? ` · ${alert.message}` : ''}`;
    if (alert.quantity) return `${alert.quantity}${alert.itemName ? ` × ${alert.itemName}` : ''}`;
    return alert.message || alert.tier || (alert.value !== undefined ? `${alert.metric}: ${alert.value}` : '');
  }

  function playAlertSound(alert) {
    if (!alert.display || alert.display.sound.mode !== 'chime' || alert.display.sound.volume <= 0) return;
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      const context = new AudioContextType();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(Math.min(1, Math.max(0, alert.display.sound.volume)), context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.35);
      oscillator.addEventListener('ended', () => context.close(), { once: true });
    } catch { /* Browser-source audio policy may block a preview; visuals continue. */ }
  }

  function safeClass(value) { return String(value).toLowerCase().replace(/[^a-z0-9-]/g, ''); }

  fetch('/overlay/config').then((response) => response.ok ? response.json() : undefined).then((config) => {
    if (config) { clientConfig = config; alertController.configure(config.maxAlertQueue, config.alertDurationMs); }
    brandLabel.textContent = clientConfig.brandLabel;
    brandLabel.hidden = clientConfig.brandLabel.length === 0;
  }).catch(() => undefined).finally(connect);
})();
