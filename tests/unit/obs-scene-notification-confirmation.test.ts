import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { ObsDirectSceneClient } from '../../bridge/services/obs-direct-scene-client.js';
let stop: AbortController | undefined;
let server: WebSocketServer | undefined;
afterEach(async () => { stop?.abort(); for (const socket of server?.clients ?? []) socket.terminate(); const current = server; if (current !== undefined) await new Promise<void>((resolve) => current.close(() => resolve())); });
it('confirms the scene even if OBS misses a notification and stops confirming when disconnected', async () => {
  server = new WebSocketServer({ port: 0 }); await once(server, 'listening');
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    socket.on('message', (raw) => { const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(new Uint8Array(raw)).toString('utf8'); const value = JSON.parse(text) as { op?: number }; if (value.op === 1) socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); });
  });
  const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('Missing server address');
  stop = new AbortController(); const changed = vi.fn();
  const watching = new ObsDirectSceneClient(`ws://127.0.0.1:${String(address.port)}`).watchChanges(changed, stop.signal);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2_000 });
  stop.abort(); await watching; const calls = changed.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 1_100)); expect(changed).toHaveBeenCalledTimes(calls);
});
