'use strict';
const ports = new Set();
let socket;
let reconnectTimer;
let transportState = 'reconnecting';
let alertPreview;
const chatPreviews = new Map();
const addOnPreviews = new Map();

self.onconnect = (connection) => {
  const port = connection.ports[0];
  ports.add(port);
  port.start();
  port.postMessage({ kind: 'transport.status', state: transportState });
  if (alertPreview) port.postMessage(alertPreview);
  for (const preview of chatPreviews.values()) port.postMessage(preview);
  for (const preview of addOnPreviews.values()) port.postMessage(preview);
  port.addEventListener('message', (message) => {
    if (message.data?.kind === 'transport.send') {
      if (socket?.readyState === WebSocket.OPEN && typeof message.data.payload === 'object') socket.send(JSON.stringify(message.data.payload));
      return;
    }
    if (message.data?.kind !== 'disconnect') return;
    ports.delete(port);
    port.close();
    if (ports.size === 0) {
      clearTimeout(reconnectTimer);
      const closingSocket = socket;
      socket = undefined;
      setTransportState('reconnecting');
      closingSocket?.close(1000, 'No overlay sections remain');
    }
  });
  connect();
};

function connect() {
  if (ports.size === 0 || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  const protocol = self.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const candidate = new WebSocket(`${protocol}//${self.location.host}/overlay/events`);
  socket = candidate;
  candidate.addEventListener('open', () => {
    if (socket === candidate) setTransportState('live');
  });
  candidate.addEventListener('message', (message) => {
    if (socket !== candidate) return;
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    if (event.kind === 'alert.show') alertPreview = event.payload?.templatePreview === true ? event : undefined;
    if (event.kind === 'chat.add' && event.payload?.templatePreview === true && chatPreviews.size < 10) chatPreviews.set(event.payload.platform, event);
    if (event.kind === 'alert.preview.clear' || event.kind === 'overlay.reset') alertPreview = undefined;
    if (event.kind === 'chat.preview.clear' || event.kind === 'overlay.reset') chatPreviews.clear();
    if (event.kind === 'addon.publish' && event.payload?.templatePreview === true && addOnPreviews.size < 200) addOnPreviews.set(event.moduleId, event);
    if (event.kind === 'addon.publish' && event.topic === `${event.moduleId}.preview.hide`) addOnPreviews.delete(event.moduleId);
    if (event.kind === 'overlay.reset') addOnPreviews.clear();
    for (const port of ports) port.postMessage(event);
  });
  candidate.addEventListener('close', () => {
    if (socket !== candidate) return;
    socket = undefined;
    setTransportState('reconnecting');
    clearTimeout(reconnectTimer);
    if (ports.size > 0) reconnectTimer = setTimeout(connect, 1500);
  });
}

function setTransportState(state) {
  if (state !== 'live') { alertPreview = undefined; chatPreviews.clear(); addOnPreviews.clear(); }
  transportState = state;
  for (const port of ports) port.postMessage({ kind: 'transport.status', state });
}
