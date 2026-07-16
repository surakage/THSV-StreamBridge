// Compatible with standard Chromium/CEF browser sources.
(() => {
  'use strict';
  const chat = document.getElementById('chat');
  const alerts = document.getElementById('alerts');
  const status = document.getElementById('status');
  const mode = location.pathname.endsWith('/chat') ? 'chat' : location.pathname.endsWith('/alerts') ? 'alerts' : 'combined';
  const search = new URLSearchParams(location.search);
  const requestedLayout = search.get('layout');
  const layout = requestedLayout === 'compact' ? 'compact' : 'canvas';
  document.body.dataset.mode = mode;
  document.body.dataset.layout = layout;
  const alertQueue = [];
  const priorityRank = { low: 1, normal: 2, high: 3 };
  let activeAlert;
  let alertTimer;
  let clientConfig = { maxChatMessages: 40, alertDurationMs: 7000 };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function receive(event) {
    if (event.kind === 'chat.add' && mode !== 'alerts') addChat(event.payload);
    else if (event.kind === 'chat.remove' && mode !== 'alerts') removeChat(event.payload.targetEventId);
    else if (event.kind === 'alert.show' && mode !== 'chat') enqueueAlert(event.payload);
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
      let event;
      try { event = JSON.parse(message.data); } catch { return; }
      receive(event);
    });
    socket.addEventListener('close', () => {
      transportStatus('reconnecting');
      clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connectDirectly, 1500);
    });
  }

  function connect() {
    if ('SharedWorker' in window) {
      try {
        const worker = new SharedWorker('/overlay/worker.js', 'thsv-browser-overlay');
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
      const avatar = element('img', 'avatar'); avatar.src = message.presentation.avatarUrl; avatar.alt = ''; avatar.referrerPolicy = 'no-referrer'; identity.append(avatar);
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
    while (chat.children.length > clientConfig.maxChatMessages) chat.firstElementChild.remove();
  }

  function removeChat(eventId) {
    for (const item of chat.children) if (item.dataset.eventId === eventId) { item.remove(); break; }
  }

  function enqueueAlert(alert) {
    if (activeAlert && priorityRank[alert.priority] > priorityRank[activeAlert.priority]) {
      clearTimeout(alertTimer); alerts.replaceChildren(); activeAlert = undefined;
    }
    alertQueue.push(alert);
    alertQueue.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.sequence - b.sequence);
    showNextAlert();
  }

  function showNextAlert() {
    if (activeAlert || alertQueue.length === 0) return;
    activeAlert = alertQueue.shift();
    const card = element('article', `alert priority-${activeAlert.priority}`);
    card.append(element('span', 'alert-platform', activeAlert.platform.toUpperCase()));
    card.append(element('h2', '', alertTitle(activeAlert)));
    const detail = alertDetail(activeAlert);
    if (detail) card.append(element('p', '', detail));
    if (activeAlert.simulated) card.append(element('span', 'simulated', 'TEST EVENT'));
    alerts.replaceChildren(card);
    alertTimer = setTimeout(() => { alerts.replaceChildren(); activeAlert = undefined; showNextAlert(); }, clientConfig.alertDurationMs);
  }

  function alertTitle(alert) {
    const actor = alert.actor ? alert.actor.displayName : 'The community';
    return `${actor} \u00b7 ${alert.alertType.replaceAll('-', ' ')}`;
  }

  function alertDetail(alert) {
    if (alert.subscription) {
      const parts = [alert.subscription.kind, alert.subscription.months ? `${alert.subscription.months} months` : '', alert.subscription.streakMonths ? `${alert.subscription.streakMonths} month streak` : '', alert.subscription.gifterName ? `gifted by ${alert.subscription.gifterName}` : ''].filter(Boolean);
      if (parts.length) return parts.join(' \u00b7 ');
    }
    if (alert.amount && alert.currency) return `${alert.amount} ${alert.currency}${alert.message ? ` \u00b7 ${alert.message}` : ''}`;
    if (alert.quantity) return `${alert.quantity}${alert.itemName ? ` \u00d7 ${alert.itemName}` : ''}`;
    return alert.message || alert.tier || (alert.value !== undefined ? `${alert.metric}: ${alert.value}` : '');
  }

  function safeClass(value) { return String(value).toLowerCase().replace(/[^a-z0-9-]/g, ''); }
  fetch('/overlay/config').then((response) => response.ok ? response.json() : undefined).then((config) => { if (config) clientConfig = config; }).catch(() => undefined).finally(connect);
})();
