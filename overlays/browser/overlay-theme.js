// Applies the universal overlay theme to this page. Loaded before the overlay's own script, so the
// theme rules are already on when the first card appears. Saved changes arrive as an overlay.theme event.
(() => {
  const root = document.documentElement;
  const FONTS = {
    broadcast: 'Inter, "Segoe UI", ui-sans-serif, system-ui, sans-serif',
    rounded: '"Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    display: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    mono: '"Cascadia Mono", Consolas, monospace',
  };
  const COLORS = { panelColor: '--thsv-panel', accentColor: '--thsv-accent', highlightColor: '--thsv-highlight', textColor: '--thsv-text', mutedColor: '--thsv-muted' };
  function apply(theme) {
    if (!theme || typeof theme !== 'object') return;
    root.dataset.overlayTheme = theme.enabled === false ? 'off' : 'on';
    for (const [key, property] of Object.entries(COLORS)) if (/^#[0-9a-f]{6}$/iu.test(String(theme[key]))) root.style.setProperty(property, theme[key]);
    if (Number.isFinite(theme.panelOpacity)) root.style.setProperty('--thsv-panel-opacity', `${Math.max(0, Math.min(100, theme.panelOpacity))}%`);
    if (FONTS[theme.bodyFont]) root.style.setProperty('--thsv-font', FONTS[theme.bodyFont]);
    if (FONTS[theme.titleFont]) root.style.setProperty('--thsv-title-font', FONTS[theme.titleFont]);
  }
  root.dataset.overlayTheme = 'on';
  window.thsvOverlayTheme = { apply };
  fetch('/overlay/theme', { cache: 'no-store' }).then((response) => response.ok ? response.json() : undefined).then(apply).catch(() => { /* The built-in theme stays on. */ });
})();
