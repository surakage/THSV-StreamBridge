import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { ObsDirectSceneClient } from '../../bridge/services/obs-direct-scene-client.js';
let stop: AbortController | undefined;
let server: WebSocketServer | undefined;
afterEach(async () => { stop?.abort(); for (const socket of server?.clients ?? []) socket.terminate(); const current = server; if (current !== undefined) await new Promise<void>((resolve) => current.close(() => resolve())); });

interface FakeObs { readonly url: string; readonly identifies: Record<string, unknown>[]; readonly requests: string[]; readonly sockets: WebSocket[]; streaming: boolean }
async function fakeObs(): Promise<FakeObs> {
  server = new WebSocketServer({ port: 0 }); await once(server, 'listening');
  const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('Missing server address');
  const state: FakeObs = { url: `ws://127.0.0.1:${String(address.port)}`, identifies: [], requests: [], sockets: [], streaming: false };
  server.on('connection', (socket) => {
    state.sockets.push(socket);
    socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    socket.on('message', (raw) => {
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(new Uint8Array(raw)).toString('utf8');
      const value = JSON.parse(text) as { op?: number; d?: Record<string, unknown> };
      if (value.op === 1) { state.identifies.push(value.d ?? {}); socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); }
      if (value.op === 6) {
        const requestType = String(value.d?.['requestType']); state.requests.push(requestType);
        const responseData = requestType === 'GetStreamStatus' ? { outputActive: state.streaming } : { scenes: [{ sceneName: 'Live' }], currentProgramSceneName: 'Live' };
        socket.send(JSON.stringify({ op: 7, d: { requestType, requestId: value.d?.['requestId'], requestStatus: { result: true, code: 100 }, responseData } }));
      }
    });
  });
  return state;
}

it('confirms the scene even if OBS misses a notification and stops confirming when disconnected', async () => {
  const obs = await fakeObs();
  stop = new AbortController(); const changed = vi.fn();
  const watching = new ObsDirectSceneClient(obs.url, '', 4_000, obs.url, 'OBS', 200).watchChanges(changed, stop.signal);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2_000 });
  stop.abort(); await watching; const calls = changed.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 500)); expect(changed).toHaveBeenCalledTimes(calls);
});

it('defaults to a slow confirmation interval instead of re-querying every second', async () => {
  const obs = await fakeObs();
  stop = new AbortController(); const changed = vi.fn();
  const client = new ObsDirectSceneClient(obs.url);
  const watching = client.watchChanges(changed, stop.signal);
  await vi.waitFor(() => expect(client.hasOpenSession()).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  expect(changed).not.toHaveBeenCalled();
  stop.abort(); await watching;
});

it('reuses the open subscribed socket for scene and stream-state queries and forwards stream state events', async () => {
  const obs = await fakeObs();
  stop = new AbortController();
  const watcher = new ObsDirectSceneClient(obs.url, '', 4_000, 'profile', 'OBS');
  const monitorClient = new ObsDirectSceneClient(obs.url);
  const signals: string[] = []; const unsubscribe = monitorClient.onStreamStateSignal((signal) => signals.push(signal));
  const watching = watcher.watchChanges(vi.fn(), stop.signal);
  await vi.waitFor(() => expect(signals).toEqual(['connected']));
  expect(obs.identifies).toHaveLength(1);
  // Scenes (4) and Outputs (64) are both subscribed on the single socket.
  expect(obs.identifies[0]?.['eventSubscriptions']).toBe(4 | 64);
  for (let index = 0; index < 5; index += 1) {
    await expect(watcher.getSceneList()).resolves.toMatchObject({ connectionId: 'profile', currentScene: 'Live' });
    await expect(monitorClient.isStreaming()).resolves.toBe(false);
  }
  expect(obs.sockets).toHaveLength(1); expect(obs.identifies).toHaveLength(1);
  expect(obs.requests.filter((request) => request === 'GetStreamStatus')).toHaveLength(5);
  obs.streaming = true;
  obs.sockets[0]?.send(JSON.stringify({ op: 5, d: { eventType: 'StreamStateChanged', eventData: { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' } } }));
  await vi.waitFor(() => expect(signals).toEqual(['connected', 'stream-state-changed']));
  await expect(monitorClient.isStreaming()).resolves.toBe(true);
  stop.abort(); await watching; unsubscribe();
  expect(monitorClient.hasOpenSession()).toBe(false);
  // Without an open subscription a one-off query still works on its own connection.
  await expect(monitorClient.isStreaming()).resolves.toBe(true);
  expect(obs.identifies).toHaveLength(2); expect(obs.identifies[1]?.['eventSubscriptions']).toBe(0);
});
