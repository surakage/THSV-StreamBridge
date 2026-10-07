import { describe, expect, it } from 'vitest';
// @ts-expect-error packaged add-ons are JavaScript
import * as lurkTrackerModule from '../../addons/lurk-tracker/dist/index.js';

interface LurkEntry { visits: number; since: number; seconds: number }
interface LurkState { entries?: LurkEntry[] }
type Context = ReturnType<typeof harness>['context'];
type TestEvent = ReturnType<typeof event>;
const { default: tracker, processLurkEvent } = lurkTrackerModule as {
  default: { start: (context: Context) => Promise<void>; stop: (context: Context) => Promise<void> };
  processLurkEvent: (event: TestEvent, context: Context, now: number) => Promise<void>;
};

function harness() {
  let state: LurkState = {};
  const chats: unknown[] = [];
  const context = { settings: { enabled: true }, state: { read: async () => state, write: async (next: LurkState) => { state = structuredClone(next); } },
    chat: { send: async (request: unknown) => { chats.push(request); } }, viewerFoundation: { getProjection: async () => ({ viewerId: 'facebook-viewer' }) }, schedule: { after: () => 'test-task', cancel: () => undefined } };
  return { context, chats, state: () => state, entry: () => state.entries?.[0] };
}
function event(type: string, id: string, platform = 'facebook') { return { eventType: type, eventId: id, platform, user: { id: '123', name: 'Villager', displayName: 'Villager', actorType: 'human' }, source: { eventId: id }, payload: type === 'command.received' ? { command: 'lurk' } : { message: 'Hello village!' }, metadata: { simulated: false } }; }
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
    const bot = event('command.received','bot'); bot.user.name = 'suraruisuh_bot';
    await processLurkEvent(bot, h.context, now);
    const simulated = event('command.received','sim'); simulated.metadata.simulated = true;
    await processLurkEvent(simulated, h.context, now); expect(h.state()).toEqual({});
    await processLurkEvent(event('command.received','one'), h.context, now);
    await processLurkEvent(event('chat.message','return'), h.context, now + 30000);
    await processLurkEvent(event('chat.message','return'), h.context, now + 60000);
    expect(h.entry()?.seconds).toBe(30);
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
