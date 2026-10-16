import { once } from 'node:events';
import { afterEach, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { ObsDirectSceneClient } from '../../bridge/services/obs-direct-scene-client.js';

let server: WebSocketServer | undefined;
afterEach(async () => { for (const socket of server?.clients ?? []) socket.terminate(); const current = server; if (current !== undefined) await new Promise<void>((resolve) => current.close(() => resolve())); server = undefined; });

/** Fake OBS whose virtual camera reports active only some time after StartVirtualCam, like real OBS. */
async function fakeObs(activationDelayMs: number | undefined): Promise<{ url: string; requests: string[] }> {
  server = new WebSocketServer({ port: 0 }); await once(server, 'listening');
  const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('Missing server address');
  const requests: string[] = []; let activeAt: number | undefined;
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    socket.on('message', (raw) => {
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(new Uint8Array(raw)).toString('utf8');
      const value = JSON.parse(text) as { op?: number; d?: Record<string, unknown> };
      if (value.op === 1) socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      if (value.op !== 6) return;
      const requestType = String(value.d?.['requestType']); requests.push(requestType);
      if (requestType === 'StartVirtualCam' && activationDelayMs !== undefined) activeAt = Date.now() + activationDelayMs;
      const responseData = requestType === 'GetVirtualCamStatus' ? { outputActive: activeAt !== undefined && Date.now() >= activeAt } : {};
      socket.send(JSON.stringify({ op: 7, d: { requestType, requestId: value.d?.['requestId'], requestStatus: { result: true, code: 100 }, responseData } }));
    });
  });
  return { url: `ws://127.0.0.1:${String(address.port)}`, requests };
}

it('waits for OBS Virtual Camera to report running after starting it', async () => {
  const obs = await fakeObs(400);
  await expect(new ObsDirectSceneClient(obs.url).ensureVirtualCamera()).resolves.toBe(true);
  expect(obs.requests.filter((request) => request === 'StartVirtualCam')).toHaveLength(1);
  expect(obs.requests.filter((request) => request === 'GetVirtualCamStatus').length).toBeGreaterThan(2);
});

it('gives up when OBS Virtual Camera never starts', async () => {
  const obs = await fakeObs(undefined);
  await expect(new ObsDirectSceneClient(obs.url).ensureVirtualCamera(600)).resolves.toBe(false);
});
