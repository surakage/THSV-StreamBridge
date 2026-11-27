import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { TikTokLiveStudioControl } from '../../bridge/services/tiktok-live-studio-control.js';
import { TikTokLiveAutomation } from '../../bridge/services/tiktok-live-automation.js';

/** A minimal stand-in for TikTok LIVE Studio's Stream Deck channel (socket.io v4 framing over WebSocket). */
interface FakeStudio {
  readonly port: number;
  status: number;
  readonly presses: Record<string, unknown>[];
  /** What LIVE Studio does when Go / end LIVE is pressed. */
  onPress: 'toggle' | 'reject' | 'ignore';
}
let servers: WebSocketServer[] = [];
afterEach(async () => {
  for (const server of servers) { for (const client of server.clients) client.terminate(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  servers = [];
});

async function fakeStudio(initialStatus: number): Promise<FakeStudio> {
  const server = new WebSocketServer({ port: 0, handleProtocols: (protocols) => (protocols.has('streamdeck_ttls_v1') ? 'streamdeck_ttls_v1' : false) });
  servers.push(server); await once(server, 'listening');
  const address = server.address(); if (typeof address === 'string' || address === null) throw new Error('no address');
  const studio: FakeStudio = { port: address.port, status: initialStatus, presses: [], onPress: 'toggle' };
  const send = (socket: WebSocket, event: string, payload?: unknown): void => { socket.send(`42${JSON.stringify(payload === undefined ? [event] : [event, payload])}`); };
  const settings = (): string => JSON.stringify({ audio_mute: false, mic_mute: false, scene: 'Virtual Camera', stream_status: studio.status, recording: false });
  server.on('connection', (socket) => {
    socket.send(`0${JSON.stringify({ sid: 'fake', upgrades: [], pingInterval: 25_000, pingTimeout: 20_000 })}`);
    socket.on('message', (raw) => {
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(new Uint8Array(raw)).toString('utf8');
      if (text === '40') { socket.send('40{"sid":"ns"}'); return; }
      if (!text.startsWith('42')) return;
      const [event, payload] = JSON.parse(text.slice(2)) as [string, string | undefined];
      if (event === 'stream_deck/join_room') send(socket, 'stream_deck/join_room');
      if (event === 'stream_deck/sync_settings') send(socket, 'stream_deck/sync_settings', settings());
      if (event === 'stream_deck/action_emit' && payload !== undefined) {
        const action = JSON.parse(payload) as Record<string, unknown>; studio.presses.push(action);
        if (studio.onPress === 'reject') { send(socket, `stream_deck/${String(action['context'])}`, JSON.stringify({ code: -1 })); return; }
        send(socket, `stream_deck/${String(action['context'])}`, JSON.stringify({ code: 0 }));
        const pause = action['action'] === 'com.tiktok.livestudio.livepauseresume';
        if (studio.onPress === 'toggle') setTimeout(() => { studio.status = pause ? (studio.status === 2 ? 1 : 2) : studio.status === 2 ? 0 : 2; send(socket, 'stream_deck/sync_settings', settings()); }, 50);
      }
    });
  });
  return studio;
}

function automation(studio: FakeStudio | undefined, overrides: { virtualCamera?: boolean; studioEnabled?: boolean; notLiveRecheckMs?: number; startWaitMs?: number; pauseLimitMs?: number } = {}) {
  const onLiveState = vi.fn<(live: boolean) => Promise<void>>(async () => undefined);
  const control = new TikTokLiveStudioControl({ ports: studio === undefined ? [1] : [1, studio.port], connectTimeoutMs: 500, requestTimeoutMs: 1_000 });
  const reminder = { broadcastStarted: vi.fn(async () => undefined), broadcastStopped: vi.fn(async () => undefined), pauseFailed: vi.fn(async () => undefined), pauseResumed: vi.fn(async () => undefined) };
  const sceneRoles = () => ({ starting: 'Starting Soon', break: 'Be Right Back', ending: 'Ending' });
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const ensureVirtualCamera = vi.fn(async () => overrides.virtualCamera ?? true);
  return { control, reminder, logger, ensureVirtualCamera, onLiveState, make: (settingsPath: string) => new TikTokLiveAutomation({ settingsPath, control, reminder, ensureVirtualCamera, onLiveState, notLiveRecheckMs: overrides.notLiveRecheckMs ?? 300, studioEnabled: async () => overrides.studioEnabled ?? true, logger, confirmTimeoutMs: 1_500, sceneRoles, ...(overrides.startWaitMs === undefined ? {} : { startWaitMs: overrides.startWaitMs }), ...(overrides.pauseLimitMs === undefined ? {} : { pauseLimitMs: overrides.pauseLimitMs }) }) };
}

async function settingsFile(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-tiktok-automation-'));
  return { path: join(root, 'configuration', 'tiktok-live-automation.json'), cleanup: () => rm(root, { recursive: true, force: true }) };
}

describe('TikTokLiveStudioControl', () => {
  it('finds LIVE Studio on its known ports, joins like the plugin and reads the live state', async () => {
    const studio = await fakeStudio(0);
    const session = await new TikTokLiveStudioControl({ ports: [1, studio.port], connectTimeoutMs: 500 }).open();
    expect(session?.streamStatus()).toBe(0);
    session?.close();
    expect(studio.presses).toEqual([]);
  });

  it('returns undefined when LIVE Studio is not running', async () => {
    await expect(new TikTokLiveStudioControl({ ports: [1], connectTimeoutMs: 300 }).open()).resolves.toBeUndefined();
  });
});

describe('TikTokLiveAutomation', () => {
  it('stays off by default and only reminds', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.broadcastStarted();
      expect(studio.presses).toEqual([]);
      expect(h.reminder.broadcastStarted).toHaveBeenCalledOnce();
      expect(await subject.status()).toMatchObject({ enabled: false });
    } finally { await file.cleanup(); }
  });

  it('goes live with OBS, then ends the LIVE when OBS stops', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      expect(JSON.parse(await readFile(file.path, 'utf8'))).toEqual({ enabled: true });
      await subject.broadcastStarted();
      expect(h.ensureVirtualCamera).toHaveBeenCalledOnce();
      expect(studio.presses).toHaveLength(1);
      expect(studio.presses[0]).toMatchObject({ action: 'com.tiktok.livestudio.livestartend', event: 'keyDown' });
      expect(studio.status).toBe(2);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'obs-started', outcome: 'went-live' } });
      expect(h.reminder.broadcastStarted).not.toHaveBeenCalled();
      expect(h.onLiveState.mock.calls).toEqual([[true]]);
      await subject.broadcastStopped();
      expect(studio.presses).toHaveLength(2);
      expect(studio.status).toBe(0);
      expect(h.onLiveState.mock.calls).toEqual([[true], [false]]);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'obs-stopped', outcome: 'ended-live' } });
    } finally { await file.cleanup(); }
  });

  it('never presses the toggle when that would do the opposite of what OBS did', async () => {
    const file = await settingsFile();
    try {
      // Already live when OBS starts: pressing would END the LIVE.
      const live = await fakeStudio(2); const a = automation(live).make(file.path);
      await a.setEnabled({ enabled: true }); await a.broadcastStarted();
      expect(live.presses).toEqual([]); expect(await a.status()).toMatchObject({ last: { outcome: 'already-live' } });
      // Not live when OBS stops: pressing would START a LIVE.
      const idle = await fakeStudio(0); const b = automation(idle).make(file.path);
      await b.broadcastStopped();
      expect(idle.presses).toEqual([]); expect(await b.status()).toMatchObject({ last: { outcome: 'not-live' } });
      // Paused: left alone on start.
      const paused = await fakeStudio(1); const c = automation(paused).make(file.path);
      await c.broadcastStarted();
      expect(paused.presses).toEqual([]); expect(await c.status()).toMatchObject({ last: { outcome: 'paused-left-alone' } });
    } finally { await file.cleanup(); }
  });

  it('falls back to the reminder whenever anything is in doubt', async () => {
    const file = await settingsFile();
    try {
      const closed = automation(undefined); const a = closed.make(file.path);
      await a.setEnabled({ enabled: true }); await a.broadcastStarted();
      expect(closed.reminder.broadcastStarted).toHaveBeenCalledOnce();

      const rejecting = await fakeStudio(0); rejecting.onPress = 'reject';
      const r = automation(rejecting); const b = r.make(file.path); await b.broadcastStarted();
      expect(r.reminder.broadcastStarted).toHaveBeenCalledOnce(); expect(await b.status()).toMatchObject({ last: { outcome: 'reminder' } });

      // LIVE Studio accepted the press but never reported going live (for example a confirmation window).
      const silent = await fakeStudio(0); silent.onPress = 'ignore';
      const s = automation(silent); const c = s.make(file.path); await c.broadcastStarted();
      expect(silent.presses).toHaveLength(1); expect(s.reminder.broadcastStarted).toHaveBeenCalledOnce();

      // No OBS Virtual Camera means TikTok would show nothing, so it does not go live.
      const noCamera = await fakeStudio(0); const v = automation(noCamera, { virtualCamera: false }); const d = v.make(file.path);
      await d.broadcastStarted();
      expect(noCamera.presses).toEqual([]); expect(v.reminder.broadcastStarted).toHaveBeenCalledOnce();
    } finally { await file.cleanup(); }
  });

  it('reminds when Go LIVE failed and LIVE Studio then reports not live at the end', async () => {
    const file = await settingsFile();
    try {
      // Go LIVE refused, so the creator starts TikTok by hand; at the end LIVE Studio wrongly says "not live".
      const studio = await fakeStudio(0); studio.onPress = 'reject';
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true }); await subject.broadcastStarted();
      expect(await subject.status()).toMatchObject({ last: { trigger: 'obs-started', outcome: 'reminder' } });
      await subject.broadcastStopped();
      expect(studio.presses).toHaveLength(1);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'obs-stopped', outcome: 'reminder' } });
      expect(h.reminder.broadcastStopped).toHaveBeenCalledOnce();
    } finally { await file.cleanup(); }
  });

  it('presses End LIVE when LIVE Studio corrects a momentary "not live" while OBS stops', async () => {
    const file = await settingsFile();
    try {
      const studio = await fakeStudio(0);
      // LIVE Studio is re-asked every 2 seconds, so give the recheck long enough to see the correction.
      const h = automation(studio, { notLiveRecheckMs: 3_000 }); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      setTimeout(() => { studio.status = 2; }, 100);
      await subject.broadcastStopped();
      expect(studio.presses).toHaveLength(1);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'obs-stopped', outcome: 'ended-live' } });
    } finally { await file.cleanup(); }
  });

  it('does nothing automatic unless TikTok LIVE Studio is enabled in the launcher, and validates the setting', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio, { studioEnabled: false }); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true }); await subject.broadcastStarted();
      expect(studio.presses).toEqual([]); expect(h.reminder.broadcastStarted).toHaveBeenCalledOnce();
      await expect(subject.setEnabled({ enabled: 'yes' })).rejects.toThrow('enabled must be true or false');
    } finally { await file.cleanup(); }
  });

  it('waits for the Starting scene to end before going LIVE, so TikTok never gets the still screen', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Starting Soon');
      expect(studio.presses).toEqual([]);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'obs-started', outcome: 'waiting' } });
      await subject.sceneChanged('Starting Soon');
      expect(studio.presses).toEqual([]);
      await subject.sceneChanged('Gameplay');
      expect(studio.presses).toHaveLength(1);
      expect(studio.status).toBe(2);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'starting-ended', outcome: 'went-live' } });
      expect(h.reminder.broadcastStarted).not.toHaveBeenCalled();
      await subject.broadcastStopped();
    } finally { await file.cleanup(); }
  });

  it('goes LIVE when a SprigCast countdown reaches 0 on the Starting scene', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Starting Soon');
      await subject.countdownDone();
      expect(studio.status).toBe(2);
      await subject.sceneChanged('Gameplay');
      expect(studio.presses).toHaveLength(1);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'countdown-done', outcome: 'went-live' } });
    } finally { await file.cleanup(); }
  });

  it('only reminds when the Starting scene never ends, and never starts TikTok on its own', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio, { startWaitMs: 100 }); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Starting Soon');
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(studio.presses).toEqual([]);
      expect(h.reminder.broadcastStarted).toHaveBeenCalledOnce();
      expect(await subject.status()).toMatchObject({ last: { trigger: 'start-wait-timeout', outcome: 'reminder' } });
      await subject.sceneChanged('Gameplay');
      expect(studio.presses).toEqual([]);
    } finally { await file.cleanup(); }
  });

  it('pauses the TikTok LIVE on the Break scene and continues after it', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Gameplay');
      await subject.sceneChanged('Be Right Back');
      expect(studio.presses[1]).toMatchObject({ action: 'com.tiktok.livestudio.livepauseresume', event: 'keyUp' });
      expect(studio.status).toBe(1);
      // SprigCast's Break & End Guard also says the break started: one pause is enough.
      await subject.breakStarted();
      expect(studio.presses).toHaveLength(2);
      await subject.sceneChanged('Gameplay');
      expect(studio.status).toBe(2);
      expect(studio.presses).toHaveLength(3);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'break-ended', outcome: 'resumed' } });
      expect(h.onLiveState.mock.calls).toEqual([[true]]);
    } finally { await file.cleanup(); }
  });

  it('continues before TikTok\'s pause limit and tells the creator', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio, { pauseLimitMs: 100 }); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Gameplay');
      await subject.breakStarted();
      expect(studio.status).toBe(1);
      await vi.waitFor(() => { expect(studio.status).toBe(2); }, { timeout: 3_000 });
      await vi.waitFor(() => { expect(h.reminder.pauseResumed).toHaveBeenCalledOnce(); });
      expect(await subject.status()).toMatchObject({ last: { trigger: 'pause-limit', outcome: 'resumed' } });
      await subject.breakEnded();
      expect(studio.presses).toHaveLength(3);
    } finally { await file.cleanup(); }
  });

  it('ends the TikTok LIVE when the Ending scene comes on, even from a pause, and stream stop finds nothing left', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Gameplay');
      await subject.sceneChanged('Be Right Back');
      expect(studio.status).toBe(1);
      await subject.sceneChanged('Ending');
      expect(studio.status).toBe(0);
      expect(studio.presses.map((press) => press['action'])).toEqual(['com.tiktok.livestudio.livestartend', 'com.tiktok.livestudio.livepauseresume', 'com.tiktok.livestudio.livepauseresume', 'com.tiktok.livestudio.livestartend']);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'ending-scene', outcome: 'ended-live' } });
      expect(h.onLiveState.mock.calls).toEqual([[true], [false]]);
      await subject.sceneChanged('Gameplay');
      await subject.broadcastStopped();
      expect(studio.presses).toHaveLength(4);
      expect(await subject.status()).toMatchObject({ last: { trigger: 'obs-stopped', outcome: 'not-live' } });
      expect(h.reminder.broadcastStopped).not.toHaveBeenCalled();
    } finally { await file.cleanup(); }
  });

  it('never starts TikTok when the stream stops while still on the Starting scene', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Starting Soon');
      await subject.broadcastStopped();
      await subject.countdownDone();
      expect(studio.presses).toEqual([]);
      expect(h.reminder.broadcastStopped).not.toHaveBeenCalled();
    } finally { await file.cleanup(); }
  });

  it('warns loudly when LIVE Studio does not take the pause, since TikTok is showing the break screen', async () => {
    const studio = await fakeStudio(0); const file = await settingsFile();
    try {
      const h = automation(studio); const subject = h.make(file.path);
      await subject.setEnabled({ enabled: true });
      await subject.broadcastStarted('Gameplay');
      studio.onPress = 'reject';
      await subject.sceneChanged('Be Right Back');
      expect(studio.status).toBe(2);
      expect(h.reminder.pauseFailed).toHaveBeenCalledOnce();
      expect(await subject.status()).toMatchObject({ last: { trigger: 'break-started', outcome: 'reminder' } });
    } finally { await file.cleanup(); }
  });
});
