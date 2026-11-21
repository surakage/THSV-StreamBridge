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
  for (const name of ['obsSourceVisibleChanged', 'obsSourceActiveChanged', 'obsSceneChanged', 'obsStreamingStarted', 'obsStreamingStopped', 'obsRecordingStarted', 'obsRecordingStopped']) {
    addEventListener(name, (event) => {
      for (const frame of frames) {
        try { frame.contentWindow?.dispatchEvent(new frame.contentWindow.CustomEvent(name, { detail: event.detail })); } catch { /* A frame still loading catches up from its own first report. */ }
      }
    });
  }
})();
