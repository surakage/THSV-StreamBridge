import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { AddOnWizardService } from '../../bridge/services/addon-wizard-service.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

function declarativeArchive(): Uint8Array {
  const configuration = `${JSON.stringify({
    type: 'object', additionalProperties: false, required: ['label'],
    properties: {
      label: { type: 'string', title: 'Card label', minLength: 1, maxLength: 40, default: 'Hello, stream!' },
      interval: { type: 'integer', minimum: 5, maximum: 120, default: 30 },
      enabled: { type: 'boolean', default: true },
      color: { type: 'string', enum: ['purple', 'green'], default: 'purple' },
    },
  }, null, 2)}\n`;
  const descriptor = {
    packageFormat: 'thsv-addon-v2', packageKind: 'declarative', author: 'THSV Project',
    description: 'A harmless declarative settings example.', changelog: 'Initial example.', permissions: ['state.private', 'streamerbot.run-approved-action'],
    manifest: {
      contractVersion: '2.0.0-preview.1', moduleId: 'sample.status-card', name: 'Sample Status Card', version: '1.0.0',
      minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies: [], requiredCapabilities: [],
      configurationSchema: 'schemas/config.json', eventSubscriptions: [], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
      dataStorageOwned: ['addons/state/sample.status-card/'], installationSteps: ['Install through the Add-ons page.'],
      uninstallationSteps: ['Uninstall through the Add-ons page; private settings remain preserved.'], migrations: [], healthChecks: [],
    },
    files: [{ path: 'schemas/config.json', size: Buffer.byteLength(configuration), sha256: createHash('sha256').update(configuration).digest('hex') }],
  };
  return zipSync({ 'module-package.json': strToU8(`${JSON.stringify(descriptor, null, 2)}\n`), 'schemas/config.json': strToU8(configuration) });
}

describe('wizard add-on management', () => {
  it('installs a verified declarative archive, validates settings, toggles it, and preserves state on removal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-addon-wizard-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state');
    const service = new AddOnWizardService(packages, state);
    const archive = declarativeArchive();
    await expect(service.install({ filename: 'status-card.thsv-addon', contentBase64: Buffer.from(archive).toString('base64'), approvedByCreator: false })).rejects.toThrow('approve');
    await expect(service.install({ filename: 'status-card.zip', contentBase64: Buffer.from(archive).toString('base64'), approvedByCreator: true })).rejects.toThrow('.thsv-addon');
    await expect(service.install({ filename: 'status-card.thsv-addon', contentBase64: Buffer.from(archive).toString('base64'), approvedByCreator: true })).resolves.toMatchObject({ installed: true, moduleId: 'sample.status-card', restartRequired: true });
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ moduleId: 'sample.status-card', packageKind: 'declarative', enabled: true, settings: { label: 'Hello, stream!', interval: 30, enabled: true, color: 'purple' } })]);

    await expect(service.saveSettings('sample.status-card', { label: '', interval: 30, enabled: true, color: 'purple' })).rejects.toThrow('from 1 through 40');
    await expect(service.saveSettings('sample.status-card', { label: 'Live now', interval: 15, enabled: false, color: 'green', surprise: true })).rejects.toThrow('Unknown add-on setting');
    await expect(service.saveSettings('sample.status-card', { label: 'Live now', interval: 15, enabled: false, color: 'green' })).resolves.toMatchObject({ saved: true });
    await expect(readFile(join(state, 'sample.status-card', 'settings.json'), 'utf8')).resolves.toContain('Live now');

    await expect(service.setEnabled('sample.status-card', { enabled: false, approvedByCreator: true })).resolves.toMatchObject({ enabled: false });
    const actionId = '11111111-1111-4111-8111-111111111111';
    await expect(service.setApprovedActions('sample.status-card', { actionIds: [actionId], approvedByCreator: false })).rejects.toThrow('explicit creator approval');
    await expect(service.setApprovedActions('sample.status-card', { actionIds: [actionId], approvedByCreator: true })).resolves.toMatchObject({ approvedActionIds: [actionId], restartRequired: true });
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ approvedActionIds: [actionId] })]);
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ enabled: false, settings: expect.objectContaining({ label: 'Live now' }) as unknown })]);
    await expect(service.remove('sample.status-card', { approvedByCreator: true })).resolves.toMatchObject({ removed: true, statePreserved: true });
    await expect(service.list()).resolves.toEqual([]);
    await expect(readFile(join(state, 'sample.status-card', 'settings.json'), 'utf8')).resolves.toContain('Live now');
  });

  it('rejects traversal entries before extracting an archive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-addon-traversal-')); temporary.push(root);
    const archive = zipSync({ '../outside.txt': strToU8('unsafe'), 'module-package.json': strToU8('{}') });
    const service = new AddOnWizardService(join(root, 'packages'), join(root, 'state'));
    await expect(service.install({ filename: 'unsafe.thsv-addon', contentBase64: Buffer.from(archive).toString('base64'), approvedByCreator: true })).rejects.toThrow('Unsafe archive path');
  });
});
