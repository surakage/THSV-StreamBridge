'use strict';
const ports = new Set();
let socket;
let reconnectTimer;
let transportState = 'reconnecting';

self.onconnect = (connection) => {
  const port = connection.ports[0];
  ports.add(port);
  port.start();
  port.postMessage({ kind: 'transport.status', state: transportState });
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
  transportState = state;
  for (const port of ports) port.postMessage({ kind: 'transport.status', state });
}
