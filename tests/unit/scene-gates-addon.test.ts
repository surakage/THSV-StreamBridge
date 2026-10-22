import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import { NestingSceneFilter } from '../../bridge/core/nesting-scene-filter.js';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import sceneGates, { APPLY_ACTION_ID, allowedScenesText, diffGates, gateAllowed, gateIdFor, manifest as runtimeManifest, parseGate, sceneNamesMatch, settingsFor } from '../../addons/scene-gates/dist/index.js';

const COMMAND = '0f9a1d6e-1111-4c4c-8a8a-123456789abc';
const OTHER_COMMAND = '5e6d7c8b-2222-4d4d-9b9b-abcdef012345';
const ROLES: Record<string, string> = { starting: '🔴 Starting Soon', live: '🔴 Gameplay', chatting: '🔴 Just Chatting', break: '🔴 Be Right Back', ending: '🔴 Ending' };
const scenes = {
  resolve: (value: string) => { const role = /^role:(\w+)$/u.exec(value)?.[1]; return role === undefined ? value : (ROLES[role] ?? ''); },
  roleOf: (name: string) => Object.entries(ROLES).find(([, scene]) => scene.toLowerCase() === name.toLowerCase())?.[0],
  sceneFor: (role: string) => ROLES[role] ?? '',
};

interface Change { gate: string; kind: string; target: string; allowed: boolean; message: string }

function runtime(settings: Record<string, unknown>, options: { saved?: unknown; failRuns?: number } = {}) {
  let saved: unknown = options.saved;
  let failures = options.failRuns ?? 0;
  const timers: Array<{ delay: number; callback: () => unknown; cancelled: boolean }> = [];
  const context = {
    settings: { enabled: true, ...settings },
    scenes,
    streamerbot: { runApprovedAction: vi.fn(async () => { if (failures > 0) { failures -= 1; throw new Error('Streamer.bot is unavailable'); } }) },
    state: { read: vi.fn(async () => saved), write: vi.fn(async (value: unknown) => { saved = JSON.parse(JSON.stringify(value)); }) },
    schedule: {
      after: vi.fn((delay: number, callback: () => unknown) => { const timer = { delay, callback, cancelled: false }; timers.push(timer); return `task-${String(timers.length)}`; }),
      cancel: vi.fn(() => true),
    },
  };
  const calls = (): Change[][] => context.streamerbot.runApprovedAction.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, Record<string, unknown>])[1]['sceneGateChanges'])) as Change[]);
  const fire = async () => { const timer = timers.filter((entry) => !entry.cancelled).shift(); if (!timer) throw new Error('no timer'); timer.cancelled = true; await timer.callback(); };
  return { context, calls, timers, fire, saved: () => saved as { applied: Record<string, { allowed: boolean }>; livePlatforms: string[]; sceneName: string } };
}

let sequence = 0;
function event(eventType: string, payload: Record<string, unknown> = {}, platform = 'system', simulated = false): NormalizedEvent {
  sequence += 1;
  return {
    schemaVersion: '1.0.0', eventId: `event-${String(sequence)}`, eventType, platform, receivedAt: new Date().toISOString(),
    source: { adapter: 'test', eventId: `source-${String(sequence)}`, eventName: eventType }, channel: { name: 'channel' }, payload, metadata: { simulated },
  } as NormalizedEvent;
}
const scene = (sceneName: string, oldSceneName?: string) => event('stream.scene-changed', { provider: 'obs', sceneName, ...(oldSceneName === undefined ? {} : { oldSceneName }) });
const GATES = [
  `on | Hydrate | command | ${COMMAND} | role:chatting | Hydrate only works during {scenes}.`,
  'on | Sing Song | twitch-reward | twitch-reward-1 | role:live, Music |',
  'on | Kick Dance | check-only | | role:live |',
];

describe('Scene Gates rows and scene matching', () => {
  it('parses one gate per row and rejects rows it cannot act on', () => {
    expect(parseGate(GATES[0])).toEqual({ id: 'hydrate', label: 'Hydrate', enabled: true, kind: 'command', target: COMMAND, scenes: ['role:chatting'], message: 'Hydrate only works during {scenes}.' });
    expect(parseGate(GATES[2])).toMatchObject({ id: 'kick-dance', kind: 'check-only', target: '', scenes: ['role:live'] });
    expect(parseGate('off | Later | reward | abc | Gameplay')).toMatchObject({ enabled: false, kind: 'twitch-reward', target: 'abc' });
    expect(parseGate('on | No ID | command | not-a-guid | Gameplay')).toBeUndefined();
    expect(parseGate('on | No scenes | check-only | | ')).toBeUndefined();
    expect(parseGate('on | | command | ' + COMMAND + ' | Gameplay')).toBeUndefined();
    expect(gateIdFor('  Café Song!! ')).toBe('cafe-song');
    // Duplicate names and duplicate targets keep only the first row.
    expect(settingsFor({ settings: { gates: [...GATES, `on | hydrate | command | ${OTHER_COMMAND} | Gameplay`, `on | Again | command | ${COMMAND} | Gameplay`] } }).gates.map((gate: { id: string }) => gate.id)).toEqual(['hydrate', 'sing-song', 'kick-dance']);
  });

  it('matches exact names and scene roles the way scene roles compare names', () => {
    expect(sceneNamesMatch('Gameplay', '🔴 Gameplay')).toBe(true);
    expect(sceneNamesMatch('🔴 Gameplay', '🟠 Gameplay')).toBe(false);
    expect(sceneNamesMatch('just chatting', 'Just Chatting')).toBe(true);
    const sing = parseGate(GATES[1]);
    expect(gateAllowed(sing, '🔴 Gameplay', scenes)).toBe(true);
    expect(gateAllowed(sing, '🎵 Music', scenes)).toBe(true);
    expect(gateAllowed(sing, '🔴 Just Chatting', scenes)).toBe(false);
    expect(allowedScenesText(sing, scenes)).toBe('Gameplay or Music');
    // An unmapped role never opens a gate.
    expect(gateAllowed(parseGate('on | X | check-only | | role:nope, role:ending'), 'Anything', { resolve: () => '', roleOf: () => undefined })).toBe(false);
  });

  it('diffs against what Streamer.bot was last told and reopens removed or retargeted gates', () => {
    const closed = { kind: 'command', target: COMMAND, allowed: false, message: 'm' };
    expect(diffGates({ hydrate: closed }, { hydrate: closed }).changes).toEqual([]);
    expect(diffGates({ hydrate: closed }, {}).changes).toEqual([{ gate: 'hydrate', ...closed, allowed: true }]);
    const retargeted = diffGates({ hydrate: closed }, { hydrate: { ...closed, target: OTHER_COMMAND } });
    expect(retargeted.changes).toEqual([{ gate: 'hydrate', ...closed, allowed: true }, { gate: 'hydrate', ...closed, target: OTHER_COMMAND }]);
    expect(retargeted.next).toEqual({ hydrate: { ...closed, target: OTHER_COMMAND } });
  });
});

describe('Scene Gates runtime', () => {
  it('closes and opens gates on scene changes while live, sending only changes', async () => {
    const test = runtime({ gates: GATES });
    await sceneGates.onEvent(scene('🔴 Starting Soon'), test.context);
    // Offline: only-while-live keeps every gate open (and tells Streamer.bot so once).
    expect(test.calls()).toHaveLength(1);
    expect(test.calls()[0]?.every((change) => change.allowed)).toBe(true);
    await sceneGates.onEvent(event('stream.online', {}, 'twitch'), test.context);
    expect(test.calls()[1]?.map((change) => [change.gate, change.allowed])).toEqual([['hydrate', false], ['sing-song', false], ['kick-dance', false]]);
    expect(test.context.streamerbot.runApprovedAction.mock.calls[1]).toEqual([APPLY_ACTION_ID, expect.objectContaining({ sceneGateScene: '🔴 Starting Soon', sceneGateReason: 'online' })]);
    await sceneGates.onEvent(scene('🔴 Gameplay', '🔴 Starting Soon'), test.context);
    expect(test.calls()[2]).toEqual([
      { gate: 'sing-song', kind: 'twitch-reward', target: 'twitch-reward-1', allowed: true, message: 'That only works during Gameplay or Music.' },
      { gate: 'kick-dance', kind: 'check-only', target: '', allowed: true, message: 'That only works during Gameplay.' },
    ]);
    // Music keeps Sing Song open, so only Kick Dance changes.
    await sceneGates.onEvent(scene('Music', '🔴 Gameplay'), test.context);
    expect(test.calls()[3]?.map((change) => [change.gate, change.allowed])).toEqual([['kick-dance', false]]);
    // The same scene again sends nothing.
    await sceneGates.onEvent(scene('Music', 'Music'), test.context);
    expect(test.calls()).toHaveLength(4);
    await sceneGates.onEvent(scene('🔴 Just Chatting', 'Music'), test.context);
    expect(test.calls()[4]?.map((change) => [change.gate, change.allowed])).toEqual([['hydrate', true], ['sing-song', false]]);
    expect(test.calls()[4]?.[0]?.message).toBe('Hydrate only works during Just Chatting.');
    expect(test.saved().applied['hydrate']?.allowed).toBe(true);
  });

  it('turns everything back on only when every platform has gone offline', async () => {
    const test = runtime({ gates: GATES });
    await sceneGates.onEvent(event('stream.online', {}, 'twitch'), test.context);
    await sceneGates.onEvent(event('stream.online', {}, 'kick'), test.context);
    await sceneGates.onEvent(scene('🔴 Be Right Back'), test.context);
    expect(test.calls().at(-1)?.every((change) => !change.allowed)).toBe(true);
    const before = test.calls().length;
    await sceneGates.onEvent(event('stream.offline', {}, 'twitch'), test.context);
    expect(test.calls()).toHaveLength(before);
    await sceneGates.onEvent(event('stream.offline', {}, 'kick'), test.context);
    expect(test.calls().at(-1)?.map((change) => [change.gate, change.allowed])).toEqual([['hydrate', true], ['sing-song', true], ['kick-dance', true]]);
    expect((test.context.streamerbot.runApprovedAction.mock.calls.at(-1) as unknown as [string, Record<string, unknown>])[1]).toMatchObject({ sceneGateReason: 'offline' });
    // A scene switch after the stream does not close anything again.
    await sceneGates.onEvent(scene('🔴 Ending'), test.context);
    expect(test.calls()).toHaveLength(before + 1);
  });

  it('ignores nesting scenes because StreamBridge filters them before add-ons see them', async () => {
    const test = runtime({ gates: GATES, onlyWhileLive: false });
    const filter = new NestingSceneFilter(() => ({ prefixes: ['🟠'] }));
    const deliver = async (value: NormalizedEvent) => { const decision = filter.apply(value); if (decision.kind === 'pass') await sceneGates.onEvent(decision.event, test.context); };
    await deliver(scene('🔴 Just Chatting'));
    const before = test.calls().length;
    await deliver(scene('🟠 Gameplay', '🔴 Just Chatting'));
    await deliver(scene('🔴 Just Chatting', '🟠 Gameplay'));
    expect(test.calls()).toHaveLength(before);
    expect(test.saved().sceneName).toBe('🔴 Just Chatting');
  });

  it('ignores simulated events and gates while offline when only-while-live is off', async () => {
    const test = runtime({ gates: GATES, onlyWhileLive: false });
    await sceneGates.onEvent(event('stream.scene-changed', { sceneName: '🔴 Gameplay' }, 'system', true), test.context);
    expect(test.calls()).toHaveLength(0);
    await sceneGates.onEvent(scene('🔴 Gameplay'), test.context);
    expect(test.calls()[0]?.find((change) => change.gate === 'hydrate')?.allowed).toBe(false);
  });

  it('retries after Streamer.bot was unavailable and keeps the last applied state until it succeeds', async () => {
    const test = runtime({ gates: GATES, onlyWhileLive: false }, { failRuns: 1 });
    await sceneGates.onEvent(scene('🔴 Gameplay'), test.context);
    expect(test.saved().applied).toEqual({});
    expect(test.timers[0]?.delay).toBe(15_000);
    await test.fire();
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledTimes(2);
    expect(test.saved().applied['hydrate']?.allowed).toBe(false);
  });

  it('on start reopens gates that were removed, turned off, or left closed while offline', async () => {
    const saved = { applied: { hydrate: { kind: 'command', target: COMMAND, allowed: false, message: 'x' }, old: { kind: 'twitch-reward', target: 'r-1', allowed: false, message: 'y' } }, livePlatforms: [], sceneName: '🔴 Gameplay' };
    const test = runtime({ gates: [GATES[0]] }, { saved });
    await sceneGates.start(test.context);
    await test.fire();
    expect(test.calls()[0]?.map((change) => [change.gate, change.target, change.allowed])).toEqual([['old', 'r-1', true], ['hydrate', COMMAND, true]]);
    expect(Object.keys(test.saved().applied)).toEqual(['hydrate']);
    // Turning the whole feature off reopens everything and forgets it.
    const off = runtime({ enabled: false, gates: GATES }, { saved: { ...saved, livePlatforms: ['twitch'] } });
    await sceneGates.start(off.context);
    await off.fire();
    expect(off.calls()[0]?.every((change) => change.allowed)).toBe(true);
    expect(off.saved().applied).toEqual({});
  });

  it('keeps gating after a restart in the middle of a stream', async () => {
    const saved = { applied: {}, livePlatforms: ['youtube'], sceneName: '🔴 Gameplay' };
    const test = runtime({ gates: GATES }, { saved });
    await sceneGates.start(test.context);
    await test.fire();
    expect(test.calls()[0]?.map((change) => [change.gate, change.allowed])).toEqual([['hydrate', false], ['sing-song', true], ['kick-dance', true]]);
  });

  it('ships a runtime manifest identical to the package descriptor', async () => {
    const descriptor = JSON.parse(await readFile('addons/scene-gates/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(runtimeManifest).toEqual(descriptor.manifest);
    expect(descriptor.permissions).toContain('streamerbot.run-approved-action');
    const schema = JSON.parse(await readFile('addons/scene-gates/schemas/config.json', 'utf8')) as { properties: Record<string, { default?: unknown }> };
    expect(schema.properties['enabled']?.default).toBe(false);
    expect(schema.properties['onlyWhileLive']?.default).toBe(true);
  });
});
