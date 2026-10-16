import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { ObsDirectSceneClient, type ObsStreamOutputSample } from '../../bridge/services/obs-direct-scene-client.js';
import { ObsOutputHealthMonitor, streamOutputLabel } from '../../bridge/services/obs-output-health-monitor.js';

const TIKTOK = 'Aitum Stream Suite Output TikTok Output';
const KICK = 'Aitum Stream Suite Output Kick Output';

function harness(options: { alertAfterDroppedSamples?: number; recoveryMs?: number } = {}) {
  let now = Date.parse('2026-10-13T19:56:00.000Z');
  let samples: readonly ObsStreamOutputSample[] | undefined = [];
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const monitor = new ObsOutputHealthMonitor({ sample: async () => samples, logger, now: () => now, ...options });
  return {
    logger, monitor,
    async step(next: readonly ObsStreamOutputSample[] | undefined, advanceMs = 10_000) { now += advanceMs; samples = next; await monitor.tick(); },
    status: () => monitor.status() as { alerts: { name: string; label: string }[]; signature: string; obsConnected: boolean; streaming?: boolean },
  };
}

describe('ObsOutputHealthMonitor', () => {
  it('names Aitum, main and Twitch multitrack outputs the way the creator sees them', () => {
    expect(streamOutputLabel(TIKTOK)).toBe('TikTok Output');
    expect(streamOutputLabel('adv_stream')).toBe('Main stream');
    expect(streamOutputLabel('rtmp multitrack video')).toBe('Twitch Enhanced Broadcasting');
    expect(streamOutputLabel('Custom Output')).toBe('Custom Output');
  });

  it('reports whether OBS is streaming so the tray can remind about TikTok LIVE Studio', async () => {
    const h = harness();
    expect(h.status().streaming).toBeUndefined();
    await h.step([{ name: 'adv_stream', reconnecting: false, durationMs: 5_000 }]);
    expect(h.status().streaming).toBe(true);
    await h.step([]);
    expect(h.status().streaming).toBe(false);
    await h.step([{ name: 'adv_stream', reconnecting: false, durationMs: 5_000 }]);
    await h.step(undefined);
    expect(h.status().streaming).toBeUndefined();
  });

  it('reports an output caught in a reconnect loop while the healthy outputs stay quiet', async () => {
    const h = harness();
    await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 1_260_000 }, { name: KICK, reconnecting: false, durationMs: 1_260_000 }]);
    // TikTok is dropped a few seconds after every reconnect: each sample sees a brand-new connection
    // or OBS waiting to reconnect. Kick keeps one connection that ages normally.
    await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 1_300 }, { name: KICK, reconnecting: false, durationMs: 1_270_000 }]);
    await h.step([{ name: TIKTOK, reconnecting: true, durationMs: 0 }, { name: KICK, reconnecting: false, durationMs: 1_280_000 }]);
    expect(h.status().alerts).toEqual([]);
    await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 1_600 }, { name: KICK, reconnecting: false, durationMs: 1_290_000 }]);
    expect(h.status().alerts.map((alert) => alert.label)).toEqual(['TikTok Output']);
    expect(h.status().signature).toContain(TIKTOK);
    expect(h.logger.warn).toHaveBeenCalledOnce();
    expect(h.logger.warn).toHaveBeenCalledWith(expect.stringContaining('keeps disconnecting'), expect.objectContaining({ output: 'TikTok Output' }));
    // Still looping: the alert and its signature stay the same, so the tray notifies only once.
    const signature = h.status().signature;
    await h.step([{ name: TIKTOK, reconnecting: true, durationMs: 0 }, { name: KICK, reconnecting: false, durationMs: 1_300_000 }]);
    expect(h.status().signature).toBe(signature);
    expect(h.logger.warn).toHaveBeenCalledOnce();
  });

  it('ignores a single network blip', async () => {
    const h = harness();
    await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 600_000 }]);
    await h.step([{ name: TIKTOK, reconnecting: true, durationMs: 0 }]);
    await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 7_000 }]);
    for (let index = 1; index <= 12; index += 1) await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 7_000 + index * 10_000 }]);
    expect(h.status().alerts).toEqual([]);
    expect(h.logger.warn).not.toHaveBeenCalled();
  });

  it('clears the alert after the output has been stable, or when it is stopped, and alerts again on a new loop', async () => {
    const h = harness();
    await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 5_000 }]);
    for (let index = 0; index < 3; index += 1) await h.step([{ name: TIKTOK, reconnecting: true, durationMs: 0 }]);
    expect(h.status().alerts).toHaveLength(1);
    // New key pasted in: one fresh connection that keeps aging for over a minute.
    for (let index = 0; index < 7; index += 1) await h.step([{ name: TIKTOK, reconnecting: false, durationMs: 9_000 + index * 10_000 }]);
    expect(h.status().alerts).toEqual([]);
    expect(h.logger.info).toHaveBeenCalledWith('Stream output is stable again', { output: 'TikTok Output' });
    for (let index = 0; index < 3; index += 1) await h.step([{ name: TIKTOK, reconnecting: true, durationMs: 0 }], 40_000);
    expect(h.status().alerts).toHaveLength(1);
    await h.step([]);
    expect(h.status().alerts).toEqual([]);
    expect(h.logger.info).toHaveBeenCalledWith('Stream output alert cleared', { output: 'TikTok Output', reason: 'stopped' });
  });

  it('forgets every output while OBS is not connected and keeps sampling after a failed request', async () => {
    const h = harness();
    await h.step([{ name: TIKTOK, reconnecting: true, durationMs: 0 }]);
    await h.step(undefined);
    expect(h.status().obsConnected).toBe(false);
    expect(h.status().alerts).toEqual([]);
    const failing = new ObsOutputHealthMonitor({ sample: async () => { throw new Error('OBS GetOutputList failed'); }, logger: h.logger });
    await failing.tick();
    expect(failing.status()).toMatchObject({ lastError: 'OBS GetOutputList failed', alerts: [] });
  });
});

describe('ObsDirectSceneClient.getStreamingOutputs', () => {
  let server: WebSocketServer | undefined;
  let stop: AbortController | undefined;
  afterEach(async () => { stop?.abort(); for (const socket of server?.clients ?? []) socket.terminate(); const current = server; if (current !== undefined) await new Promise<void>((resolve) => current.close(() => resolve())); server = undefined; });

  it('reads only active streaming outputs over the open subscribed socket and never opens its own', async () => {
    server = new WebSocketServer({ port: 0 }); await once(server, 'listening');
    const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('Missing server address');
    const url = `ws://127.0.0.1:${String(address.port)}`;
    const requests: { requestType: string; requestData?: unknown }[] = []; let connections = 0;
    server.on('connection', (socket) => {
      connections += 1;
      socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
      socket.on('message', (raw) => {
        const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(new Uint8Array(raw)).toString('utf8');
        const value = JSON.parse(text) as { op?: number; d?: Record<string, unknown> };
        if (value.op === 1) socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        if (value.op !== 6) return;
        const requestType = String(value.d?.['requestType']); requests.push({ requestType, requestData: value.d?.['requestData'] });
        const service = { OBS_OUTPUT_SERVICE: true }; const local = { OBS_OUTPUT_SERVICE: false };
        const responseData = requestType === 'GetOutputList'
          ? { outputs: [
            { outputName: 'adv_stream', outputActive: true, outputFlags: service },
            { outputName: TIKTOK, outputActive: true, outputFlags: service },
            { outputName: KICK, outputActive: false, outputFlags: service },
            { outputName: 'virtualcam_output', outputActive: true, outputFlags: local },
            { outputName: 'adv_file_output', outputActive: true, outputFlags: local },
          ] }
          : requestType === 'GetOutputStatus'
            ? { outputActive: true, outputReconnecting: (value.d?.['requestData'] as { outputName?: string } | undefined)?.outputName === TIKTOK, outputDuration: 42_000 }
            : { scenes: [], currentProgramSceneName: '' };
        socket.send(JSON.stringify({ op: 7, d: { requestType, requestId: value.d?.['requestId'], requestStatus: { result: true, code: 100 }, responseData } }));
      });
    });
    const client = new ObsDirectSceneClient(url);
    expect(await client.getStreamingOutputs()).toBeUndefined();
    expect(connections).toBe(0);
    stop = new AbortController();
    const watching = client.watchChanges(vi.fn(), stop.signal);
    await vi.waitFor(() => expect(client.hasOpenSession()).toBe(true));
    expect(await client.getStreamingOutputs()).toEqual([
      { name: 'adv_stream', reconnecting: false, durationMs: 42_000 },
      { name: TIKTOK, reconnecting: true, durationMs: 42_000 },
    ]);
    expect(connections).toBe(1);
    expect(requests.filter((request) => request.requestType === 'GetOutputStatus').map((request) => request.requestData)).toEqual([{ outputName: 'adv_stream' }, { outputName: TIKTOK }]);
    stop.abort(); await watching;
  });
});
