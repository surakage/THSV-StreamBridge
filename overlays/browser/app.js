// Compatible with standard Chromium/CEF browser sources.
(() => {
  'use strict';
  const chat = document.getElementById('chat');
  const alerts = document.getElementById('alerts');
  const status = document.getElementById('status');
  const brandLabel = document.getElementById('brand-label');
  const companion = document.getElementById('companion');
  const companionBloom = document.getElementById('companion-bloom');
  const companionNotice = document.getElementById('companion-notice');
  const mode = location.pathname.endsWith('/chat') ? 'chat' : location.pathname.endsWith('/alerts') ? 'alerts' : location.pathname.endsWith('/companion') ? 'companion' : 'combined';
  const search = new URLSearchParams(location.search);
  const requestedLayout = search.get('layout');
  const layout = requestedLayout === 'compact' ? 'compact' : 'canvas';
  document.body.dataset.mode = mode;
  document.body.dataset.layout = layout;
  const alertQueue = [];
  const priorityRank = { low: 1, normal: 2, high: 3 };
  let activeAlert;
  let alertTimer;
  const chatFadeMs = 240;
  const companionQueue = [];
  const companionDurations = { wave: 2300, eat: 3400, sleep: 5200, wake: 5200, celebrate: 2800 };
  const companionFramePositions = Array.from({ length: 8 }, (_, index) => {
    const x = ['0%', '33.3333%', '66.6667%', '100%'][index % 4];
    const y = index < 4 ? '0%' : '100%';
    return [x, y];
  });
  const companionFrames = {
    idle: [0, 1, 2, 3, 4, 5, 6, 7],
    wave: [0, 1, 2, 3, 4, 5, 6, 7],
    eat: [0, 1, 2, 3, 4, 5, 6, 7],
    sleep: [0, 1, 2, 3, 4, 5, 6, 7],
    wake: [7, 6, 5, 4, 3, 2, 1, 0],
    celebrate: [0, 1, 2, 3, 4, 5, 6, 7],
  };
  const companionFrameIntervals = { wave: 260, eat: 400, sleep: 650, wake: 650, celebrate: 300 };
  let activeCompanion;
  let companionTimer;
  let companionFrameTimer;
  let companionBlinkTimer;
  let companionSleeping = false;
  let clientConfig = { brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, maxCompanionQueue: 20, alertDurationMs: 7000, companionSleeping: false };
  brandLabel.textContent = clientConfig.brandLabel;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function receive(event) {
    if (event.kind === 'chat.add' && (mode === 'chat' || mode === 'combined')) addChat(event.payload);
    else if (event.kind === 'chat.remove' && (mode === 'chat' || mode === 'combined')) removeChat(event.payload.targetEventId);
    else if (event.kind === 'alert.show' && (mode === 'alerts' || mode === 'combined')) enqueueAlert(event.payload);
    else if (event.kind === 'companion.action' && (mode === 'companion' || mode === 'combined')) enqueueCompanion(event.payload);
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
        const worker = new SharedWorker('/overlay/worker-1.1.0.js', 'thsv-browser-overlay-1.1.0');
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
      const avatar = element('img', 'avatar'); avatar.src = message.presentation.avatarUrl; avatar.alt = ''; avatar.referrerPolicy = 'no-referrer';
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
    const visibleMessages = [...chat.children].filter((item) => !item.classList.contains('message-expiring'));
    while (visibleMessages.length > clientConfig.maxChatMessages) {
      const oldest = visibleMessages.shift();
      if (!oldest) return;
      oldest.classList.add('message-expiring');
      setTimeout(() => oldest.remove(), chatFadeMs);
    }
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
    while (alertQueue.length > clientConfig.maxAlertQueue) {
      const lowestRank = Math.min(...alertQueue.map((queued) => priorityRank[queued.priority]));
      const oldestLowestPriority = alertQueue.findIndex((queued) => priorityRank[queued.priority] === lowestRank);
      alertQueue.splice(oldestLowestPriority, 1);
    }
    showNextAlert();
  }

  function showNextAlert() {
    if (activeAlert || alertQueue.length === 0) return;
    while (!activeAlert && alertQueue.length > 0) {
      const nextAlert = alertQueue.shift();
      try {
        const card = buildAlertCard(nextAlert);
        alerts.replaceChildren(card);
        const timer = setTimeout(finishAlert, clientConfig.alertDurationMs);
        activeAlert = nextAlert;
        alertTimer = timer;
      } catch (error) {
        alerts.replaceChildren();
        console.warn('Skipped an alert that could not be rendered.', error);
      }
    }
  }

  function buildAlertCard(alert) {
    const card = element('article', `alert priority-${alert.priority}`);
    card.append(element('span', 'alert-platform', alert.platform.toUpperCase()));
    card.append(element('h2', '', alertTitle(alert)));
    const detail = alertDetail(alert);
    if (detail) card.append(element('p', '', detail));
    if (alert.simulated) card.append(element('span', 'simulated', 'TEST EVENT'));
    return card;
  }

  function finishAlert() {
    alerts.replaceChildren();
    activeAlert = undefined;
    alertTimer = undefined;
    showNextAlert();
  }

  function enqueueCompanion(action) {
    companionQueue.push(action);
    while (companionQueue.length > clientConfig.maxCompanionQueue) companionQueue.shift();
    if (action.action === 'wake' && companionSleeping) return beginCompanionWake();
    showNextCompanion();
  }

  function showNextCompanion() {
    if (activeCompanion || companionQueue.length === 0) return;
    clearTimeout(companionBlinkTimer);
    clearInterval(companionFrameTimer);
    activeCompanion = companionQueue.shift();
    const action = activeCompanion.action;
    setCompanionStats(activeCompanion);
    companionNotice.hidden = false;
    companionNotice.textContent = `${activeCompanion.actorName} · ${companionActionLabel(action)}${activeCompanion.cost > 0 ? ` · ${activeCompanion.cost} sprouts` : ''}`;
    companion.classList.add(`companion-${action}`);
    animateCompanionAction(action);
    companionTimer = setTimeout(action === 'sleep' ? holdCompanionSleep : finishCompanion, companionDurations[action]);
  }

  function holdCompanionSleep() {
    clearTimeout(companionTimer);
    clearInterval(companionFrameTimer);
    setCompanionFrame(7);
    companionNotice.hidden = true;
    companionSleeping = true;
    companionTimer = undefined;
    if (companionQueue.some((queued) => queued.action === 'wake')) beginCompanionWake();
  }

  function beginCompanionWake() {
    if (activeCompanion?.action === 'sleep') companion.classList.remove('companion-sleep');
    activeCompanion = undefined;
    companionSleeping = false;
    const wakeIndex = companionQueue.findIndex((queued) => queued.action === 'wake');
    if (wakeIndex > 0) companionQueue.unshift(...companionQueue.splice(wakeIndex, 1));
    showNextCompanion();
  }

  function finishCompanion() {
    clearTimeout(companionTimer);
    clearInterval(companionFrameTimer);
    if (activeCompanion) companion.classList.remove(`companion-${activeCompanion.action}`);
    setCompanionFrame(0);
    companionNotice.hidden = true;
    activeCompanion = undefined;
    companionTimer = undefined;
    scheduleCompanionBlink();
    showNextCompanion();
  }

  function animateCompanionAction(action) {
    const frames = companionFrames[action];
    let step = 0;
    setCompanionFrame(frames[step]);
    companionFrameTimer = setInterval(() => {
      step += 1;
      if (step < frames.length) setCompanionFrame(frames[step]);
      else clearInterval(companionFrameTimer);
    }, companionFrameIntervals[action]);
  }

  function scheduleCompanionBlink() {
    clearTimeout(companionBlinkTimer);
    companionBlinkTimer = setTimeout(() => {
      if (activeCompanion) return scheduleCompanionBlink();
      const frames = companionFrames.idle;
      let step = 0;
      setCompanionFrame(frames[step]);
      companionFrameTimer = setInterval(() => {
        step += 1;
        if (step < frames.length) setCompanionFrame(frames[step]);
        else { clearInterval(companionFrameTimer); scheduleCompanionBlink(); }
      }, 75);
    }, 3200 + Math.floor(Math.random() * 4600));
  }

  function setCompanionFrame(index) {
    const position = companionFramePositions[index];
    companionBloom.style.backgroundPosition = `${position[0]} ${position[1]}`;
  }

  function setCompanionStats(state) {
    document.getElementById('companion-happiness').textContent = state.happiness;
    document.getElementById('companion-fullness').textContent = state.fullness;
    document.getElementById('companion-energy').textContent = state.energy;
  }

  function restoreCompanionState() {
    if (!clientConfig.companionSleeping) return;
    clearTimeout(companionBlinkTimer);
    companionSleeping = true;
    activeCompanion = { action: 'sleep' };
    companion.classList.add('companion-sleep');
    setCompanionFrame(7);
  }

  function companionActionLabel(action) {
    return { wave: 'waved to Bloom', eat: 'fed Bloom a berry', sleep: 'helped Bloom rest', wake: 'woke Bloom up', celebrate: 'celebrated with Bloom' }[action] || action;
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
  fetch('/overlay/config').then((response) => response.ok ? response.json() : undefined).then((config) => {
    if (config) clientConfig = config;
    brandLabel.textContent = clientConfig.brandLabel;
    brandLabel.hidden = clientConfig.brandLabel.length === 0;
    restoreCompanionState();
  }).catch(() => undefined).finally(connect);
  setCompanionFrame(0);
  scheduleCompanionBlink();
})();
