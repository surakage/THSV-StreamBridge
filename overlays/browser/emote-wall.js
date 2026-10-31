// Emote & GIF wall: every emote posted in chat (Twitch, YouTube, Kick, BTTV, FFZ and 7TV) floats across a
// full-screen transparent layer. All settings come from the source URL, which the Wizard builds.
(() => {
  'use strict';
  const MOVEMENTS = ['float', 'slide', 'zoom', 'bounce', 'spiral', 'wobble'];
  const PLATFORMS = ['twitch', 'youtube', 'kick'];
  const BASE_SIZE_PX = 72;
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
    };
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
      if (fragment?.type !== 'emote' || typeof fragment.imageUrl !== 'string' || !/^https:\/\//u.test(fragment.imageUrl)) continue;
      if (!options.gifs && isAnimated(fragment.imageUrl)) continue;
      picked.push({ url: fragment.imageUrl, name: typeof fragment.name === 'string' ? fragment.name : '' });
    }
    return picked;
  }
  if (typeof document === 'undefined') {
    if (typeof module === 'object' && module.exports) module.exports = { parseOptions, pickEmotes, isAnimated, MOVEMENTS };
    return;
  }

  const options = parseOptions(location.search);
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
    image.src = emote.url;
    const entry = { image, timer: undefined, animation: undefined };
    image.addEventListener('error', () => remove(entry), { once: true });
    const motion = keyframes(choose(options.movements), size);
    const duration = random(options.minSpeed, options.maxSpeed) * 1000;
    wall.append(image); live.push(entry);
    entry.animation = image.animate(motion.frames, { duration, iterations: motion.loop ? Infinity : 1, easing: 'linear', fill: 'forwards' });
    entry.animation.finished.then(() => remove(entry), () => {});
    entry.timer = setTimeout(() => {
      // Fade out instead of cutting off when the lifetime ends mid-flight.
      image.animate([{ opacity: getComputedStyle(image).opacity }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => remove(entry), () => remove(entry));
    }, options.lifetimeMs);
  }
  function clear() { for (const entry of [...live]) remove(entry); }
  function receive(event) {
    if (event?.kind === 'chat.add') { pickEmotes(event.payload, options).forEach((emote, index) => setTimeout(() => launch(emote), index * 120)); }
    else if (event?.kind === 'overlay.reset' || event?.kind === 'emote-wall.clear') clear();
  }

  if (options.demo) {
    // Wizard preview: sample emotes drawn locally, so the preview needs no chat and no network.
    const faces = ['#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8'].map((color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${color}"/><circle cx="22" cy="26" r="5" fill="#111"/><circle cx="42" cy="26" r="5" fill="#111"/><path d="M18 40q14 12 28 0" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`)}`);
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
