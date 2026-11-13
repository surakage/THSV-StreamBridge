import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BroadcastConnectionVaultService, type CredentialProtector } from '../../bridge/services/broadcast-connection-vault-service.js';
import { DirectSceneConnectionManager } from '../../bridge/services/direct-scene-connection-manager.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const protector: CredentialProtector = { protect: async (value) => `p:${value}`, unprotect: async (value) => value.slice(2) };

async function manager(withObs: boolean, addBrowserSources = vi.fn(async (sceneName: string, sources: readonly { name: string }[]) => ({ sceneName, sceneCreated: true, added: sources.map((source) => source.name), skipped: [] as string[] }))) {
  const root = await mkdtemp(join(tmpdir(), 'thsv-obs-add-')); roots.push(root);
  const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
  if (withObs) await vault.save({ name: 'Main OBS', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
  const instance = new DirectSceneConnectionManager(vault, [], (profile) => ({
    getSceneList: async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: [] }),
    watchChanges: async () => undefined,
    addBrowserSources,
  }));
  return { instance, addBrowserSources };
}

const chat = { name: 'StreamBridge Chat', url: 'http://localhost:7474/overlay/chat', width: 500, height: 900 };

describe('Add all to OBS', () => {
  it('adds StreamBridge overlay links to their own scene through the saved OBS connection', async () => {
    const { instance, addBrowserSources } = await manager(true);
    await expect(instance.addOverlaySources({ sources: [chat] })).resolves.toMatchObject({ sceneName: 'StreamBridge Overlays', added: ['StreamBridge Chat'], connectionName: 'Main OBS' });
    expect(addBrowserSources).toHaveBeenCalledWith('StreamBridge Overlays', [chat], false);
  });

  it('only accepts StreamBridge overlay links on this PC with sensible sizes', async () => {
    const { instance, addBrowserSources } = await manager(true);
    for (const bad of [{ ...chat, url: 'https://example.com/overlay/chat' }, { ...chat, url: 'http://localhost:7474/wizard/' }, { ...chat, url: 'file:///C:/overlay/chat' }, { ...chat, width: 10 }, { ...chat, name: ' ' }]) {
      await expect(instance.addOverlaySources({ sources: [bad] })).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(instance.addOverlaySources({ sources: [] })).rejects.toMatchObject({ statusCode: 400 });
    expect(addBrowserSources).not.toHaveBeenCalled();
  });

  it('passes shareExisting through for starter scenes', async () => {
    const { instance, addBrowserSources } = await manager(true);
    await instance.addOverlaySources({ sceneName: 'StreamBridge Live', shareExisting: true, sources: [chat] });
    expect(addBrowserSources).toHaveBeenCalledWith('StreamBridge Live', [chat], true);
  });

  it('shares an existing source into a starter scene instead of copying it, and never twice', async () => {
    const { ObsDirectSceneClient } = await import('../../bridge/services/obs-direct-scene-client.js');
    const client = new ObsDirectSceneClient();
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    (client as unknown as { request: (type: string, data?: Record<string, unknown>) => Promise<Record<string, unknown>> }).request = async (type, data) => {
      calls.push([type, data]);
      if (type === 'GetSceneList') return { scenes: [{ sceneName: 'StreamBridge Live' }] };
      if (type === 'GetInputList') return { inputs: [{ inputName: 'StreamBridge Chat' }, { inputName: 'StreamBridge Alerts' }] };
      if (type === 'GetSceneItemList') return { sceneItems: [{ sourceName: 'StreamBridge Alerts' }] };
      return {};
    };
    const alerts = { ...chat, name: 'StreamBridge Alerts', url: 'http://localhost:7474/overlay/alerts' };
    const goals = { ...chat, name: 'Goal Bars', url: 'http://localhost:7474/overlay/addons/thsv.goal-bars' };
    await expect(client.addBrowserSources('StreamBridge Live', [chat, alerts, goals], true)).resolves.toEqual({ sceneName: 'StreamBridge Live', sceneCreated: false, added: ['Goal Bars'], skipped: ['StreamBridge Alerts'], shared: ['StreamBridge Chat'] });
    expect(calls.filter(([type]) => type === 'CreateSceneItem')).toEqual([['CreateSceneItem', { sceneName: 'StreamBridge Live', sourceName: 'StreamBridge Chat', sceneItemEnabled: true }]]);
    expect(calls.some(([type]) => type === 'CreateScene')).toBe(false);
  });

  it('asks the creator to connect OBS first when no OBS connection is saved', async () => {
    const { instance } = await manager(false);
    await expect(instance.addOverlaySources({ sources: [chat] })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('Save power in OBS', () => {
  it('only pauses StreamBridge overlays that show a standing picture', async () => {
    const { pausableOverlayUrl } = await import('../../bridge/services/obs-direct-scene-client.js');
    expect(pausableOverlayUrl('http://127.0.0.1:8787/overlay/addons/thsv.local-clock')).toBe(true);
    expect(pausableOverlayUrl('http://localhost:8787/overlay/addons/thsv.viewer-spotlight?layout=vertical')).toBe(true);
    for (const kept of ['http://127.0.0.1:8787/overlay/alerts', 'http://127.0.0.1:8787/overlay/chat', 'http://127.0.0.1:8787/overlay/countdown', 'http://127.0.0.1:8787/overlay/emote-wall', 'http://127.0.0.1:8787/overlay/addons/thsv.reward-timers', 'https://example.com/overlay/addons/thsv.local-clock', 'not a url']) expect(pausableOverlayUrl(kept)).toBe(false);
  });

  it('sets only the shutdown flag on safe sources and leaves everything else alone', async () => {
    const { ObsDirectSceneClient } = await import('../../bridge/services/obs-direct-scene-client.js');
    const client = new ObsDirectSceneClient();
    const urls: Record<string, { url: string; shutdown?: boolean }> = {
      Clock: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.local-clock' },
      Crown: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.fan-crown', shutdown: true },
      Alerts: { url: 'http://127.0.0.1:8787/overlay/alerts' },
      Art: { url: 'file:///C:/art/starting.html' },
    };
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    (client as unknown as { request: (type: string, data?: Record<string, unknown>) => Promise<Record<string, unknown>> }).request = async (type, data) => {
      calls.push([type, data]);
      if (type === 'GetInputList') return { inputs: Object.keys(urls).map((inputName) => ({ inputName })) };
      if (type === 'GetInputSettings') return { inputSettings: urls[String(data?.['inputName'])] };
      return {};
    };
    await expect(client.pauseHiddenOverlaySources()).resolves.toEqual({ changed: ['Clock'], already: ['Crown'], keptRunning: 2 });
    expect(calls.filter(([type]) => type === 'SetInputSettings')).toEqual([['SetInputSettings', { inputName: 'Clock', inputSettings: { shutdown: true }, overlay: true }]]);
  });
});

describe('Starter scene layout and undo', () => {
  it('places overlays by edge and fills the canvas for full-canvas ones', async () => {
    const { placementTransform } = await import('../../bridge/services/obs-direct-scene-client.js');
    const canvas = { width: 1920, height: 1080 };
    expect(placementTransform('full', { width: 1920, height: 1080 }, { width: 1280, height: 720 })).toEqual({ positionX: 0, positionY: 0, scaleX: 2 / 3, scaleY: 2 / 3 });
    expect(placementTransform('right', { width: 500, height: 900 }, canvas)).toEqual({ positionX: 1396, positionY: 90, scaleX: 1, scaleY: 1 });
    expect(placementTransform('bottom-left', { width: 600, height: 200 }, canvas)).toEqual({ positionX: 24, positionY: 856, scaleX: 1, scaleY: 1 });
    const tall = placementTransform('center', { width: 500, height: 2000 }, canvas);
    expect(tall.scaleX * 2000).toBeLessThanOrEqual(1080);
  });

  it('positions each new item after creating it', async () => {
    const { ObsDirectSceneClient } = await import('../../bridge/services/obs-direct-scene-client.js');
    const client = new ObsDirectSceneClient();
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    (client as unknown as { request: (type: string, data?: Record<string, unknown>) => Promise<Record<string, unknown>> }).request = async (type, data) => {
      calls.push([type, data]);
      if (type === 'GetSceneList') return { scenes: [] };
      if (type === 'GetInputList') return { inputs: [] };
      if (type === 'GetVideoSettings') return { baseWidth: 1920, baseHeight: 1080 };
      if (type === 'CreateInput') return { sceneItemId: 7 };
      return {};
    };
    await client.addBrowserSources('StreamBridge Live', [{ ...chat, placement: 'right' }], true);
    expect(calls.find(([type]) => type === 'SetSceneItemTransform')?.[1]).toEqual({ sceneName: 'StreamBridge Live', sceneItemId: 7, sceneItemTransform: { positionX: 1396, positionY: 90, scaleX: 1, scaleY: 1 } });
  });

  it('removes only StreamBridge starter scenes', async () => {
    const removeScenes = vi.fn(async (names: readonly string[]) => ({ removed: names, missing: [] as string[] }));
    const root = await mkdtemp(join(tmpdir(), 'thsv-obs-remove-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'Main OBS', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
    const instance = new DirectSceneConnectionManager(vault, [], (profile) => ({ getSceneList: async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: [] }), watchChanges: async () => undefined, removeScenes }));
    await expect(instance.removeStarterScenes({ sceneNames: ['StreamBridge Live'] })).resolves.toMatchObject({ removed: ['StreamBridge Live'], connectionName: 'Main OBS' });
    for (const bad of [['Gameplay'], [], ['StreamBridge Live', 'My Scene']]) await expect(instance.removeStarterScenes({ sceneNames: bad })).rejects.toMatchObject({ statusCode: 400 });
    expect(removeScenes).toHaveBeenCalledTimes(1);
  });

  it('undoes Save power only on paused StreamBridge overlays', async () => {
    const { ObsDirectSceneClient } = await import('../../bridge/services/obs-direct-scene-client.js');
    const client = new ObsDirectSceneClient();
    const urls: Record<string, { url: string; shutdown?: boolean }> = {
      Clock: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.local-clock', shutdown: true },
      Crown: { url: 'http://127.0.0.1:8787/overlay/addons/thsv.fan-crown' },
      Art: { url: 'file:///C:/art/starting.html', shutdown: true },
    };
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    (client as unknown as { request: (type: string, data?: Record<string, unknown>) => Promise<Record<string, unknown>> }).request = async (type, data) => {
      calls.push([type, data]);
      if (type === 'GetInputList') return { inputs: Object.keys(urls).map((inputName) => ({ inputName })) };
      if (type === 'GetInputSettings') return { inputSettings: urls[String(data?.['inputName'])] };
      return {};
    };
    await expect(client.resumeHiddenOverlaySources()).resolves.toEqual({ changed: ['Clock'], already: ['Crown'], keptRunning: 1 });
    expect(calls.filter(([type]) => type === 'SetInputSettings')).toEqual([['SetInputSettings', { inputName: 'Clock', inputSettings: { shutdown: false }, overlay: true }]]);
  });
});
