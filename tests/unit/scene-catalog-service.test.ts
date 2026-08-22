import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeStreamerBotSceneCatalogRelay, normalizeStreamerBotSceneRelay } from '../../bridge/adapters/streamerbot-scene-relay-adapter.js';
import { SceneCatalogError, SceneCatalogService } from '../../bridge/services/scene-catalog-service.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('SceneCatalogService', () => {
  it('merges observed provider scenes, replaces complete OBS inventories, and persists Unicode exactly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-scene-catalog-')); roots.push(root);
    const service = new SceneCatalogService(root); await service.start();
    service.observe(normalizeStreamerBotSceneRelay({ type: 'thsv.scene', version: '1.0.0', provider: 'meld', sourceEventType: 'MeldSceneChanged', relayId: 'one', receivedAt: '2026-08-22T10:00:00.000Z', simulated: false, connectionId: 'meld-1', connectionName: 'Meld', sceneName: 'BRB 🦥', oldSceneName: 'Gameplay 🎮' }));
    service.observe(normalizeStreamerBotSceneCatalogRelay({ type: 'thsv.scene-catalog', version: '1.0.0', provider: 'obs', relayId: 'two', receivedAt: '2026-08-22T10:01:00.000Z', connectionIndex: 0, connectionId: '0', connectionName: 'OBS', currentScene: 'Live', scenes: ['Live', 'Starting Soon ✨'], complete: true, error: '' }));
    expect(service.status()).toMatchObject({ providers: { obs: { scenes: ['Live', 'Starting Soon ✨'], complete: true, source: 'streamerbot-fallback' }, meld: { scenes: ['BRB 🦥', 'Gameplay 🎮'], complete: false, source: 'observed' } } });
    await service.flush(); const restarted = new SceneCatalogService(root); await restarted.start();
    expect(restarted.status()).toMatchObject({ providers: { meld: { scenes: ['BRB 🦥', 'Gameplay 🎮'] } } });
  });

  it('dispatches only a validated provider and connection index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-scene-refresh-')); roots.push(root); const request = vi.fn(async () => undefined);
    const service = new SceneCatalogService(root, request); await service.refresh({ provider: 'obs', connectionIndex: 2 });
    expect(request).toHaveBeenCalledWith('obs', 2);
    await expect(service.refresh({ provider: 'xsplit' })).rejects.toBeInstanceOf(SceneCatalogError);
    await expect(service.refresh({ provider: 'obs', connectionIndex: 99 })).rejects.toBeInstanceOf(SceneCatalogError);
  });

  it('prefers a direct read-only WebSocket snapshot and skips the Streamer.bot fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-scene-direct-')); roots.push(root);
    const fallback = vi.fn(async () => undefined);
    const direct = vi.fn(async () => ({ connectionId: 'ws://127.0.0.1:4455', connectionName: 'OBS direct', scenes: ['Live', 'BRB'], currentScene: 'Live' }));
    const service = new SceneCatalogService(root, fallback, direct);
    const result = await service.refresh({ provider: 'obs', connectionIndex: 0 });
    expect(result).toMatchObject({ source: 'direct-websocket', status: { providers: { obs: { source: 'direct-websocket', scenes: ['BRB', 'Live'] } } } });
    expect(fallback).not.toHaveBeenCalled();
    await service.flush();
  });
});
