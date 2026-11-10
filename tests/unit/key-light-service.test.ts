import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyLightError, KeyLightService, isPrivateAddress, kelvinToElgato } from '../../bridge/services/key-light-service.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function sceneChanged(sceneName: string, simulated = false): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId: `scene-${sceneName}`, eventType: 'stream.scene-changed', platform: 'system', source: { adapter: 'obs-scene-monitor', eventName: 'CurrentProgramSceneChanged' }, receivedAt: new Date().toISOString(), channel: { name: 'OBS' }, payload: { provider: 'obs', sceneName }, metadata: { simulated, unverifiedFields: [] } } as unknown as NormalizedEvent;
}

describe('KeyLightService', () => {
  let root: string | undefined;
  afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }); });
  const logger = { info: vi.fn(), warn: vi.fn() };

  it('only accepts home-network addresses and converts warmth to the Elgato scale', () => {
    for (const address of ['192.168.1.50', '10.0.0.7', '172.16.4.2', '172.31.255.1', '169.254.3.4']) expect(isPrivateAddress(address), address).toBe(true);
    for (const address of ['8.8.8.8', '172.32.0.1', '192.169.1.1', '127.0.0.1', '192.168.1.256', 'example.com', '192.168.1.5:80', '192.168.1.5/x', '']) expect(isPrivateAddress(address), address).toBe(false);
    expect(kelvinToElgato(7000)).toBe(143);
    expect(kelvinToElgato(2900)).toBe(344);
    expect(kelvinToElgato(4500)).toBe(222);
  });

  it('saves lights and scenes, then sets every light when a listed scene starts', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-key-lights-'));
    const path = join(root, 'configuration', 'key-lights.json');
    const request = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const service = new KeyLightService(path, logger, request, async () => []); await service.start();
    expect(service.status()).toEqual({ enabled: false, lights: [], scenes: [] });
    await expect(service.save({ enabled: true, lights: [{ name: 'Left', address: 'example.com' }], scenes: [] })).rejects.toBeInstanceOf(KeyLightError);
    const saved = await service.save({ enabled: true, lights: [{ name: ' Left ', address: '192.168.1.50' }, { name: '', address: '192.168.1.51' }, { name: 'Twin', address: '192.168.1.50' }], scenes: [{ scene: 'Gameplay', on: true, brightness: 250, temperature: 1000 }, { scene: 'gameplay', on: false }, { scene: 'Be Right Back', on: false, brightness: 10, temperature: 5600 }, { scene: ' ' }] });
    expect(saved).toEqual({ enabled: true, lights: [{ name: 'Left', address: '192.168.1.50' }, { name: 'Elgato light', address: '192.168.1.51' }], scenes: [{ scene: 'Gameplay', on: true, brightness: 100, temperature: 2900 }, { scene: 'Be Right Back', on: false, brightness: 10, temperature: 5600 }] });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1, enabled: true });

    service.observe(sceneChanged('Starting Soon')); service.observe(sceneChanged('Gameplay', true)); await service.flush();
    expect(request).not.toHaveBeenCalled();
    service.observe(sceneChanged('be right back')); await service.flush();
    expect(request.mock.calls.map((call) => (call as unknown[])[0])).toEqual(['http://192.168.1.50:9123/elgato/lights', 'http://192.168.1.51:9123/elgato/lights']);
    const sent = (request.mock.calls[0] as unknown as [string, { method: string; body: string }])[1];
    expect(sent.method).toBe('PUT');
    expect(JSON.parse(sent.body)).toEqual({ numberOfLights: 1, lights: [{ on: 0, brightness: 10, temperature: 179 }] });

    const restarted = new KeyLightService(path, logger, request, async () => []); await restarted.start();
    expect(restarted.status()).toEqual(saved);
    await restarted.save({ ...saved, enabled: false });
    request.mockClear(); restarted.observe(sceneChanged('Gameplay')); await restarted.flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('finds lights that answer, names them, and tests one address', async () => {
    root = await mkdtemp(join(tmpdir(), 'thsv-key-lights-'));
    const request = vi.fn(async (url: string) => {
      if (url.startsWith('http://192.168.1.60:')) throw new Error('timeout');
      if (url.endsWith('/elgato/accessory-info')) return { ok: true, status: 200, json: async () => ({ productName: 'Elgato Key Light', displayName: url.includes('.50') ? 'Desk left' : '' }) };
      return { ok: true, status: 200, json: async () => ({ numberOfLights: 1, lights: [{ on: 1, brightness: 35, temperature: 222 }] }) };
    });
    const service = new KeyLightService(join(root, 'key-lights.json'), logger, request, async () => ['192.168.1.50', '192.168.1.50', '8.8.8.8', '192.168.1.60', '192.168.1.51']);
    expect(await service.discover()).toEqual([{ name: 'Desk left', address: '192.168.1.50' }, { name: 'Elgato Key Light', address: '192.168.1.51' }]);
    expect(request.mock.calls.some((call) => call[0].includes('8.8.8.8'))).toBe(false);
    expect(await service.test({ address: '192.168.1.50' })).toEqual({ on: true, brightness: 35, temperature: 4500 });
    await expect(service.test({ address: '8.8.8.8' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.test({ address: '192.168.1.60' })).rejects.toMatchObject({ statusCode: 502 });
  });
});
