// Pop-out pages (Control Panel, Stream info, Jukebox remote) use the same light or dark choice as the Setup Wizard.
// Loaded in <head> so the page never flashes the wrong colours; follows a change made in the Wizard straight away.
(() => {
  const key = 'thsv.streambridge.wizard.theme.v1';
  const pick = () => {
    let saved = null;
    try { saved = localStorage.getItem(key); } catch { /* Private window: follow the system setting. */ }
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };
  const apply = () => { const theme = pick(); document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; };
  apply();
  addEventListener('storage', (event) => { if (event.key === key) apply(); });
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', apply);
})();
