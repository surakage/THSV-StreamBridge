// The raid clip window: Twitch's clip player in a small Edge window that SprigCast captures (a stopgap until
// SprigCast's Web pages can play H.264). It tells StreamBridge once it has loaded, with its size, so the capture
// can leave out the title bar. Opened without a clip it only measures the window.
(() => {
  const params = new URLSearchParams(window.location.search);
  const clip = params.get('clip') || '';
  const token = params.get('token') || '';
  const end = Number(params.get('end'));
  const frame = document.getElementById('clip');
  let told = false;
  const tell = () => {
    if (told || !/^[a-f0-9]{32}$/.test(token)) return; told = true;
    const query = new URLSearchParams({
      token, ow: String(window.outerWidth), oh: String(window.outerHeight),
      iw: String(window.innerWidth), ih: String(window.innerHeight), dpr: String(window.devicePixelRatio || 1),
    });
    fetch(`/overlay/clip-window/ready?${query.toString()}`, { method: 'POST', keepalive: true }).catch(() => undefined);
  };
  // The window's size settles a moment after it opens.
  const tellSoon = () => { window.setTimeout(tell, 400); };
  if (/^[A-Za-z0-9_-]{1,120}$/.test(clip)) {
    frame.addEventListener('load', tellSoon, { once: true });
    frame.src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip)}&parent=localhost&autoplay=true&muted=false`;
    // StreamBridge closes the window when the clip ends; this is only a backstop.
    if (Number.isFinite(end) && end > 0) window.setTimeout(() => { window.close(); }, Math.min(end, 600000));
  } else {
    frame.remove();
    if (document.readyState === 'complete') tellSoon(); else window.addEventListener('load', tellSoon, { once: true });
  }
})();
