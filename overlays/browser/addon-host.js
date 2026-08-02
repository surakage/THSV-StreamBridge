(() => {
  'use strict';
  const aliases = Object.freeze({
    '/overlay/shoutouts': 'thsv.automated-shoutouts',
    '/overlay/clips': 'thsv.random-clip-player',
    '/overlay/subathon': 'thsv.subathon-timer',
    '/overlay/countdown': 'thsv.starting-soon-countdown',
  });
  const moduleId = aliases[location.pathname] || location.pathname.slice('/overlay/addons/'.length);
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId)) return;
  const card = document.getElementById('card');
  const cardImage = document.getElementById('card-image');
  const cardTitle = document.getElementById('card-title');
  const cardText = document.getElementById('card-text');
  const mediaShell = document.getElementById('media-shell');
  const media = document.getElementById('media');
  const embedMedia = document.getElementById('embed-media');
  const mediaTitle = document.getElementById('media-title');
  const timerShell = document.getElementById('timer-shell');
  const timerLabel = document.getElementById('timer-label');
  const timerBadge = document.getElementById('timer-badge');
  const timerTime = document.getElementById('timer-time');
  const timerProgressTrack = document.getElementById('timer-progress-track');
  const timerProgress = document.getElementById('timer-progress');
  const timerReason = document.getElementById('timer-reason');
  const timerPlatforms = document.getElementById('timer-platforms');
  const labelShell = document.getElementById('label-shell');
  const labelList = document.getElementById('label-list');
  const counterShell = document.getElementById('counter-shell');
  const counterIcon = document.getElementById('counter-icon');
  const counterName = document.getElementById('counter-name');
  const counterValue = document.getElementById('counter-value');
  const wheelShell = document.getElementById('wheel-shell');
  const wheel = document.getElementById('wheel');
  const wheelStuds = document.getElementById('wheel-studs');
  const wheelLabels = document.getElementById('wheel-labels');
  const wheelPointer = document.getElementById('wheel-pointer');
  const wheelTitle = document.getElementById('wheel-title');
  const wheelResult = document.getElementById('wheel-result');
  const wheelWinner = document.getElementById('wheel-winner');
  const status = document.getElementById('status');
  const requestedLabel = (() => {
    const value = new URLSearchParams(location.search).get('label') || 'latest';
    return ['follower', 'member', 'gift-membership', 'support', 'raid', 'reward', 'latest', 'all'].includes(value) ? value : 'latest';
  })();
  let cardTimer;
  let cardRevealTimer;
  let mediaTimer;
  let mediaFadeTimer;
  let pendingMediaDurationMs;
  let embeddedPlayback = false;
  let embeddedPlaybackKind = '';
  let embeddedConfigured = false;
  let embeddedConfigurationAttempts = 0;
  let embeddedMuted = false;
  let embeddedVolume = 1;
  let heartbeatTimer;
  let activePlaybackId = '';
  let wheelTimer;
  let wheelRevealTimer;
  let wheelTickTimer;
  let wheelSequence = -1;
  // Every browser-source instance has its own identity. OBS can keep multiple copies of the
  // same source alive across scenes; the bridge uses this ID to ensure that only the copy that
  // actually started a clip is allowed to report its completion.
  const rendererId = globalThis.crypto?.randomUUID?.() || `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let lastCompletionSequence = -1;
  let sendTransport = () => undefined;
  const mediaFadeMs = 750;

  function safeUrl(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return undefined;
    try {
      const url = new URL(value, location.origin);
      return url.protocol === 'https:' || url.origin === location.origin ? url.href : undefined;
    } catch { return undefined; }
  }

  function safeTwitchClipEmbed(value, muted) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return undefined;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'clips.twitch.tv' || url.pathname !== '/embed') return undefined;
      url.searchParams.set('parent', location.hostname);
      url.searchParams.set('autoplay', 'true');
      url.searchParams.set('muted', muted === true ? 'true' : 'false');
      return url.href;
    } catch { return undefined; }
  }

  function safeYouTubeEmbed(value, muted) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return undefined;
    try {
      const url = new URL(value);
      const match = /^\/embed\/([A-Za-z0-9_-]{11})$/u.exec(url.pathname);
      if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname.toLowerCase()) || !match?.[1]) return undefined;
      const safe = new URL(`https://www.youtube.com/embed/${match[1]}`);
      safe.searchParams.set('autoplay', '1'); safe.searchParams.set('enablejsapi', '1'); safe.searchParams.set('playsinline', '1');
      safe.searchParams.set('rel', '0'); safe.searchParams.set('origin', location.origin);
      if (muted === true) safe.searchParams.set('mute', '1');
      return safe.href;
    } catch { return undefined; }
  }

  function boundedDuration(value, fallback) {
    return Number.isInteger(value) && value >= 1_000 && value <= 3_600_000 ? value : fallback;
  }

  function hideCard() {
    clearTimeout(cardTimer);
    clearInterval(cardRevealTimer);
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

  function hideLabels() {
    labelShell.classList.add('hidden');
    labelList.replaceChildren();
  }

  function hideCounter() {
    counterShell.classList.add('hidden');
    counterIcon.classList.add('hidden'); counterIcon.removeAttribute('src');
  }

  function showCounter(payload) {
    hideCard(); hideTimer(); hideLabels(); hideWheel(); clearMedia(activePlaybackId ? 'stopped' : undefined);
    if (payload.visible !== true) return hideCounter();
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const iconUrl = safeUrl(payload.iconUrl);
    if (iconUrl && style.showIcon !== false) { counterIcon.src = iconUrl; counterIcon.classList.remove('hidden'); } else { counterIcon.classList.add('hidden'); counterIcon.removeAttribute('src'); }
    counterName.textContent = boundedText(payload.name, 80, 'STREAM COUNTER') || 'STREAM COUNTER';
    counterValue.textContent = Number.isSafeInteger(payload.value) ? payload.value.toLocaleString('en-US') : '0';
    counterName.classList.toggle('hidden', style.showLabel === false);
    counterShell.dataset.animation = ['pop', 'pulse', 'bounce', 'flash', 'slide', 'none'].includes(style.animation) ? style.animation : 'pop';
    counterShell.dataset.font = ['display', 'broadcast', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'broadcast';
    counterShell.dataset.layout = ['horizontal', 'vertical'].includes(style.layout) ? style.layout : 'horizontal';
    counterShell.style.setProperty('--counter-background', safeColor(style.backgroundColor, '#111827'));
    counterShell.style.setProperty('--counter-accent', safeColor(style.accentColor, '#7ee0ff'));
    counterShell.style.setProperty('--counter-text', safeColor(style.textColor, '#ffffff'));
    counterShell.style.setProperty('--counter-border', safeColor(style.borderColor, '#7ee0ff'));
    counterShell.style.setProperty('--counter-border-width', `${Number.isInteger(style.borderWidth) ? Math.max(0, Math.min(12, style.borderWidth)) : 3}px`);
    counterShell.style.setProperty('--counter-radius', `${Number.isInteger(style.borderRadius) ? Math.max(0, Math.min(64, style.borderRadius)) : 24}px`);
    counterShell.style.setProperty('--counter-spacing', `${Number.isInteger(style.spacing) ? Math.max(0, Math.min(64, style.spacing)) : 24}px`);
    counterShell.style.setProperty('--counter-value-size', `${Number.isInteger(style.fontSize) ? Math.max(24, Math.min(120, style.fontSize)) : 72}px`);
    counterShell.style.setProperty('--counter-align', ['left', 'center', 'right'].includes(style.alignment) ? style.alignment : 'left');
    counterShell.dataset.shadow = style.shadow === false ? 'off' : 'on';
    counterShell.classList.remove('hidden', 'counter-change'); void counterShell.offsetWidth; counterShell.classList.add('counter-change');
  }

  function hideWheel() {
    clearTimeout(wheelTimer); clearTimeout(wheelRevealTimer); clearTimeout(wheelTickTimer);
    wheelShell.classList.add('hidden');
    wheelResult.classList.remove('revealed');
    wheelLabels.replaceChildren(); wheelStuds.replaceChildren();
    wheel.removeAttribute('style');
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

  function playCompletionTone(payload) {
    const tone = ['soft-chime', 'digital-pop', 'celebration'].includes(payload.completionTone) ? payload.completionTone : 'none';
    const sequence = Number.isInteger(payload.completionSequence) ? payload.completionSequence : -1;
    if (payload.playCompletionTone !== true || tone === 'none' || sequence === lastCompletionSequence) return;
    lastCompletionSequence = sequence;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const audio = new AudioContextClass();
      const volume = typeof payload.toneVolume === 'number' && Number.isFinite(payload.toneVolume) ? Math.max(0, Math.min(1, payload.toneVolume)) : 0.6;
      const notes = tone === 'soft-chime' ? [[659.25, 0, 0.2], [880, 0.18, 0.48]]
        : tone === 'digital-pop' ? [[440, 0, 0.08], [659.25, 0.08, 0.2]]
          : [[523.25, 0, 0.12], [659.25, 0.11, 0.25], [783.99, 0.24, 0.5]];
      for (const [frequency, offset, length] of notes) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = tone === 'digital-pop' ? 'square' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, audio.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.25), audio.currentTime + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + offset + length);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(audio.currentTime + offset); oscillator.stop(audio.currentTime + offset + length + 0.02);
      }
      setTimeout(() => void audio.close(), 1_000);
    } catch { /* Audio is optional and may be blocked by the browser source. */ }
  }

  function showTimer(payload) {
    hideCard();
    hideLabels();
    clearMedia(activePlaybackId ? 'stopped' : undefined);
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const remaining = Number.isInteger(payload.remainingSeconds) && payload.remainingSeconds >= 0 ? payload.remainingSeconds : 0;
    const maximum = Number.isInteger(payload.maximumSeconds) && payload.maximumSeconds > 0 ? payload.maximumSeconds : 1;
    const computedTime = `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    const livePlatforms = Array.isArray(payload.livePlatforms) ? payload.livePlatforms.filter((value) => typeof value === 'string').slice(0, 4) : [];
    timerLabel.textContent = boundedText(payload.label, 80, 'TIMER') || 'TIMER';
    const completed = payload.completed === true;
    timerTime.textContent = completed ? (boundedText(payload.completionMessage, 200, 'The stream is starting now!') || 'The stream is starting now!')
      : (/^(?:\d{2,4}:)?\d{2}:\d{2}$/u.test(payload.remainingText) ? payload.remainingText : computedTime);
    timerTime.classList.toggle('timer-complete-message', completed);
    timerBadge.textContent = completed ? 'COMPLETE' : payload.running === true ? 'RUNNING' : payload.live === true ? 'PAUSED' : 'READY';
    timerReason.textContent = boundedText(payload.lastReason, 120, 'Waiting for an update').replace(/-/gu, ' ');
    timerPlatforms.textContent = boundedText(payload.contextText, 100) || (livePlatforms.length > 0 ? livePlatforms.join(' + ') : 'Ready for scene control');
    timerProgress.style.width = `${Math.max(0, Math.min(100, remaining / maximum * 100)).toFixed(2)}%`;
    timerProgressTrack.classList.toggle('hidden', style.showProgressBar === false);
    const backgroundMode = ['glass', 'solid', 'none'].includes(style.backgroundMode) ? style.backgroundMode : 'glass';
    const fontFamily = ['display', 'broadcast', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'display';
    timerShell.dataset.state = completed ? 'complete' : payload.critical === true ? 'critical' : payload.warning === true ? 'warning' : payload.running === true ? 'running' : 'paused';
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
    playCompletionTone(payload);
  }

  function showCard(payload) {
    hideCard();
    hideTimer();
    hideLabels();
    hideWheel();
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 200) : '';
    const text = typeof payload.text === 'string' ? payload.text.slice(0, 1_000) : '';
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const imageUrl = safeUrl(payload.imageUrl);
    if (imageUrl) { cardImage.src = imageUrl; cardImage.classList.remove('hidden'); }
    const backgroundMode = ['glass', 'solid', 'none'].includes(style.backgroundMode) ? style.backgroundMode : 'glass';
    const fontFamily = ['display', 'broadcast', 'serif', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'broadcast';
    const presentationMode = ['single', 'fade-carousel', 'credits-scroll', 'typewriter'].includes(payload.presentationMode) ? payload.presentationMode : 'single';
    card.dataset.background = backgroundMode;
    card.dataset.font = fontFamily;
    card.dataset.presentation = presentationMode;
    card.style.setProperty('--card-duration', `${boundedDuration(payload.durationMs, 8_000)}ms`);
    card.style.setProperty('--card-background', safeColor(style.backgroundColor, '#140d1f'));
    card.style.setProperty('--card-background-rendered', colorWithOpacity(style.backgroundColor, style.backgroundOpacity, '#140d1f', 0.94));
    card.style.setProperty('--card-accent', safeColor(style.accentColor, '#ffffff'));
    card.style.setProperty('--card-border', colorWithOpacity(style.accentColor, 0.36, '#ffffff', 0.18));
    card.style.setProperty('--card-text', safeColor(style.textColor, '#ffffff'));
    const fontSize = Number.isFinite(style.fontSize) ? Math.max(20, Math.min(72, style.fontSize)) : 36;
    card.style.setProperty('--card-title-size', `${Math.min(84, Math.round(fontSize * 1.25))}px`);
    card.style.setProperty('--card-text-size', `${fontSize}px`);
    cardTitle.textContent = title;
    if (presentationMode === 'typewriter' && text) {
      const words = text.split(/\s+/u).filter(Boolean);
      const revealDurationMs = boundedDuration(payload.revealDurationMs, boundedDuration(payload.durationMs, 8_000));
      let visible = 0;
      cardText.textContent = '';
      cardRevealTimer = setInterval(() => {
        visible += 1;
        cardText.textContent = words.slice(0, visible).join(' ');
        if (visible >= words.length) clearInterval(cardRevealTimer);
      }, Math.max(40, Math.floor(revealDurationMs / Math.max(1, words.length))));
    } else cardText.textContent = text;
    card.classList.remove('hidden');
    cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 8_000));
  }

  function showLabels(payload) {
    hideCard();
    hideTimer();
    hideWheel();
    clearMedia(activePlaybackId ? 'stopped' : undefined);
    const labels = payload.labels && typeof payload.labels === 'object' ? payload.labels : {};
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const keys = requestedLabel === 'all'
      ? ['follower', 'member', 'gift-membership', 'support', 'raid', 'reward', 'latest']
      : [requestedLabel];
    const entries = keys.map((key) => {
      const item = labels[key];
      if (!item || typeof item !== 'object') return undefined;
      const value = boundedText(item.value, 240);
      if (!value) return undefined;
      return { key, title: boundedText(item.title, 80, 'Latest Event'), value, platform: boundedText(item.platform, 32) };
    }).filter(Boolean);
    labelList.replaceChildren();
    for (const item of entries) {
      const row = document.createElement('article');
      row.className = 'stream-label';
      row.dataset.selected = item.key === requestedLabel ? 'true' : 'false';
      const title = document.createElement('strong');
      title.className = 'stream-label-title';
      title.textContent = item.title;
      title.classList.toggle('hidden', style.showLabelTitle === false);
      const value = document.createElement('span');
      value.className = 'stream-label-value';
      value.textContent = item.value;
      const platform = document.createElement('small');
      platform.className = 'stream-label-platform';
      platform.textContent = item.platform;
      platform.classList.toggle('hidden', style.showPlatform === false || !item.platform);
      row.append(title, value, platform);
      labelList.append(row);
    }
    const backgroundMode = ['glass', 'solid', 'none'].includes(style.backgroundMode) ? style.backgroundMode : 'glass';
    const fontFamily = ['display', 'broadcast', 'serif', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'broadcast';
    labelShell.dataset.view = requestedLabel;
    labelShell.dataset.background = backgroundMode;
    labelShell.dataset.font = fontFamily;
    labelShell.style.setProperty('--label-background', safeColor(style.backgroundColor, '#101820'));
    labelShell.style.setProperty('--label-background-rendered', colorWithOpacity(style.backgroundColor, style.backgroundOpacity, '#101820', 0.88));
    labelShell.style.setProperty('--label-accent', safeColor(style.accentColor, '#7ff5cc'));
    labelShell.style.setProperty('--label-text', safeColor(style.textColor, '#ffffff'));
    labelShell.style.setProperty('--label-font-size', `${Number.isFinite(style.fontSize) ? Math.max(18, Math.min(96, style.fontSize)) : 42}px`);
    labelShell.style.setProperty('--label-align', ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : 'left');
    labelShell.classList.toggle('hidden', entries.length === 0);
  }

  function showWheel(payload) {
    const options = Array.isArray(payload.options) ? payload.options.map((value) => boundedText(value, 80)).filter(Boolean).slice(0, 10) : [];
    const winnerIndex = Number.isInteger(payload.winnerIndex) ? payload.winnerIndex : -1;
    const sequence = Number.isInteger(payload.sequence) ? payload.sequence : -1;
    if (options.length < 2 || winnerIndex < 0 || winnerIndex >= options.length || sequence === wheelSequence) return;
    wheelSequence = sequence;
    hideCard(); hideTimer(); hideLabels(); clearMedia(activePlaybackId ? 'stopped' : undefined); hideWheel();
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const palette = Array.isArray(style.wheelColors)
      ? style.wheelColors.map((value) => safeColor(value, '')).filter(Boolean).slice(0, 10)
      : [];
    const colors = palette.length > 0 ? palette : ['#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#dc2626', '#2563eb'];
    const slice = 360 / options.length;
    const gradient = options.map((_option, index) => `${colors[index % colors.length]} ${index * slice}deg ${(index + 1) * slice}deg`).join(', ');
    const rotations = 6 + Math.max(0, Math.min(4, Math.floor(options.length / 3)));
    const landing = (360 - ((winnerIndex + 0.5) * slice % 360)) % 360;
    const finalRotation = rotations * 360 + landing;
    const spinDurationMs = boundedDuration(payload.spinDurationMs, 9_000);
    const winnerDurationMs = boundedDuration(payload.winnerDurationMs, 8_000);
    wheelShell.style.setProperty('--wheel-panel', safeColor(style.backgroundColor, '#101521'));
    wheelShell.style.setProperty('--wheel-text', safeColor(style.textColor, '#ffffff'));
    wheelShell.style.setProperty('--wheel-accent', safeColor(style.accentColor, '#ffd166'));
    wheelShell.style.setProperty('--wheel-winner', safeColor(style.winnerColor, '#7ff5cc'));
    wheelTitle.textContent = boundedText(payload.title, 80, 'SPIN THE WHEEL');
    wheelWinner.textContent = boundedText(payload.winner, 80, options[winnerIndex]);
    wheelResult.classList.remove('revealed');
    wheel.style.background = `conic-gradient(from -90deg, ${gradient})`;
    wheel.style.transition = `transform ${spinDurationMs}ms cubic-bezier(.11,.67,.08,1)`;
    wheelShell.style.setProperty('--wheel-option-size', `${options.length >= 9 ? 17 : options.length >= 7 ? 19 : options.length >= 5 ? 22 : 26}px`);
    wheelShell.style.setProperty('--wheel-option-width', options.length >= 9 ? 'clamp(70px, 16vmin, 118px)' : options.length >= 7 ? 'clamp(76px, 18vmin, 135px)' : 'clamp(82px, 21vmin, 160px)');
    options.forEach((option, index) => {
      const position = document.createElement('span');
      position.className = 'wheel-option-position';
      position.style.setProperty('--label-angle', `${index * slice + slice / 2}deg`);
      const label = document.createElement('span');
      label.className = 'wheel-option';
      label.textContent = option;
      label.style.setProperty('--label-angle', `${index * slice + slice / 2}deg`);
      label.style.transitionDuration = `${spinDurationMs}ms`;
      position.append(label);
      wheelLabels.append(position);
      const stud = document.createElement('i');
      stud.className = 'wheel-stud';
      stud.style.setProperty('--stud-angle', `${index * slice}deg`);
      wheelStuds.append(stud);
    });
    wheelShell.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wheel.style.transform = `rotate(${finalRotation}deg)`;
      wheelLabels.querySelectorAll('.wheel-option').forEach((label, index) => {
        const angle = index * slice + slice / 2;
        label.style.transform = `translate(-50%, -50%) rotate(${-angle - finalRotation}deg)`;
      });
    }));
    const startedAt = performance.now();
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / spinDurationMs);
      wheelPointer.classList.remove('ticking'); void wheelPointer.offsetWidth; wheelPointer.classList.add('ticking');
      if (progress < 0.98) wheelTickTimer = setTimeout(tick, Math.round(75 + 420 * progress * progress));
    };
    wheelTickTimer = setTimeout(tick, 90);
    wheelRevealTimer = setTimeout(() => wheelResult.classList.add('revealed'), spinDurationMs);
    wheelTimer = setTimeout(hideWheel, spinDurationMs + winnerDurationMs);
  }

  function reportLifecycle(phase, error) {
    if (!activePlaybackId) return;
    sendTransport({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId, rendererId, playbackId: activePlaybackId, phase, currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0, duration: Number.isFinite(media.duration) ? media.duration : 0, ...(error ? { error: String(error).slice(0, 300) } : {}) });
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
    embedMedia.removeAttribute('src');
    embedMedia.classList.add('hidden');
    media.classList.remove('hidden');
    embeddedPlayback = false;
    embeddedPlaybackKind = '';
    embeddedConfigured = false;
    embeddedConfigurationAttempts = 0;
    mediaTitle.textContent = '';
    mediaTitle.classList.add('hidden');
    mediaShell.classList.remove('fading');
    mediaShell.classList.add('hidden');
    activePlaybackId = '';
  }

  function stopMedia(payload = {}) {
    if (payload.fade !== true || mediaShell.classList.contains('hidden')) { clearMedia('stopped'); return; }
    clearTimeout(mediaTimer); clearTimeout(mediaFadeTimer); clearInterval(heartbeatTimer);
    reportLifecycle('stopped');
    media.pause();
    mediaShell.classList.add('fading');
    mediaFadeTimer = setTimeout(() => clearMedia(), mediaFadeMs);
  }

  function playMedia(payload) {
    const twitchEmbedUrl = safeTwitchClipEmbed(payload.embedUrl, payload.muted === true);
    const youtubeEmbedUrl = safeYouTubeEmbed(payload.embedUrl, payload.muted === true);
    const embedUrl = twitchEmbedUrl || youtubeEmbedUrl;
    const url = embedUrl || safeUrl(payload.url);
    const playbackId = typeof payload.playbackId === 'string' && /^[A-Za-z0-9._:-]{1,100}$/u.test(payload.playbackId) ? payload.playbackId : '';
    if (!url || !playbackId) return;
    // Recovery broadcasts and late OBS connections may deliver the same play message more than
    // once. It is an acknowledgement retry, not a request to seek back to zero. Reloading here
    // caused clips to stutter for a second and then appear to skip.
    if (activePlaybackId === playbackId) return;
    clearMedia(activePlaybackId ? 'stopped' : undefined);
    hideCard();
    hideTimer();
    activePlaybackId = playbackId;
    embeddedPlayback = Boolean(embedUrl);
    embeddedPlaybackKind = twitchEmbedUrl ? 'twitch-clip' : youtubeEmbedUrl ? 'youtube' : '';
    embeddedConfigured = false;
    embeddedConfigurationAttempts = 0;
    embeddedMuted = payload.muted === true;
    embeddedVolume = typeof payload.volume === 'number' && Number.isFinite(payload.volume) ? Math.max(0, Math.min(1, payload.volume)) : 1;
    if (embedUrl) {
      media.classList.add('hidden');
      embedMedia.classList.remove('hidden');
      embedMedia.src = embedUrl;
    } else {
      media.src = url;
      media.muted = payload.muted !== false;
      media.volume = typeof payload.volume === 'number' && Number.isFinite(payload.volume) ? Math.max(0, Math.min(1, payload.volume)) : 1;
    }
    const posterUrl = safeUrl(payload.posterUrl);
    if (posterUrl) media.poster = posterUrl; else media.removeAttribute('poster');
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 300) : '';
    mediaTitle.textContent = title;
    mediaTitle.classList.toggle('hidden', title.length === 0);
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    mediaShell.style.setProperty('--media-background', safeColor(style.backgroundColor, '#101820'));
    mediaShell.style.setProperty('--media-accent', safeColor(style.accentColor, '#7ff5cc'));
    mediaShell.style.setProperty('--media-text', safeColor(style.textColor, '#ffffff'));
    mediaShell.dataset.font = ['broadcast', 'display', 'serif', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'broadcast';
    mediaShell.classList.remove('fading');
    mediaShell.classList.remove('hidden');
    reportLifecycle('loading');
    pendingMediaDurationMs = payload.durationMs;
    // A blocked embed, offline browser source, or missing IFrame API event must never hold the
    // shared media slot forever. Once playback actually starts, the normal duration watchdog
    // replaces this short startup deadline.
    if (embeddedPlaybackKind === 'youtube') mediaTimer = setTimeout(() => clearMedia('timeout'), 20_000);
    if (!embedUrl) void startNativeMedia();
  }

  async function startNativeMedia() {
    try {
      await media.play();
    } catch (firstError) {
      // Chromium can reject unmuted autoplay before the browser source receives a user gesture.
      // Preserve visual playback by retrying muted; OBS creators can still route audio when its
      // browser runtime permits unmuted autoplay.
      if (!media.muted) {
        media.muted = true;
        try { await media.play(); return; } catch { /* Report the original useful policy error below. */ }
      }
      status.textContent = 'PLAYBACK BLOCKED';
      status.dataset.state = 'error';
      reportLifecycle('failed', firstError?.message || 'Playback blocked');
      clearMedia();
    }
  }

  function commandYouTubePlayer(func, args = []) {
    try { embedMedia.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: activePlaybackId }), 'https://www.youtube.com'); } catch { /* The duration watchdog still prevents a stuck player. */ }
  }

  function configureYouTubePlayer() {
    if (embeddedConfigured || embeddedConfigurationAttempts >= 3 || embeddedPlaybackKind !== 'youtube' || !activePlaybackId) return;
    embeddedConfigurationAttempts += 1;
    commandYouTubePlayer('setVolume', [Math.round(embeddedVolume * 100)]);
    commandYouTubePlayer(embeddedMuted ? 'mute' : 'unMute');
    commandYouTubePlayer('playVideo');
  }

  embedMedia.addEventListener('load', () => {
    if (!activePlaybackId || !embeddedPlayback || !embedMedia.getAttribute('src')) return;
    if (embeddedPlaybackKind === 'youtube') {
      try {
        embedMedia.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: activePlaybackId }), 'https://www.youtube.com');
        embedMedia.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onReady'], id: activePlaybackId }), 'https://www.youtube.com');
        embedMedia.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: activePlaybackId }), 'https://www.youtube.com');
      } catch { /* The bounded duration watchdog still prevents a stuck player. */ }
      return;
    }
    transportState('live');
    reportLifecycle('started');
    clearTimeout(mediaTimer);
    const durationWithGrace = Number.isInteger(pendingMediaDurationMs) ? pendingMediaDurationMs + 4_000 : undefined;
    mediaTimer = setTimeout(() => {
      if (!activePlaybackId || !embeddedPlayback) return;
      reportLifecycle('ended');
      mediaShell.classList.add('fading');
      mediaFadeTimer = setTimeout(() => clearMedia(), mediaFadeMs);
    }, boundedDuration(durationWithGrace, 64_000));
  });

  addEventListener('message', (message) => {
    if (embeddedPlaybackKind !== 'youtube' || !activePlaybackId || message.source !== embedMedia.contentWindow || !['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(message.origin)) return;
    let payload;
    try { payload = typeof message.data === 'string' ? JSON.parse(message.data) : message.data; } catch { return; }
    if (payload?.event === 'onReady' || payload?.event === 'infoDelivery') configureYouTubePlayer();
    const state = payload?.event === 'onStateChange' ? Number(payload.info) : payload?.event === 'infoDelivery' ? Number(payload.info?.playerState) : Number.NaN;
    if (state === 1) {
      embeddedConfigured = true;
      transportState('live'); reportLifecycle('started'); clearInterval(heartbeatTimer); heartbeatTimer = setInterval(() => reportLifecycle('heartbeat'), 10_000);
      clearTimeout(mediaTimer); const durationWithGrace = Number.isInteger(pendingMediaDurationMs) ? pendingMediaDurationMs + 15_000 : undefined;
      mediaTimer = setTimeout(() => clearMedia('timeout'), boundedDuration(durationWithGrace, 75_000));
    } else if (state === 0) {
      clearTimeout(mediaTimer); clearInterval(heartbeatTimer); reportLifecycle('ended'); mediaShell.classList.add('fading'); mediaFadeTimer = setTimeout(() => clearMedia(), mediaFadeMs);
    }
  });

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
    // Keep the final frame mounted during a short fade. Report the clean ending immediately so
    // the add-on's creator-configured pause includes this transition instead of starting after it.
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
    else if (event.topic === `${moduleId}.media.stop`) stopMedia(event.payload);
    else if (event.topic === `${moduleId}.timer.update`) showTimer(event.payload);
    else if (event.topic === `${moduleId}.timer.hide`) hideTimer();
    else if (event.topic === `${moduleId}.labels.update`) showLabels(event.payload);
    else if (event.topic === `${moduleId}.counter.update`) showCounter(event.payload);
    else if (event.topic === `${moduleId}.wheel.spin`) showWheel(event.payload);
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
      const worker = new SharedWorker('/overlay/worker-1.3.2.js', 'thsv-browser-overlay-1.3.2');
      sendTransport = (payload) => worker.port.postMessage({ kind: 'transport.send', payload });
      worker.port.addEventListener('message', (message) => message.data?.kind === 'transport.status' ? transportState(message.data.state) : receive(message.data));
      worker.port.start();
      addEventListener('pagehide', () => worker.port.postMessage({ kind: 'disconnect' }), { once: true });
      return;
    } catch { /* Browser sources without SharedWorker use one direct connection. */ }
  }
  connectDirectly();
})();
