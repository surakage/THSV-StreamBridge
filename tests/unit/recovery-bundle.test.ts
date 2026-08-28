import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportRecoveryBundle, exportTransferBundle, previewTransferBundle, restoreRecoveryBundle, restoreTransferBundle, verifyRecoveryBundle, verifyTransferBundle } from '../../launcher/recovery-bundle.mjs';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('encrypted recovery bundles', () => {
  it('authenticates, transactionally restores, and refreshes recovery access without retaining plaintext secrets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-recovery-')); roots.push(root);
    const bundle = join(root, 'backup.thsv-recovery');
    await mkdir(join(root, 'data', 'configuration'), { recursive: true });
    await mkdir(join(root, 'data', 'state'), { recursive: true });
    await mkdir(join(root, 'data', 'secrets'), { recursive: true });
    await mkdir(join(root, 'addons', 'packages', 'thsv.test'), { recursive: true });
    await mkdir(join(root, 'addons', 'state', 'thsv.test'), { recursive: true });
    await writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), '{"saved":true}\n', 'utf8');
    await writeFile(join(root, 'data', 'state', 'creator.json'), '{"points":42}\n', 'utf8');
    await writeFile(join(root, 'data', 'secrets', 'control-token'), 'private-recovery-token\n', 'utf8');
    await writeFile(join(root, 'addons', 'packages', 'thsv.test', 'installed-package.json'), '{"enabled":true}\n', 'utf8');
    await writeFile(join(root, 'addons', 'state', 'thsv.test', 'state.json'), '{"preserved":true}\n', 'utf8');

    const exported = await exportRecoveryBundle({ installRoot: root, outputPath: bundle, passphrase: 'correct horse battery staple' });
    expect(exported).toMatchObject({ encrypted: true, verified: true, fileCount: 5 });
    expect(await readFile(bundle, 'utf8')).not.toContain('private-recovery-token');
    await expect(verifyRecoveryBundle({ bundlePath: bundle, passphrase: 'wrong passphrase value' })).rejects.toThrow('authentication failed');
    await expect(restoreRecoveryBundle({ installRoot: root, bundlePath: bundle, passphrase: 'correct horse battery staple' })).rejects.toThrow('explicit creator approval');

    await writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), '{"saved":false}\n', 'utf8');
    await writeFile(join(root, 'data', 'state', 'creator.json'), '{"points":0}\n', 'utf8');
    const restored = await restoreRecoveryBundle({ installRoot: root, bundlePath: bundle, passphrase: 'correct horse battery staple', approvedByCreator: true });
    expect(restored).toMatchObject({ restored: true, fileCount: 5 });
    expect(await readFile(join(root, 'data', 'configuration', 'bridge.local.json'), 'utf8')).toContain('true');
    expect(await readFile(join(root, 'data', 'state', 'creator.json'), 'utf8')).toContain('42');
    expect(await readFile(join(root, 'addons', 'state', 'thsv.test', 'state.json'), 'utf8')).toContain('preserved');
    expect(await readFile(join(root, 'THSV StreamBridge Recovery Key.txt'), 'utf8')).toContain('private-recovery-token');
    expect(await readFile(join(root, 'data', 'backups', 'recovery-restore-latest.json'), 'utf8')).toContain('"fileCount": 5');
  });

  it('restores declared persistent roots even when one is empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-recovery-empty-')); roots.push(root);
    const bundle = join(root, 'backup.thsv-recovery');
    await mkdir(join(root, 'data', 'configuration'), { recursive: true });
    await mkdir(join(root, 'addons', 'packages'), { recursive: true });
    await writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), '{}\n', 'utf8');
    await exportRecoveryBundle({ installRoot: root, outputPath: bundle, passphrase: 'correct horse battery staple' });
    await restoreRecoveryBundle({ installRoot: root, bundlePath: bundle, passphrase: 'correct horse battery staple', approvedByCreator: true });
    await expect(readFile(join(root, 'data', 'configuration', 'bridge.local.json'), 'utf8')).resolves.toBe('{}\n');
  });

  it('moves settings, state, packages, and assets without moving credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-transfer-')); roots.push(root);
    const destination = await mkdtemp(join(tmpdir(), 'thsv-transfer-destination-')); roots.push(destination);
    const bundle = join(root, 'move.thsv-transfer');
    await mkdir(join(root, 'data', 'configuration'), { recursive: true });
    await mkdir(join(root, 'data', 'state'), { recursive: true });
    await mkdir(join(root, 'data', 'secrets'), { recursive: true });
    await mkdir(join(root, 'addons', 'packages', 'thsv.test'), { recursive: true });
    await mkdir(join(root, 'addons', 'state', 'thsv.test'), { recursive: true });
    await writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), JSON.stringify({ security: { controlTokenFile: 'data/secrets/control-token' }, webhookUrl: 'https://secret.invalid/value', sceneName: 'BRB' }), 'utf8');
    await writeFile(join(root, 'data', 'state', 'scene-catalog.json'), `\uFEFF${JSON.stringify({ scene: 'BRB', credential: 'never-move' })}`, 'utf8');
    await writeFile(join(root, 'data', 'secrets', 'control-token'), 'never-move-token', 'utf8');
    await writeFile(join(root, 'addons', 'packages', 'thsv.test', 'asset.png'), Buffer.from([1, 2, 3]));
    await writeFile(join(root, 'addons', 'state', 'thsv.test', 'settings.json'), JSON.stringify({ volume: 0.8, apiKey: 'never-move-key' }), 'utf8');
    const preview = await previewTransferBundle({ installRoot: root });
    expect(preview).toMatchObject({ portableTransfer: true, credentialsRequired: true, redactedFields: 3 });
    expect(preview.omittedCategories).toEqual(expect.arrayContaining<string>(['credentials', 'secrets']));
    expect(preview.files.map((file) => file.path)).not.toContain('data/secrets/control-token');
    const exported = await exportTransferBundle({ installRoot: root, outputPath: bundle, passphrase: 'correct horse battery staple' });
    expect(exported).toMatchObject({ portableTransfer: true, credentialsRequired: true, verified: true });
    await expect(verifyTransferBundle({ bundlePath: bundle, passphrase: 'correct horse battery staple' })).resolves.toMatchObject({ portableTransfer: true, credentialsRequired: true });
    await restoreTransferBundle({ installRoot: destination, bundlePath: bundle, passphrase: 'correct horse battery staple', approvedByCreator: true });
    await expect(readFile(join(destination, 'data', 'secrets', 'control-token'), 'utf8')).rejects.toThrow();
    expect(await readFile(join(destination, 'data', 'configuration', 'bridge.local.json'), 'utf8')).not.toContain('secret.invalid');
    expect(await readFile(join(destination, 'data', 'state', 'scene-catalog.json'), 'utf8')).not.toContain('never-move');
    expect(await readFile(join(destination, 'addons', 'state', 'thsv.test', 'settings.json'), 'utf8')).not.toContain('never-move');
    await expect(readFile(join(destination, 'addons', 'packages', 'thsv.test', 'asset.png'))).resolves.toEqual(Buffer.from([1, 2, 3]));
  });
});
