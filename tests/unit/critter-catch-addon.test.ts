import type * as Crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Throws and visits use secure random numbers. The tests queue the numbers they need; anything else gets the highest
// value, which means "no Glimmer", "missed" and "did not run off".
const queued: number[] = [];
vi.mock('node:crypto', async (importOriginal) => ({ ...(await importOriginal<typeof Crypto>()), randomInt: (maximum: number) => Math.min(maximum - 1, queued.length > 0 ? (queued.shift() ?? 0) : maximum - 1) }));
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import critters, { VILLAGE, activePlatforms, resetChatters, catchChance, critterPool, hasCritter, manifest, maskCount, parseCustomCritter, pickCritter, rollSeason, settingsFor, stateFor, villageRate, withCritter } from '../../addons/critter-catch/dist/index.js';
import { addOnOverlayPreviewTopic, buildAddOnOverlayPreview } from '../../bridge/services/http-server.js';
import { summarizeTracker, trackerMonth } from '../../bridge/services/monthly-tracker-reports.js';
import { validateSettings } from '../../bridge/services/addon-wizard-service.js';

interface Throw { keeper: string; jar: string; ok: boolean; wobbles: number; fled: boolean }
interface Wild { name: string; status: string; glimmer: boolean; caughtBy: string[]; throws: Throw[] }
interface Keeper { key: string; name: string; v: string; catches: number; month: number; throws: number }
interface State { month: string; wild: Wild | null; keepers: Keeper[]; nextSpawnAt: number; paused: boolean; monthCatches: number; monthSpawns: number; hallOfFame: Array<{ month: string; leaders: Array<{ displayName: string; catches: number }> }> }

function runtime(settings: Record<string, unknown> = {}, saved: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = saved;
  const tasks: Array<{ delay: number; task: () => Promise<void> }> = [];
  const context = {
    settings: { enabled: true, platforms: ['twitch', 'tiktok', 'youtube'], ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
    schedule: { after: vi.fn((delay: number, task: () => Promise<void>) => { tasks.push({ delay, task }); return `task-${String(tasks.length)}`; }), cancel: vi.fn(() => true) },
    viewerFoundation: {
      getProjection: vi.fn(async ({ platform, userId }: { platform: string; userId: string }) => ({ viewerId: userId.startsWith('linked') ? 'viewer-linked-0001' : `viewer-${platform}-${userId}`, points: 20, currencyName: 'acorns' })),
      mutate: vi.fn(async () => ({ points: 100 })),
    },
  };
  return { context, tasks, state: () => state as unknown as State };
}

let sequence = 0;
function event(eventType: string, platform: string, user: string, payload: Record<string, unknown> = {}, roles: string[] = []) {
  sequence += 1;
  return { eventId: `event-${String(sequence)}`, eventType, platform, user: { id: `${user.toLowerCase()}-id`, name: user.toLowerCase(), displayName: user, roles, actorType: 'human' }, payload, metadata: { simulated: false } };
}
const command = (platform: string, user: string, args: string[] = [], roles: string[] = []) => event('command.received', platform, user, { command: 'catch', arguments: args }, roles);
const messages = (test: ReturnType<typeof runtime>) => test.context.chat.send.mock.calls.map((call: unknown[]) => (call[0] as { message: string }).message);
async function sendPinecub(test: ReturnType<typeof runtime>) {
  await critters.start(test.context);
  await critters.controlPanel({ operation: 'action', action: 'spawn-named', values: { critter: 'Pinecub' } }, test.context);
}

describe('Critter Catch extension', () => {
  beforeEach(() => { queued.length = 0; resetChatters(); });
  afterEach(async () => { await critters.stop(); });

  it('ships the 151 Village Critters with catch rates from rarity, growth stage and knacks', () => {
    expect(VILLAGE).toHaveLength(151);
    expect(new Set(VILLAGE.map((row: unknown[]) => row[1])).size).toBe(151);
    const rate = (name: string) => villageRate(VILLAGE.find((row: unknown[]) => row[1] === name));
    expect([rate('Pinecub'), rate('Conifurr'), rate('Mosslow'), rate('Grandbough'), rate('Letterwing'), rate('Anvilope'), rate('Wispurr')]).toEqual([55, 35, 18, 15, 30, 12, 4]);
    expect([rate('Napapotamus'), rate('Mistling'), rate('Grumbleweed')]).toEqual([60, 50, 45]);
    const settings = settingsFor({ settings: {} });
    const pool = critterPool(settings);
    const pinecub = pool.find((critter: { name: string }) => critter.name === 'Pinecub');
    const wispurr = pool.find((critter: { name: string }) => critter.name === 'Wispurr');
    expect([catchChance(pinecub, 'jar', false, settings), catchChance(pinecub, 'honey', false, settings), catchChance(pinecub, 'moon', false, settings)]).toEqual([55, 82.5, 90]);
    expect(catchChance(pinecub, 'jar', true, settings)).toBe(44);
    expect([catchChance(wispurr, 'jar', false, settings), catchChance(wispurr, 'moon', false, settings)]).toEqual([4, 10]);
    expect(catchChance(wispurr, 'moon', false, settingsFor({ settings: { guardianCap: 8 } }))).toBe(8);
  });

  it('reads the creator\'s own critters and mixes them in only when asked', () => {
    expect(parseCustomCritter('Mossling | rare | Moss | https://example.com/m.png | Naps in hollows.')).toMatchObject({ key: 'c:mossling', name: 'Mossling', rarity: 'rare', picture: 'https://example.com/m.png', base: 12 });
    expect(parseCustomCritter('Odd | legendary | | http://insecure.example/x.png |')).toMatchObject({ rarity: 'guardian', picture: '' });
    expect(parseCustomCritter(' | common')).toBeUndefined();
    const rows = ['Mossling | common | Moss | https://example.com/m.png |'];
    expect(critterPool(settingsFor({ settings: { customCritters: rows } }))).toHaveLength(151);
    expect(critterPool(settingsFor({ settings: { customCritters: rows, critterSet: 'both' } }))).toHaveLength(152);
    expect(critterPool(settingsFor({ settings: { customCritters: rows, critterSet: 'custom' } }))).toHaveLength(1);
    expect(critterPool(settingsFor({ settings: { customCritters: [], critterSet: 'custom' } }))).toHaveLength(151);
  });

  it('keeps each Field Journal as a small bit mask', () => {
    let mask = '';
    for (const number of [1, 106, 151]) mask = withCritter(mask, number);
    expect([hasCritter(mask, 1), hasCritter(mask, 106), hasCritter(mask, 151), hasCritter(mask, 2)]).toEqual([true, true, true, false]);
    expect(maskCount(mask)).toBe(3);
    expect(mask.length).toBeLessThanOrEqual(38);
    expect(hasCritter('not hex', 3)).toBe(false);
  });

  it('picks rarities by weight and stops Guardians after the monthly limit', () => {
    const settings = settingsFor({ settings: {} });
    const pool = critterPool(settings);
    const state = stateFor({});
    expect(pickCritter(pool, settings, state, () => 0).rarity).toBe('common');
    expect(pickCritter(pool, settings, state, (maximum: number) => (maximum === 100 ? 99 : 0)).rarity).toBe('guardian');
    state.guardiansMonth = 3;
    expect(pickCritter(pool, settings, state, (maximum: number) => maximum - 1).rarity).toBe('rare');
  });

  it('charges a Jar, catches on a good roll and fills the Keeper\'s Field Journal once', async () => {
    const test = runtime();
    await sendPinecub(test);
    expect(test.state().wild).toMatchObject({ name: 'Pinecub', status: 'wild', glimmer: false });
    expect(messages(test).at(-1)).toBe('A wild Pinecub (Common) wandered in! Type !catch to throw a Jar.');
    queued.push(0);
    await critters.onEvent(command('twitch', 'Ana'), test.context);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ viewerId: 'viewer-twitch-ana-id', operation: 'spend', amount: 50 }));
    expect(test.state().wild?.throws.at(-1)).toMatchObject({ keeper: 'Ana', jar: 'jar', ok: true, wobbles: 3 });
    expect(test.state().keepers[0]).toMatchObject({ name: 'Ana', catches: 1, month: 1 });
    expect(hasCritter(test.state().keepers[0]?.v, 106)).toBe(true);
    expect(messages(test).slice(-6)).toContain('Ana caught Pinecub with a Jar! Field Journal: 1 of 151.');
    // The first catch of a visit also posts the critter's Field Journal entry as its own line.
    expect(messages(test).at(-1)).toMatch(/^Field Journal #106 Pinecub: \S/u);
    expect(test.state().wild?.status).toBe('wild');
    // The same Keeper cannot catch the same visitor twice; others still can.
    await critters.onEvent(command('twitch', 'Ana', ['moon']), test.context);
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledTimes(1);
    queued.push(0);
    await critters.onEvent(command('youtube', 'Bo', ['honey']), test.context);
    expect(test.context.viewerFoundation.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 150 }));
    expect(test.state().wild?.caughtBy).toHaveLength(2);
    expect(messages(test).at(-1)).toBe('Bo caught Pinecub with a Honey Jar! Field Journal: 1 of 151.');
    const update = (test.context.overlay.publish.mock.calls as unknown[][]).filter((call) => call[0] === 'thsv.critter-catch.critters.update').at(-1)?.[1] as { critter: { art: string }; throws: Throw[] };
    expect(update.critter.art).toBe('pinecub');
    expect(update.throws.map((item) => item.jar)).toEqual(['jar', 'honey']);
  });

  it('uses channel point rewards on Twitch and Kick while other platforms type !catch', async () => {
    const test = runtime({ platforms: ['twitch', 'kick', 'youtube'], commandPlatforms: ['youtube'], rewardThrows: ['Throw a Jar | jar', 'Throw a Moon Jar | moon'] });
    await sendPinecub(test);
    const sent = test.context.chat.send.mock.calls.map((call: unknown[]) => call[0] as { message: string; selectedPlatforms: string[] });
    expect(sent.find((item) => item.selectedPlatforms[0] === 'youtube')?.message).toBe('A wild Pinecub (Common) wandered in! Type !catch to throw a Jar.');
    expect(sent.find((item) => item.selectedPlatforms[0] === 'twitch')?.message).toBe('A wild Pinecub (Common) wandered in! Redeem a Jar channel point reward to throw one.');
    const update = (test.context.overlay.publish.mock.calls as unknown[][]).filter((call) => call[0] === 'thsv.critter-catch.critters.update').at(-1)?.[1] as { hint: string };
    expect(update.hint).toBe('Type !catch or redeem a Jar');
    await critters.onEvent(command('kick', 'Cy'), test.context);
    expect(test.state().wild?.throws).toHaveLength(0);
    expect(messages(test).at(-1)).toBe('Cy, here you throw a Jar by redeeming a Jar channel point reward.');
    queued.push(0);
    await critters.onEvent(event('reward.redemption', 'kick', 'Cy', { rewardTitle: 'Throw a Moon Jar' }), test.context);
    expect(test.state().wild?.throws.at(-1)).toMatchObject({ keeper: 'Cy', jar: 'moon', ok: true });
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    await critters.onEvent(command('kick', 'Cy', ['journal']), test.context);
    expect(messages(test).at(-1)).toContain("Cy's Field Journal: 1 of 151");
  });

  it('turns Twitch Jar rewards on only while a critter visits, matches by reward ID and refunds a throw that cannot land', async () => {
    const rewardId = '3f6c1a2e-9b7d-4c21-8e55-0a1b2c3d4e5f';
    const test = runtime({ platforms: ['twitch', 'kick'], commandPlatforms: [], rewardThrows: [`${rewardId} | honey`, 'Throw a Jar | jar'] });
    const administerReward = vi.fn(async () => undefined);
    Object.assign(test.context, { streamerbot: { administerReward } });
    await critters.start(test.context);
    expect(administerReward).toHaveBeenLastCalledWith({ platform: 'twitch', operation: 'disable', rewardId });
    await critters.controlPanel({ operation: 'action', action: 'spawn-named', values: { critter: 'Pinecub' } }, test.context);
    expect(administerReward).toHaveBeenLastCalledWith({ platform: 'twitch', operation: 'enable', rewardId });
    // Only rewards with an ID can be switched; a name-only row still throws.
    expect(administerReward.mock.calls.every((call: unknown[]) => (call[0] as { rewardId: string }).rewardId === rewardId)).toBe(true);
    queued.push(0);
    await critters.onEvent(event('reward.redemption', 'twitch', 'Ana', { rewardId: rewardId.toUpperCase(), rewardTitle: 'Renamed reward', redemptionId: 'red-1' }), test.context);
    expect(test.state().wild?.throws.at(-1)).toMatchObject({ keeper: 'Ana', jar: 'honey', ok: true });
    await critters.onEvent(event('reward.redemption', 'twitch', 'Ana', { rewardId, rewardTitle: 'Renamed reward', redemptionId: 'red-2' }), test.context);
    expect(administerReward).toHaveBeenLastCalledWith({ platform: 'twitch', operation: 'cancel', rewardId, redemptionId: 'red-2' });
    await critters.controlPanel({ operation: 'action', action: 'end' }, test.context);
    expect(administerReward).toHaveBeenLastCalledWith({ platform: 'twitch', operation: 'disable', rewardId });
  });

  it('lets only the first catch count when the creator picks that, then the critter leaves', async () => {
    const test = runtime({ catchMode: 'first' });
    await sendPinecub(test);
    queued.push(0);
    await critters.onEvent(command('twitch', 'Ana'), test.context);
    expect(test.state().wild?.status).toBe('caught');
    expect(test.state().nextSpawnAt).toBeGreaterThan(Date.now());
    await critters.onEvent(command('twitch', 'Bo'), test.context);
    expect(messages(test).at(-1)).toBe('No critter is wandering about right now. Watch the stream!');
  });

  it('can scare the critter off after a miss', async () => {
    const test = runtime();
    await sendPinecub(test);
    await critters.onEvent(command('twitch', 'Ana'), test.context);
    expect(test.state().wild).toMatchObject({ status: 'wild', throws: [{ ok: false, wobbles: 2, fled: false }] });
    expect(test.state().keepers[0]).toMatchObject({ throws: 1, catches: 0 });
    queued.push(999_999, 1, 0);
    await critters.onEvent(command('tiktok', 'Bo'), test.context);
    expect(test.state().wild).toMatchObject({ status: 'fled' });
    expect(messages(test).at(-1)).toBe('Pinecub broke out of Bo\'s Jar and scurried off into the woods.');
  });

  it('turns away a throw the Keeper cannot afford and tells them their balance', async () => {
    const test = runtime();
    await sendPinecub(test);
    test.context.viewerFoundation.mutate.mockRejectedValueOnce(new Error('Not enough points'));
    await critters.onEvent(command('twitch', 'Ana', ['moon']), test.context);
    expect(test.state().wild?.throws).toHaveLength(0);
    expect(messages(test).at(-1)).toBe('Ana, a Moon Jar costs 400 acorns. You have 20.');
  });

  it('throws a free Jar for a named channel point reward or gift', async () => {
    const test = runtime({ rewardThrows: ['Throw a Moon Jar | moon', 'Rose | jar'] });
    await sendPinecub(test);
    queued.push(0);
    await critters.onEvent(event('reward.redemption', 'twitch', 'Ana', { rewardTitle: 'Throw a moon jar' }), test.context);
    await critters.onEvent(event('engagement.gift', 'tiktok', 'Bo', { itemName: 'Rose', quantity: 1 }), test.context);
    await critters.onEvent(event('engagement.gift', 'tiktok', 'Cy', { itemName: 'Lion', quantity: 1 }), test.context);
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    expect(test.state().wild?.throws.map((item) => [item.keeper, item.jar, item.ok])).toEqual([['Ana', 'moon', true], ['Bo', 'jar', false]]);
  });

  it('wanders off when its time is up, and only visits while chat is active', async () => {
    const test = runtime();
    await sendPinecub(test);
    const leave = test.tasks.at(-1);
    expect(leave?.delay).toBeGreaterThan(89_000);
    expect(leave?.delay).toBeLessThanOrEqual(90_000);
    vi.useFakeTimers({ now: Date.now() + 91_000, toFake: ['Date'] });
    try {
      await leave?.task();
      expect(test.state().wild?.status).toBe('left');
      expect(messages(test).at(-1)).toBe('Pinecub wandered off. Watch for the next visitor!');
      const visit = test.tasks.at(-1);
      expect(visit?.delay).toBeGreaterThanOrEqual(6 * 60_000);
      expect(visit?.delay).toBeLessThanOrEqual(12 * 60_000);
      // Nobody chatted, so the next visit waits and looks again in two minutes.
      await visit?.task();
      expect(test.state().wild?.status).toBe('left');
      expect(test.tasks.at(-1)?.delay).toBe(120_000);
      // One chatter is not enough by default, and the streamer or a bot never count.
      await critters.onEvent(event('chat.message', 'twitch', 'Ana', { message: 'hello' }), test.context);
      await critters.onEvent(event('chat.message', 'twitch', 'Me', { message: 'hi chat' }, ['broadcaster']), test.context);
      await critters.onEvent({ ...event('chat.message', 'twitch', 'Nightbot', { message: 'beep' }), user: { id: 'nb', name: 'nightbot', displayName: 'Nightbot', roles: [], actorType: 'bot' } }, test.context);
      await critters.onEvent(event('chat.message', 'twitch', 'Own', { message: 'x', fromConnectedAccount: true }), test.context);
      await test.tasks.at(-1)?.task();
      expect(test.state().wild?.status).toBe('left');
      await critters.onEvent(event('chat.message', 'twitch', 'Bo', { message: 'hey' }), test.context);
      await test.tasks.at(-1)?.task();
      expect(test.state().wild).toMatchObject({ status: 'wild', platform: 'twitch' });
    } finally { vi.useRealTimers(); }
  });

  it('sends each critter to one active platform, takes turns between active chats and only lets that chat throw', async () => {
    const test = runtime({ platforms: ['twitch', 'kick', 'youtube'], spawnMinMinutes: 3, spawnMaxMinutes: 3 });
    await critters.start(test.context);
    for (const [platform, user] of [['youtube', 'Yu'], ['youtube', 'Yo'], ['kick', 'Ki'], ['kick', 'Ko']] as const) await critters.onEvent(event('chat.message', platform, user, { message: 'hi' }), test.context);
    expect(activePlatforms({ platforms: ['twitch', 'kick', 'youtube'], activeChatters: 2, activeMinutes: 10 }, { platformVisits: {} })).toEqual(['youtube', 'kick']);
    await test.tasks.at(-1)?.task();
    expect(test.state().wild).toMatchObject({ status: 'wild', platform: 'youtube' });
    const sent = test.context.chat.send.mock.calls.map((call: unknown[]) => (call[0] as { selectedPlatforms: string[] }).selectedPlatforms[0]);
    expect(sent).toEqual(['youtube']);
    // Kick's chat cannot throw at YouTube's critter.
    await critters.onEvent(command('kick', 'Ki'), test.context);
    expect(test.state().wild?.throws).toHaveLength(0);
    await critters.controlPanel({ operation: 'action', action: 'end' }, test.context);
    // Kick has waited longest now, so it gets the next visit.
    await test.tasks.at(-1)?.task();
    expect(test.state().wild).toMatchObject({ status: 'wild', platform: 'kick' });
  });

  it('tells a viewer in their own chat why a throw did nothing', async () => {
    const test = runtime();
    await critters.start(test.context);
    await critters.onEvent(command('youtube', 'Nobody'), test.context);
    expect(messages(test).at(-1)).toBe('No critter is wandering about right now. Watch the stream!');
    // The no-critter reply is per viewer, so a second viewer still hears it.
    await critters.onEvent(command('youtube', 'Other'), test.context);
    expect(messages(test).filter((text: string) => text.startsWith('No critter is'))).toHaveLength(2);
    await critters.onEvent(command('tiktok', 'Mod', ['spawn', 'Pinecub'], ['moderator']), test.context);
    expect(test.state().wild).toMatchObject({ name: 'Pinecub', platform: 'tiktok' });
    await critters.onEvent(command('youtube', 'Yu'), test.context);
    expect(messages(test).at(-1)).toBe('Yu, Pinecub is visiting TikTok chat right now. The next one may wander in here!');
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ selectedPlatforms: ['youtube'] }));
    queued.push(0);
    await critters.onEvent(command('tiktok', 'Ana'), test.context);
    await critters.onEvent(command('tiktok', 'Ana'), test.context);
    expect(messages(test).at(-1)).toBe('Ana, you already caught Pinecub on this visit. Wait for the next critter!');
    await critters.onEvent(command('tiktok', 'Bo'), test.context);
    expect(test.state().wild?.throws.at(-1)).toMatchObject({ keeper: 'Bo', ok: false });
    await critters.onEvent(command('tiktok', 'Bo'), test.context);
    expect(messages(test).at(-1)).toMatch(/^Bo, catch your breath\. You can throw again in [1-5]s\.$/u);
    // Repeating the same mistake within 30 seconds does not repeat the reply.
    const count = messages(test).length;
    await critters.onEvent(command('tiktok', 'Bo'), test.context);
    expect(messages(test)).toHaveLength(count);
    await critters.onEvent(command('tiktok', 'Bo', ['info', 'Nonesuch']), test.context);
    expect(messages(test).at(-1)).toBe('No critter called "Nonesuch".');
  });

  it('answers journal, top and info, and lets moderators spawn, pause and resume', async () => {
    const test = runtime();
    await critters.start(test.context);
    await critters.onEvent(command('twitch', 'Viewer', ['spawn', 'Pinecub']), test.context);
    expect(test.state().wild).toBeNull();
    await critters.onEvent(command('twitch', 'Mod', ['spawn', 'Pinecub'], ['moderator']), test.context);
    expect(test.state().wild?.name).toBe('Pinecub');
    await critters.onEvent(command('twitch', 'Ana', ['info', 'pinecub']), test.context);
    expect(messages(test).at(-1)).toBe('Ana, you have not caught Pinecub yet.');
    queued.push(0);
    await critters.onEvent(command('twitch', 'Ana'), test.context);
    await critters.onEvent(command('twitch', 'Ana', ['info', '106']), test.context);
    expect(messages(test).at(-1)).toMatch(/^#106 Pinecub \(Common Moss\): /u);
    await critters.onEvent(command('twitch', 'Ana', ['journal']), test.context);
    expect(messages(test).at(-1)).toBe('Ana\'s Field Journal: 1 of 151 critters, 0 Glimmer. 1 caught this month.');
    await critters.onEvent(command('twitch', 'Ana', ['top']), test.context);
    expect(messages(test).at(-1)).toBe('Top Keepers this month: 1. Ana (1)');
    await critters.onEvent(command('twitch', 'Mod', ['pause'], ['moderator']), test.context);
    expect(test.state()).toMatchObject({ paused: true });
    await critters.onEvent(command('twitch', 'Mod', ['end'], ['moderator']), test.context);
    expect(test.state().wild?.status).toBe('left');
    await critters.onEvent(command('twitch', 'Mod', ['resume'], ['moderator']), test.context);
    expect(test.state()).toMatchObject({ paused: false });
  });

  it('starts a new month with a hall of fame and keeps Field Journals', () => {
    const june30 = Date.UTC(2026, 6, 1, 2);
    const state = stateFor({ month: '2026-06', monthSpawns: 9, monthCatches: 5, keepers: [{ key: 'a', name: 'Ana', v: withCritter('', 106), catches: 7, month: 3 }, { key: 'b', name: 'Bo', catches: 2, month: 2 }] });
    expect(trackerMonth('thsv.critter-catch', state)).toBe('2026-06');
    expect(summarizeTracker('thsv.critter-catch', state)).toMatchObject({ participants: 2, visits: 9, catches: 5, leaders: [{ name: 'Ana', catches: 3 }, { name: 'Bo', catches: 2 }] });
    expect(rollSeason(state, 'America/Chicago', june30)).toBe(false);
    expect(rollSeason(state, 'UTC', june30)).toBe(true);
    expect(state).toMatchObject({ month: '2026-07', monthCatches: 0, monthSpawns: 0 });
    expect(state.keepers[0]).toMatchObject({ catches: 7, month: 0 });
    expect(hasCritter(state.keepers[0].v, 106)).toBe(true);
    expect(state.hallOfFame).toEqual([{ month: '2026-06', spawns: 9, catches: 5, leaders: [{ displayName: 'Ana', platform: '', catches: 3 }, { displayName: 'Bo', platform: '', catches: 2 }] }]);
  });

  it('publishes a settings preview and matches its manifest, schema and package', async () => {
    expect(addOnOverlayPreviewTopic('thsv.critter-catch')).toBe('thsv.critter-catch.critters.update');
    expect(buildAddOnOverlayPreview({ moduleId: 'thsv.critter-catch', name: 'Critter Catch', settings: { critterSize: 'large', position: 'top-left', catchCommand: 'jar' } })).toMatchObject({ size: 'large', position: 'top-left', hint: 'Type !jar', critter: { art: 'pinecub' } });
    const descriptor = JSON.parse(await readFile('addons/critter-catch/module-package.json', 'utf8'));
    expect(descriptor.manifest).toEqual(JSON.parse(JSON.stringify(manifest)));
    const schema = JSON.parse(await readFile('addons/critter-catch/schemas/config.json', 'utf8'));
    const defaults = validateSettings(schema, {}, true) as Record<string, unknown>;
    const fromDefaults = settingsFor({ settings: defaults }); const fromNothing = settingsFor({ settings: {} });
    expect({ ...fromDefaults, timeZone: '' }).toEqual({ ...fromNothing, timeZone: '' });
    const art = await readFile('overlays/browser/critters.js', 'utf8');
    for (const row of VILLAGE) expect(art.includes(`"${String(row[1]).toLowerCase()}":"<svg`), String(row[1])).toBe(true);
    expect(art.includes('class="prop"')).toBe(false);
  });
});
