(() => {
  'use strict';
  const aliases = Object.freeze({
    '/overlay/shoutouts': 'thsv.automated-shoutouts',
    '/overlay/clips': 'thsv.random-clip-player',
    '/overlay/subathon': 'thsv.subathon-timer',
    '/overlay/countdown': 'thsv.starting-soon-countdown',
    '/overlay/ad-break': 'thsv.ad-break-companion',
  });
  const moduleId = aliases[location.pathname] || location.pathname.slice('/overlay/addons/'.length);
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId)) return;
  const card = document.getElementById('card');
  const genericCard = document.getElementById('generic-card');
  const cardImage = document.getElementById('card-image');
  const cardTitle = document.getElementById('card-title');
  const cardText = document.getElementById('card-text');
  const spotlightCard = document.getElementById('spotlight-card');
  const spotlightAvatar = document.getElementById('spotlight-avatar');
  const spotlightAvatarFallback = document.getElementById('spotlight-avatar-fallback');
  const spotlightName = document.getElementById('spotlight-name');
  const spotlightPlatform = document.getElementById('spotlight-platform');
  const spotlightViewerType = document.getElementById('spotlight-viewer-type');
  const spotlightCategory = document.getElementById('spotlight-category');
  const spotlightFollow = document.getElementById('spotlight-follow');
  const spotlightBackName = document.getElementById('spotlight-back-name');
  const spotlightStats = document.getElementById('spotlight-stats');
  const spotlightBackPlatform = document.getElementById('spotlight-back-platform');
  const rollCallShell = document.getElementById('roll-call-shell');
  const rollCallTitle = document.getElementById('roll-call-title');
  const rollCallSubtitle = document.getElementById('roll-call-subtitle');
  const rollCallMonth = document.getElementById('roll-call-month');
  const rollCallPodium = document.getElementById('roll-call-podium');
  const rollCallRunners = document.getElementById('roll-call-runners');
  const firstFiveShell = document.getElementById('first-five-shell');
  const firstFiveTitle = document.getElementById('first-five-title');
  const firstFiveSubtitle = document.getElementById('first-five-subtitle');
  const firstFiveProgress = document.getElementById('first-five-progress');
  const firstFivePlaces = document.getElementById('first-five-places');
  const firstFiveMonth = document.getElementById('first-five-month');
  const firstFiveLeaders = document.getElementById('first-five-leaders');
  const fanCrownShell = document.getElementById('fan-crown-shell');
  const fanCrownEvent = document.getElementById('fan-crown-event');
  const fanCrownAvatar = document.getElementById('fan-crown-avatar');
  const fanCrownAvatarFallback = document.getElementById('fan-crown-avatar-fallback');
  const fanCrownStatus = document.getElementById('fan-crown-status');
  const fanCrownName = document.getElementById('fan-crown-name');
  const fanCrownPlatform = document.getElementById('fan-crown-platform');
  const fanCrownCost = document.getElementById('fan-crown-cost');
  const fanCrownCaptures = document.getElementById('fan-crown-captures');
  const fanCrownReign = document.getElementById('fan-crown-reign');
  const fanCrownSeason = document.getElementById('fan-crown-season');
  const fanCrownLeaders = document.getElementById('fan-crown-leaders');
  const chatPlayGameShell = document.getElementById('chat-play-game-shell');
  const chatPlayGameState = document.getElementById('chat-play-game-state');
  const chatPlayGameName = document.getElementById('chat-play-game-name');
  const chatPlayPrompt = document.getElementById('chat-play-prompt');
  const chatPlayChoices = document.getElementById('chat-play-choices');
  const chatPlayDuelists = document.getElementById('chat-play-duelists');
  const chatPlayChallenger = document.getElementById('chat-play-challenger');
  const chatPlayOpponent = document.getElementById('chat-play-opponent');
  const chatPlayHint = document.getElementById('chat-play-hint');
  const chatPlayInstruction = document.getElementById('chat-play-instruction');
  const chatPlayWinnerShell = document.getElementById('chat-play-winner-shell');
  const chatPlayWinnerGame = document.getElementById('chat-play-winner-game');
  const chatPlayWinnerAvatar = document.getElementById('chat-play-winner-avatar');
  const chatPlayWinnerAvatarFallback = document.getElementById('chat-play-winner-avatar-fallback');
  const chatPlayWinnerName = document.getElementById('chat-play-winner-name');
  const chatPlayWinnerPlatform = document.getElementById('chat-play-winner-platform');
  const chatPlayWinnerPoints = document.getElementById('chat-play-winner-points');
  const shoutoutShell = document.getElementById('shoutout-shell');
  const shoutoutReason = document.getElementById('shoutout-reason');
  const shoutoutAvatar = document.getElementById('shoutout-avatar');
  const shoutoutAvatarFallback = document.getElementById('shoutout-avatar-fallback');
  const shoutoutKicker = document.getElementById('shoutout-kicker');
  const shoutoutName = document.getElementById('shoutout-name');
  const shoutoutHandle = document.getElementById('shoutout-handle');
  const shoutoutCategory = document.getElementById('shoutout-category');
  const shoutoutCategoryLabel = document.getElementById('shoutout-category-label');
  const shoutoutMessage = document.getElementById('shoutout-message');
  const shoutoutUrl = document.getElementById('shoutout-url');
  const shoutoutViewers = document.getElementById('shoutout-viewers');
  const pollShell = document.getElementById('poll-shell');
  const pollQuestion = document.getElementById('poll-question');
  const pollOptions = document.getElementById('poll-options');
  const pollStatus = document.getElementById('poll-status');
  const pollTotal = document.getElementById('poll-total');
  const pollTimer = document.getElementById('poll-timer');
  const drawShell = document.getElementById('draw-shell');
  const drawConfetti = document.getElementById('draw-confetti');
  const drawStatus = document.getElementById('draw-status');
  const drawImage = document.getElementById('draw-image');
  const drawSeal = document.getElementById('draw-seal');
  const drawGiveaway = document.getElementById('draw-giveaway');
  const drawName = document.getElementById('draw-name');
  const drawPrize = document.getElementById('draw-prize');
  const drawMessage = document.getElementById('draw-message');
  const drawPlatform = document.getElementById('draw-platform');
  const drawCount = document.getElementById('draw-count');
  const mediaShell = document.getElementById('media-shell');
  const media = document.getElementById('media');
  const mediaCanvas = document.getElementById('media-canvas');
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
  const hydrationShell = document.getElementById('hydration-shell');
  const hydrationTitle = document.getElementById('hydration-title');
  const hydrationStatus = document.getElementById('hydration-status');
  const hydrationLiquid = document.getElementById('hydration-liquid');
  const hydrationTotal = document.getElementById('hydration-total');
  const hydrationGoal = document.getElementById('hydration-goal');
  const hydrationPercent = document.getElementById('hydration-percent');
  const hydrationProgress = document.getElementById('hydration-progress');
  const hydrationNext = document.getElementById('hydration-next');
  const hydrationNotice = document.getElementById('hydration-notice');
  const hydrationNoticeText = document.getElementById('hydration-notice-text');
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
  let timerHideTimer;
  let timerPreviewHeld = false;
  let cardRevealTimer;
  let mediaTimer;
  let mediaFadeTimer;
  let mediaStallTimer;
  let mediaTitleTimer;
  let nativePlaybackStarted = false;
  let mediaFetchController;
  let mediaObjectUrl = '';
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
  let hydrationCountdownTimer;
  let hydrationHideTimer;
  let pollCountdownTimer;
  let pollHideTimer;
  let pollTransitionTimer;
  let drawCycleTimer;
  let drawRevealTimer;
  let drawHideTimer;
  let firstFiveActivePlatform = '';
  let firstFiveGapTimer;
  let firstFiveGapMs = 2_000;
  let firstFiveQueue = [];
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
    clearTimeout(firstFiveGapTimer);
    firstFiveActivePlatform = '';
    firstFiveQueue = [];
    card.classList.add('hidden');
    card.removeAttribute('data-card-kind');
    genericCard.classList.remove('hidden');
    spotlightCard.classList.add('hidden');
    spotlightCard.removeAttribute('data-flip');
    cardImage.classList.add('hidden');
    cardImage.removeAttribute('src');
    cardTitle.textContent = '';
    cardText.textContent = '';
    spotlightAvatar.classList.add('hidden'); spotlightAvatar.removeAttribute('src'); spotlightAvatarFallback.classList.remove('hidden');
    spotlightName.textContent = ''; spotlightPlatform.textContent = ''; spotlightViewerType.textContent = '';
    spotlightCategory.textContent = ''; spotlightCategory.classList.add('hidden'); spotlightFollow.textContent = ''; spotlightFollow.removeAttribute('data-state');
    spotlightBackName.textContent = ''; spotlightStats.replaceChildren(); spotlightBackPlatform.textContent = '';
    rollCallShell.classList.add('hidden');
    rollCallPodium.replaceChildren();
    rollCallRunners.replaceChildren();
    firstFiveShell.classList.add('hidden'); firstFivePlaces.replaceChildren(); firstFiveLeaders.replaceChildren();
    fanCrownShell.classList.add('hidden'); fanCrownLeaders.replaceChildren(); fanCrownAvatar.classList.add('hidden'); fanCrownAvatar.removeAttribute('src'); fanCrownName.textContent = ''; fanCrownName.removeAttribute('data-length');
    chatPlayGameShell.classList.add('hidden'); chatPlayChoices.replaceChildren(); chatPlayDuelists.classList.add('hidden'); chatPlayHint.classList.add('hidden');
    chatPlayWinnerShell.classList.add('hidden'); chatPlayWinnerAvatar.classList.add('hidden'); chatPlayWinnerAvatar.removeAttribute('src'); chatPlayWinnerName.textContent = ''; chatPlayWinnerName.removeAttribute('data-length');
    shoutoutShell.classList.add('hidden'); shoutoutAvatar.classList.add('hidden'); shoutoutAvatar.removeAttribute('src'); shoutoutName.textContent = ''; shoutoutName.removeAttribute('data-length'); shoutoutViewers.classList.add('hidden');
    hidePoll();
    hideDraw();
  }

  function hideDraw() {
    clearInterval(drawCycleTimer); clearTimeout(drawRevealTimer); clearTimeout(drawHideTimer);
    drawShell.classList.add('hidden'); drawShell.classList.remove('draw-leaving'); drawConfetti.replaceChildren();
    drawImage.classList.add('hidden'); drawImage.removeAttribute('src'); drawName.textContent = ''; drawName.removeAttribute('data-length'); drawPrize.textContent = ''; drawMessage.textContent = '';
  }

  function fadeOutDraw() { drawShell.classList.add('draw-leaving'); drawHideTimer = setTimeout(hideDraw, 480); }

  function playDrawTone(enabled) {
    if (enabled !== true) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) return;
    try {
      const audio = new AudioContextClass(); const now = audio.currentTime;
      for (const [offset, frequency] of [[0, 523.25], [.11, 659.25], [.22, 783.99]]) { const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.0001, now + offset); gain.gain.exponentialRampToValueAtTime(.12, now + offset + .02); gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .22); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now + offset); oscillator.stop(now + offset + .24); }
      setTimeout(() => void audio.close(), 900);
    } catch { /* Browser-source autoplay policy may suppress optional tones. */ }
  }

  function addDrawConfetti(enabled) {
    drawConfetti.replaceChildren(); if (enabled !== true) return;
    for (let index = 0; index < 18; index += 1) { const piece = document.createElement('i'); piece.style.setProperty('--confetti-x', `${(index * 37) % 100}%`); piece.style.setProperty('--confetti-delay', `${(index % 6) * 45}ms`); piece.style.setProperty('--confetti-color', index % 3 === 0 ? 'var(--draw-accent)' : index % 3 === 1 ? '#7ff5cc' : '#ffffff'); drawConfetti.append(piece); }
  }

  function showVillageDraw(payload) {
    hideCard(); hideTimer(); hideLabels(); hideWheel();
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {}; const phase = payload.phase === 'winner' ? 'drawing' : 'open';
    const winner = payload.winner && typeof payload.winner === 'object' ? payload.winner : {};
    const winnerName = boundedText(winner.displayName, 100, 'Example Villager'); const winnerPlatform = boundedText(winner.platform, 20).toUpperCase();
    const prizeImage = style.showPrizeImage === false ? undefined : safeUrl(payload.imageUrl); const avatar = style.showWinnerAvatar === false ? undefined : safeUrl(winner.avatarUrl);
    drawShell.dataset.layout = style.layout === 'wide' ? 'wide' : 'compact'; drawShell.dataset.phase = phase; drawShell.dataset.font = ['display', 'broadcast', 'serif', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'broadcast';
    drawShell.style.setProperty('--draw-background', colorWithOpacity(style.backgroundColor, style.backgroundOpacity, '#10201b', .72)); drawShell.style.setProperty('--draw-accent', safeColor(style.accentColor, '#ffd166')); drawShell.style.setProperty('--draw-text', safeColor(style.textColor, '#ffffff'));
    drawGiveaway.textContent = boundedText(payload.giveawayName, 100, 'Village Giveaway'); drawPrize.textContent = boundedText(payload.prizeName, 160, 'Mystery Prize');
    drawStatus.textContent = phase === 'open' ? 'ENTRIES OPEN' : 'DRAWING…'; drawName.textContent = phase === 'open' ? 'Your ticket could be next' : 'Mixing the tickets…';
    drawMessage.textContent = phase === 'open' ? boundedText(payload.entryHint || payload.description, 220, 'Enter for a chance to win!') : 'One lucky villager will be revealed shortly.';
    drawPlatform.textContent = ''; drawCount.textContent = style.showEntryCount === false ? '' : `${Number.isSafeInteger(payload.entrantCount) ? payload.entrantCount : 0} villagers • ${Number.isSafeInteger(payload.ticketCount) ? payload.ticketCount : 0} tickets`;
    drawSeal.textContent = phase === 'open' ? '★' : '?'; drawImage.classList.add('hidden'); if (prizeImage) { drawImage.src = prizeImage; drawImage.classList.remove('hidden'); }
    drawShell.classList.remove('hidden', 'draw-leaving');
    clearTimeout(drawHideTimer);
    if (phase === 'open') { drawHideTimer = setTimeout(fadeOutDraw, boundedDuration(payload.durationMs, 12_000)); return; }
    const entrants = (Array.isArray(payload.entrants) ? payload.entrants : []).map((name) => boundedText(name, 80)).filter(Boolean).slice(0, 20); let cursor = 0;
    if (entrants.length) drawCycleTimer = setInterval(() => { drawName.textContent = entrants[cursor % entrants.length]; cursor += 1; }, 160);
    drawRevealTimer = setTimeout(() => {
      clearInterval(drawCycleTimer); drawShell.dataset.phase = 'winner'; drawStatus.textContent = 'WINNING TICKET'; drawName.textContent = winnerName; drawName.dataset.length = winnerName.length > 42 ? 'very-long' : winnerName.length > 28 ? 'long' : 'normal'; drawPrize.textContent = boundedText(payload.prizeName, 160, 'Mystery Prize'); drawMessage.textContent = boundedText(payload.winnerMessage, 160, 'The village has chosen!');
      drawPlatform.textContent = style.showPlatformBadge === false ? '' : winnerPlatform; drawSeal.textContent = [...winnerName][0]?.toUpperCase() || '★';
      if (avatar) { drawImage.src = avatar; drawImage.classList.remove('hidden'); }
      addDrawConfetti(style.showConfetti); playDrawTone(style.playWinnerTone); drawShell.classList.add('draw-winner-reveal'); setTimeout(() => drawShell.classList.remove('draw-winner-reveal'), 650);
      drawHideTimer = setTimeout(fadeOutDraw, boundedDuration(payload.durationMs, 12_000));
    }, Number.isInteger(payload.drawAnimationMs) ? Math.max(2_000, Math.min(10_000, payload.drawAnimationMs)) : 4_000);
  }

  function hidePoll() {
    clearInterval(pollCountdownTimer); clearTimeout(pollHideTimer); clearTimeout(pollTransitionTimer);
    pollShell.classList.add('hidden'); pollShell.classList.remove('poll-leaving', 'poll-result-enter'); pollOptions.replaceChildren();
  }

  function fadeOutPoll() {
    clearTimeout(pollTransitionTimer); pollShell.classList.add('poll-leaving');
    pollTransitionTimer = setTimeout(hidePoll, 420);
  }

  function pollOptionRow(option, winnerIndexes, style, closed) {
    if (!option || typeof option !== 'object') return undefined;
    const index = Number.isInteger(option.index) ? Math.max(1, Math.min(10, option.index)) : 1;
    const label = boundedText(option.label, 90); if (!label) return undefined;
    const votes = Number.isSafeInteger(option.votes) ? Math.max(0, Math.min(5000, option.votes)) : 0;
    const percentage = Number.isFinite(option.percentage) ? Math.max(0, Math.min(100, Math.round(option.percentage))) : 0;
    const row = document.createElement('div'); row.className = 'poll-option'; row.dataset.winner = closed && winnerIndexes.includes(index - 1) ? 'true' : 'false';
    const top = document.createElement('div'); top.className = 'poll-option-top';
    const number = document.createElement('span'); number.className = 'poll-option-number'; number.textContent = String(index);
    const name = document.createElement('strong'); name.className = 'poll-option-name'; name.textContent = label;
    const result = document.createElement('span'); result.className = 'poll-option-result';
    const parts = []; if (style.showPercentages !== false) parts.push(`${percentage}%`); if (style.showVoteCounts !== false) parts.push(`${votes}`); result.textContent = parts.join(' • ');
    top.append(number, name, result);
    const track = document.createElement('div'); track.className = 'poll-track'; const fill = document.createElement('div'); fill.className = 'poll-fill'; fill.style.width = `${percentage}%`; track.append(fill);
    row.append(top, track);
    if (style.showPlatformBreakdown === true && option.platforms && typeof option.platforms === 'object') {
      const breakdown = document.createElement('div'); breakdown.className = 'poll-platforms';
      for (const [platform, short] of [['twitch', 'TW'], ['youtube', 'YT'], ['kick', 'KI'], ['tiktok', 'TT']]) { const count = Number(option.platforms[platform]); if (Number.isSafeInteger(count) && count > 0) { const badge = document.createElement('span'); badge.textContent = `${short} ${count}`; breakdown.append(badge); } }
      if (breakdown.childElementCount) row.append(breakdown);
    }
    return row;
  }

  function updatePollClock(closesAt, closed, showTimer) {
    clearInterval(pollCountdownTimer);
    const render = () => {
      if (closed) { pollTimer.textContent = 'FINAL RESULT'; return; }
      if (showTimer === false) { pollTimer.textContent = ''; return; }
      const remaining = Date.parse(closesAt) - Date.now();
      if (!closesAt || !Number.isFinite(remaining)) { pollTimer.textContent = 'Closes manually'; return; }
      const seconds = Math.max(0, Math.ceil(remaining / 1000)); pollTimer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining`;
    };
    render(); if (!closed && closesAt) pollCountdownTimer = setInterval(render, 1000);
  }

  function renderPoll(payload) {
    hideCard(); hideTimer(); hideLabels(); hideWheel();
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const closed = payload.state === 'closed'; const options = Array.isArray(payload.options) ? payload.options.slice(0, 10) : [];
    const winners = Array.isArray(payload.winnerIndexes) ? payload.winnerIndexes.filter(Number.isSafeInteger).slice(0, 10) : [];
    pollQuestion.textContent = boundedText(payload.question, 180, 'Village poll');
    pollStatus.textContent = closed ? (winners.length > 1 ? 'TIE RESULT' : winners.length === 1 ? 'WINNER' : 'POLL CLOSED') : 'VOTING OPEN';
    pollTotal.textContent = `${Number.isSafeInteger(payload.totalVotes) ? Math.max(0, Math.min(5000, payload.totalVotes)) : 0} votes`;
    pollOptions.replaceChildren(...options.map((option) => pollOptionRow(option, winners, style, closed)).filter(Boolean));
    pollShell.dataset.layout = style.layout === 'full' ? 'full' : 'compact'; pollShell.dataset.state = closed ? 'closed' : 'open'; pollShell.dataset.transition = ['fade', 'slide', 'pop'].includes(style.transition) ? style.transition : 'slide';
    pollShell.style.setProperty('--poll-background', colorWithOpacity(style.backgroundColor, style.backgroundOpacity, '#111923', 0.72));
    pollShell.style.setProperty('--poll-accent', safeColor(style.accentColor, '#7ff5cc')); pollShell.style.setProperty('--poll-text', safeColor(style.textColor, '#ffffff'));
    pollShell.classList.remove('hidden'); updatePollClock(boundedText(payload.closesAt, 40), closed, style.showTimer);
    clearTimeout(pollHideTimer);
    if (closed || payload.preview === true) pollHideTimer = setTimeout(fadeOutPoll, boundedDuration(payload.durationMs, closed ? 12_000 : 60_000));
  }

  function showPoll(payload) {
    const changingToResult = payload.state === 'closed' && !pollShell.classList.contains('hidden') && pollShell.dataset.state === 'open';
    if (!changingToResult) { renderPoll(payload); return; }
    clearTimeout(pollHideTimer); clearInterval(pollCountdownTimer); clearTimeout(pollTransitionTimer);
    pollShell.classList.add('poll-leaving');
    pollTransitionTimer = setTimeout(() => {
      pollShell.classList.remove('poll-leaving'); renderPoll(payload); pollShell.classList.add('poll-result-enter');
      pollTransitionTimer = setTimeout(() => pollShell.classList.remove('poll-result-enter'), 480);
    }, 420);
  }

  function rollCallEntry(entry, fallbackRank) {
    if (!entry || typeof entry !== 'object') return undefined;
    const displayName = boundedText(entry.displayName, 80);
    if (!displayName) return undefined;
    return {
      rank: Number.isSafeInteger(entry.rank) ? Math.max(1, Math.min(99, entry.rank)) : fallbackRank,
      displayName,
      count: Number.isSafeInteger(entry.count) ? Math.max(0, Math.min(9999, entry.count)) : 0,
    };
  }

  function buildRollCallRow(entry, podium = false) {
    const row = document.createElement(podium ? 'article' : 'div');
    row.className = podium ? `roll-call-place roll-call-place-${entry.rank}` : 'roll-call-runner';
    const rank = document.createElement('span'); rank.className = 'roll-call-rank'; rank.textContent = `#${entry.rank}`;
    const name = document.createElement('strong'); name.className = 'roll-call-name'; name.textContent = entry.displayName;
    const count = document.createElement('span'); count.className = 'roll-call-count'; count.textContent = `${entry.count} ${entry.count === 1 ? 'check-in' : 'check-ins'}`;
    row.append(rank, name, count);
    return row;
  }

  function showRollCall(payload) {
    const leaders = (Array.isArray(payload.leaders) ? payload.leaders : [])
      .slice(0, 8).map((entry, index) => rollCallEntry(entry, index + 1)).filter(Boolean);
    rollCallTitle.textContent = boundedText(payload.headline || payload.title, 80, 'Village Roll Call');
    rollCallSubtitle.textContent = boundedText(payload.subtitle, 120, leaders.length ? 'Monthly check-in leaderboard' : 'The noticeboard is ready for its first villager');
    rollCallMonth.textContent = boundedText(payload.monthLabel, 40, 'CURRENT SEASON').toUpperCase();
    rollCallPodium.replaceChildren(...leaders.slice(0, 3).map((entry) => buildRollCallRow(entry, true)));
    rollCallRunners.replaceChildren(...leaders.slice(3).map((entry) => buildRollCallRow(entry, false)));
    rollCallRunners.classList.toggle('hidden', leaders.length <= 3);
    rollCallShell.dataset.mode = ['leaderboard', 'checkin', 'monthly-winner', 'preview'].includes(payload.mode) ? payload.mode : 'leaderboard';
    rollCallShell.classList.remove('hidden');
    cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 20_000));
  }

  function finishFirstFive() {
    clearTimeout(cardTimer);
    firstFiveShell.classList.add('hidden');
    firstFiveActivePlatform = '';
    const next = firstFiveQueue.shift();
    if (next) { firstFiveActivePlatform = '__gap__'; firstFiveGapTimer = setTimeout(() => renderFirstFive(next), firstFiveGapMs); }
  }

  function compactReign(claimedAt) {
    const elapsed = Date.now() - Date.parse(claimedAt);
    if (!Number.isFinite(elapsed) || elapsed < 0) return 'Just claimed';
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return 'Just claimed';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  function showFanCrown(payload) {
    const holder = payload.holder && typeof payload.holder === 'object' ? payload.holder : {};
    const held = payload.state !== 'open' && boundedText(holder.displayName, 100).length > 0;
    const displayName = held ? boundedText(holder.displayName, 100, 'Village Champion') : 'The crown is waiting';
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    fanCrownShell.dataset.state = held ? 'held' : 'open'; fanCrownShell.dataset.background = ['glass', 'solid', 'none'].includes(style.backgroundMode) ? style.backgroundMode : 'glass'; fanCrownShell.dataset.font = ['display', 'broadcast', 'serif', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'display';
    fanCrownShell.style.setProperty('--crown-background', colorWithOpacity(style.backgroundColor, style.backgroundOpacity, '#201335', .94)); fanCrownShell.style.setProperty('--crown-solid', safeColor(style.backgroundColor, '#201335')); fanCrownShell.style.setProperty('--crown-accent', safeColor(style.accentColor, '#f4cc63')); fanCrownShell.style.setProperty('--crown-text', safeColor(style.textColor, '#ffffff'));
    fanCrownEvent.textContent = boundedText(payload.eventTitle || payload.title, 50, held ? 'CROWN CAPTURED' : 'CROWN AVAILABLE'); fanCrownStatus.textContent = held ? 'CURRENT CROWN HOLDER' : 'WHO WILL CLAIM IT?';
    fanCrownName.textContent = displayName; fanCrownName.dataset.length = displayName.length > 44 ? 'very-long' : displayName.length > 28 ? 'long' : 'normal';
    fanCrownPlatform.textContent = held ? boundedText(holder.platform, 20, 'viewer').toUpperCase() : 'OPEN TO THE VILLAGE';
    fanCrownCost.textContent = `${Number.isSafeInteger(payload.currentCost) ? Math.max(0, payload.currentCost).toLocaleString('en-US') : '0'} PTS`;
    fanCrownCaptures.textContent = held && Number.isSafeInteger(holder.captures) ? Math.max(0, holder.captures).toLocaleString('en-US') : '0'; fanCrownReign.textContent = held ? compactReign(boundedText(holder.claimedAt, 40)) : '—';
    fanCrownSeason.textContent = `${boundedText(payload.seasonMonth, 20, 'CURRENT SEASON').toUpperCase()} LEADERS`;
    const avatar = held ? safeUrl(holder.avatarUrl || payload.imageUrl) : undefined;
    if (avatar) { fanCrownAvatar.src = avatar; fanCrownAvatar.classList.remove('hidden'); fanCrownAvatarFallback.classList.add('hidden'); } else { fanCrownAvatar.classList.add('hidden'); fanCrownAvatar.removeAttribute('src'); fanCrownAvatarFallback.classList.remove('hidden'); fanCrownAvatarFallback.textContent = [...displayName][0]?.toUpperCase() || 'V'; }
    const leaderNodes = (Array.isArray(payload.leaders) ? payload.leaders : []).slice(0, 3).map((entry, index) => { const chip = document.createElement('span'); chip.className = 'fan-crown-leader'; chip.textContent = `#${Number.isInteger(entry.rank) ? entry.rank : index + 1} ${boundedText(entry.displayName, 50, 'Villager')} · ${Number.isSafeInteger(entry.totalSpent) ? entry.totalSpent.toLocaleString('en-US') : 0} pts`; return chip; });
    fanCrownLeaders.replaceChildren(...leaderNodes); fanCrownShell.classList.remove('hidden'); cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 20_000));
  }

  function showFirstFive(payload) {
    const platform = boundedText(payload.platform, 20, 'twitch').toLowerCase();
    if (firstFiveActivePlatform) {
      if (firstFiveActivePlatform === platform && !firstFiveShell.classList.contains('hidden')) { renderFirstFive(payload, true); return; }
      const existing = firstFiveQueue.findIndex((item) => boundedText(item.platform, 20, 'twitch').toLowerCase() === platform);
      if (existing >= 0) firstFiveQueue[existing] = payload;
      else if (firstFiveQueue.length < 4) firstFiveQueue.push(payload);
      return;
    }
    renderFirstFive(payload);
  }

  function renderFirstFive(payload, updating = false) {
    const queued = firstFiveQueue;
    if (!updating) { hideCard(); firstFiveQueue = queued; }
    firstFiveActivePlatform = boundedText(payload.platform, 20, 'twitch').toLowerCase();
    firstFiveGapMs = Math.max(1_000, Math.min(10_000, Number.isInteger(payload.queueGapMs) ? payload.queueGapMs : 2_000));
    const claims = (Array.isArray(payload.placements) ? payload.placements : []).filter((item) => item && typeof item === 'object').slice(0, 5);
    const claimAt = (position) => claims.find((item) => Number(item.position) === position);
    firstFiveTitle.textContent = boundedText(payload.headline, 50, 'First Five');
    firstFiveSubtitle.textContent = boundedText(payload.subtitle, 100, claims.length >= 5 ? 'The arrival board is complete' : 'Who will arrive next?');
    firstFiveProgress.textContent = `${claims.length} / 5`;
    firstFiveMonth.textContent = `${boundedText(payload.monthLabel, 30, 'CURRENT MONTH').toUpperCase()} LEADERS`;
    const places = [];
    for (let position = 1; position <= 5; position += 1) {
      const claim = claimAt(position); const row = document.createElement('article'); row.className = 'first-five-place'; row.dataset.filled = claim ? 'true' : 'false';
      const badge = document.createElement('span'); badge.className = 'first-five-rank'; badge.textContent = String(position).padStart(2, '0');
      const copy = document.createElement('div'); copy.className = 'first-five-copy'; const label = document.createElement('small'); label.textContent = `${['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH'][position - 1]} ARRIVAL`;
      const name = document.createElement('strong'); name.textContent = claim ? boundedText(claim.displayName, 100, 'Villager') : 'Waiting for a villager'; copy.append(label, name);
      const platform = document.createElement('span'); platform.className = 'first-five-platform'; platform.textContent = claim ? boundedText(claim.platform, 20, 'viewer').toUpperCase() : 'OPEN';
      row.append(badge, copy, platform); places.push(row);
    }
    firstFivePlaces.replaceChildren(...places);
    const leaderNodes = (Array.isArray(payload.leaders) ? payload.leaders : []).slice(0, 3).map((entry, index) => {
      const chip = document.createElement('span'); chip.className = 'first-five-leader'; chip.textContent = `#${Number.isInteger(entry.rank) ? entry.rank : index + 1} ${boundedText(entry.displayName, 50, 'Villager')} - ${Number.isInteger(entry.points) ? entry.points : 0} pts`; return chip;
    });
    firstFiveLeaders.replaceChildren(...leaderNodes); firstFiveShell.classList.remove('hidden');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(finishFirstFive, boundedDuration(payload.durationMs, 30_000));
  }

  function hideTimer(payload = {}) {
    if (timerPreviewHeld && payload.force !== true) return;
    timerPreviewHeld = false;
    clearTimeout(timerHideTimer);
    if (timerShell.classList.contains('hidden')) {
      timerShell.removeAttribute('style'); timerShell.dataset.state = 'idle'; timerShell.dataset.variant = '';
      return;
    }
    timerShell.classList.add('timer-fading');
    timerHideTimer = setTimeout(() => {
      timerShell.classList.add('hidden'); timerShell.classList.remove('timer-fading');
      timerShell.removeAttribute('style'); timerShell.dataset.state = 'idle'; timerShell.dataset.variant = '';
    }, 360);
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

  function hideHydration() {
    clearInterval(hydrationCountdownTimer);
    clearTimeout(hydrationHideTimer);
    hydrationCountdownTimer = undefined;
    hydrationHideTimer = undefined;
    hydrationShell.classList.add('hidden');
    hydrationNotice.classList.add('hidden');
  }

  function showHydration(payload) {
    if (payload.visible === false) return hideHydration();
    hideCard(); hideTimer({ force: true }); hideLabels(); hideCounter(); hideWheel(); hidePoll();
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    const total = Number.isFinite(payload.totalOunces) ? Math.max(0, Math.min(10_000, payload.totalOunces)) : 0;
    const goal = Number.isFinite(payload.goalOunces) ? Math.max(1, Math.min(512, payload.goalOunces)) : 64;
    const percentage = Math.max(0, Math.min(100, Number.isFinite(payload.percentage) ? payload.percentage : total / goal * 100));
    hydrationShell.dataset.container = ['bottle', 'glass', 'water-tower'].includes(style.containerStyle) ? style.containerStyle : 'bottle';
    hydrationShell.dataset.background = ['glass', 'solid', 'none'].includes(style.backgroundMode) ? style.backgroundMode : 'glass';
    hydrationShell.style.setProperty('--hydration-background', safeColor(style.backgroundColor, '#0b1720'));
    hydrationShell.style.setProperty('--hydration-opacity', `${String(Math.round((Number.isFinite(style.backgroundOpacity) ? Math.max(0, Math.min(1, style.backgroundOpacity)) : .9) * 100))}%`);
    hydrationShell.style.setProperty('--hydration-water', safeColor(style.waterColor, '#55d6ff'));
    hydrationShell.style.setProperty('--hydration-highlight', safeColor(style.waterHighlightColor, '#b8f3ff'));
    hydrationShell.style.setProperty('--hydration-accent', safeColor(style.accentColor, '#7ff5cc'));
    hydrationShell.style.setProperty('--hydration-text', safeColor(style.textColor, '#ffffff'));
    hydrationShell.style.setProperty('--hydration-muted', safeColor(style.mutedColor, '#c9e7ef'));
    hydrationLiquid.style.height = `${percentage}%`;
    hydrationTotal.textContent = String(Math.round(total * 10) / 10);
    hydrationGoal.textContent = String(Math.round(goal * 10) / 10);
    hydrationPercent.textContent = `${String(Math.round(percentage))}%`;
    hydrationProgress.style.width = `${percentage}%`;
    hydrationTitle.textContent = boundedText(payload.title, 80, 'Water Goal');
    hydrationStatus.textContent = payload.live === true ? 'LIVE' : payload.templatePreview === true ? 'PREVIEW' : 'READY';
    hydrationShell.classList.toggle('hydration-hide-numbers', payload.showNumbers === false);
    const notice = payload.notice && typeof payload.notice === 'object' ? boundedText(payload.notice.text, 300) : '';
    hydrationNoticeText.textContent = notice;
    hydrationNotice.classList.toggle('hidden', notice.length === 0);
    hydrationNotice.dataset.kind = boundedText(payload.notice?.kind, 20);
    clearInterval(hydrationCountdownTimer);
    const updateCountdown = () => {
      const nextAt = Number(payload.nextReminderAt);
      if (payload.showNextReminder === false) { hydrationNext.classList.add('hidden'); return; }
      hydrationNext.classList.remove('hidden');
      if (!Number.isFinite(nextAt) || nextAt <= Date.now()) { hydrationNext.textContent = payload.live === true ? 'Reminder due soon' : 'Starts when you go live'; return; }
      const minutes = Math.max(1, Math.ceil((nextAt - Date.now()) / 60_000));
      hydrationNext.textContent = `Next reminder in ${String(minutes)} min`;
    };
    updateCountdown(); hydrationCountdownTimer = setInterval(updateCountdown, 15_000);
    hydrationShell.classList.remove('hidden');
    clearTimeout(hydrationHideTimer);
    if (payload.templatePreview !== true) hydrationHideTimer = setTimeout(hideHydration, Math.max(1_000, Math.min(120_000, Number(payload.durationMs) || 10_000)));
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

  function showChatPlayGame(payload) {
    const gameKind = ['trivia', 'unscramble', 'duel'].includes(payload.gameKind) ? payload.gameKind : 'trivia';
    const gameName = boundedText(payload.gameName, 80, gameKind);
    chatPlayGameShell.dataset.game = gameKind;
    chatPlayGameState.textContent = gameKind === 'duel' ? 'CHALLENGE OPEN' : 'ROUND OPEN';
    chatPlayGameName.textContent = gameName;
    chatPlayPrompt.textContent = boundedText(payload.prompt, 300);
    chatPlayPrompt.classList.toggle('hidden', !chatPlayPrompt.textContent);
    chatPlayChoices.replaceChildren();
    const choices = Array.isArray(payload.choices) ? payload.choices.slice(0, 6) : [];
    choices.forEach((choice, index) => { const item = document.createElement('span'); item.textContent = `${index + 1}. ${boundedText(choice, 100)}`; chatPlayChoices.append(item); });
    chatPlayChoices.classList.toggle('hidden', choices.length === 0);
    const challenger = boundedText(payload.challenger, 100); const opponent = boundedText(payload.opponent, 100);
    chatPlayDuelists.classList.toggle('hidden', !challenger || !opponent); chatPlayChallenger.textContent = challenger; chatPlayOpponent.textContent = opponent;
    const hint = boundedText(payload.hint, 180); chatPlayHint.textContent = hint ? `Hint: ${hint}` : ''; chatPlayHint.classList.toggle('hidden', !hint);
    chatPlayInstruction.textContent = boundedText(payload.instruction, 120, 'Play in chat');
    chatPlayGameShell.classList.remove('hidden');
    if (payload.sticky !== true) cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 300_000));
  }

  function showChatPlayWinner(payload) {
    const winner = payload.winner && typeof payload.winner === 'object' ? payload.winner : {};
    const displayName = boundedText(winner.displayName, 100, 'Viewer');
    const platform = boundedText(winner.platform, 20, 'twitch').toUpperCase();
    const avatarUrl = safeUrl(winner.avatarUrl);
    chatPlayWinnerGame.textContent = boundedText(payload.gameName, 80, 'Chat Play').toUpperCase();
    chatPlayWinnerName.textContent = displayName;
    chatPlayWinnerName.dataset.length = displayName.length > 42 ? 'very-long' : displayName.length > 25 ? 'long' : 'normal';
    chatPlayWinnerPlatform.textContent = platform;
    chatPlayWinnerPoints.textContent = `+${Number.isInteger(payload.points) ? Math.max(0, Math.min(100_000, payload.points)).toLocaleString() : '0'}`;
    chatPlayWinnerAvatarFallback.textContent = [...displayName][0]?.toUpperCase() || 'V';
    if (avatarUrl) { chatPlayWinnerAvatar.src = avatarUrl; chatPlayWinnerAvatar.classList.remove('hidden'); chatPlayWinnerAvatarFallback.classList.add('hidden'); }
    else { chatPlayWinnerAvatar.classList.add('hidden'); chatPlayWinnerAvatarFallback.classList.remove('hidden'); }
    chatPlayWinnerShell.classList.remove('hidden');
    if (payload.sticky !== true) cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 10_000));
  }

  function showShoutoutSpotlight(payload) {
    const creator = payload.creator && typeof payload.creator === 'object' ? payload.creator : {};
    const displayName = boundedText(creator.displayName, 100, 'Featured Creator');
    const userName = boundedText(creator.userName, 80);
    const platform = ['twitch', 'youtube', 'kick', 'tiktok'].includes(payload.platform) ? payload.platform : 'twitch';
    const presentation = payload.presentation === 'welcome' ? 'welcome' : 'creator';
    const category = boundedText(creator.category, 140, presentation === 'welcome' ? `${platform.toUpperCase()} COMMUNITY` : `Live on ${platform}`);
    const trigger = ['raid', 'first-chat', 'manual'].includes(payload.trigger) ? payload.trigger : 'manual';
    const avatarUrl = safeUrl(creator.avatarUrl);
    const viewers = Number.isInteger(creator.viewers) ? Math.max(0, Math.min(10_000_000, creator.viewers)) : 0;
    shoutoutShell.dataset.trigger = trigger; shoutoutShell.dataset.platform = platform; shoutoutShell.dataset.presentation = presentation;
    shoutoutReason.textContent = trigger === 'raid' ? 'RAID WELCOME' : presentation === 'welcome' ? 'NEW VILLAGER' : trigger === 'first-chat' ? 'CREATOR DISCOVERED' : 'CREATOR SPOTLIGHT';
    shoutoutKicker.textContent = presentation === 'welcome' ? 'WELCOME TO THE VILLAGE' : 'GO SHOW THEM SOME LOVE';
    shoutoutName.textContent = displayName;
    shoutoutName.dataset.length = displayName.length > 28 ? 'very-long' : displayName.length > 16 ? 'long' : 'normal';
    shoutoutHandle.textContent = userName ? `@${userName}` : '@creator';
    shoutoutCategoryLabel.textContent = presentation === 'welcome' ? 'JOINING FROM' : 'STREAMING';
    shoutoutCategory.textContent = category;
    shoutoutMessage.textContent = boundedText(payload.text, 500);
    shoutoutMessage.classList.toggle('hidden', !shoutoutMessage.textContent);
    shoutoutUrl.textContent = presentation === 'welcome' ? `${platform.toUpperCase()} WELCOME` : boundedText(creator.channelUrl, 180, userName ? `${platform}.tv/${userName}` : platform);
    shoutoutAvatarFallback.textContent = [...displayName][0]?.toUpperCase() || 'V';
    if (avatarUrl) { shoutoutAvatar.src = avatarUrl; shoutoutAvatar.classList.remove('hidden'); shoutoutAvatarFallback.classList.add('hidden'); }
    else { shoutoutAvatar.classList.add('hidden'); shoutoutAvatarFallback.classList.remove('hidden'); }
    if (trigger === 'raid' && viewers > 0) { shoutoutViewers.textContent = `${viewers.toLocaleString()} RAIDERS`; shoutoutViewers.classList.remove('hidden'); }
    else { shoutoutViewers.textContent = ''; shoutoutViewers.classList.add('hidden'); }
    shoutoutShell.classList.remove('hidden');
    if (payload.sticky !== true) cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 10_000));
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
    timerPreviewHeld = payload.preview === true;
    const remaining = Number.isInteger(payload.remainingSeconds) && payload.remainingSeconds >= 0 ? payload.remainingSeconds : 0;
    const maximum = Number.isInteger(payload.maximumSeconds) && payload.maximumSeconds > 0 ? payload.maximumSeconds : 1;
    const computedTime = `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    const livePlatforms = Array.isArray(payload.livePlatforms) ? payload.livePlatforms.filter((value) => typeof value === 'string').slice(0, 4) : [];
    timerLabel.textContent = boundedText(payload.label, 80, 'TIMER') || 'TIMER';
    const completed = payload.completed === true;
    timerTime.textContent = completed ? (boundedText(payload.completionMessage, 200, 'The stream is starting now!') || 'The stream is starting now!')
      : (/^(?:\d{2,4}:)?\d{2}:\d{2}$/u.test(payload.remainingText) ? payload.remainingText : computedTime);
    timerTime.classList.toggle('timer-complete-message', completed);
    const badgeText = boundedText(payload.badgeText, 32);
    timerBadge.textContent = badgeText || (completed ? 'COMPLETE' : payload.running === true ? 'RUNNING' : payload.live === true ? 'PAUSED' : 'READY');
    timerReason.textContent = boundedText(payload.lastReason, 120, 'Waiting for an update').replace(/-/gu, ' ');
    timerPlatforms.textContent = boundedText(payload.contextText, 100) || (livePlatforms.length > 0 ? livePlatforms.join(' + ') : 'Ready for scene control');
    timerProgress.style.width = `${Math.max(0, Math.min(100, remaining / maximum * 100)).toFixed(2)}%`;
    timerProgressTrack.classList.toggle('hidden', style.showProgressBar === false);
    const backgroundMode = ['glass', 'solid', 'none'].includes(style.backgroundMode) ? style.backgroundMode : 'glass';
    const fontFamily = ['display', 'broadcast', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'display';
    timerShell.dataset.state = completed ? 'complete' : payload.critical === true ? 'critical' : payload.warning === true ? 'warning' : payload.running === true ? 'running' : 'paused';
    timerShell.dataset.variant = payload.variant === 'ad-break' ? 'ad-break' : '';
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
    clearTimeout(timerHideTimer);
    timerShell.classList.remove('hidden', 'timer-fading');
    playCompletionTone(payload);
  }

  function showCard(payload) {
    if (payload.cardKind === 'first-five') return showFirstFive(payload);
    hideCard();
    hideTimer();
    hideLabels();
    hideWheel();
    if (payload.cardKind === 'village-roll-call') return showRollCall(payload);
    if (payload.cardKind === 'village-polls') return showPoll(payload);
    if (payload.cardKind === 'village-draw') return showVillageDraw(payload);
    if (payload.cardKind === 'fan-crown') return showFanCrown(payload);
    if (payload.cardKind === 'chat-play-game') return showChatPlayGame(payload);
    if (payload.cardKind === 'chat-play-winner') return showChatPlayWinner(payload);
    if (payload.cardKind === 'shoutout-spotlight') return showShoutoutSpotlight(payload);
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
    if (payload.cardKind === 'viewer-spotlight') {
      const front = payload.front && typeof payload.front === 'object' ? payload.front : {};
      const displayName = boundedText(front.displayName, 100, title || 'Viewer');
      const platformLabel = boundedText(front.platformLabel, 30, 'Platform');
      const viewerType = boundedText(front.viewerType, 30, 'Viewer');
      const category = boundedText(front.category, 140);
      const followStatus = ['following', 'not-following', 'unknown'].includes(front.followStatus) ? front.followStatus : 'unknown';
      const spotlightImageUrl = safeUrl(front.imageUrl || payload.imageUrl);
      const statistics = Array.isArray(payload.stats) ? payload.stats.slice(0, 10) : [];
      genericCard.classList.add('hidden'); spotlightCard.classList.remove('hidden');
      spotlightCard.dataset.flip = payload.flipToStats === true && statistics.length > 0 ? 'true' : 'false'; card.dataset.cardKind = 'viewer-spotlight';
      card.style.setProperty('--spotlight-flip-delay', `${Math.max(1800, Math.min(7000, Math.round(boundedDuration(payload.durationMs, 8_000) * 0.32)))}ms`);
      if (spotlightImageUrl) { spotlightAvatar.src = spotlightImageUrl; spotlightAvatar.classList.remove('hidden'); spotlightAvatarFallback.classList.add('hidden'); }
      spotlightAvatarFallback.textContent = [...displayName][0]?.toUpperCase() || 'V'; spotlightName.textContent = displayName; spotlightBackName.textContent = displayName;
      spotlightPlatform.textContent = platformLabel; spotlightBackPlatform.textContent = `${platformLabel} • ${viewerType}`; spotlightViewerType.textContent = viewerType;
      if (category) { spotlightCategory.textContent = `Active category: ${category}`; spotlightCategory.classList.remove('hidden'); }
      spotlightFollow.dataset.state = followStatus; spotlightFollow.textContent = followStatus === 'following' ? 'Following the channel' : followStatus === 'not-following' ? 'Not following yet' : 'Follow status unavailable';
      for (const statistic of statistics) {
        if (!statistic || typeof statistic !== 'object') continue;
        const label = boundedText(statistic.label, 40); const value = boundedText(statistic.value, 100); if (!label || !value) continue;
        const item = document.createElement('div'); item.className = 'spotlight-stat';
        const name = document.createElement('span'); name.className = 'spotlight-stat-name'; name.textContent = label;
        const amount = document.createElement('span'); amount.className = 'spotlight-stat-value'; amount.textContent = value; item.append(name, amount); spotlightStats.append(item);
      }
    } else { genericCard.classList.remove('hidden'); spotlightCard.classList.add('hidden'); cardTitle.textContent = title; }
    if (payload.cardKind !== 'viewer-spotlight' && presentationMode === 'typewriter' && text) {
      const words = text.split(/\s+/u).filter(Boolean);
      const revealDurationMs = boundedDuration(payload.revealDurationMs, boundedDuration(payload.durationMs, 8_000));
      let visible = 0;
      cardText.textContent = '';
      cardRevealTimer = setInterval(() => {
        visible += 1;
        cardText.textContent = words.slice(0, visible).join(' ');
        if (visible >= words.length) clearInterval(cardRevealTimer);
      }, Math.max(40, Math.floor(revealDurationMs / Math.max(1, words.length))));
    } else if (payload.cardKind !== 'viewer-spotlight') cardText.textContent = text;
    card.classList.remove('hidden');
    cardTimer = setTimeout(hideCard, boundedDuration(payload.durationMs, 8_000));
  }

  function showQueue(payload) {
    const entries = Array.isArray(payload.entries) ? payload.entries.slice(0, 20) : [];
    const total = Number.isSafeInteger(payload.count) ? Math.max(entries.length, Math.min(200, payload.count)) : entries.length;
    const statusValue = boundedText(payload.status, 20, 'closed').toUpperCase();
    const summary = entries.length === 0
      ? 'No viewers are waiting.'
      : `${entries.map((entry, index) => {
        const position = Number.isSafeInteger(entry?.position) ? entry.position : index + 1;
        const name = boundedText(entry?.displayName, 100, 'Viewer') || 'Viewer';
        const platform = boundedText(entry?.platform, 20).toUpperCase();
        const stateValue = boundedText(entry?.state, 20, 'waiting');
        const gamertag = boundedText(entry?.gamertag, 80);
        return `${position}. ${name}${platform ? ` (${platform})` : ''}${gamertag ? ` - ${gamertag}` : ''}${stateValue !== 'waiting' ? ` - ${stateValue}` : ''}`;
      }).join(' • ')}${total > entries.length ? ` • +${total - entries.length} more waiting` : ''}`;
    showCard({
      title: `VIEWER LOBBY • ${statusValue} • ${total} ${total === 1 ? 'VIEWER' : 'VIEWERS'}`,
      text: summary,
      durationMs: 3_600_000,
      style: payload.style,
    });
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

  function stopMediaCanvas() {
    mediaShell.classList.remove('media-canvas-active');
    mediaCanvas.classList.add('hidden');
  }

  function clearMedia(phase) {
    clearTimeout(mediaTimer);
    clearTimeout(mediaFadeTimer);
    clearTimeout(mediaStallTimer);
    clearTimeout(mediaTitleTimer);
    mediaFetchController?.abort();
    mediaFetchController = undefined;
    pendingMediaDurationMs = undefined;
    nativePlaybackStarted = false;
    stopMediaCanvas();
    clearInterval(heartbeatTimer);
    if (phase) reportLifecycle(phase);
    media.pause();
    media.removeAttribute('src');
    media.load();
    if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = '';
    embedMedia.removeAttribute('src');
    embedMedia.classList.add('hidden');
    media.classList.remove('hidden');
    embeddedPlayback = false;
    embeddedPlaybackKind = '';
    embeddedConfigured = false;
    embeddedConfigurationAttempts = 0;
    mediaTitle.textContent = '';
    mediaTitle.classList.remove('media-title-live');
    mediaTitle.classList.add('hidden');
    mediaShell.classList.remove('fading');
    mediaShell.classList.remove('media-playing');
    mediaShell.classList.remove('media-template-preview');
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
    if (payload.templatePreview === true) {
      clearMedia(activePlaybackId ? 'stopped' : undefined); hideCard(); hideTimer(); hideLabels(); hideCounter(); hideWheel();
      const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
      clearTimeout(mediaTitleTimer);
      mediaTitle.textContent = boundedText(payload.title, 300, 'MEDIA PREVIEW'); mediaTitle.classList.remove('hidden', 'media-title-live');
      mediaShell.style.setProperty('--media-background', safeColor(style.backgroundColor, '#101820'));
      mediaShell.style.setProperty('--media-accent', safeColor(style.accentColor, '#7ff5cc'));
      mediaShell.style.setProperty('--media-text', safeColor(style.textColor, '#ffffff'));
      mediaShell.dataset.font = ['broadcast', 'display', 'serif', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'broadcast';
      mediaShell.classList.remove('hidden', 'fading', 'media-playing'); mediaShell.classList.add('media-template-preview');
      return;
    }
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
      media.preload = 'auto';
      media.src = url;
      media.load();
      media.muted = payload.muted !== false;
      media.volume = typeof payload.volume === 'number' && Number.isFinite(payload.volume) ? Math.max(0, Math.min(1, payload.volume)) : 1;
    }
    const posterUrl = safeUrl(payload.posterUrl);
    if (posterUrl) media.poster = posterUrl; else media.removeAttribute('poster');
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 300) : '';
    clearTimeout(mediaTitleTimer);
    mediaTitle.textContent = title;
    mediaTitle.classList.toggle('media-title-live', title.length > 0);
    mediaTitle.classList.toggle('hidden', title.length === 0);
    if (title.length > 0) mediaTitleTimer = setTimeout(() => mediaTitle.classList.add('hidden'), 4_500);
    const style = payload.style && typeof payload.style === 'object' ? payload.style : {};
    mediaShell.style.setProperty('--media-background', safeColor(style.backgroundColor, '#101820'));
    mediaShell.style.setProperty('--media-accent', safeColor(style.accentColor, '#7ff5cc'));
    mediaShell.style.setProperty('--media-text', safeColor(style.textColor, '#ffffff'));
    mediaShell.dataset.font = ['broadcast', 'display', 'serif', 'mono'].includes(style.fontFamily) ? style.fontFamily : 'broadcast';
    mediaShell.classList.remove('fading');
    mediaShell.classList.remove('media-playing');
    mediaShell.classList.remove('hidden');
    reportLifecycle('loading');
    pendingMediaDurationMs = payload.durationMs;
    // A blocked embed, offline browser source, or missing IFrame API event must never hold the
    // shared media slot forever. Once playback actually starts, the normal duration watchdog
    // replaces this short startup deadline.
    if (embeddedPlaybackKind === 'youtube') mediaTimer = setTimeout(() => clearMedia('timeout'), 20_000);
    if (!embedUrl) void startNativeMedia(playbackId, url);
  }

  function nativeMediaIsFullyBuffered() {
    if (media.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return true;
    if (!Number.isFinite(media.duration) || media.duration <= 0 || media.buffered.length === 0) return false;
    return media.buffered.end(media.buffered.length - 1) >= media.duration - 0.25;
  }

  function waitForNativeMediaReady(playbackId, timeoutMs = 20_000) {
    if (nativeMediaIsFullyBuffered()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        media.removeEventListener('canplaythrough', check);
        media.removeEventListener('progress', check);
        media.removeEventListener('loadeddata', check);
      };
      const check = () => {
        if (settled) return;
        if (activePlaybackId !== playbackId) { settled = true; cleanup(); resolve(); return; }
        if (!nativeMediaIsFullyBuffered()) return;
        settled = true; cleanup(); resolve();
      };
      const timeout = setTimeout(() => { settled = true; cleanup(); reject(new Error('Clip did not finish buffering before playback')); }, timeoutMs);
      media.addEventListener('canplaythrough', check);
      media.addEventListener('progress', check);
      media.addEventListener('loadeddata', check);
      check();
    });
  }

  async function prepareNativeMediaSource(playbackId, sourceUrl) {
    const parsed = new URL(sourceUrl, location.origin);
    if (parsed.origin !== location.origin || !parsed.pathname.startsWith('/overlay/cache/')) return;
    if (activePlaybackId !== playbackId) return;
    // Keep locally cached clips on their HTTP URL. OBS's embedded Chromium can advance a large
    // blob-backed video's clock without repainting decoded frames, which looks like a frozen clip.
    // The local endpoint already supports bounded byte ranges, so native URL playback is both
    // smoother and more memory-efficient while preserving the private local-only cache boundary.
    media.src = parsed.href;
    media.load();
  }

  async function startNativeMedia(playbackId, sourceUrl) {
    try {
      await prepareNativeMediaSource(playbackId, sourceUrl);
      if (activePlaybackId !== playbackId) return;
      await waitForNativeMediaReady(playbackId);
      if (activePlaybackId !== playbackId) return;
      await media.play();
    } catch (firstError) {
      if (activePlaybackId !== playbackId) return;
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

  const armNativePlaybackDeadline = () => {
    clearTimeout(mediaTimer);
    const actualDurationMs = Number.isFinite(media.duration) && media.duration > 0 ? Math.ceil(media.duration * 1_000) : 0;
    const expectedDurationMs = Math.max(Number.isInteger(pendingMediaDurationMs) ? pendingMediaDurationMs : 0, actualDurationMs);
    const elapsedMs = Number.isFinite(media.currentTime) && media.currentTime > 0 ? Math.floor(media.currentTime * 1_000) : 0;
    const remainingWithGrace = expectedDurationMs > 0 ? Math.max(1_000, expectedDurationMs - elapsedMs) + 10_000 : undefined;
    mediaTimer = setTimeout(() => clearMedia('timeout'), boundedDuration(remainingWithGrace, 70_000));
  };

  media.addEventListener('playing', () => {
    // A previous unmuted autoplay attempt may have left a visible failure badge. Once the
    // browser actually starts this playback, restore the normal transient LIVE state so the
    // stale warning does not cover a clip that is already running.
    transportState('live');
    mediaShell.classList.add('media-playing');
    clearTimeout(mediaStallTimer);
    nativePlaybackStarted = true;
    // Render the fully cached MP4 directly. Copying every decoded 1080p frame into a second
    // canvas doubled browser-source work and produced visible judder when OBS browser hardware
    // acceleration was unavailable or disabled.
    stopMediaCanvas();
    reportLifecycle('started');
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => reportLifecycle('heartbeat'), 10_000);
    // Loading time must not consume the clip's playback budget. A small grace period covers
    // metadata differences while the native ended event remains the normal completion path.
    // Re-arm from the current playhead after buffering so a network stall cannot consume the
    // remaining playback budget and force the next clip to start early.
    armNativePlaybackDeadline();
  });
  const armStallFailure = () => {
    if (!activePlaybackId || !nativePlaybackStarted || media.paused || media.ended) return;
    clearTimeout(mediaTimer);
    clearTimeout(mediaStallTimer);
    mediaStallTimer = setTimeout(() => {
      if (!activePlaybackId || media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      reportLifecycle('failed', 'Clip playback stalled');
      clearMedia();
    }, 30_000);
  };
  media.addEventListener('waiting', armStallFailure);
  media.addEventListener('stalled', armStallFailure);
  media.addEventListener('canplay', () => {
    clearTimeout(mediaStallTimer);
    if (activePlaybackId && nativePlaybackStarted && !media.ended) armNativePlaybackDeadline();
  });
  media.addEventListener('ended', () => {
    // Keep the final frame mounted during a short fade. Report the clean ending immediately so
    // the add-on's creator-configured pause includes this transition instead of starting after it.
    clearTimeout(mediaTimer);
    clearTimeout(mediaStallTimer);
    clearInterval(heartbeatTimer);
    reportLifecycle('ended');
    mediaShell.classList.add('fading');
    mediaFadeTimer = setTimeout(() => clearMedia(), mediaFadeMs);
  });
  media.addEventListener('error', () => { reportLifecycle('failed', media.error?.message || `Media error ${media.error?.code || 0}`); clearMedia(); });

  function receive(event) {
    if (event?.kind === 'overlay.reset') { resetOverlaySurface(); return; }
    if (event?.contractVersion !== 'thsv-addon-overlay-v1' || event.kind !== 'addon.publish' || event.moduleId !== moduleId || typeof event.topic !== 'string' || !event.payload || typeof event.payload !== 'object') return;
    if (event.topic === `${moduleId}.preview.hide`) { hideCard(); hideTimer({ force: true }); hideLabels(); hideCounter(); hideHydration(); hideWheel(); hidePoll(); clearMedia(); }
    else if (event.topic === `${moduleId}.card.show`) showCard(event.payload);
    else if (event.topic === `${moduleId}.card.hide`) hideCard();
    else if (event.topic === `${moduleId}.result.show`) showCard(event.payload);
    else if (event.topic === `${moduleId}.poll.update`) showPoll(event.payload);
    else if (event.topic === `${moduleId}.poll.hide`) hidePoll();
    else if (event.topic === `${moduleId}.queue.update`) showQueue(event.payload);
    else if (event.topic === `${moduleId}.media.play`) playMedia(event.payload);
    else if (event.topic === `${moduleId}.media.stop`) stopMedia(event.payload);
    else if (event.topic === `${moduleId}.timer.update`) showTimer(event.payload);
    else if (event.topic === `${moduleId}.timer.hide`) hideTimer(event.payload);
    else if (event.topic === `${moduleId}.labels.update`) showLabels(event.payload);
    else if (event.topic === `${moduleId}.counter.update`) showCounter(event.payload);
    else if (event.topic === `${moduleId}.hydration.update`) showHydration(event.payload);
    else if (event.topic === `${moduleId}.hydration.hide`) hideHydration();
    else if (event.topic === `${moduleId}.wheel.spin`) showWheel(event.payload);
    if (event.payload.templatePreview === true) {
      clearTimeout(cardTimer); clearTimeout(pollHideTimer); clearTimeout(drawHideTimer); clearTimeout(wheelTimer);
    }
  }

  function transportState(state) {
    status.textContent = state === 'live' ? 'LIVE' : 'OFFLINE';
    status.dataset.state = state;
    if (state === 'live') sendTransport({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.subscribe', moduleId, rendererId });
    else resetOverlaySurface();
  }

  function resetOverlaySurface() {
    hideCard();
    hideTimer({ force: true });
    hideLabels();
    hideCounter();
    hideHydration();
    hideWheel();
    hidePoll();
    clearMedia();
  }

  function connectDirectly() {
    resetOverlaySurface();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/overlay/events`);
    sendTransport = (payload) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); };
    socket.addEventListener('open', () => transportState('live'));
    socket.addEventListener('message', (message) => { try { receive(JSON.parse(message.data)); } catch { /* Ignore malformed transport data. */ } });
    socket.addEventListener('close', () => { transportState('reconnecting'); setTimeout(connectDirectly, 1_500); });
  }

  if ('SharedWorker' in window) {
    try {
      resetOverlaySurface();
      const worker = new SharedWorker('/overlay/worker-1.3.3.js', 'thsv-browser-overlay-1.3.3');
      sendTransport = (payload) => worker.port.postMessage({ kind: 'transport.send', payload });
      worker.port.addEventListener('message', (message) => {
        if (message.data?.kind === 'transport.status') transportState(message.data.state);
        else receive(message.data);
      });
      worker.port.start();
      addEventListener('pagehide', () => {
        sendTransport({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.unsubscribe', moduleId, rendererId });
        worker.port.postMessage({ kind: 'disconnect' });
      }, { once: true });
      return;
    } catch { /* Browser sources without SharedWorker use one direct connection. */ }
  }
  connectDirectly();
})();
