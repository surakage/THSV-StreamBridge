// Lets a small browser source show one part of a full-screen overlay, so the streaming app only pays for the
// part that is drawn. With ?sbCanvas=1920x1080&sbAt=X,Y the page lays out exactly as it would on a 1920x1080
// source: vw/vh/vmin/vmax, size media queries and innerWidth/innerHeight all use 1920x1080. The source itself is
// sized to the part it shows, and it shows the area whose top-left corner is X,Y. Without sbCanvas nothing changes.
// Loaded in <head> after the page's stylesheets and before its own scripts; stylesheets added later (the streaming
// app's custom CSS) are converted as they arrive. Inline styles that scripts write in vw/vh are not converted.
(() => {
  const params = new URLSearchParams(location.search);
  const size = /^(\d{2,5})x(\d{2,5})$/u.exec(params.get('sbCanvas') ?? '');
  if (size === null) return;
  const at = /^(-?\d{1,5}),(-?\d{1,5})$/u.exec(params.get('sbAt') ?? '0,0');
  const width = Number(size[1]); const height = Number(size[2]);
  const left = at === null ? 0 : Number(at[1]); const top = at === null ? 0 : Number(at[2]);
  if (!(width > 0 && height > 0)) return;

  const unitSize = { vw: width / 100, vh: height / 100, vmin: Math.min(width, height) / 100, vmax: Math.max(width, height) / 100 };
  // 12vw, -3.5vh, .5vmin; also the small/large/dynamic forms (svh, dvw, ...), which are the same here.
  const UNITS = /(?<![\w.-])(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[sld]?(vw|vh|vmin|vmax)(?![\w-])/giu;
  const HAS_UNITS = /\d[sld]?(?:vw|vh|vmin|vmax)(?![\w-])/iu;
  const toPixels = (value) => value.replace(UNITS, (_match, number, unit) => `${String(Number((Number(number) * unitSize[unit.toLowerCase()]).toFixed(4)))}px`);

  // The whole declaration block is rewritten at once, so shorthands that also use var() (border-left: 0.2vw solid
  // var(--accent)) are converted too: their longhands read back empty until the variable is known.
  function fixStyle(style) {
    const text = style.cssText;
    if (HAS_UNITS.test(text)) style.cssText = toPixels(text);
  }

  // One media feature about the page size, true or false for the full-size layout; undefined for anything else.
  function sizeFeature(text) {
    const feature = /^\(\s*(min-|max-)?(width|height|aspect-ratio|orientation)\s*:\s*([^)]+?)\s*\)$/iu.exec(text.trim());
    if (feature !== null) {
      const [, limit, name, raw] = feature;
      const kind = name.toLowerCase();
      if (kind === 'orientation') return raw.toLowerCase() === (height >= width ? 'portrait' : 'landscape');
      const actual = kind === 'width' ? width : kind === 'height' ? height : width / height;
      const wanted = kind === 'aspect-ratio' ? ratio(raw) : length(raw);
      if (wanted === undefined) return undefined;
      return limit === undefined ? Math.abs(actual - wanted) < 0.01 : limit.toLowerCase() === 'min-' ? actual >= wanted : actual <= wanted;
    }
    const range = /^\(\s*(width|height)\s*(<=|>=|<|>|=)\s*([^)]+?)\s*\)$/iu.exec(text.trim()) ?? flipped(text.trim());
    if (range === null) return undefined;
    const actual = range[1].toLowerCase() === 'width' ? width : height;
    const wanted = length(range[3]);
    if (wanted === undefined) return undefined;
    return { '<=': actual <= wanted, '>=': actual >= wanted, '<': actual < wanted, '>': actual > wanted, '=': actual === wanted }[range[2]];
  }
  function flipped(text) {
    const match = /^\(\s*([^<>=()]+?)\s*(<=|>=|<|>|=)\s*(width|height)\s*\)$/iu.exec(text);
    if (match === null) return null;
    const opposite = { '<=': '>=', '>=': '<=', '<': '>', '>': '<', '=': '=' }[match[2]];
    return [match[0], match[3], opposite, match[1]];
  }
  function length(raw) {
    const match = /^(-?\d*\.?\d+)(px|em|rem)?$/iu.exec(raw.trim());
    if (match === null) return undefined;
    return Number(match[1]) * (match[2] === undefined || match[2].toLowerCase() === 'px' ? 1 : 16);
  }
  function ratio(raw) {
    const match = /^(\d*\.?\d+)\s*(?:\/\s*(\d*\.?\d+))?$/u.exec(raw.trim());
    return match === null ? undefined : Number(match[1]) / Number(match[2] ?? 1);
  }

  // A media query list with every page-size test worked out for the full-size layout.
  function fixMedia(list) {
    return list.split(',').map((query) => {
      const text = query.trim();
      const negated = /^not\s+/iu.test(text);
      const parts = text.replace(/^(?:not|only)\s+/iu, '').split(/\s+and\s+/iu);
      const others = []; let matches = true; let sized = false;
      for (const part of parts) {
        const result = sizeFeature(part);
        if (result === undefined) others.push(part); else { sized = true; if (!result) matches = false; }
      }
      if (!sized) return text;
      if (negated) return others.length === 0 ? (matches ? 'not all' : 'all') : text;
      if (!matches) return 'not all';
      return others.length === 0 ? 'all' : others.join(' and ');
    }).join(', ');
  }

  function fixRules(rules) {
    for (const rule of Array.from(rules)) {
      if (rule.style !== undefined) fixStyle(rule.style);
      if (rule.media !== undefined && rule.media !== null && typeof rule.media.mediaText === 'string' && /width|height|orientation|aspect-ratio/iu.test(rule.media.mediaText)) {
        const fixed = fixMedia(rule.media.mediaText);
        if (fixed !== rule.media.mediaText) rule.media.mediaText = fixed;
      }
      if (rule.cssRules !== undefined) fixRules(rule.cssRules);
    }
  }

  const done = new WeakSet();
  function fixSheets() {
    for (const sheet of Array.from(document.styleSheets)) {
      if (done.has(sheet)) continue;
      let rules;
      try { rules = sheet.cssRules; } catch { continue; } // another site's stylesheet, or still loading
      if (rules === null) continue;
      done.add(sheet);
      fixRules(rules);
    }
  }

  // The page is the full-size layout moved so the chosen area sits in the source. A transformed <html> is the
  // containing block for position: fixed, so pinned cards stay where they would be on the full-size page.
  const frame = document.createElement('style');
  frame.id = 'thsv-overlay-frame';
  frame.textContent = `html { width: ${String(width)}px !important; height: ${String(height)}px !important; overflow: hidden !important; transform: translate(${String(-left)}px, ${String(-top)}px) !important; transform-origin: 0 0 !important; }`;
  (document.head ?? document.documentElement).appendChild(frame);
  done.add(frame.sheet);
  document.documentElement.dataset.overlayFrame = `${String(width)}x${String(height)}`;

  try {
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => height });
  } catch { /* Kept as the browser has them. */ }
  if (typeof window.matchMedia === 'function') {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => original(fixMedia(String(query)));
  }

  fixSheets();
  let queued = false;
  const queue = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; fixSheets(); }); };
  const watch = new MutationObserver((changes) => {
    for (const change of changes) {
      const target = change.target;
      if (target.nodeName === 'STYLE' || target.parentNode?.nodeName === 'STYLE' || Array.from(change.addedNodes).some((node) => node.nodeName === 'STYLE' || node.nodeName === 'LINK')) { queue(); return; }
    }
  });
  // Stylesheets go in <head> (or straight under <html> before <head> exists), so <body> is not watched.
  watch.observe(document.documentElement, { childList: true });
  const watchHead = () => { if (document.head !== null) watch.observe(document.head, { childList: true, subtree: true, characterData: true }); };
  watchHead();
  if (document.head === null) addEventListener('DOMContentLoaded', watchHead, { once: true });
  document.addEventListener('load', (event) => { if (event.target?.nodeName === 'LINK') queue(); }, true);
  addEventListener('DOMContentLoaded', queue);
  addEventListener('load', queue);
})();
