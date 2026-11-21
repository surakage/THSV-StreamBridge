(() => {
  'use strict';
  // One browser source that hosts several StreamBridge pages (each in its own see-through frame), so a streaming
  // app opens one page instead of several. Every frame is the normal page with this page's own query (card size,
  // position, orientation), and gets the streaming app's show/hide and scene signals passed on.
  const modules = (document.body.dataset.modules || '').split(',').filter((id) => /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(id));
  const frames = [];
  for (const moduleId of modules) {
    const frame = document.createElement('iframe');
    frame.title = moduleId;
    frame.dataset.moduleId = moduleId;
    frame.setAttribute('allow', 'autoplay');
    frame.src = `/overlay/addons/${encodeURIComponent(moduleId)}${location.search}`;
    document.body.append(frame);
    frames.push(frame);
  }
  // The streaming app's custom CSS for this source (OBS and SprigCast add it to this page as a <style>) is meant for
  // the cards, which live in the frames: each frame gets a copy, kept up to date when the CSS changes.
  const hostStyles = () => [...document.querySelectorAll('style:not([data-combined-own]), link[rel="stylesheet"]')].map((node) => node.outerHTML).join('\n');
  const shared = new WeakMap();
  function shareStyles(frame) {
    try {
      const doc = frame.contentDocument; if (!doc?.head) return;
      const html = hostStyles();
      if (shared.get(doc) === html) return;
      shared.set(doc, html);
      for (const old of doc.querySelectorAll('[data-combined-host-css]')) old.remove();
      const holder = doc.createElement('template'); holder.innerHTML = html;
      for (const node of [...holder.content.children]) { node.setAttribute('data-combined-host-css', ''); doc.head.append(node); }
    } catch { /* A frame from another origin can't be styled; ours never is. */ }
  }
  for (const frame of frames) frame.addEventListener('load', () => shareStyles(frame));
  new MutationObserver(() => { for (const frame of frames) shareStyles(frame); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  for (const name of ['obsSourceVisibleChanged', 'obsSourceActiveChanged', 'obsSceneChanged', 'obsStreamingStarted', 'obsStreamingStopped', 'obsRecordingStarted', 'obsRecordingStopped']) {
    addEventListener(name, (event) => {
      for (const frame of frames) {
        try { frame.contentWindow?.dispatchEvent(new frame.contentWindow.CustomEvent(name, { detail: event.detail })); } catch { /* A frame still loading catches up from its own first report. */ }
      }
    });
  }
})();
