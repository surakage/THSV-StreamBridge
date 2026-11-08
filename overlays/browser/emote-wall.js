// Emote & GIF wall: every emote posted in chat (Twitch, YouTube, Kick, BTTV, FFZ and 7TV) floats across a
// full-screen transparent layer, and stream moments (follows, subs, raids, bits...) set off an emote explosion,
// emote rain or emote fireworks. All settings come from the source URL, which the Wizard builds.
(() => {
  'use strict';
  const MOVEMENTS = ['float', 'slide', 'zoom', 'bounce', 'spiral', 'wobble'];
  const PLATFORMS = ['twitch', 'youtube', 'kick'];
  const BASE_SIZE_PX = 72;
  // Event effects: stream moments set off an emote explosion, emote rain or emote fireworks.
  const EFFECTS = ['explosion', 'rain', 'fireworks', 'random'];
  const EFFECT_GROUPS = ['follow', 'sub', 'gift', 'cheer', 'raid', 'tip', 'tiktok', 'reward', 'likes'];
  const DEFAULT_EFFECTS = { follow: 'rain', sub: 'fireworks', gift: 'fireworks', cheer: 'explosion', raid: 'explosion', tip: 'fireworks' };
  // Which wizard group each kind of stream moment belongs to (same names the bridge sends).
  const CATEGORY_GROUP = {
    follow: 'follow', subscriber: 'follow',
    subscription: 'sub', resubscription: 'sub', member: 'sub', 'member-milestone': 'sub',
    'gift-subscription': 'gift', 'gift-bomb': 'gift', 'mass-gift-subscription': 'gift', 'membership-gift': 'gift',
    cheer: 'cheer', raid: 'raid',
    'super-chat': 'tip', 'super-sticker': 'tip', donation: 'tip', 'jewels-gift': 'tip', 'gifted-kicks': 'tip',
    gift: 'tiktok', 'reward-redemption': 'reward', likes: 'likes',
  };
  const clamp = (value, minimum, maximum, fallback) => {
    const number = Number(value);
    return value !== null && value !== '' && Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  };
  const list = (value, allowed) => {
    if (typeof value !== 'string') return [...allowed];
    const picked = value.split(',').map((item) => item.trim().toLowerCase()).filter((item) => allowed.includes(item));
    return picked.length > 0 ? [...new Set(picked)] : [...allowed];
  };
  function parseOptions(search) {
    const query = new URLSearchParams(search);
    const minSize = clamp(query.get('minSize'), 20, 400, 60);
    const maxSize = Math.max(minSize, clamp(query.get('maxSize'), 20, 400, 150));
    const minSpeed = clamp(query.get('minSpeed'), 1, 30, 4);
    const maxSpeed = Math.max(minSpeed, clamp(query.get('maxSpeed'), 1, 30, 8));
    return {
      maxOnScreen: Math.round(clamp(query.get('max'), 1, 200, 50)),
      perMessage: Math.round(clamp(query.get('perMessage'), 1, 30, 10)),
      lifetimeMs: Math.round(clamp(query.get('life'), 2, 60, 10) * 1000),
      gifs: query.get('gifs') !== '0',
      minSize, maxSize, minSpeed, maxSpeed,
      movements: list(query.get('moves'), MOVEMENTS),
      platforms: list(query.get('platforms'), PLATFORMS),
      demo: query.get('demo') === '1',
      layout: query.get('layout') === 'vertical' ? 'vertical' : 'horizontal',
      effects: parseEffects(query.get('fx')),
      effectCount: Math.round(clamp(query.get('fxCount'), 5, 150, 40)),
      effectSize: clamp(query.get('fxSize'), 40, 400, 130),
      effectScale: query.get('fxScale') !== '0',
      effectMinBits: Math.round(clamp(query.get('fxMinBits'), 1, 100000, 1)),
      effectRewards: (query.get('fxRewards') || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 30),
      effectEmotes: (query.get('fxEmotes') || '').split(',').map((item) => item.trim()).filter((item) => /^https:\/\/[^\s"'<>]+$/u.test(item)).slice(0, 30),
    };
  }
  // fx=follow:rain,raid:explosion,... ; fx=none turns every event effect off; no fx keeps the defaults.
  function parseEffects(value) {
    if (typeof value !== 'string' || value.trim() === '') return { ...DEFAULT_EFFECTS };
    const effects = {};
    for (const pair of value.split(',')) {
      const [group, effect] = pair.split(':').map((item) => (item || '').trim().toLowerCase());
      if (EFFECT_GROUPS.includes(group) && EFFECTS.includes(effect)) effects[group] = effect;
    }
    return effects;
  }
  // Which effect (if any) a stream moment plays on this wall.
  function effectFor(trigger, options) {
    if (!trigger || typeof trigger !== 'object') return undefined;
    if (EFFECTS.includes(trigger.test)) return trigger.test === 'random' ? 'explosion' : trigger.test;
    const group = CATEGORY_GROUP[trigger.category];
    const effect = group === undefined ? undefined : options.effects[group];
    if (effect === undefined) return undefined;
    const platform = String(trigger.platform || '').toLowerCase();
    if (PLATFORMS.includes(platform) && !options.platforms.includes(platform)) return undefined;
    if (group === 'cheer' && Number(trigger.quantity || 0) < options.effectMinBits) return undefined;
    if (group === 'reward' && options.effectRewards.length > 0) {
      const title = String(trigger.rewardTitle || '').toLowerCase(); const id = String(trigger.rewardId || '').toLowerCase();
      if (!options.effectRewards.some((wanted) => wanted === title || wanted === id)) return undefined;
    }
    return effect === 'random' ? ['explosion', 'rain', 'fireworks'][Math.floor(Math.random() * 3)] : effect;
  }
  // Bigger moments throw more emotes: up to 3 times as many for a big raid, bits pile or gift bomb.
  function effectEmoteCount(trigger, options) {
    if (!options.effectScale || trigger?.test) return options.effectCount;
    const quantity = Number(trigger?.quantity || 0);
    const group = CATEGORY_GROUP[trigger?.category];
    const units = group === 'cheer' ? quantity / 100 : group === 'raid' ? quantity / 10 : group === 'gift' ? quantity : 0;
    const factor = Math.min(3, 1 + Math.max(0, units - 1) * 0.2);
    return Math.min(150, Math.round(options.effectCount * factor));
  }
  // Emotes are drawn from the largest copy each emote site offers, so a big emote is scaled down
  // (sharp) instead of a small one being blown up (blurry). If that copy does not exist, the
  // original link is used instead. Only height is ever set, so an emote keeps its own shape.
  function sharpestUrl(url) {
    if (typeof url !== 'string') return url;
    if (/^https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\//u.test(url)) return url.replace(/\/(?:1|2)\.0$/u, '/3.0');
    if (/^https:\/\/cdn\.7tv\.app\/emote\//u.test(url)) return url.replace(/\/[123]x(\.\w+)?$/u, '/4x$1');
    if (/^https:\/\/cdn\.betterttv\.net\/emote\//u.test(url)) return url.replace(/\/[12]x(\.\w+)?$/u, '/3x$1');
    if (/^https:\/\/cdn\.frankerfacez\.com\/emote\//u.test(url)) return url.replace(/\/[12]$/u, '/4');
    return url;
  }
  function setSource(image, url, onFail) {
    const best = sharpestUrl(url);
    image.addEventListener('error', () => { if (best !== url && image.src === best) image.src = url; else onFail(); });
    image.src = best;
  }
  // Animated emotes: Twitch serves them from /animated/, other catalogs mark them with a .gif file.
  const isAnimated = (url) => /\/animated\//u.test(url) || /\.gif(?:$|\?)/iu.test(url);
  function pickEmotes(message, options) {
    if (!message || typeof message !== 'object') return [];
    const platform = String(message.platform || '').toLowerCase();
    if (PLATFORMS.includes(platform) && !options.platforms.includes(platform)) return [];
    const fragments = Array.isArray(message.fragments) ? message.fragments : [];
    const picked = [];
    for (const fragment of fragments) {
      if (picked.length >= options.perMessage) break;
      // Twitch chat GIFs (GIPHY) fly across the wall too when animated images are allowed.
      if (fragment?.type === 'gif') {
        if (options.gifs && typeof fragment.url === 'string' && /^https:\/\/(?:media\d*|i)\.giphy\.com\/media\//u.test(fragment.url)) picked.push({ url: fragment.url, name: typeof fragment.text === 'string' ? fragment.text : 'GIF' });
        continue;
      }
      if (fragment?.type !== 'emote' || typeof fragment.imageUrl !== 'string' || !/^https:\/\//u.test(fragment.imageUrl)) continue;
      if (!options.gifs && isAnimated(fragment.imageUrl)) continue;
      picked.push({ url: fragment.imageUrl, name: typeof fragment.name === 'string' ? fragment.name : '' });
    }
    return picked;
  }
  if (typeof document === 'undefined') {
    if (typeof module === 'object' && module.exports) module.exports = { parseOptions, pickEmotes, isAnimated, sharpestUrl, effectFor, effectEmoteCount, MOVEMENTS, EFFECT_GROUPS, DEFAULT_EFFECTS };
    return;
  }

  const options = parseOptions(location.search);
  document.body.dataset.layout = options.layout;
  const wall = document.getElementById('emote-wall');
  const random = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);
  const choose = (items) => items[Math.floor(Math.random() * items.length)];
  const live = [];

  // Each movement returns keyframes in pixels for an emote of the given size on the current screen.
  function keyframes(movement, size) {
    const width = innerWidth; const height = innerHeight;
    const x = random(0, Math.max(1, width - size)); const y = random(0, Math.max(1, height - size));
    switch (movement) {
      case 'float': {
        const up = Math.random() < 0.7; const from = up ? height + size : -size * 2; const to = up ? -size * 2 : height + size; const sway = random(30, 90);
        return { loop: false, frames: [0, 0.25, 0.5, 0.75, 1].map((step, index) => ({ transform: `translate(${x + (index % 2 === 0 ? 0 : (index === 1 ? sway : -sway))}px, ${from + (to - from) * step}px)`, opacity: index === 0 || index === 4 ? 0.85 : 1 })) };
      }
      case 'slide': {
        const right = Math.random() < 0.5; const from = right ? -size * 2 : width + size; const to = right ? width + size : -size * 2;
        return { loop: false, frames: [{ transform: `translate(${from}px, ${y}px) rotate(0deg)` }, { transform: `translate(${to}px, ${y}px) rotate(${right ? 360 : -360}deg)` }] };
      }
      case 'zoom':
        return { loop: true, frames: [{ transform: `translate(${x}px, ${y}px) scale(0) rotate(0deg)`, opacity: 0 }, { transform: `translate(${x}px, ${y}px) scale(1.15) rotate(200deg)`, opacity: 1, offset: 0.45 }, { transform: `translate(${x}px, ${y}px) scale(1) rotate(360deg)`, opacity: 1, offset: 0.8 }, { transform: `translate(${x}px, ${y}px) scale(0) rotate(420deg)`, opacity: 0 }] };
      case 'bounce': {
        const floor = height - size; const drift = random(-width / 4, width / 4); const frames = [];
        for (let index = 0; index <= 8; index += 1) {
          const step = index / 8; const peak = floor - Math.abs(Math.sin(step * Math.PI * 3)) * height * 0.55 * (1 - step * 0.6);
          frames.push({ transform: `translate(${x + drift * step}px, ${peak}px)`, opacity: index === 8 ? 0 : 1 });
        }
        return { loop: false, frames };
      }
      case 'spiral': {
        const centerX = width / 2 - size / 2; const centerY = height / 2 - size / 2; const turn = random(0, Math.PI * 2); const frames = [];
        for (let index = 0; index <= 12; index += 1) {
          const step = index / 12; const angle = turn + step * Math.PI * 4; const radius = step * Math.min(width, height) * 0.48;
          frames.push({ transform: `translate(${centerX + Math.cos(angle) * radius}px, ${centerY + Math.sin(angle) * radius}px) scale(${0.3 + step * 0.7})`, opacity: step > 0.9 ? 0 : 1 });
        }
        return { loop: false, frames };
      }
      default: {
        const frames = [];
        for (let index = 0; index <= 8; index += 1) {
          const step = index / 8;
          frames.push({ transform: `translate(${x + Math.sin(step * Math.PI * 4) * 40}px, ${height + size - step * (height + size * 3)}px) rotate(${Math.sin(step * Math.PI * 6) * 18}deg)` });
        }
        return { loop: false, frames };
      }
    }
  }

  function remove(entry) {
    const index = live.indexOf(entry); if (index >= 0) live.splice(index, 1);
    clearTimeout(entry.timer); entry.animation?.cancel(); entry.image.remove();
  }
  function launch(emote) {
    while (live.length >= options.maxOnScreen) remove(live[0]);
    const size = Math.round(BASE_SIZE_PX * random(options.minSize, options.maxSize) / 100);
    const image = document.createElement('img');
    image.className = 'wall-emote'; image.alt = ''; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    image.style.height = `${size}px`; image.style.maxWidth = `${size * 3}px`;
    const entry = { image, timer: undefined, animation: undefined };
    setSource(image, emote.url, () => remove(entry));
    const movement = choose(options.movements);
    const motion = keyframes(movement, size);
    // On a tall (vertical) screen, emotes that travel top to bottom get extra time so they move at the same speed.
    const tall = movement === 'float' || movement === 'wobble' ? Math.max(1, innerHeight / 1080) : 1;
    const duration = random(options.minSpeed, options.maxSpeed) * 1000 * tall;
    wall.append(image); live.push(entry);
    entry.animation = image.animate(motion.frames, { duration, iterations: motion.loop ? Infinity : 1, easing: 'linear', fill: 'forwards' });
    entry.animation.finished.then(() => remove(entry), () => {});
    entry.timer = setTimeout(() => {
      // Fade out instead of cutting off when the lifetime ends mid-flight.
      image.animate([{ opacity: getComputedStyle(image).opacity }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => remove(entry), () => remove(entry));
    }, options.lifetimeMs);
  }
  // ---- Event effects ----
  const effectLive = new Set();
  const recentEmotes = [];
  const EFFECT_LIMIT = 400;
  const SAMPLE_FACES = ['#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8'].map((color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${color}"/><circle cx="22" cy="26" r="5" fill="#111"/><circle cx="42" cy="26" r="5" fill="#111"/><path d="M18 40q14 12 28 0" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`)}`);
  function remember(emotes) {
    for (const emote of emotes) { const at = recentEmotes.indexOf(emote.url); if (at >= 0) recentEmotes.splice(at, 1); recentEmotes.push(emote.url); }
    while (recentEmotes.length > 40) recentEmotes.shift();
  }
  // Your chosen emotes first, then emotes chat used recently, then the built-in sample faces.
  const effectPool = () => (options.effectEmotes.length > 0 ? options.effectEmotes : recentEmotes.length > 0 ? recentEmotes : SAMPLE_FACES);
  function particle(url, size, frames, timing) {
    if (effectLive.size >= EFFECT_LIMIT) return;
    const image = document.createElement('img');
    image.className = 'fx-emote'; image.alt = ''; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    image.style.height = `${size}px`; image.style.maxWidth = `${size * 3}px`; image.style.opacity = '0';
    const done = () => { effectLive.delete(image); image.remove(); };
    setSource(image, url, done);
    wall.append(image); effectLive.add(image);
    image.animate(frames, { fill: 'both', ...timing }).finished.then(done, done);
  }
  const effectSize = () => Math.round(BASE_SIZE_PX * options.effectSize / 100 * random(0.7, 1.2));
  function explosion(count, centerX, centerY) {
    const width = innerWidth; const height = innerHeight;
    const cx = centerX ?? width / 2; const cy = centerY ?? height / 2; const reach = Math.max(width, height) * 0.75;
    for (let index = 0; index < count; index += 1) {
      const size = effectSize(); const angle = random(0, Math.PI * 2); const distance = random(0.35, 1) * reach; const spin = random(-540, 540);
      const endX = cx + Math.cos(angle) * distance - size / 2; const endY = cy + Math.sin(angle) * distance - size / 2 + random(60, 200);
      const midX = cx + Math.cos(angle) * distance * 0.7 - size / 2; const midY = cy + Math.sin(angle) * distance * 0.7 - size / 2;
      particle(choose(effectPool()), size, [
        { transform: `translate(${cx - size / 2}px, ${cy - size / 2}px) scale(0.2) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${midX}px, ${midY}px) scale(1.15) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${endX}px, ${endY}px) scale(0.9) rotate(${spin}deg)`, opacity: 0 },
      ], { duration: random(1400, 2200), delay: random(0, 120), easing: 'cubic-bezier(.12,.75,.3,1)' });
    }
  }
  function rain(count) {
    const width = innerWidth; const height = innerHeight; const spread = Math.min(6000, 1800 + count * 60);
    for (let index = 0; index < count; index += 1) {
      const size = effectSize(); const x = random(-size / 2, width - size / 2); const sway = random(-80, 80); const tilt = random(-35, 35);
      particle(choose(effectPool()), size, [
        { transform: `translate(${x}px, ${-size * 1.5}px) rotate(${-tilt}deg)`, opacity: 1 },
        { transform: `translate(${x + sway}px, ${height * 0.5}px) rotate(${tilt}deg)`, opacity: 1 },
        { transform: `translate(${x - sway / 2}px, ${height + size}px) rotate(${-tilt}deg)`, opacity: 1 },
      ], { duration: random(2200, 3800) * Math.max(1, height / 1080), delay: random(0, spread), easing: 'ease-in' });
    }
  }
  function fireworks(count) {
    const width = innerWidth; const height = innerHeight;
    const shells = Math.max(2, Math.min(7, Math.round(count / 12)));
    const perShell = Math.max(6, Math.round(count / shells));
    for (let shell = 0; shell < shells; shell += 1) {
      const delay = shell * random(350, 650) + random(0, 150);
      const x = random(width * 0.15, width * 0.85); const peakY = random(height * 0.12, height * (height > width ? 0.6 : 0.42)); const size = effectSize(); const rise = random(650, 900);
      const pool = effectPool(); const shellEmote = choose(pool);
      particle(shellEmote, Math.round(size * 0.6), [
        { transform: `translate(${x - size * 0.3}px, ${height + size}px) scale(0.6)`, opacity: 1 },
        { transform: `translate(${x - size * 0.3}px, ${peakY - size * 0.3}px) scale(0.9)`, opacity: 1 },
      ], { duration: rise, delay, easing: 'cubic-bezier(.2,.6,.4,1)' });
      setTimeout(() => {
        const ring = random(0, Math.PI * 2); const radius = random(0.16, 0.26) * Math.min(width, height) + perShell * 4;
        for (let index = 0; index < perShell; index += 1) {
          const sparkSize = effectSize(); const angle = ring + index / perShell * Math.PI * 2; const reach = radius * random(0.85, 1.1);
          const startX = x - sparkSize / 2; const startY = peakY - sparkSize / 2;
          const outX = startX + Math.cos(angle) * reach; const outY = startY + Math.sin(angle) * reach;
          particle(Math.random() < 0.7 ? shellEmote : choose(pool), sparkSize, [
            { transform: `translate(${startX}px, ${startY}px) scale(0.3)`, opacity: 1 },
            { transform: `translate(${outX}px, ${outY}px) scale(1)`, opacity: 1, offset: 0.4, easing: 'ease-in' },
            { transform: `translate(${outX}px, ${outY + random(90, 180)}px) scale(0.8)`, opacity: 0 },
          ], { duration: random(1500, 2100), easing: 'cubic-bezier(.1,.8,.3,1)' });
        }
      }, delay + rise);
    }
  }
  const EFFECT_PLAYERS = { explosion: (count) => explosion(count), rain, fireworks };
  // A gift bomb arrives as one bomb plus a gift per viewer, so the same group waits a moment before it plays again.
  const lastPlayed = {};
  function playEffect(trigger) {
    const effect = effectFor(trigger, options);
    if (effect === undefined) return;
    const group = trigger.test ? `test-${effect}` : CATEGORY_GROUP[trigger.category];
    const now = Date.now();
    if (!trigger.test && now - (lastPlayed[group] || 0) < 2500) return;
    lastPlayed[group] = now;
    EFFECT_PLAYERS[effect](effectEmoteCount(trigger, options));
  }
  function clearEffects() { for (const image of [...effectLive]) { image.getAnimations().forEach((animation) => animation.cancel()); image.remove(); } effectLive.clear(); }

  function clear() { for (const entry of [...live]) remove(entry); clearEffects(); }
  function receive(event) {
    if (event?.kind === 'chat.add') { const emotes = pickEmotes(event.payload, options); remember(emotes); emotes.forEach((emote, index) => setTimeout(() => launch(emote), index * 120)); }
    else if (event?.kind === 'emote-wall.event') playEffect(event.payload);
    else if (event?.kind === 'overlay.reset' || event?.kind === 'emote-wall.clear') clear();
  }
  // The Wizard preview plays effects through a message, so trying them never needs a live stream.
  addEventListener('message', (message) => {
    if (message.origin !== location.origin || message.data?.kind !== 'thsv.emote-wall.effect') return;
    if (['explosion', 'rain', 'fireworks'].includes(message.data.effect)) playEffect({ test: message.data.effect });
  });

  if (options.demo) {
    // Wizard preview: sample emotes drawn locally, so the preview needs no chat and no network.
    const faces = SAMPLE_FACES;
    const burst = () => { const count = 1 + Math.floor(Math.random() * Math.min(4, options.perMessage)); for (let index = 0; index < count; index += 1) setTimeout(() => launch({ url: choose(faces), name: '' }), index * 120); };
    burst(); setInterval(burst, 900);
    return;
  }
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/overlay/events`);
    socket.addEventListener('message', (message) => { try { receive(JSON.parse(message.data)); } catch { /* ignore malformed frames */ } });
    socket.addEventListener('close', () => setTimeout(connect, 1500));
  }
  connect();
})();
