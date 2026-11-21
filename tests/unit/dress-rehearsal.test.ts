import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRESS_REHEARSAL_TEXT, DressRehearsal, doctorProblems, type DressRehearsalAddOn, type DressRehearsalDependencies, type DressRehearsalRun, type MediaLifecycleReport, type OverlayRehearsalReport } from '../../bridge/services/dress-rehearsal.js';

type Overrides = Partial<DressRehearsalDependencies> & { addOnList?: DressRehearsalAddOn[]; pageAnswers?: (moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>) => OverlayRehearsalReport[] };

function harness(overrides: Overrides = {}) {
  let clock = 0;
  const overlayListeners = new Set<(report: OverlayRehearsalReport) => void>();
  const mediaListeners = new Set<(report: MediaLifecycleReport) => void>();
  const published: Array<{ moduleId: string; topic: string; payload: Readonly<Record<string, unknown>> }> = [];
  const switched: string[] = [];
  const actions: string[] = [];
  let current = 'Just Chatting';
  const dependencies: DressRehearsalDependencies = {
    isLive: () => false,
    streamingApp: async () => ({ app: 'sprigcast', connected: ['sprigcast'], operations: { sprigcast: ['switch-scene'] } }),
    streamingAppBusy: async () => ({ busy: false }),
    preStreamCheck: async () => ({ readinessSummary: { coreReady: true, issues: [] } }),
    sceneRoles: async () => ({ starting: 'Starting Soon', live: 'Gameplay', chatting: 'Just Chatting', break: '', ending: 'Ending' }),
    sceneNames: () => ['Starting Soon', 'Gameplay', 'Just Chatting'],
    currentScene: () => current,
    switchScene: async (name) => { switched.push(name); current = name; },
    addOns: async () => overrides.addOnList ?? [],
    checkEffects: async (effects) => ({ connected: true, effects: effects.map((effect) => ({ name: effect.name, status: effect.name === 'Blackout' ? 'ready' : 'needs-setup', detail: 'Filter missing' })) }),
    communityName: async () => 'Village',
    buildAddOnPreview: (addOn) => ({ moduleId: addOn.moduleId }),
    addOnPreviewTopic: (moduleId) => `${moduleId}.card.show`,
    publishAddOn: async (moduleId, topic, payload) => {
      published.push({ moduleId, topic, payload });
      for (const report of overrides.pageAnswers?.(moduleId, topic, payload) ?? []) for (const listener of overlayListeners) listener(report);
    },
    publishAlertsAndEffects: () => 6,
    overlaySeen: () => ({ 'obs:thsv.goal-bars': 1 }),
    onOverlayReport: (listener) => { overlayListeners.add(listener); return () => overlayListeners.delete(listener); },
    onMediaLifecycle: (_moduleId, listener) => { mediaListeners.add(listener); return () => mediaListeners.delete(listener); },
    controlAction: async (_moduleId, action) => { actions.push(action); if (action === 'start') for (const listener of mediaListeners) listener({ playbackId: 'clip-1', phase: 'started' }); return {}; },
    sleep: async (milliseconds) => { clock += milliseconds; await Promise.resolve(); },
    now: () => clock,
    ...overrides,
  };
  const rehearsal = new DressRehearsal(dependencies);
  const finish = async (input: unknown = {}): Promise<DressRehearsalRun> => {
    await rehearsal.start(input);
    for (let index = 0; index < 2_000; index += 1) {
      const status = await rehearsal.status();
      if (status['running'] !== true) return status['run'] as DressRehearsalRun;
      await new Promise((resolve) => { setImmediate(resolve); });
    }
    throw new Error('rehearsal never finished');
  };
  return { rehearsal, finish, published, switched, actions };
}

const addOn = (moduleId: string, settings: Record<string, unknown> = {}, permissions = ['overlay.publish']): DressRehearsalAddOn => ({ moduleId, name: moduleId, settings, permissions });
const item = (run: DressRehearsalRun, id: string) => run.items.find((entry) => entry.id === id);

describe('dress rehearsal', () => {
  it('refuses while live or while the streaming app streams or records', async () => {
    await expect(harness({ isLive: () => true }).rehearsal.start({})).rejects.toThrow(DRESS_REHEARSAL_TEXT.refuseLive);
    await expect(harness({ streamingAppBusy: async () => ({ busy: true }) }).rehearsal.start({})).rejects.toThrow(DRESS_REHEARSAL_TEXT.refuseBusy);
  });

  it('a blank setup gets a short list and passes', async () => {
    const run = await harness({ sceneRoles: async () => ({}) }).finish();
    expect(run.state).toBe('finished');
    expect(run.items.map((entry) => entry.id)).toEqual(['app', 'check', 'scenes', 'alerts']);
    expect(item(run, 'scenes')?.status).toBe('skip');
    expect(run.summary?.fail).toBe(0);
  });

  it('checks scene roles exist, and only switches through them when asked, then goes back', async () => {
    const quiet = harness();
    const checked = await quiet.finish();
    expect(quiet.switched).toEqual([]);
    expect(item(checked, 'scene-Ending')?.status).toBe('fail');
    expect(item(checked, 'scene-Gameplay')?.status).toBe('pass');
    const loud = harness();
    const switched = await loud.finish({ switchScenes: true });
    expect(loud.switched).toEqual(['Starting Soon', 'Gameplay', 'Just Chatting', 'Just Chatting']);
    expect(item(switched, 'scene-back')?.status).toBe('pass');
  });

  it('marks a scene that never showed as a problem', async () => {
    const run = await harness({ switchScene: async () => undefined, currentScene: () => 'Just Chatting' }).finish({ switchScenes: true });
    expect(item(run, 'scene-Gameplay')?.status).toBe('fail');
  });

  it('tells an answering page from a closed one and a never-added one', async () => {
    const run = await harness({
      addOnList: [addOn('thsv.local-clock'), addOn('thsv.goal-bars'), addOn('thsv.scoreboard'), addOn('thsv.chat-guard', {}, [])],
      pageAnswers: (moduleId, topic, payload) => (moduleId === 'thsv.local-clock' && topic.endsWith('.card.show') ? [{ moduleId, rehearsalId: String(payload['rehearsalId']), phase: 'shown', host: 'obs', visible: true }] : []),
    }).finish();
    expect(item(run, 'overlay-thsv.local-clock')?.status).toBe('pass');
    expect(item(run, 'overlay-thsv.goal-bars')?.status).toBe('warn');
    expect(item(run, 'overlay-thsv.scoreboard')?.status).toBe('fail');
    expect(item(run, 'overlay-thsv.chat-guard')).toBeUndefined();
  });

  it('plays a Critter Catch miss and catch and fails when the critter keeps the Jar colours', async () => {
    const answers = (ok: boolean) => (moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>): OverlayRehearsalReport[] => {
      if (topic !== `${moduleId}.critters.update`) return [];
      const rehearsalId = String(payload['rehearsalId']); const throws = payload['throws'] as unknown[];
      const shown: OverlayRehearsalReport = { moduleId, rehearsalId, phase: 'shown', host: 'obs', visible: true };
      return throws.length === 1 ? [shown, { ...shown, phase: 'check', check: 'critter-colours', ok, detail: ok ? '' : 'filter brightness(3)' }] : [shown];
    };
    const good = harness({ addOnList: [addOn('thsv.critter-catch', { commandPlatforms: ['twitch'] })], pageAnswers: answers(true) });
    const passed = await good.finish();
    expect(item(passed, 'critters-screen')?.status).toBe('pass');
    expect(good.published.filter((entry) => entry.topic.endsWith('.critters.update')).map((entry) => (entry.payload['throws'] as unknown[]).length)).toEqual([0, 1, 2]);
    expect(good.published.at(-1)?.topic).toBe('thsv.critter-catch.preview.hide');
    const bad = await harness({ addOnList: [addOn('thsv.critter-catch')], pageAnswers: answers(false) }).finish();
    expect(item(bad, 'critters-screen')?.status).toBe('fail');
  });

  it('warns about Twitch Jars that only switch on during a Twitch visit', async () => {
    const settings = { platforms: ['twitch', 'tiktok'], commandPlatforms: ['tiktok'], rewardThrows: ['jar-reward'], visitMode: 'active-platform' };
    const run = await harness({ addOnList: [addOn('thsv.critter-catch', settings)] }).finish();
    expect(item(run, 'critters-twitch')?.status).toBe('warn');
    const everyone = await harness({ addOnList: [addOn('thsv.critter-catch', { ...settings, visitMode: 'everyone' })] }).finish();
    expect(item(everyone, 'critters-twitch')?.status).toBe('pass');
    const noRewards = await harness({ addOnList: [addOn('thsv.critter-catch', { ...settings, rewardThrows: [] })] }).finish();
    expect(item(noRewards, 'critters-twitch')?.status).toBe('fail');
  });

  it('plays one clip, reports it, and stops clips again', async () => {
    const test = harness({ addOnList: [addOn('thsv.random-clip-player')] });
    const run = await test.finish();
    expect(item(run, 'clips')?.status).toBe('pass');
    expect(test.actions).toEqual(['start', 'stop']);
    const silent = harness({ addOnList: [addOn('thsv.random-clip-player')], controlAction: async () => ({}) });
    expect(item(await silent.finish(), 'clips')?.status).toBe('fail');
  });

  it('checks Streamer Punishments screen effects in the app', async () => {
    const run = await harness({ addOnList: [addOn('thsv.streamer-punishments', { effects: ['Blackout|Camera|THSV Blackout|10|100', 'Pixelate|Camera||10|100'] })] }).finish();
    expect(item(run, 'effect-Blackout')?.status).toBe('pass');
    expect(item(run, 'effect-Pixelate')?.status).toBe('fail');
  });

  it('reports what SprigCast\'s Stream doctor would hold, when SprigCast can say', async () => {
    const unavailable = await harness({ streamDoctor: async () => undefined }).finish();
    expect(item(unavailable, 'go-live')?.status).toBe('skip');
    const held = await harness({ streamDoctor: async () => ({ problems: [{ severity: 'serious', text: 'Preview runs at 42 of 60 fps' }] }) }).finish();
    expect(item(held, 'go-live')?.status).toBe('warn');
    expect(item(held, 'go-live')?.detail).toContain('42 of 60 fps');
    expect(doctorProblems({ problems: [{ severity: 'warning', text: 'No key', blocking: true }] })[0]?.blocking).toBe(true);
  });

  it('turns pre-stream check issues into items', async () => {
    const run = await harness({ preStreamCheck: async () => ({ readinessSummary: { coreReady: false, issues: [{ area: 'core', fix: 'Start Streamer.bot.' }] } }) }).finish();
    expect(item(run, 'check-0')).toMatchObject({ status: 'fail', title: 'Pre-stream check: Streamer.bot', detail: 'Start Streamer.bot.', target: 'diagnostics' });
  });

  it('stops when a platform goes live mid-run', async () => {
    let live = false;
    const run = await harness({ isLive: () => live, preStreamCheck: async () => { live = true; return { readinessSummary: { issues: [] } }; } }).finish();
    expect(run.state).toBe('stopped');
    expect(run.stopReason).toBe(DRESS_REHEARSAL_TEXT.stoppedLive);
  });
});

describe('dress rehearsal translations', () => {
  const app = readFileSync(join('wizard', 'browser', 'app.js'), 'utf8');
  const uiStrings = [
    'Dress rehearsal', 'Switch through my scenes in the rehearsal (scene changes also run their own actions, such as lights)', 'Off air only. Nothing is sent to chat or your platforms, and nothing starts streaming.', 'Stop',
    'Passed', 'Problem', 'Check this', 'Watch', 'Skipped', 'Streaming app', 'Go Live', 'Pre-stream check', 'Scenes', 'Screen effects', 'Overlays', 'Critter Catch', 'Clips', 'Open',
    'Checking your streaming app…', 'Asking the Stream doctor…', 'Running the pre-stream check…', 'Trying your scenes…', 'Checking screen effects…', 'Showing a test on each overlay…', 'Critter Catch: a miss, then a catch…', 'Playing a test clip…',
    'Dress rehearsal running…', 'Starting the dress rehearsal…', 'Dress rehearsal found problems. See the list.', 'Dress rehearsal finished.',
    'Passed: {0}', 'Problems: {0}', 'To check: {0}', 'To watch: {0}', 'Finished {0}', 'your streaming app',
  ];
  it('the Wizard uses each interface string', () => {
    for (const text of ['Passed', 'Check this', 'Critter Catch: a miss, then a catch…', 'Dress rehearsal found problems. See the list.']) expect(app).toContain(text);
  });
  const codes = readdirSync(join('wizard', 'locales')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length));
  it.each(codes)('%s translates every dress rehearsal sentence', (code) => {
    const locale = JSON.parse(readFileSync(join('wizard', 'locales', `${code}.json`), 'utf8')) as Record<string, string>;
    const missing = [...Object.values(DRESS_REHEARSAL_TEXT), ...uiStrings].filter((text) => locale[text] === undefined);
    expect(missing).toEqual([]);
    for (const text of Object.values(DRESS_REHEARSAL_TEXT)) expect((locale[text] ?? '').match(/\{\d\}/gu)?.sort() ?? [], text).toEqual(text.match(/\{\d\}/gu)?.sort() ?? []);
  });
});
