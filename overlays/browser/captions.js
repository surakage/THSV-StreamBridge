(() => {
  'use strict';
  const stage = document.getElementById('caption-stage');
  const caption = document.getElementById('caption');
  const captionText = document.getElementById('caption-text');
  const rendererId = globalThis.crypto?.randomUUID?.() || `caption-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let hideTimer;
  let captionExpiresAt = 0;
  let sendTransport = () => {};
  let obsVisible = document.visibilityState !== 'hidden';
  let obsActive;
  let obsScene;

  const colors = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
  const integer = (value, minimum, maximum, fallback) => Number.isInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
  const decimal = (value, minimum, maximum, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
  const rgba = (hex, opacity) => { const clean = colors(hex, '#101722').slice(1); return `rgb(${parseInt(clean.slice(0,2),16)} ${parseInt(clean.slice(2,4),16)} ${parseInt(clean.slice(4,6),16)} / ${Math.round(decimal(opacity,0,1,.88)*100)}%)`; };

  function applyStyle(raw = {}) {
    const mode = ['solid','glass','highlight','none'].includes(raw.backgroundMode) ? raw.backgroundMode : 'glass';
    caption.dataset.background = mode;
    caption.dataset.font = ['system','rounded','serif','mono'].includes(raw.fontFamily) ? raw.fontFamily : 'system';
    caption.dataset.animation = ['fade','slide','pop','none'].includes(raw.animation) ? raw.animation : 'fade';
    stage.dataset.position = ['top','center','bottom'].includes(raw.position) ? raw.position : 'bottom';
    caption.style.textAlign = ['left','center','right'].includes(raw.textAlign) ? raw.textAlign : 'center';
    caption.style.setProperty('--caption-color', colors(raw.textColor, '#ffffff'));
    caption.style.setProperty('--caption-outline', colors(raw.outlineColor, '#000000'));
    caption.style.setProperty('--caption-outline-width', `${integer(raw.outlineWidthPx,0,8,2)}px`);
    caption.style.setProperty('--caption-background', mode === 'none' ? 'transparent' : rgba(raw.backgroundColor, raw.backgroundOpacity));
    caption.style.setProperty('--caption-padding', `${integer(raw.paddingPx,0,64,20)}px`);
    caption.style.setProperty('--caption-radius', `${integer(raw.borderRadiusPx,0,64,18)}px`);
    caption.style.setProperty('--caption-font-size', `${integer(raw.fontSizePx,20,120,48)}px`);
    caption.style.setProperty('--caption-font-weight', String(integer(raw.fontWeight,400,900,800)));
    caption.style.setProperty('--caption-width', `${integer(raw.maximumWidthPercent,25,100,86)}%`);
    caption.style.setProperty('--caption-lines', String(integer(raw.maximumLines,1,6,3)));
    const shadow = raw.shadowEnabled === false ? 'none' : `${integer(raw.shadowOffsetXpx,-30,30,0)}px ${integer(raw.shadowOffsetYpx,-30,30,4)}px ${integer(raw.shadowBlurPx,0,40,12)}px ${colors(raw.shadowColor,'#000000')}`;
    caption.style.setProperty('--caption-shadow', shadow);
  }

  function show(payload) {
    if (typeof payload?.text !== 'string' || payload.text.trim() === '') return;
    const durationMs = integer(payload.durationMs,1_000,30_000,6_000);
    const declaredExpiry = typeof payload.expiresAt === 'string' ? Date.parse(payload.expiresAt) : Number.NaN;
    const remainingMs = Number.isFinite(declaredExpiry) ? Math.min(durationMs, declaredExpiry - Date.now()) : durationMs;
    if (remainingMs <= 0) { clear(); return; }
    clearTimeout(hideTimer); applyStyle(payload.style); captionText.textContent = payload.text; caption.classList.remove('hidden','caption-enter');
    void caption.offsetWidth; caption.classList.add('caption-enter');
    captionExpiresAt = Date.now() + remainingMs;
    hideTimer = setTimeout(clear, remainingMs);
  }
  function clear() { clearTimeout(hideTimer); captionExpiresAt = 0; caption.classList.add('hidden'); caption.classList.remove('caption-enter'); captionText.textContent = ''; }
  function enforceExpiry() { if (captionExpiresAt > 0 && Date.now() >= captionExpiresAt) clear(); }
  function receive(event) { if (event.kind === 'caption.show' && event.contractVersion === 'thsv-live-captions-v1') show(event.payload); else if (event.kind === 'caption.clear' || event.kind === 'overlay.reset') clear(); }
  function reportHostVisibility() { sendTransport({ contractVersion:'thsv-addon-overlay-v1',kind:'host.visibility',rendererId,host:window.obsstudio?'obs':'browser',moduleId:'core.live-captions',surface:'/overlay/captions',visible:window.obsstudio?obsVisible:document.visibilityState!=='hidden',...(typeof obsActive==='boolean'?{active:obsActive}:{}),...(typeof obsScene==='string'?{scene:obsScene}:{}) }); }
  function refreshObsScene(){ if(typeof window.obsstudio?.getCurrentScene==='function')window.obsstudio.getCurrentScene((scene)=>{if(typeof scene?.name==='string')obsScene=scene.name;reportHostVisibility()}); }
  document.addEventListener('visibilitychange',()=>{enforceExpiry();if(!window.obsstudio)obsVisible=document.visibilityState!=='hidden';reportHostVisibility()});
  addEventListener('pageshow',enforceExpiry);
  setInterval(enforceExpiry,1_000);
  addEventListener('obsSourceVisibleChanged',(event)=>{const value=event.detail?.visible??event.detail;if(typeof value==='boolean')obsVisible=value;reportHostVisibility()});
  addEventListener('obsSourceActiveChanged',(event)=>{const value=event.detail?.active??event.detail;if(typeof value==='boolean')obsActive=value;reportHostVisibility()});
  addEventListener('obsSceneChanged',(event)=>{const value=event.detail?.name??event.detail?.sceneName;if(typeof value==='string')obsScene=value;reportHostVisibility()});
  refreshObsScene(); setInterval(reportHostVisibility,15_000);
  function connectDirectly(){const protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(`${protocol}//${location.host}/overlay/events`);sendTransport=(payload)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(payload))};socket.addEventListener('open',reportHostVisibility);socket.addEventListener('message',(message)=>{try{receive(JSON.parse(message.data))}catch{}});socket.addEventListener('close',()=>setTimeout(connectDirectly,1500));}
  function connect(){if('SharedWorker'in window){try{const worker=new SharedWorker('/overlay/worker-1.3.3.js','thsv-browser-overlay-1.3.3');sendTransport=(payload)=>worker.port.postMessage({kind:'transport.send',payload});worker.port.addEventListener('message',(message)=>{if(message.data?.kind==='transport.status'){if(message.data.state==='live')reportHostVisibility();return}receive(message.data)});worker.port.start();return}catch{}}connectDirectly();}
  addEventListener('beforeunload',()=>sendTransport({contractVersion:'thsv-addon-overlay-v1',kind:'host.visibility',rendererId,host:window.obsstudio?'obs':'browser',moduleId:'core.live-captions',surface:'/overlay/captions',visible:false}));
  connect();
})();
