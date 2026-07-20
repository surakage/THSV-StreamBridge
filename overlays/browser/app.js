import { AlertPresentationController } from '/overlay/alert-queue-1.2.2.js';

// Compatible with standard Chromium/CEF browser sources.
(() => {
  'use strict';
  const chat = document.getElementById('chat');
  const alerts = document.getElementById('alerts');
  const status = document.getElementById('status');
  const brandLabel = document.getElementById('brand-label');
  const dockMode = location.pathname.endsWith('/dock');
  const mode = location.pathname.startsWith('/overlay/chat') ? 'chat' : location.pathname.endsWith('/alerts') ? 'alerts' : 'combined';
  const requestedLayout = new URLSearchParams(location.search).get('layout');
  document.body.dataset.mode = mode;
  document.body.dataset.dock = dockMode ? 'true' : 'false';

  const chatFadeMs = 240;
  let clientConfig = {
    brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7000,
    chat: { layout: 'regular', fontFamily: 'system', fontSizePx: 18, textColor: '#ffffff', backgroundMode: 'transparent', backgroundColor: '#171120', backgroundOpacity: 0.9, messageBackgroundColor: '#171120', messageBackgroundOpacity: 0.96, messageColorMode: 'platform', platformMessageColors: { twitch: '#4b267b', youtube: '#7d1717', kick: '#245c18', tiktok: '#172b31' }, showPlatformLabels: true, showProfilePictures: true, showBadges: true, ignoredNames: [], events: { enabled: true, platforms: { twitch: true, youtube: true, kick: true, tiktok: true }, characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150 } } },
  };
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
    else if (event.kind === 'chat.event' && (mode === 'chat' || mode === 'combined')) addEventMessage(event.payload);
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
        const worker = new SharedWorker('/overlay/worker-1.3.1.js', 'thsv-browser-overlay-1.3.1');
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
    item.style.setProperty('--message-platform-bg', messageBackground(message.platform));
    item.dataset.eventId = message.eventId;
    const identity = element('div', 'identity');
    if (clientConfig.chat.showProfilePictures) identity.append(buildAvatar(message.user, message.presentation, message.platform, 'chat-avatar'));
    if (clientConfig.chat.showPlatformLabels) identity.append(element('span', 'platform', message.platform.toUpperCase()));
    const displayName = element('strong', 'display-name', message.user.displayName);
    if (message.presentation.nameColor) displayName.style.color = message.presentation.nameColor;
    identity.append(displayName);
    if (clientConfig.chat.showBadges && message.user.isBroadcaster) identity.append(element('span', 'role', 'HOST'));
    else if (clientConfig.chat.showBadges && message.user.isModerator) identity.append(element('span', 'role', 'MOD'));
    else if (clientConfig.chat.showBadges && message.user.isSubscriber) identity.append(element('span', 'role', 'MEMBER'));
    if (clientConfig.chat.showBadges && message.user.isBot) identity.append(element('span', 'role bot', 'BOT'));
    for (const badge of clientConfig.chat.showBadges ? message.presentation.badges : []) {
      const badgeElement = element('span', 'role badge');
      if (badge.iconUrl) {
        const icon = element('img', 'badge-icon');
        icon.src = badge.iconUrl;
        icon.alt = '';
        icon.referrerPolicy = 'no-referrer';
        icon.addEventListener('error', () => icon.remove(), { once: true });
        badgeElement.append(icon);
      }
      badgeElement.append(document.createTextNode(badge.label));
      identity.append(badgeElement);
    }
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

  function addEventMessage(activity) {
    const item = element('li', `message event-message category-${safeClass(activity.category)} platform-${safeClass(activity.platform)}`);
    item.style.setProperty('--message-platform-bg', messageBackground(activity.platform));
    item.dataset.eventId = activity.eventId;
    const identity = element('div', 'identity');
    if (clientConfig.chat.showProfilePictures && activity.actor) identity.append(buildAvatar(activity.actor, activity.presentation || {}, activity.platform, 'chat-avatar'));
    else identity.append(element('span', 'activity-icon', '✦'));
    if (clientConfig.chat.showPlatformLabels) identity.append(element('span', 'platform', activity.platform.toUpperCase()));
    identity.append(element('strong', 'display-name event-label', activity.label));
    if (activity.simulated) identity.append(element('span', 'role event-test', 'TEST'));
    item.append(identity, element('p', 'body', activity.message));
    chat.append(item);
    trimChat();
  }

  function removeChat(eventId) {
    for (const item of chat.children) if (item.dataset.eventId === eventId) { item.remove(); break; }
  }

  function enqueueAlert(alert) {
    alertController.enqueue(alert);
  }

  function buildAlertCard(alert) {
    const card = element('article', `alert priority-${alert.priority}`);
    const cardStyle = alert.display && alert.display.card ? alert.display.card : {};
    const alertFamilies = { system: '"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif', rounded: '"Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', monospace: 'Consolas, "Cascadia Mono", monospace' };
    card.style.setProperty('--alert-card-bg', cardStyle.backgroundColor || '#171120');
    card.style.setProperty('--alert-font-family', alertFamilies[cardStyle.fontFamily] || alertFamilies.system);
    if (cardStyle.backgroundImageUrl) card.style.setProperty('--alert-card-image', `url("${String(cardStyle.backgroundImageUrl).replace(/["\\]/g, '')}")`);
    const identity = element('div', 'alert-identity');
    identity.append(buildAvatar(alert.actor, alert.presentation || {}, alert.platform, 'alert-avatar'));
    const copy = element('div', 'alert-copy');
    copy.append(element('span', 'alert-platform', alert.platform.toUpperCase()));
    copy.append(element('h2', '', alert.display ? alert.display.title : alertTitle(alert)));
    const detail = alert.display ? alert.display.detail : alertDetail(alert);
    if (detail) copy.append(element('p', 'alert-detail', detail));
    if (alert.aggregateCount > 1) card.append(element('span', 'aggregated', `${alert.aggregateCount} EVENTS COMBINED${alert.quantity ? ` · ${alert.quantity} TOTAL` : ''}`));
    if (alert.simulated) card.append(element('span', 'simulated', 'TEST EVENT'));
    identity.append(copy);
    card.prepend(identity);
    return card;
  }

  function buildAvatar(actor, presentation, platform, extraClass) {
    const displayName = actor && (actor.displayName || actor.name) ? actor.displayName || actor.name : platform;
    const frame = element('span', `avatar-frame ${extraClass} platform-${safeClass(platform)}`);
    frame.append(element('span', 'avatar avatar-fallback', String(displayName).trim().charAt(0).toUpperCase() || '?'));
    if (presentation.avatarUrl) {
      const avatar = element('img', 'avatar avatar-image');
      avatar.src = presentation.avatarUrl;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
      avatar.addEventListener('error', () => avatar.remove(), { once: true });
      frame.append(avatar);
    }
    return frame;
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
    if (!alert.display || alert.display.sound.mode === 'none' || alert.display.sound.volume <= 0) return;
    if (alert.display.sound.mode === 'custom' && alert.display.sound.customUrl) {
      const audio = new Audio(alert.display.sound.customUrl); audio.volume = Math.min(1, Math.max(0, alert.display.sound.volume)); void audio.play().catch(() => undefined); return;
    }
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      const context = new AudioContextType();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const patterns = { chime: [660, .35], 'soft-bell': [440, .55], 'digital-pop': [880, .18], celebration: [784, .65] };
      const pattern = patterns[alert.display.sound.mode] || patterns.chime;
      oscillator.frequency.value = pattern[0];
      gain.gain.setValueAtTime(Math.min(1, Math.max(0, alert.display.sound.volume)), context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + pattern[1]);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + pattern[1]);
      oscillator.addEventListener('ended', () => context.close(), { once: true });
    } catch { /* Browser-source audio policy may block a preview; visuals continue. */ }
  }

  function safeClass(value) { return String(value).toLowerCase().replace(/[^a-z0-9-]/g, ''); }

  function messageBackground(platform) {
    const chatConfig = clientConfig.chat;
    if (chatConfig.messageColorMode === 'transparent') return 'transparent';
    const color = chatConfig.messageColorMode === 'platform' ? chatConfig.platformMessageColors[platform] || chatConfig.messageBackgroundColor : chatConfig.messageBackgroundColor;
    return rgba(color, chatConfig.messageBackgroundOpacity);
  }

  function applyChatAppearance() {
    const chatConfig = clientConfig.chat;
    const selectedLayout = requestedLayout === 'compact' || requestedLayout === 'regular' ? requestedLayout : chatConfig.layout;
    document.body.dataset.layout = selectedLayout;
    const families = { system: '"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif', rounded: '"Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif', monospace: 'Consolas, "Cascadia Mono", monospace' };
    document.documentElement.style.setProperty('--chat-font-family', families[chatConfig.fontFamily] || families.system);
    document.documentElement.style.setProperty('--chat-font-size', `${chatConfig.fontSizePx}px`);
    document.documentElement.style.setProperty('--chat-text-color', chatConfig.textColor);
    document.documentElement.style.setProperty('--chat-canvas-bg', chatConfig.backgroundMode === 'solid' ? rgba(chatConfig.backgroundColor, chatConfig.backgroundOpacity) : 'transparent');
    document.documentElement.style.setProperty('--chat-message-bg', rgba(chatConfig.messageBackgroundColor, chatConfig.messageBackgroundOpacity));
  }

  function rgba(hex, opacity) {
    const value = String(hex).replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, Number(opacity)))})`;
  }

  fetch('/overlay/config').then((response) => response.ok ? response.json() : undefined).then((config) => {
    if (config) { clientConfig = config; alertController.configure(config.maxAlertQueue, config.alertDurationMs); }
    applyChatAppearance();
    brandLabel.textContent = clientConfig.brandLabel;
    brandLabel.hidden = clientConfig.brandLabel.length === 0;
  }).catch(() => undefined).finally(connect);
})();
