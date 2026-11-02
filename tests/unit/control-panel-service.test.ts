import { describe, expect, it, vi } from 'vitest';
import { CORE_CONTRACT_VERSION } from '../../bridge/contracts/v2/common.js';
import type { ModuleRuntimeContextV2 } from '../../bridge/contracts/v2/addon-capability.js';
import type { ModuleManifestV2 } from '../../bridge/contracts/v2/module-manifest.js';
import { ModuleRegistry, type FrameworkModule, type RunningModuleSnapshot } from '../../bridge/core/module-registry.js';
import { CONTROL_PANEL_SPECS, ControlPanelError, ControlPanelService, type ControlPanelAddOn } from '../../bridge/services/control-panel-service.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

function manifest(moduleId: string, eventSubscriptions: string[] = []): ModuleManifestV2 {
  return {
    contractVersion: CORE_CONTRACT_VERSION, moduleId, name: moduleId, version: '1.0.0', minimumCoreVersion: CORE_CONTRACT_VERSION, maximumTestedCoreVersion: CORE_CONTRACT_VERSION,
    dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions, commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
    installationSteps: ['Install for test.'], uninstallationSteps: ['Remove after test.'], migrations: [], healthChecks: [],
  };
}

const counterSchema = { type: 'object', properties: { enabled: { type: 'boolean' }, defaultCounterName: { type: 'string', maxLength: 80 }, followDelta: { type: 'integer', minimum: 0, maximum: 100 }, commandName: { type: 'string' } } };

function service(overrides: { addOns?: ControlPanelAddOn[]; running?: Record<string, RunningModuleSnapshot> } = {}) {
  const addOns: ControlPanelAddOn[] = overrides.addOns ?? [
    { moduleId: 'thsv.custom-counter', name: 'Custom Counter', enabled: true, health: 'installed', configurationSchema: counterSchema, settings: { enabled: true, defaultCounterName: 'Deaths', followDelta: 1, commandName: 'streamcounter' } },
    { moduleId: 'thsv.prize-wheel', name: 'Prize Wheel', enabled: false, health: 'installed', configurationSchema: {}, settings: {} },
  ];
  const running = overrides.running ?? { 'thsv.custom-counter': { moduleId: 'thsv.custom-counter', status: 'healthy', settings: { enabled: true, defaultCounterName: 'Deaths', followDelta: 1, commandName: 'streamcounter' }, approvedActionIds: [] } };
  const dependencies = {
    listAddOns: vi.fn(async () => addOns),
    runningModule: vi.fn((moduleId: string) => running[moduleId]),
    controlPanel: vi.fn(async (...call: [string, unknown, NormalizedEvent?]) => { void call; return {}; }),
    saveSettings: vi.fn(async (_moduleId: string, settings: Readonly<Record<string, unknown>>) => ({ saved: true, settings })),
    updateSettings: vi.fn(),
  };
  return { panel: new ControlPanelService(dependencies), dependencies };
}

describe('Control Panel service', () => {
  it('lists every tab, greys out extensions that are off, and offers only live-safe settings', async () => {
    const { panel } = service();
    const { tabs } = await panel.tabs() as { tabs: Array<{ moduleId: string; available: boolean; reason: string; fields: Array<{ name: string; value: unknown }>; actions: unknown[] }> };
    expect(tabs.map((tab) => tab.moduleId)).toEqual(CONTROL_PANEL_SPECS.map((spec) => spec.moduleId));
    const counter = tabs.find((tab) => tab.moduleId === 'thsv.custom-counter');
    expect(counter).toMatchObject({ available: true, reason: '' });
    expect(counter?.fields.map((field) => field.name)).toEqual(['defaultCounterName', 'followDelta']);
    expect(counter?.actions.length).toBeGreaterThan(0);
    expect(tabs.find((tab) => tab.moduleId === 'thsv.prize-wheel')).toMatchObject({ available: false, reason: 'Turned off. Turn it on in the Setup Wizard.', fields: [], actions: [] });
    expect(tabs.find((tab) => tab.moduleId === 'thsv.viewer-lobby')).toMatchObject({ available: false, reason: 'Not installed.' });
  });

  it('passes an extension\'s row-list columns so each list cell gets its own box', async () => {
    const schema = { type: 'object', properties: { exercises: { type: 'array', items: { type: 'string' } }, beanPairs: { type: 'array', items: { type: 'string' } }, graceSeconds: { type: 'integer' } } };
    const settingsUi = { fields: { exercises: { control: 'row-list', itemLabel: 'exercise', legacyColumnOrder: [0, 1, 2], columns: [
      { label: 'Name', hint: '!buy name', maxLength: 40, required: true, width: '1fr' }, { label: 'Reps', type: 'number', min: 1, max: 500 },
      { label: 'Platform', type: 'select', options: [{ value: 'twitch', label: 'Twitch' }] }, 'not a column',
    ] } } };
    const settings = { exercises: ['Pushups | 10 | twitch'], beanPairs: ['Black | #1c1c1c'], graceSeconds: 30 };
    const { panel } = service({
      addOns: [{ moduleId: 'thsv.streamer-punishments', name: 'Streamer Punishments', enabled: true, health: 'installed', configurationSchema: schema, settings, settingsUi }],
      running: { 'thsv.streamer-punishments': { moduleId: 'thsv.streamer-punishments', status: 'healthy', settings, approvedActionIds: [] } },
    });
    const { tabs } = await panel.tabs() as { tabs: Array<{ moduleId: string; fields: Array<{ name: string; layout?: unknown }> }> };
    const fields = tabs.find((tab) => tab.moduleId === 'thsv.streamer-punishments')?.fields ?? [];
    expect(fields.find((field) => field.name === 'exercises')?.layout).toEqual({ itemLabel: 'exercise', legacyColumnOrder: [0, 1, 2], columns: [
      { label: 'Name', hint: '!buy name', placeholder: '', type: 'text', maxLength: 40, required: true },
      { label: 'Reps', hint: '', placeholder: '', type: 'number', maxLength: 120, min: 1, max: 500, required: false },
      { label: 'Platform', hint: '', placeholder: '', type: 'select', maxLength: 120, options: [{ value: 'twitch', label: 'Twitch' }], required: false },
    ] });
    expect(fields.find((field) => field.name === 'beanPairs')?.layout).toBeUndefined();
    expect(fields.find((field) => field.name === 'graceSeconds')?.layout).toBeUndefined();
  });

  it('uses the panel\'s own columns for Chat Play Pack lists the extension does not describe', async () => {
    const schema = { type: 'object', properties: { triviaQuestions: { type: 'array', items: { type: 'string' } }, unscrambleWords: { type: 'array', items: { type: 'string' } } } };
    const settings = { triviaQuestions: ['Q | A'], unscrambleWords: ['sloth | A slow mammal'] };
    const { panel } = service({
      addOns: [{ moduleId: 'thsv.chat-play-pack', name: 'Chat Play Pack', enabled: true, health: 'installed', configurationSchema: schema, settings }],
      running: { 'thsv.chat-play-pack': { moduleId: 'thsv.chat-play-pack', status: 'healthy', settings, approvedActionIds: [] } },
    });
    const { tabs } = await panel.tabs() as { tabs: Array<{ moduleId: string; fields: Array<{ name: string; layout?: { itemLabel: string; columns: Array<{ label: string }> } }> }> };
    const fields = tabs.find((tab) => tab.moduleId === 'thsv.chat-play-pack')?.fields ?? [];
    expect(fields.find((field) => field.name === 'triviaQuestions')?.layout?.columns.map((column) => column.label)).toEqual(['Question', 'Answer', 'Other answers']);
    expect(fields.find((field) => field.name === 'unscrambleWords')?.layout?.itemLabel).toBe('word');
  });

  it('turns a panel button into the extension\'s own creator-control event, checking its values first', async () => {
    const { panel, dependencies } = service();
    await panel.action({ moduleId: 'thsv.custom-counter', action: 'add', values: { amount: 5 } });
    const [moduleId, request, event] = dependencies.controlPanel.mock.calls[0] ?? [];
    expect(moduleId).toBe('thsv.custom-counter');
    expect(request).toEqual({ operation: 'action', action: 'add', values: { amount: 5 } });
    expect(event).toMatchObject({ eventType: 'addon.thsv.custom-counter.control', platform: 'system', source: { adapter: 'control-panel' }, payload: { operation: 'add', amount: 5 }, metadata: { simulated: false } });
    await expect(panel.action({ moduleId: 'thsv.custom-counter', action: 'add', values: { amount: 0 } })).rejects.toThrow('Amount must be a number');
    await expect(panel.action({ moduleId: 'thsv.custom-counter', action: 'delete-everything' })).rejects.toThrow('Unknown control');
    await expect(panel.action({ moduleId: 'thsv.prize-wheel', action: 'spin' })).rejects.toThrow('turned off');
    await expect(panel.action({ moduleId: 'thsv.not-a-tab', action: 'x' })).rejects.toBeInstanceOf(ControlPanelError);
  });

  it('saves only the tab\'s settings and hands them to the running extension straight away', async () => {
    const { panel, dependencies } = service();
    const result = await panel.saveSettings({ moduleId: 'thsv.custom-counter', settings: { defaultCounterName: 'Wins', followDelta: 3 } });
    expect(result).toEqual({ saved: true, settings: { defaultCounterName: 'Wins', followDelta: 3 } });
    expect(dependencies.saveSettings).toHaveBeenCalledWith('thsv.custom-counter', { enabled: true, defaultCounterName: 'Wins', followDelta: 3, commandName: 'streamcounter' });
    expect(dependencies.updateSettings).toHaveBeenCalledWith('thsv.custom-counter', { enabled: true, defaultCounterName: 'Wins', followDelta: 3, commandName: 'streamcounter' });
    await expect(panel.saveSettings({ moduleId: 'thsv.custom-counter', settings: { commandName: 'hacked' } })).rejects.toThrow('cannot be changed from the Control Panel');
  });
});

describe('ModuleRegistry Control Panel support', () => {
  it('gives a running extension new settings without a restart', async () => {
    let seen: Readonly<Record<string, unknown>> = {};
    const module: FrameworkModule = { manifest: manifest('thsv.custom-counter', ['chat.message']), required: false, settings: { label: 'Deaths' }, async onEvent(_event, context) { seen = context.settings; } };
    const registry = new ModuleRegistry([module], silentLogger);
    await registry.start();
    registry.updateSettings('thsv.custom-counter', { label: 'Wins' });
    const event = { eventType: 'chat.message', payload: {}, metadata: { simulated: false } } as unknown as NormalizedEvent;
    await registry.publish(event);
    expect(seen).toEqual({ label: 'Wins' });
    expect(Object.isFrozen(seen)).toBe(true);
    expect(registry.runningModule('thsv.custom-counter')?.settings).toEqual({ label: 'Wins' });
  });

  it('uses an extension\'s own hook, or delivers its creator-control event, and refuses stopped extensions', async () => {
    const hook = vi.fn(async (...call: [unknown, ModuleRuntimeContextV2]) => { void call; return { summary: [{ label: 'Score', value: '3' }] }; });
    const onEvent = vi.fn(async () => undefined);
    const registry = new ModuleRegistry([
      { manifest: manifest('thsv.prize-wheel'), required: false, controlPanel: hook },
      { manifest: manifest('thsv.viewer-lobby', ['addon.thsv.viewer-lobby.control']), required: false, onEvent },
    ], silentLogger);
    await expect(registry.controlPanel('thsv.prize-wheel', { operation: 'status' })).rejects.toThrow('not running');
    await registry.start();
    expect(await registry.controlPanel('thsv.prize-wheel', { operation: 'status' })).toEqual({ summary: [{ label: 'Score', value: '3' }] });
    const control = { eventType: 'addon.thsv.viewer-lobby.control', payload: { action: 'next' } } as unknown as NormalizedEvent;
    expect(await registry.controlPanel('thsv.viewer-lobby', { operation: 'action', action: 'next' }, control)).toEqual({});
    expect(onEvent).toHaveBeenCalledWith(control, expect.anything());
    await expect(registry.controlPanel('thsv.viewer-lobby', { operation: 'action', action: 'next' }, { ...control, eventType: 'addon.thsv.other.control' })).rejects.toThrow('no controls');
    await expect(registry.controlPanel('thsv.prize-wheel', { operation: 'action', action: 'BAD ACTION' })).rejects.toThrow();
  });
});
