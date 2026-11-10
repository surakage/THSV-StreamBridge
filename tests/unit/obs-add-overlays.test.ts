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
    expect(addBrowserSources).toHaveBeenCalledWith('StreamBridge Overlays', [chat]);
  });

  it('only accepts StreamBridge overlay links on this PC with sensible sizes', async () => {
    const { instance, addBrowserSources } = await manager(true);
    for (const bad of [{ ...chat, url: 'https://example.com/overlay/chat' }, { ...chat, url: 'http://localhost:7474/wizard/' }, { ...chat, url: 'file:///C:/overlay/chat' }, { ...chat, width: 10 }, { ...chat, name: ' ' }]) {
      await expect(instance.addOverlaySources({ sources: [bad] })).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(instance.addOverlaySources({ sources: [] })).rejects.toMatchObject({ statusCode: 400 });
    expect(addBrowserSources).not.toHaveBeenCalled();
  });

  it('asks the creator to connect OBS first when no OBS connection is saved', async () => {
    const { instance } = await manager(false);
    await expect(instance.addOverlaySources({ sources: [chat] })).rejects.toMatchObject({ statusCode: 409 });
  });
});
