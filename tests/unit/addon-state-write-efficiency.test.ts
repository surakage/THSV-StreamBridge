import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import * as chatPlayModule from '../../addons/chat-play-pack/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import * as lurkTrackerModule from '../../addons/lurk-tracker/dist/index.js';

type State = Record<string, unknown>;
type Task = () => unknown;
interface Harness { context: Record<string, unknown>; writes: State[]; tick: () => Promise<void>; state: () => State }
interface Lifecycle { start: (context: Record<string, unknown>) => Promise<void>; stop: (context: Record<string, unknown>) => Promise<void> }

const chatPlay = (chatPlayModule as { default: Lifecycle }).default;
const { default: lurkTracker, processLurkEvent } = lurkTrackerModule as { default: Lifecycle; processLurkEvent: (event: Record<string, unknown>, context: Record<string, unknown>, now: number) => Promise<void> };

function harness(initial: State, settings: State): Harness {
  let state = initial; let pending: Task | undefined;
  const writes: State[] = [];
  const context = {
    settings: { enabled: true, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: State) => { state = structuredClone(value); writes.push(state); }) },
    schedule: { after: (_delay: number, task: Task) => { pending = task; return 'monthly-task'; }, cancel: () => true },
    chat: { send: vi.fn(async () => []) }, overlay: { publish: vi.fn(async () => undefined) },
    streamerbot: { runApprovedAction: vi.fn(async () => ({ dispatched: true })) },
    viewerFoundation: { getProjection: vi.fn(async () => ({ viewerId: 'viewer-abc' })), mutate: vi.fn(async () => ({})), onDeleted: () => () => undefined },
  };
  const tick = async () => { const task = pending; pending = undefined; if (task === undefined) throw new Error('No timer was scheduled.'); await task(); };
  return { context, writes, tick, state: () => state };
}

const lurkEvent = { eventType: 'command.received', eventId: 'lurk-1', platform: 'twitch', user: { id: '1', name: 'Villager', displayName: 'Villager', actorType: 'human' }, source: { eventId: 'lurk-1' }, payload: { command: 'lurk' }, metadata: { simulated: false } };

describe('add-on periodic state writes', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('Chat Play Pack only rewrites its state when the month rolls over', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-15T12:00:00Z');
    const h = harness({}, {});
    await chatPlay.start(h.context);
    const afterStart = h.writes.length;
    await h.tick(); await h.tick();
    expect(h.writes).toHaveLength(afterStart + (afterStart === 0 ? 1 : 0));
    const settled = h.writes.length;
    await h.tick();
    expect(h.writes).toHaveLength(settled);
    vi.setSystemTime('2026-11-02T12:00:00Z');
    await h.tick();
    expect(h.writes).toHaveLength(settled + 1);
    expect(h.state()['month']).toBe('2026-11');
    await chatPlay.stop(h.context);
  });

  it('Lurk Tracker skips idle heartbeats but keeps them while someone is lurking', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-15T12:00:00Z');
    const h = harness({}, { announceLurk: false });
    await lurkTracker.start(h.context);
    const idle = h.writes.length;
    await h.tick();
    expect(h.writes).toHaveLength(idle);
    await processLurkEvent(lurkEvent, h.context, Date.now());
    const lurking = h.writes.length;
    vi.setSystemTime('2026-10-15T12:01:00Z');
    await h.tick();
    expect(h.writes).toHaveLength(lurking + 1);
    expect(h.state()['lastTickAt']).toBe(Date.now());
    await lurkTracker.stop(h.context);
  });

  it('Random Clip Player backs off while Streamer.bot is unavailable and resets after success', async () => {
    const source = await readFile('addons/random-clip-player/dist/index.js', 'utf8');
    expect(source).toContain('const CONNECTION_RETRY_MAX_MS = 30_000;');
    expect(source).toContain('Math.min(CONNECTION_RETRY_MAX_MS, CONNECTION_RETRY_MS * 2 ** connectionFailures)');
    expect(source.match(/runApprovedAction\([^;]+\); connectionFailures = 0; \}/gu)).toHaveLength(2);
  });
});
