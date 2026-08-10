import { AlertPresentationController } from '/overlay/alert-queue-1.2.3.js';

// Compatible with standard Chromium/CEF browser sources.
(() => {
  'use strict';
  const chat = document.getElementById('chat');
  const alerts = document.getElementById('alerts');
  const status = document.getElementById('status');
  const brandLabel = document.getElementById('brand-label');
  const dockComposer = document.getElementById('dock-composer');
  const dockTarget = document.getElementById('dock-target');
  const dockMessage = document.getElementById('dock-message');
  const dockSend = document.getElementById('dock-send');
  const dockSendStatus = document.getElementById('dock-send-status');
  const dockCharacterCount = document.getElementById('dock-character-count');
  const dockMode = location.pathname.endsWith('/dock');
  const mode = location.pathname.startsWith('/overlay/chat') ? 'chat' : location.pathname.endsWith('/alerts') ? 'alerts' : 'combined';
  const requestedLayout = new URLSearchParams(location.search).get('layout');
  const platformNameColors = { twitch: '#ffd166', youtube: '#72e5ff', kick: '#d8b4ff', tiktok: '#ff8fab', streamlabs: '#e7c6ff', kofi: '#ffd0a8' };
  document.body.dataset.mode = mode;
  document.body.dataset.dock = dockMode ? 'true' : 'false';

  const chatFadeMs = 240;
  const alertExitMs = 320;
  const retainedChatHistory = 200;
  let compactBubbleCursor = 0;
  let clientConfig = {
    brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7000,
    chat: { layout: 'regular', orientation: 'vertical', newMessagePosition: 'end', animation: 'slide', textAlign: 'left', fontFamily: 'system', fontSizePx: 18, textColor: '#ffffff', backgroundMode: 'transparent', backgroundColor: '#171120', backgroundOpacity: 0.9, messageBackgroundColor: '#171120', messageBackgroundOpacity: 0.96, messageColorMode: 'platform', platformMessageColors: { twitch: '#321b52', youtube: '#571313', kick: '#153e12', tiktok: '#10272c', streamlabs: '#125a47', kofi: '#123b52' }, showPlatformLabels: true, showProfilePictures: true, showBadges: true, ignoredNames: [], events: { enabled: true, platforms: { twitch: true, youtube: true, kick: true, tiktok: true, streamlabs: true, kofi: true }, characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150, streamlabs: 500, kofi: 500 } } },
  };
  let dockConfig = { enabled: false, platforms: [], characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150 } };
  brandLabel.textContent = clientConfig.brandLabel;
  const alertController = new AlertPresentationController({
    capacity: clientConfig.maxAlertQueue,
    defaultDurationMs: clientConfig.alertDurationMs,
    render: (alert) => {
      const card = buildAlertCard(alert);
      alerts.replaceChildren(card);
      requestAnimationFrame(() => fitAlertTitle(card));
    },
    clear: () => alerts.replaceChildren(),
    dismiss: (_alert, done) => {
      const card = alerts.querySelector('.alert');
      if (!card) { done(); return; }
      card.classList.add('alert-exit');
      setTimeout(done, alertExitMs);
    },
    playSound: playAlertSound,
    onError: (error) => console.warn('Skipped an alert that could not be rendered.', error),
  });

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function usesScatteredCompactBubbles() {
    return mode === 'chat' && !dockMode && document.body.dataset.layout === 'compact'
      && innerWidth >= 1200 && innerHeight >= 700 && innerWidth / innerHeight >= 1.5;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  function nextBubbleRandom(seed) { return (Math.imul(seed, 1664525) + 1013904223) >>> 0; }

  function bubbleIntersects(left, top, width, height, candidate) {
    const gap = 24;
    const bounds = candidate.getBoundingClientRect();
    return left < bounds.right + gap && left + width + gap > bounds.left
      && top < bounds.bottom + gap && top + height + gap > bounds.top;
  }

  function positionCompactBubble(item) {
    if (!usesScatteredCompactBubbles()) {
      item.style.removeProperty('--bubble-left'); item.style.removeProperty('--bubble-top'); delete item.dataset.bubbleSlot;
      return;
    }
    const edge = Math.max(28, Math.round(Math.min(innerWidth, innerHeight) * 0.035));
    const maximumLeft = Math.max(edge, innerWidth - item.offsetWidth - edge);
    const maximumTop = Math.max(edge, innerHeight - item.offsetHeight - edge);
    const others = [...chat.children].filter((candidate) => candidate !== item && candidate.style.getPropertyValue('--bubble-left'));
    let seed = stableHash(`${item.dataset.eventId || ''}:${String(compactBubbleCursor)}`);
    let selected = { left: edge, top: edge, clearance: -1 };
    for (let attempt = 0; attempt < 24; attempt += 1) {
      seed = nextBubbleRandom(seed); const left = Math.round(edge + (maximumLeft - edge) * (seed / 4294967296));
      seed = nextBubbleRandom(seed); const top = Math.round(edge + (maximumTop - edge) * (seed / 4294967296));
      const distances = others.map((candidate) => { const bounds = candidate.getBoundingClientRect(); return Math.hypot(left + item.offsetWidth / 2 - (bounds.left + bounds.width / 2), top + item.offsetHeight / 2 - (bounds.top + bounds.height / 2)); });
      const clearance = distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
      if (clearance > selected.clearance) selected = { left, top, clearance };
      if (!others.some((candidate) => bubbleIntersects(left, top, item.offsetWidth, item.offsetHeight, candidate))) break;
    }
    item.dataset.bubbleSlot = String(stableHash(`${item.dataset.eventId || ''}:${String(compactBubbleCursor)}`));
    compactBubbleCursor += 1;
    item.style.setProperty('--bubble-left', `${selected.left}px`);
    item.style.setProperty('--bubble-top', `${selected.top}px`);
  }

  function refreshCompactBubbles() { for (const item of chat.children) positionCompactBubble(item); }

  function receive(event) {
    if (event.kind === 'overlay.reset') resetOverlaySurface();
    else if (event.kind === 'chat.add' && (mode === 'chat' || mode === 'combined')) addChat(event.payload);
    else if (event.kind === 'chat.event' && (mode === 'chat' || mode === 'combined')) addEventMessage(event.payload);
    else if (event.kind === 'chat.remove' && (mode === 'chat' || mode === 'combined')) removeChat(event.payload.targetEventId);
    else if (event.kind === 'alert.show' && (mode === 'alerts' || mode === 'combined')) enqueueAlert(event.payload);
  }

  function transportStatus(state) {
    status.textContent = state === 'live' ? 'LIVE' : 'OFFLINE';
    status.dataset.state = state;
    if (state !== 'live') resetOverlaySurface();
  }

  function resetOverlaySurface() {
    chat.replaceChildren();
    compactBubbleCursor = 0;
    alertController.reset();
  }

  function connectDirectly() {
    resetOverlaySurface();
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
    resetOverlaySurface();
    if ('SharedWorker' in window) {
      try {
        const worker = new SharedWorker('/overlay/worker-1.3.3.js', 'thsv-browser-overlay-1.3.3');
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
    displayName.style.color = readableNameColor(message.platform);
    identity.append(displayName);
    if (clientConfig.chat.showBadges && message.user.isBroadcaster) identity.append(element('span', 'role', 'HOST'));
    else if (clientConfig.chat.showBadges && message.user.isModerator) identity.append(element('span', 'role', 'MOD'));
    else if (clientConfig.chat.showBadges && message.user.isSubscriber) identity.append(element('span', 'role', 'MEMBER'));
    if (clientConfig.chat.showBadges && message.user.isBot) identity.append(element('span', 'role bot', 'BOT'));
    for (const badge of clientConfig.chat.showBadges ? message.presentation.badges : []) {
      // Streamer.bot can supply a Moderator presentation badge as well as the normalized role.
      // Keep one platform-neutral MOD marker instead of rendering MOD + Moderator side by side.
      if (message.user.isModerator && isModeratorBadge(badge)) continue;
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
    item.append(identity, buildChatBody(message));
    chat.append(item);
    requestAnimationFrame(() => positionCompactBubble(item));
    trimChat();
    scrollDockToLatest();
  }

  function buildChatBody(message) {
    const body = element('p', 'body');
    const fragments = Array.isArray(message.fragments) ? message.fragments : [{ type: 'text', text: message.message }];
    for (const fragment of fragments) {
      if (fragment?.type !== 'emote') {
        if (typeof fragment?.text === 'string') body.append(document.createTextNode(fragment.text));
        continue;
      }
      const image = element('img', 'chat-emote');
      image.src = fragment.imageUrl;
      image.alt = fragment.name;
      image.title = `${fragment.name} (${fragment.provider})`;
      image.loading = 'eager';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.replaceWith(document.createTextNode(fragment.name)), { once: true });
      body.append(image);
    }
    return body;
  }

  function trimChat() {
    const visible = [...chat.children].filter((item) => !item.classList.contains('message-expiring'));
    // The OBS source crop decides how many messages are visible. Keep only a generous,
    // bounded DOM history so a long stream cannot grow this page without limit.
    while (visible.length > retainedChatHistory) {
      const oldest = visible.shift();
      if (!oldest) return;
      oldest.classList.add('message-expiring');
      setTimeout(() => { oldest.remove(); updateChatOverflow(); }, chatFadeMs);
    }
    updateChatOverflow();
  }

  function updateChatOverflow() {
    if (usesScatteredCompactBubbles()) { chat.classList.remove('chat-overflowing'); return; }
    const styles = getComputedStyle(chat);
    const horizontal = document.body.dataset.orientation === 'horizontal';
    const gap = Number.parseFloat(horizontal ? styles.columnGap || styles.gap : styles.rowGap || styles.gap) || 0;
    const items = [...chat.children];
    const usedSpace = items.reduce((space, item) => space + (horizontal ? item.getBoundingClientRect().width : item.getBoundingClientRect().height), 0) + gap * Math.max(0, items.length - 1);
    chat.classList.toggle('chat-overflowing', usedSpace > (horizontal ? chat.clientWidth : chat.clientHeight) + 1);
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
    // Older live bridge processes can still emit the default reward separator when the redemption
    // has no viewer input. Keep the browser surface clean immediately; the server-side renderer
    // applies the same cleanup after the next normal bridge restart.
    const activityMessage = activity.category === 'reward-redemption' ? String(activity.message).replace(/\s*·\s*$/u, '').trim() : activity.message;
    item.append(identity, element('p', 'body', activityMessage));
    chat.append(item);
    requestAnimationFrame(() => positionCompactBubble(item));
    trimChat();
    scrollDockToLatest();
  }

  function removeChat(eventId) {
    for (const item of chat.children) if (item.dataset.eventId === eventId) { item.remove(); break; }
  }

  function enqueueAlert(alert) {
    alertController.enqueue(alert);
  }

  function buildAlertCard(alert) {
    const card = element('article', `alert priority-${alert.priority} platform-${safeClass(alert.platform)}`);
    const cardStyle = alert.display && alert.display.card ? alert.display.card : {};
    const alertFamilies = { system: '"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif', rounded: '"Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', monospace: 'Consolas, "Cascadia Mono", monospace' };
    const layout = cardStyle.layout || 'classic';
    const hasVideo = Boolean(cardStyle.backgroundVideoUrl);
    const hasImage = Boolean(cardStyle.backgroundImageUrl);
    const hasMedia = hasVideo || hasImage;
    // Placement only has a visual effect once media exists; otherwise fall back so layout alone controls the avatar slot.
    const mediaPlacement = hasMedia ? cardStyle.mediaPlacement || 'behind' : 'behind';
    card.dataset.layout = layout;
    card.dataset.alertType = safeClass(alert.alertType);
    card.dataset.mediaPlacement = mediaPlacement;
    card.dataset.transition = cardStyle.transition || 'slide-vertical';
    card.style.setProperty('--alert-card-bg', cardStyle.backgroundColor || '#171120');
    card.style.setProperty('--alert-font-family', alertFamilies[cardStyle.fontFamily] || alertFamilies.system);
    if (hasMedia && mediaPlacement === 'behind') {
      if (hasVideo) {
        card.append(buildAlertMediaElement(cardStyle, true, 'alert-video'), element('div', 'alert-video-overlay'));
      } else {
        card.style.setProperty('--alert-card-image', `url("${String(cardStyle.backgroundImageUrl).replace(/["\\]/g, '')}")`);
      }
    }
    const identity = element('div', 'alert-identity');
    if (hasMedia && mediaPlacement === 'inset') {
      const insetBox = element('span', 'alert-media-inset');
      insetBox.append(buildAlertMediaElement(cardStyle, hasVideo));
      identity.append(insetBox);
    } else if (layout !== 'centered') {
      identity.append(buildAvatar(alert.actor, alert.presentation || {}, alert.platform, 'alert-avatar'));
    }
    const copy = element('div', 'alert-copy');
    const meta = element('div', 'alert-meta');
    meta.append(element('span', 'alert-platform', alert.platform.toUpperCase()));
    meta.append(element('span', 'alert-event', alert.alertType.replaceAll('-', ' ').toUpperCase()));
    copy.append(meta);
    copy.append(element('h2', '', alert.display ? alert.display.title : alertTitle(alert)));
    const thankYou = alert.display && alert.display.thankYou;
    if (thankYou) copy.append(element('p', 'alert-thank-you', thankYou));
    const viewerMessage = alert.display
      ? alert.display.viewerMessage || alert.display.detail
      : alertDetail(alert);
    if (viewerMessage) copy.append(element('p', 'alert-viewer-message', viewerMessage));
    identity.append(copy);
    card.append(identity);
    if (hasMedia && mediaPlacement === 'below') {
      const banner = element('div', 'alert-media-banner');
      banner.append(buildAlertMediaElement(cardStyle, hasVideo));
      card.append(banner);
    }
    if (alert.aggregateCount > 1) card.append(element('span', 'aggregated', `${alert.aggregateCount} EVENTS COMBINED${alert.quantity ? ` · ${alert.quantity} TOTAL` : ''}`));
    if (alert.simulated) card.append(element('span', 'simulated', 'TEST EVENT'));
    return card;
  }

  function fitAlertTitle(card) {
    const title = card.querySelector('h2');
    if (!title) return;
    title.classList.remove('title-clamped');
    title.style.removeProperty('font-size');
    const minimumSize = 16;
    let size = Number.parseFloat(getComputedStyle(title).fontSize);
    const fitsTwoLines = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
      return title.scrollHeight <= lineHeight * 2 + 1;
    };
    while (!fitsTwoLines() && size > minimumSize) {
      size = Math.max(minimumSize, size - 1);
      title.style.fontSize = `${String(size)}px`;
    }
    if (!fitsTwoLines()) title.classList.add('title-clamped');
  }

  function buildAlertMediaElement(cardStyle, hasVideo, className) {
    if (hasVideo) {
      const video = element('video', className);
      video.src = cardStyle.backgroundVideoUrl;
      video.preload = 'auto';
      video.autoplay = true; video.loop = true; video.muted = false; video.playsInline = true;
      video.addEventListener('playing', () => video.classList.add('media-playing'));
      video.addEventListener('error', () => video.remove(), { once: true });
      return video;
    }
    const img = element('img', className);
    img.src = cardStyle.backgroundImageUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove(), { once: true });
    return img;
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
    // A background video carries its own embedded audio track (e.g. "an mp4 with its own song");
    // layering the separate alert sound on top of that would just be clutter.
    if (alert.display.card && alert.display.card.backgroundVideoUrl) return;
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

  function isModeratorBadge(badge) {
    const id = String(badge && badge.id ? badge.id : '').trim().toLowerCase();
    const label = String(badge && badge.label ? badge.label : '').trim().toLowerCase();
    return id === 'mod' || id === 'moderator' || label === 'mod' || label === 'moderator';
  }

  function readableNameColor(platform) {
    const chatConfig = clientConfig.chat;
    if (chatConfig.messageColorMode === 'transparent') return chatConfig.textColor;
    const background = chatConfig.messageColorMode === 'platform'
      ? chatConfig.platformMessageColors[platform] || chatConfig.messageBackgroundColor
      : chatConfig.messageBackgroundColor;
    const preferred = platformNameColors[platform] || chatConfig.textColor;
    if (contrastRatio(preferred, background) >= 4.5) return preferred;
    return contrastRatio('#ffffff', background) >= contrastRatio('#000000', background) ? '#ffffff' : '#000000';
  }

  function contrastRatio(first, second) {
    const light = Math.max(relativeLuminance(first), relativeLuminance(second));
    const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
    return (light + 0.05) / (dark + 0.05);
  }

  function relativeLuminance(hex) {
    const value = String(hex).replace('#', '');
    const channels = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)]
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function applyChatAppearance() {
    const chatConfig = clientConfig.chat;
    const selectedLayout = ['regular', 'compact', 'minimal', 'classic'].includes(requestedLayout) ? requestedLayout : chatConfig.layout;
    document.body.dataset.layout = selectedLayout;
    requestAnimationFrame(refreshCompactBubbles);
    document.body.dataset.orientation = dockMode ? 'vertical' : chatConfig.orientation || 'vertical';
    document.body.dataset.newMessagePosition = dockMode ? 'end' : chatConfig.newMessagePosition || 'end';
    document.body.dataset.chatAnimation = chatConfig.animation || 'slide';
    document.body.dataset.textAlign = chatConfig.textAlign || 'left';
    const families = { system: '"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif', rounded: '"Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif', monospace: 'Consolas, "Cascadia Mono", monospace' };
    document.documentElement.style.setProperty('--chat-font-family', families[chatConfig.fontFamily] || families.system);
    const configuredSize = Math.max(14, Math.min(28, Number(chatConfig.fontSizePx) || 18));
    // The dock is an interactive control surface, not an OBS canvas. Keep its typography fixed
    // while the on-stream overlay honors the creator's bounded appearance setting.
    document.documentElement.style.setProperty('--chat-font-size', `${dockMode ? 16 : configuredSize}px`);
    document.documentElement.style.setProperty('--chat-text-color', chatConfig.textColor);
    document.documentElement.style.setProperty('--chat-canvas-bg', chatConfig.backgroundMode === 'solid' ? rgba(chatConfig.backgroundColor, chatConfig.backgroundOpacity) : 'transparent');
    document.documentElement.style.setProperty('--chat-message-bg', rgba(chatConfig.messageBackgroundColor, chatConfig.messageBackgroundOpacity));
  }

  addEventListener('resize', () => requestAnimationFrame(refreshCompactBubbles));

  function scrollDockToLatest() {
    if (!dockMode) return;
    requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
  }

  function dockMaximum() {
    const selected = dockTarget.value;
    const platforms = selected === 'all' ? dockConfig.platforms : [selected];
    return Math.min(...platforms.map((platform) => dockConfig.characterLimits[platform] || 500));
  }

  function updateDockCharacterCount() {
    if (!dockMode) return;
    const maximum = dockMaximum();
    const count = Array.from(dockMessage.value).length;
    dockMessage.maxLength = maximum;
    dockCharacterCount.textContent = `${count} / ${maximum}`;
    dockCharacterCount.dataset.over = count > maximum ? 'true' : 'false';
  }

  function configureDock() {
    if (!dockMode) return;
    dockComposer.hidden = false;
    dockTarget.replaceChildren();
    if (dockConfig.platforms.length > 1) dockTarget.append(new Option('All live chats', 'all'));
    const names = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok' };
    for (const platform of dockConfig.platforms) dockTarget.append(new Option(names[platform] || platform, platform));
    if (dockConfig.platforms.length === 0) {
      dockTarget.append(new Option('No chat platforms enabled', ''));
      dockTarget.disabled = true;
      dockMessage.disabled = true;
      dockSend.disabled = true;
      dockSendStatus.textContent = 'Enable a chat platform and connect Streamer.bot before sending.';
    }
    updateDockCharacterCount();
  }

  async function sendDockMessage(event) {
    event.preventDefault();
    const message = dockMessage.value.trim();
    if (!message || !dockTarget.value) return;
    dockSend.disabled = true;
    dockSendStatus.dataset.state = 'sending';
    dockSendStatus.textContent = 'Queuing your message…';
    try {
      const response = await fetch('/overlay/chat/dock/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: dockTarget.value, message }),
      });
      const result = await response.json();
      if (!response.ok || !result.accepted) {
        const failures = Array.isArray(result.deliveries) ? result.deliveries.filter((delivery) => !delivery.accepted).map((delivery) => delivery.platform).join(', ') : '';
        throw new Error(result.error || (failures ? `Could not queue: ${failures}` : 'The message could not be queued.'));
      }
      const queued = result.deliveries.map((delivery) => delivery.platform).join(', ');
      dockMessage.value = '';
      dockSendStatus.dataset.state = 'success';
      dockSendStatus.textContent = `Queued to ${queued}. Platform delivery is handled by Streamer.bot.`;
      updateDockCharacterCount();
    } catch (error) {
      dockSendStatus.dataset.state = 'error';
      dockSendStatus.textContent = error instanceof Error ? error.message : 'The message could not be queued.';
    } finally { dockSend.disabled = false; dockMessage.focus(); }
  }

  function rgba(hex, opacity) {
    const value = String(hex).replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, Number(opacity)))})`;
  }

  const chatResizeObserver = new ResizeObserver(updateChatOverflow);
  chatResizeObserver.observe(chat);
  const chatShell = chat.closest('.chat-shell');
  if (chatShell) chatResizeObserver.observe(chatShell);
  addEventListener('resize', () => {
    const activeAlert = alerts.querySelector('.alert');
    if (activeAlert) fitAlertTitle(activeAlert);
  });

  const overlayConfigRequest = fetch('/overlay/config').then((response) => response.ok ? response.json() : undefined);
  const dockConfigRequest = dockMode
    ? fetch('/overlay/chat/dock/config').then((response) => response.ok ? response.json() : undefined)
    : Promise.resolve(undefined);
  Promise.all([overlayConfigRequest, dockConfigRequest]).then(([config, receivedDockConfig]) => {
    if (config) { clientConfig = config; alertController.configure(config.maxAlertQueue, config.alertDurationMs); }
    if (receivedDockConfig) dockConfig = receivedDockConfig;
    applyChatAppearance();
    brandLabel.textContent = clientConfig.brandLabel;
    brandLabel.hidden = clientConfig.brandLabel.length === 0;
    configureDock();
  }).catch(() => undefined).finally(connect);
  dockTarget.addEventListener('change', updateDockCharacterCount);
  dockMessage.addEventListener('input', updateDockCharacterCount);
  dockMessage.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); dockComposer.requestSubmit(); } });
  dockComposer.addEventListener('submit', sendDockMessage);
})();
