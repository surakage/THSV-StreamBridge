import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { licencePlan, settingsForPlan } from '../../bridge/services/licence-plan.js';
import { LicenceService } from '../../bridge/services/licence-service.js';
import { isOwnerMachine, OWNER_MACHINE_HASHES, ownerMachineHash } from '../../bridge/services/owner-entitlement.js';
import type { Logger } from '../../bridge/services/logger.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
const protector = { protect: async (value: string) => value, unprotect: async (value: string) => value };
const GUID = '4C4C4544-0042-3510-8051-B4C04F4B4E32';

describe('the owner licence', () => {
  it('hashes the MachineGuid the same way as the PowerShell line in owner-entitlement.ts', () => {
    // sha256("streambridge-owner:" + lower-case, trimmed GUID)
    expect(ownerMachineHash(`  ${GUID}\n`)).toBe(ownerMachineHash(GUID.toLowerCase()));
    expect(ownerMachineHash(GUID)).toMatch(/^[0-9a-f]{64}$/u);
    for (const hash of OWNER_MACHINE_HASHES) expect(hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('recognises only a listed PC, and never one whose id cannot be read', async () => {
    const hashes = [ownerMachineHash(GUID)];
    await expect(isOwnerMachine(hashes, async () => GUID.toLowerCase())).resolves.toBe(true);
    await expect(isOwnerMachine(hashes, async () => '00000000-0000-0000-0000-000000000000')).resolves.toBe(false);
    await expect(isOwnerMachine(hashes, async () => undefined)).resolves.toBe(false);
    await expect(isOwnerMachine(hashes, async () => { throw new Error('no registry'); })).resolves.toBe(false);
    const read = vi.fn(async () => GUID);
    await expect(isOwnerMachine([], read)).resolves.toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps an owner PC on Pro with no key, offline, and with the plan enforced', async () => {
    const fetcher = vi.fn();
    const licence = new LicenceService(await mkdtemp(join(tmpdir(), 'licence-')), { protector, logger, fetcher, isOwner: async () => true, links: {} });
    await licence.start();
    expect(licence.status()).toMatchObject({ licensed: true, owner: true, state: 'active', productName: 'StreamBridge Pro', plan: { tier: 'pro' } });
    await licence.check();
    expect(fetcher).not.toHaveBeenCalled();
    const settings = { platforms: { twitch: { enabled: true }, youtube: { enabled: true }, kick: { enabled: true }, tiktok: { enabled: true }, facebook: { enabled: true } } };
    expect(settingsForPlan(licencePlan(licence.status().licensed, true), settings).withheldPlatforms).toEqual([]);
  });

  it('leaves other PCs on the normal licence', async () => {
    const licence = new LicenceService(await mkdtemp(join(tmpdir(), 'licence-')), { protector, logger, fetcher: vi.fn(), isOwner: async () => false, links: {} });
    await licence.start();
    expect(licence.status()).toMatchObject({ licensed: false, state: 'none' });
    expect(licence.status().owner).toBeUndefined();
  });
});
