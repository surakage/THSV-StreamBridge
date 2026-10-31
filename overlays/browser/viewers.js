// Viewer counter: live viewers from Twitch, YouTube and Kick, one chip per platform or one merged total.
// The Bridge sends counts from Streamer.bot; all appearance settings come from the source URL.
(() => {
  'use strict';
  const PLATFORMS = ['twitch', 'youtube', 'kick'];
  const clamp = (value, minimum, maximum, fallback) => {
    const number = Number(value);
    return value !== null && value !== '' && Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  };
  const color = (value, fallback) => typeof value === 'string' && /^[0-9a-f]{6}$/iu.test(value) ? `#${value}` : fallback;
  const choice = (value, allowed) => allowed.includes(value) ? value : allowed[0];
  function parseOptions(search) {
    const query = new URLSearchParams(search);
    const picked = (query.get('platforms') || '').split(',').map((item) => item.trim().toLowerCase()).filter((item) => PLATFORMS.includes(item));
    return {
      mode: choice(query.get('mode'), ['split', 'total']),
      style: choice(query.get('style'), ['pill', 'plain']),
      direction: choice(query.get('direction'), ['row', 'column']),
      align: choice(query.get('align'), ['left', 'center', 'right']),
      valign: choice(query.get('valign'), ['top', 'middle', 'bottom']),
      size: Math.round(clamp(query.get('size'), 14, 160, 36)),
      text: color(query.get('text'), '#ffffff'),
      background: color(query.get('bg'), '#141020'),
      opacity: clamp(query.get('opacity'), 0, 100, 75),
      label: (query.get('label') ?? '').slice(0, 24),
      platforms: picked.length > 0 ? [...new Set(picked)] : [...PLATFORMS],
      showZero: query.get('showZero') === '1',
      demo: query.get('demo') === '1',
    };
  }
  // Which chips to draw for the latest counts. Platforms that are not live (no count) are left out.
  function view(counts, options) {
    const live = options.platforms.filter((platform) => Number.isInteger(counts?.[platform]) && (options.showZero || counts[platform] > 0));
    if (options.mode === 'total') return live.length === 0 ? [] : [{ platforms: live, viewers: live.reduce((sum, platform) => sum + counts[platform], 0) }];
    return live.map((platform) => ({ platforms: [platform], viewers: counts[platform] }));
  }
  const format = (number) => number >= 10_000 ? `${(number / 1000).toFixed(number >= 100_000 ? 0 : 1).replace(/\.0$/u, '')}K` : number.toLocaleString('en-US');
  if (typeof document === 'undefined') {
    if (typeof module === 'object' && module.exports) module.exports = { parseOptions, view, format };
    return;
  }

  const ICONS = {
    twitch: '<svg class="viewer-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#9146ff" d="M4 2 2.5 6v14h5v3h3l3-3h4l5-5V2zm16 12-3 3h-4.5l-3 3v-3H5.5V4H20z"/><path fill="#9146ff" d="M15.5 7.5h2v5.5h-2zm-5 0h2v5.5h-2z"/></svg>',
    youtube: '<svg class="viewer-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#ff0033"/><path d="m10 8.5 6 3.5-6 3.5z" fill="#fff"/></svg>',
    kick: '<svg class="viewer-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="#53fc18"/><path d="M6 5h4v4h2V7h2V5h4v6h-2v2h2v6h-4v-2h-2v-2h-2v4H6z" fill="#0b0b0b"/></svg>',
  };
  const options = parseOptions(location.search);
  const counter = document.getElementById('viewer-counter');
  document.body.dataset.align = options.align;
  document.body.dataset.valign = options.valign;
  counter.dataset.style = options.style;
  counter.dataset.direction = options.direction;
  counter.style.setProperty('--size', `${options.size}px`);
  counter.style.setProperty('--text', options.text);
  const rgb = [1, 3, 5].map((start) => parseInt(options.background.slice(start, start + 2), 16)).join(' ');
  counter.style.setProperty('--background', `rgb(${rgb} / ${options.opacity}%)`);

  const shown = new Map();
  function render(counts) {
    const chips = view(counts, options);
    const keys = chips.map((chip) => chip.platforms.join('+'));
    for (const [key, element] of shown) if (!keys.includes(key)) { element.remove(); shown.delete(key); }
    chips.forEach((chip, index) => {
      const key = keys[index];
      let element = shown.get(key);
      if (element === undefined) {
        element = document.createElement('div');
        element.className = 'viewer-chip';
        element.innerHTML = `<span class="viewer-icons">${chip.platforms.map((platform) => ICONS[platform]).join('')}</span><span class="viewer-number"></span>`;
        if (options.label !== '') { const label = document.createElement('span'); label.className = 'viewer-label'; label.textContent = options.label; element.append(label); }
        shown.set(key, element);
      }
      counter.append(element);
      element.querySelector('.viewer-number').textContent = format(chip.viewers);
    });
    counter.classList.toggle('hidden', chips.length === 0);
  }
  function receive(event) {
    if (event?.kind === 'viewers.update' && event.contractVersion === 'thsv-viewer-counts-v1') render(event.payload?.platforms ?? {});
  }

  if (options.demo) {
    // Wizard preview with made-up numbers that drift, so no live stream is needed.
    const counts = { twitch: 128, youtube: 47, kick: 19 };
    render(counts);
    setInterval(() => { for (const platform of PLATFORMS) counts[platform] = Math.max(1, counts[platform] + Math.round((Math.random() - 0.45) * 6)); render(counts); }, 1500);
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
