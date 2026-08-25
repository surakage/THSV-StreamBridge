import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BroadcastConnectionVaultService, WindowsDpapiCredentialProtector, type CredentialProtector } from '../../bridge/services/broadcast-connection-vault-service.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const protector: CredentialProtector = { protect: async (value) => `protected:${Buffer.from(value).toString('base64')}`, unprotect: async (value) => Buffer.from(value.slice('protected:'.length), 'base64').toString('utf8') };

describe('broadcast connection vault', () => {
  it.runIf(process.platform === 'win32')('round-trips through Windows DPAPI without command-line secret exposure', async () => {
    const dpapi = new WindowsDpapiCredentialProtector();
    const protectedValue = await dpapi.protect('local-vendor-token');
    expect(protectedValue).not.toContain('local-vendor-token');
    await expect(dpapi.unprotect(protectedValue)).resolves.toBe('local-vendor-token');
  });
  it('stores only protected credentials and exposes safe named profiles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-broadcast-vault-')); roots.push(root);
    const service = new BroadcastConnectionVaultService(root, 'win32', protector); await service.start();
    const status = await service.save({ name: 'OBS Portrait', provider: 'obs', url: 'ws://127.0.0.1:4456', credential: 'never-plain', enabled: true }) as { connections: Array<{ id: string; hasCredential: boolean }> };
    expect(status.connections[0]).toMatchObject({ hasCredential: true });
    expect(service.exportMetadata()).toMatchObject({ format: 'thsv-broadcast-connections-metadata-v1', connections: [{ name: 'OBS Portrait', credentialRequired: true }] });
    expect(JSON.stringify(service.exportMetadata())).not.toContain('never-plain');
    expect(await readFile(join(root, 'secrets', 'broadcast-connections.json'), 'utf8')).not.toContain('never-plain');
    await expect(service.resolved('obs')).resolves.toEqual([expect.objectContaining({ name: 'OBS Portrait', credential: 'never-plain' })]);
  });

  it('supports multiple named profiles and rejects non-loopback or credential-bearing URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-broadcast-profiles-')); roots.push(root);
    const service = new BroadcastConnectionVaultService(root, 'win32', protector); await service.start();
    await service.save({ name: 'OBS Main', provider: 'obs', url: 'ws://localhost:4455', enabled: true });
    await service.save({ name: 'OBS Vertical', provider: 'obs', url: 'ws://127.0.0.1:4456', enabled: true });
    expect((await service.resolved('obs')).map((item) => item.name)).toEqual(['OBS Main', 'OBS Vertical']);
    await expect(service.save({ name: 'Unsafe', provider: 'obs', url: 'ws://example.com:4455' })).rejects.toThrow('loopback');
    await expect(service.save({ name: 'Unsafe', provider: 'obs', url: 'ws://user:secret@127.0.0.1:4455' })).rejects.toThrow('credential-free');
    await expect(service.save({ id: 'not-an-id', name: 'Unsafe', provider: 'obs', url: 'ws://127.0.0.1:4455' })).rejects.toThrow('valid connection UUID');
  });

  it('validates metadata without secrets and transactionally imports per-profile credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-broadcast-import-')); roots.push(root);
    const service = new BroadcastConnectionVaultService(root, 'win32', protector); await service.start();
    const id = '12345678-1234-4234-8234-123456789abc';
    const metadata = { format: 'thsv-broadcast-connections-metadata-v1', exportedAt: new Date().toISOString(), secretPolicy: 'Credentials are never exported.', connections: [{ id, name: 'OBS Imported', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true, credentialRequired: true }] };
    expect(service.validateMetadataImport(metadata)).toMatchObject({ valid: true, connections: [{ id, credentialStatus: 'reentry-required' }] });
    await expect(service.importMetadata({ metadata, credentials: {} })).rejects.toThrow('Re-enter the credential');
    expect((service.status() as { connections: unknown[] }).connections).toHaveLength(0);
    await service.importMetadata({ metadata, credentials: { [id]: 'fresh-password' } });
    await expect(service.resolved('obs')).resolves.toEqual([expect.objectContaining({ id, credential: 'fresh-password' })]);
    expect(() => service.validateMetadataImport({ ...metadata, credential: 'must-not-be-here' })).toThrow('secret-bearing');
    expect(() => service.validateMetadataImport({ ...metadata, connections: [{ ...metadata.connections[0], token: 'must-not-be-here' }] })).toThrow('cannot contain credentials');
  });

  it('resolves a proposed credential without replacing the working protected profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-broadcast-candidate-')); roots.push(root);
    const service = new BroadcastConnectionVaultService(root, 'win32', protector); await service.start();
    const saved = await service.save({ name: 'OBS Main', provider: 'obs', url: 'ws://127.0.0.1:4455', credential: 'working-secret' }) as { connections: Array<{ id: string }> };
    const id = saved.connections[0]?.id ?? '';
    await expect(service.candidate({ id, name: 'OBS Main', provider: 'obs', url: 'ws://127.0.0.1:4455', credential: 'bad-rotation' })).resolves.toMatchObject({ credential: 'bad-rotation' });
    await expect(service.resolved('obs')).resolves.toEqual([expect.objectContaining({ credential: 'working-secret' })]);
  });

  it('records successful credential verification and computes optional rotation reminders without exporting timestamps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-broadcast-reminder-')); roots.push(root);
    const service = new BroadcastConnectionVaultService(root, 'win32', protector); await service.start();
    const verifiedAt = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const status = await service.save({ name: 'OBS Main', provider: 'obs', url: 'ws://127.0.0.1:4455', credential: 'protected-secret', rotationReminderDays: 30, latencyWarningMs: 1500 }, verifiedAt) as { connections: Array<{ credentialVerifiedAt: string; credentialReminderDue: boolean; credentialReminderDueAt: string; latencyWarningMs: number }> };
    expect(status.connections[0]).toMatchObject({ credentialVerifiedAt: verifiedAt, credentialReminderDue: true, latencyWarningMs: 1500 });
    expect(Date.parse(status.connections[0]?.credentialReminderDueAt ?? '')).toBe(Date.parse(verifiedAt) + 30 * 86_400_000);
    const id = (service.status() as { connections: Array<{ id: string }> }).connections[0]?.id ?? '';
    const retestedAt = new Date().toISOString(); await service.markCredentialVerified(id, retestedAt);
    expect((service.status() as { connections: Array<{ credentialVerifiedAt: string }> }).connections[0]?.credentialVerifiedAt).toBe(retestedAt);
    const exported = JSON.stringify(service.exportMetadata());
    expect(exported).toContain('rotationReminderDays'); expect(exported).toContain('latencyWarningMs'); expect(exported).not.toContain(verifiedAt); expect(exported).not.toContain('protected-secret');
  });

  it('migrates the optional strict freshness policy without changing existing profiles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-broadcast-policy-')); roots.push(root);
    const service = new BroadcastConnectionVaultService(root, 'win32', protector); await service.start();
    expect(service.reliabilityPolicy()).toEqual({ strictMode: false, acceptanceMaxAgeDays: 30, credentialMaxAgeDays: 90, sustainedAlertMinutes: 5 });
    await expect(service.saveReliabilityPolicy({ strictMode: true })).rejects.toThrow('Explicit creator approval');
    await service.saveReliabilityPolicy({ strictMode: true, acceptanceMaxAgeDays: 14, credentialMaxAgeDays: 45, approvedByCreator: true });
    expect(service.reliabilityPolicy()).toEqual({ strictMode: true, acceptanceMaxAgeDays: 14, credentialMaxAgeDays: 45, sustainedAlertMinutes: 5 });
    const reloaded = new BroadcastConnectionVaultService(root, 'win32', protector); await reloaded.start();
    expect(reloaded.reliabilityPolicy()).toEqual({ strictMode: true, acceptanceMaxAgeDays: 14, credentialMaxAgeDays: 45, sustainedAlertMinutes: 5 });
  });

  it('clones a protected profile disabled on an unused port and supports maintenance snoozes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-broadcast-clone-')); roots.push(root); const service = new BroadcastConnectionVaultService(root, 'win32', protector); await service.start();
    const initial = await service.save({ name: 'OBS Landscape', provider: 'obs', url: 'ws://127.0.0.1:4455', credential: 'shared-secret', enabled: true }) as { connections: Array<{ id: string }> }; const sourceId = initial.connections[0]?.id ?? '';
    await expect(service.cloneProfile({ sourceId, layout: 'portrait', port: 4456 })).rejects.toThrow('Explicit creator approval');
    const cloned = await service.cloneProfile({ sourceId, layout: 'portrait', name: 'OBS Portrait', port: 4456, approvedByCreator: true }) as { connections: Array<{ id: string; name: string; url: string; enabled: boolean; hasCredential: boolean }> };
    expect(cloned.connections).toContainEqual(expect.objectContaining({ name: 'OBS Portrait', url: 'ws://127.0.0.1:4456/', enabled: false, hasCredential: true }));
    const cloneId = cloned.connections.find((item) => item.name === 'OBS Portrait')?.id ?? ''; await expect(service.candidate({ id: cloneId, name: 'OBS Portrait', provider: 'obs', url: 'ws://127.0.0.1:4456' })).resolves.toMatchObject({ credential: 'shared-secret' });
    await service.setMaintenance({ id: sourceId, hours: 2, reason: 'OBS upgrade', approvedByCreator: true }); expect((service.status() as { connections: Array<{ maintenanceReason?: string }> }).connections[0]?.maintenanceReason).toBe('OBS upgrade');
    const exactUntil = new Date(Date.now() + 3_600_000).toISOString(); await service.setMaintenance({ id: sourceId, until: exactUntil, reason: 'Exact window', approvedByCreator: true }); expect((service.status() as { connections: Array<{ maintenanceUntil?: string }> }).connections[0]?.maintenanceUntil).toBe(exactUntil);
    await service.setMaintenance({ id: sourceId, clear: true, approvedByCreator: true }); expect((service.status() as { connections: Array<{ maintenanceUntil?: string }> }).connections[0]?.maintenanceUntil).toBeUndefined();
  });
});
