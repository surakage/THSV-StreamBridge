import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
// @ts-expect-error packaged add-ons are JavaScript
import * as lurkTrackerModule from '../../addons/lurk-tracker/dist/index.js';

interface LurkEntry { visits: number; since: number; seconds: number }
interface LurkState { entries?: LurkEntry[] }
type Context = ReturnType<typeof harness>['context'];
type TestEvent = ReturnType<typeof event>;
const { default: tracker, processLurkEvent, isConnectedAccount } = lurkTrackerModule as {
  default: { start: (context: Context) => Promise<void>; stop: (context: Context) => Promise<void> };
  processLurkEvent: (event: TestEvent, context: Context, now: number) => Promise<void>;
  isConnectedAccount: (event: unknown) => boolean;
};

function harness(settings: Record<string, unknown> = { enabled: true }) {
  let state: LurkState = {};
  const chats: unknown[] = [];
  const context = { settings, state: { read: async () => state, write: async (next: LurkState) => { state = structuredClone(next); } },
    chat: { send: async (request: unknown) => { chats.push(request); } }, viewerFoundation: { getProjection: async () => ({ viewerId: 'facebook-viewer' }) }, schedule: { after: () => 'test-task', cancel: () => undefined } };
  return { context, chats, state: () => state, entry: () => state.entries?.[0] };
}
function event(type: string, id: string, platform = 'facebook') { return { eventType: type, eventId: id, platform, channel: { id: 'channel-1', name: 'Creator' }, user: { id: '123', name: 'Villager', displayName: 'Villager', actorType: 'human', roles: [] as string[] }, source: { eventId: id }, payload: (type === 'command.received' ? { command: 'lurk' } : { message: 'Hello village!' }) as Record<string, unknown>, metadata: { simulated: false } }; }
describe('Village Lurk Tracker', () => {
  it('starts once, thanks the source platform, ignores repeated raw/normalized lurks, and automatically returns on chat', async () => {
    const h = harness(), now = Date.parse('2026-10-05T18:00:00Z');
    await processLurkEvent(event('command.received','one'), h.context, now);
    const raw = { ...event('chat.message','two'), payload: { message: '!lurk' } };
    await processLurkEvent(raw, h.context, now + 60000);
    await processLurkEvent(event('command.received','three'), h.context, now + 120000);
    expect(h.entry()).toMatchObject({ visits: 1, since: now });
    await processLurkEvent(event('chat.message','four'), h.context, now + 300000);
    expect(h.entry()).toMatchObject({ visits: 1, since: 0, seconds: 300 });
    expect(h.chats).toHaveLength(1); expect(h.chats[0]).toMatchObject({ routing: 'source', sourcePlatform: 'facebook' });
  });
  it('does not count bot accounts, simulated events or replayed returns', async () => {
    const h = harness(), now = Date.parse('2026-10-05T18:00:00Z');
    const bot = event('command.received','bot'); bot.user.name = 'creator_bot'; bot.payload = { ...bot.payload, connectedAccountNames: ['Creator_Bot'] };
    await processLurkEvent(bot, h.context, now);
    const broadcaster = event('command.received','broadcaster'); broadcaster.user.roles = ['broadcaster'];
    await processLurkEvent(broadcaster, h.context, now);
    const simulated = event('command.received','sim'); simulated.metadata.simulated = true;
    await processLurkEvent(simulated, h.context, now); expect(h.state()).toEqual({});
    await processLurkEvent(event('command.received','one'), h.context, now);
    await processLurkEvent(event('chat.message','return'), h.context, now + 30000);
    await processLurkEvent(event('chat.message','return'), h.context, now + 60000);
    expect(h.entry()?.seconds).toBe(30);
  });
  it('ships no personal ignored names and recognizes connected accounts from bridge event data', async () => {
    const schema = JSON.parse(await readFile('addons/lurk-tracker/schemas/config.json', 'utf8')) as { properties: Record<string, { default: unknown; enum?: unknown }> };
    expect(schema.properties['ignoredNames']?.default).toEqual([]);
    expect(schema.properties['timeZone']).toMatchObject({ default: '' });
    expect(schema.properties['timeZone']?.enum).toBeUndefined();
    const viewer = event('chat.message', 'viewer');
    expect(isConnectedAccount(viewer)).toBe(false);
    expect(isConnectedAccount({ ...viewer, user: { ...viewer.user, name: 'creator' } })).toBe(true);
    expect(isConnectedAccount({ ...viewer, user: { ...viewer.user, id: 'channel-1' } })).toBe(true);
    expect(isConnectedAccount({ ...viewer, payload: { ...viewer.payload, fromConnectedAccount: true } })).toBe(true);
    expect(isConnectedAccount({ ...viewer, payload: { ...viewer.payload, connectedAccountIds: ['123'] } })).toBe(true);
    // A missing channel name is normalized to the platform name, which must never match a viewer.
    expect(isConnectedAccount({ ...viewer, channel: { name: 'facebook' }, user: { ...viewer.user, name: 'facebook' } })).toBe(false);
  });
  it('still honors creator-entered ignored names', async () => {
    const h = harness({ enabled: true, ignoredNames: ['Villager'] });
    await processLurkEvent(event('command.received','one'), h.context, Date.parse('2026-10-05T18:00:00Z'));
    expect(h.state()).toEqual({});
  });
  it('ends active lurks on offline and excludes Bridge downtime after restart', async () => {
    const h = harness(), now = Date.parse('2026-10-05T18:00:00Z');
    await processLurkEvent(event('command.received','one'), h.context, now);
    await tracker.start(h.context); expect(h.entry()).toMatchObject({ since: 0, seconds: 0 });
    await processLurkEvent(event('command.received','two'), h.context, now + 60000);
    await processLurkEvent(event('stream.offline','offline'), h.context, now + 180000);
    expect(h.entry()).toMatchObject({ since: 0, seconds: 120 });
    await tracker.stop(h.context);
  });
});
