(() => {
  'use strict';
  const chat = document.getElementById('chat');
  const alerts = document.getElementById('alerts');
  const status = document.getElementById('status');
  const alertQueue = [];
  const priorityRank = { low: 1, normal: 2, high: 3 };
  let activeAlert;
  let alertTimer;
  let reconnectTimer;
  let clientConfig = { maxChatMessages: 40, alertDurationMs: 7000 };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/overlay/events`);
    socket.addEventListener('open', () => { status.textContent = 'LIVE'; status.dataset.state = 'live'; });
    socket.addEventListener('message', (message) => {
      let event;
      try { event = JSON.parse(message.data); } catch { return; }
      if (event.kind === 'chat.add') addChat(event.payload);
      else if (event.kind === 'chat.remove') removeChat(event.payload.targetEventId);
      else if (event.kind === 'alert.show') enqueueAlert(event.payload);
    });
    socket.addEventListener('close', () => {
      status.textContent = 'RECONNECTING'; status.dataset.state = 'offline';
      clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 1500);
    });
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

  function safeClass(value) { return String(value).toLowerCase().replace(/[^a-z0-9-]/g, ''); }
  fetch('/overlay/config').then((response) => response.ok ? response.json() : undefined).then((config) => { if (config) clientConfig = config; }).catch(() => undefined).finally(connect);
})();
