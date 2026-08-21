import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ObsSourceInventoryError, ObsSourceInventoryService } from '../../bridge/services/obs-source-inventory-service.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('ObsSourceInventoryService', () => {
  it('matches required sources by exact program scene, surface, module, and count', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-obs-inventory-')); roots.push(root);
    const service = new ObsSourceInventoryService(root); await service.start();
    expect(() => service.replace({ sources: [] })).toThrow(ObsSourceInventoryError);
    service.replace({ approvedByCreator: true, sources: [{ id: 'countdown-main', label: 'Countdown', scene: 'Starting Soon', surface: '/overlay/countdown', moduleId: 'thsv.starting-soon-countdown', minimumCount: 1, required: true }] });
    const missing = service.status({ hostVisibility: { obsSources: [{ scene: 'Live', surface: '/overlay/countdown', moduleId: 'thsv.starting-soon-countdown', visible: true }] } });
    expect(missing).toMatchObject({ configured: true, ready: false, requiredCount: 1, readyRequiredCount: 0 });
    expect(missing.discovered).toEqual([expect.objectContaining({ scene: 'Live', surface: '/overlay/countdown', moduleId: 'thsv.starting-soon-countdown', suggestedLabel: 'Starting Soon Countdown', minimumCount: 1 })]);
    expect(missing.reconciliations).toEqual([expect.objectContaining({ sourceId: 'countdown-main', suggested: expect.objectContaining({ scene: 'Live', surface: '/overlay/countdown' }) as unknown })]);
    const ready = service.status({ hostVisibility: { obsSources: [{ scene: 'Starting Soon', surface: '/overlay/countdown', moduleId: 'thsv.starting-soon-countdown', visible: true }] } });
    expect(ready).toMatchObject({ ready: true, readyRequiredCount: 1 });
    expect(ready.discovered).toEqual([]);
    expect(ready.reconciliations).toEqual([]);
    await service.flush();
    const restarted = new ObsSourceInventoryService(root); await restarted.start();
    expect((restarted.status(undefined).sources as unknown[])).toHaveLength(1);
  });
});
