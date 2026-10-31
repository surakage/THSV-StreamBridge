import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddOnWizardService, validateSettings } from '../../bridge/services/addon-wizard-service.js';
import { installAddOnArchive } from '../../bridge/services/addon-package-manager.js';
import { STREAMBRIDGE_VERSION } from '../../bridge/version.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

function declarativeArchive(moduleId = 'sample.status-card', name = 'Sample Status Card', dependencies: readonly string[] = [], official = false, version = '1.0.0'): Uint8Array {
  const configuration = `${JSON.stringify({
    type: 'object', additionalProperties: false, required: ['label'],
    properties: {
      label: { type: 'string', title: 'Card label', minLength: 1, maxLength: 40, default: 'Hello, stream!' },
      interval: { type: 'integer', minimum: 5, maximum: 120, default: 30 },
      enabled: { type: 'boolean', default: true },
      color: { type: 'string', enum: ['purple', 'green'], default: 'purple' },
      labels: { type: 'array', title: 'Rotation labels', items: { type: 'string', minLength: 1, maxLength: 20 }, minItems: 1, maxItems: 3, default: ['one'] },
    },
  }, null, 2)}\n`;
  const descriptor = {
    packageFormat: 'thsv-addon-v2', packageKind: 'declarative', author: 'THSV Project',
    description: 'A harmless declarative settings example.', changelog: 'Initial example.', permissions: ['state.private', 'streamerbot.run-approved-action'],
    manifest: {
      contractVersion: '2.0.0-preview.1', moduleId, name, version,
      minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies, requiredCapabilities: [],
      ...(official ? { minimumBridgeVersion: STREAMBRIDGE_VERSION, maximumTestedBridgeVersion: STREAMBRIDGE_VERSION } : {}),
      configurationSchema: 'schemas/config.json', eventSubscriptions: [], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [],
      dataStorageOwned: [`addons/state/${moduleId}/`], installationSteps: ['Install through the Add-ons page.'],
      uninstallationSteps: ['Uninstall through the Add-ons page; private settings remain preserved.'], migrations: [], healthChecks: [],
    },
    files: [{ path: 'schemas/config.json', size: Buffer.byteLength(configuration), sha256: createHash('sha256').update(configuration).digest('hex') }],
    trust: official ? { publisherId: 'thsv.streambridge' } : {},
  };
  return zipSync({ 'module-package.json': strToU8(`${JSON.stringify(descriptor, null, 2)}\n`), 'schemas/config.json': strToU8(configuration) });
}

describe('wizard add-on management', () => {
  it('enforces enumerated list choices rendered as selector controls', () => {
    const schema = {
      type: 'object', properties: {
        platforms: { type: 'array', items: { type: 'string', enum: ['twitch', 'youtube'] }, minItems: 1, maxItems: 2 },
      },
    };
    expect(validateSettings(schema, { platforms: ['twitch', 'youtube'] })).toEqual({ platforms: ['twitch', 'youtube'] });
    expect(() => validateSettings(schema, { platforms: ['unsupported'] })).toThrow('unsupported choice');
  });

  it('enforces declared case-insensitive uniqueness across related settings', () => {
    const schema = {
      type: 'object', 'x-distinctFields': ['counterCommand', 'pollCommand', 'voteCommand'], properties: {
        counterCommand: { type: 'string' }, pollCommand: { type: 'string' }, voteCommand: { type: 'string' },
      },
    };
    expect(validateSettings(schema, { counterCommand: 'counter', pollCommand: 'poll', voteCommand: 'vote' })).toMatchObject({ voteCommand: 'vote' });
    expect(() => validateSettings(schema, { counterCommand: 'Poll', pollCommand: 'poll', voteCommand: 'vote' })).toThrow('must use different values');
  });

  it('installs a verified declarative archive, validates settings, toggles it, and preserves state on removal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-addon-wizard-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state');
    const service = new AddOnWizardService(packages, state);
    const archive = declarativeArchive();
    await expect(installAddOnArchive(archive, packages, true, {}, { stateRoot: state })).resolves.toMatchObject({ descriptor: { manifest: { moduleId: 'sample.status-card' } } });
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ moduleId: 'sample.status-card', packageKind: 'declarative', enabled: true, settings: { label: 'Hello, stream!', interval: 30, enabled: true, color: 'purple', labels: ['one'] } })]);

    const initialAcceptance = await service.listAcceptance();
    expect(initialAcceptance['sample.status-card']).toMatchObject({ version: '1.0.0', offlineStatus: 'pending', providerStatus: 'pending' });
    await expect(service.saveAcceptance('sample.status-card', { offlineStatus: 'passed', providerStatus: 'pending', evidence: 'Simulator routing and overlay preview passed.', approvedByCreator: false })).rejects.toThrow('explicit creator approval');
    await expect(service.saveAcceptance('sample.status-card', { offlineStatus: 'passed', providerStatus: 'pending', evidence: 'token=secret-value', approvedByCreator: true })).rejects.toThrow('Do not store');
    await expect(service.saveAcceptance('sample.status-card', { offlineStatus: 'passed', providerStatus: 'pending', evidence: 'Simulator routing and overlay preview passed.', approvedByCreator: true })).resolves.toMatchObject({ moduleId: 'sample.status-card', version: '1.0.0', offlineStatus: 'passed', providerStatus: 'pending' });
    const savedAcceptance = await service.listAcceptance();
    expect(savedAcceptance['sample.status-card']).toMatchObject({ offlineStatus: 'passed', evidence: 'Simulator routing and overlay preview passed.' });

    await expect(service.saveSettings('sample.status-card', { label: '', interval: 30, enabled: true, color: 'purple' })).rejects.toThrow('from 1 through 40');
    await expect(service.saveSettings('sample.status-card', { label: 'Live now', interval: 15, enabled: false, color: 'green', surprise: true })).rejects.toThrow('Unknown add-on setting');
    await expect(service.saveSettings('sample.status-card', { label: 'Live now', interval: 15, enabled: false, color: 'green' })).resolves.toMatchObject({ saved: true });
    await expect(service.saveSettings('sample.status-card', { label: 'Live now', interval: 15, enabled: false, color: 'green', labels: ['one', 'one'] })).rejects.toThrow('duplicate items');
    await expect(service.saveSettings('sample.status-card', { label: 'Live now', interval: 15, enabled: false, color: 'green', labels: ['one', 'two', 'three', 'four'] })).rejects.toThrow('from 1 through 3 items');
    await expect(service.saveSettings('sample.status-card', { label: 'Live now', interval: 15, enabled: false, color: 'green', labels: ['first', 'second'] })).resolves.toMatchObject({ saved: true });
    await expect(readFile(join(state, 'sample.status-card', 'settings.json'), 'utf8')).resolves.toContain('Live now');
    // The settings before the latest save are kept so a bad save can be undone.
    const history = await readdir(join(state, 'sample.status-card', 'settings-history'));
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(await readFile(join(state, 'sample.status-card', 'settings-history', history.sort().at(-1) ?? ''), 'utf8')).toContain('"interval": 15');
    await expect(service.previewSettings('sample.status-card', { label: 'Unsaved preview', interval: 20, enabled: true, color: 'purple', labels: ['draft'] })).resolves.toMatchObject({ moduleId: 'sample.status-card', settings: { label: 'Unsaved preview', interval: 20, enabled: true, color: 'purple', labels: ['draft'] } });
    const settingsAfterPreview = await readFile(join(state, 'sample.status-card', 'settings.json'), 'utf8');
    expect(settingsAfterPreview).toContain('Live now');
    expect(settingsAfterPreview).not.toContain('Unsaved preview');

    await expect(service.setEnabled('sample.status-card', { enabled: false, approvedByCreator: true })).resolves.toMatchObject({ enabled: false });
    const actionId = '11111111-1111-4111-8111-111111111111';
    await expect(service.setApprovedActions('sample.status-card', { actionIds: [actionId], approvedByCreator: false })).rejects.toThrow('explicit creator approval');
    await expect(service.setApprovedActions('sample.status-card', { actionIds: [actionId], approvedByCreator: true })).resolves.toMatchObject({ approvedActionIds: [actionId], restartRequired: true });
    const liveGrant = vi.fn(() => true);
    service.onApprovedActionsChanged(liveGrant);
    await expect(service.setApprovedActions('sample.status-card', { actionIds: ['not-a-uuid'], approvedByCreator: true })).rejects.toThrow();
    expect(liveGrant).not.toHaveBeenCalled();
    await expect(service.setApprovedActions('sample.status-card', { actionIds: [], approvedByCreator: true })).resolves.toMatchObject({ approvedActionIds: [], appliedLive: true, restartRequired: false });
    expect(liveGrant).toHaveBeenCalledWith('sample.status-card', []);
    await expect(service.setApprovedActions('sample.status-card', { actionIds: [actionId], approvedByCreator: true })).resolves.toMatchObject({ appliedLive: true, restartRequired: false });
    expect(liveGrant).toHaveBeenLastCalledWith('sample.status-card', [actionId]);
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ approvedActionIds: [actionId] })]);
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ enabled: false, settings: expect.objectContaining({ label: 'Live now' }) as unknown })]);
    await expect(service.remove('sample.status-card', { approvedByCreator: true })).resolves.toMatchObject({ removed: true, statePreserved: true });
    await expect(service.list()).resolves.toEqual([]);
    await expect(readFile(join(state, 'sample.status-card', 'settings.json'), 'utf8')).resolves.toContain('Live now');
  }, 15_000);

  it('updates an already-installed official package from the verified release cache without changing creator choices', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-bundled-update-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state'); const inbox = join(root, 'inbox'); const bundled = join(root, 'bundled'); const updates = join(root, 'official-updates');
    await mkdir(updates, { recursive: true });
    const service = new AddOnWizardService(packages, state, inbox, bundled, updates);
    const moduleId = 'sample.official-card'; const actionId = '11111111-1111-4111-8111-111111111111';
    await installAddOnArchive(declarativeArchive(moduleId, 'Official Card', [], true, '1.0.0'), packages, true, {}, { stateRoot: state });
    await service.saveSettings(moduleId, { label: 'Keep me', interval: 15, enabled: true, color: 'green', labels: ['saved'] });
    await service.setApprovedActions(moduleId, { actionIds: [actionId], approvedByCreator: true });
    await service.setEnabled(moduleId, { enabled: false, approvedByCreator: true });
    await writeFile(join(updates, `${moduleId}.thsv-addon`), declarativeArchive(moduleId, 'Official Card', [], true, '1.1.0'));
    await expect(service.updateInstalledBundledExtensions()).resolves.toMatchObject({ updated: [{ moduleId, fromVersion: '1.0.0', toVersion: '1.1.0' }] });
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ moduleId, version: '1.1.0', enabled: false, approvedActionIds: [actionId], settings: expect.objectContaining({ label: 'Keep me' }) as unknown })]);
  });

  it('installs a component a release added to a built-in group the creator already enabled, and only that', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-group-addition-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state'); const inbox = join(root, 'inbox'); const bundled = join(root, 'bundled');
    await mkdir(bundled, { recursive: true });
    const service = new AddOnWizardService(packages, state, inbox, bundled, join(root, 'official-updates'));
    await installAddOnArchive(declarativeArchive('thsv.custom-counter', 'Custom Counter', [], true), packages, true, {}, { stateRoot: state });
    await writeFile(join(bundled, 'thsv.face-filters.thsv-addon'), declarativeArchive('thsv.face-filters', 'Face Filters', [], true));
    await writeFile(join(bundled, 'thsv.voice-relay.thsv-addon'), declarativeArchive('thsv.voice-relay', 'Village Voice', [], true));
    await expect(service.updateInstalledBundledExtensions()).resolves.toMatchObject({ added: ['thsv.face-filters'], skipped: [expect.objectContaining({ moduleId: 'thsv.voice-relay', reason: 'not-installed' })] });
    expect((await service.list()).map((addOn) => addOn.moduleId).sort()).toEqual(['thsv.custom-counter', 'thsv.face-filters']);
    // A creator who removes the new component keeps it removed on later startups.
    await service.remove('thsv.face-filters', { approvedByCreator: true });
    await expect(service.updateInstalledBundledExtensions()).resolves.toMatchObject({ added: [] });
    expect((await service.list()).map((addOn) => addOn.moduleId)).toEqual(['thsv.custom-counter']);
  });

  it('installs and toggles a built-in extension group as one creator-approved operation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-extension-group-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state'); const inbox = join(root, 'inbox'); const bundled = join(root, 'bundled');
    await mkdir(bundled, { recursive: true });
    await writeFile(join(bundled, 'thsv.voice-relay.thsv-addon'), declarativeArchive('thsv.voice-relay', 'Village Voice', ['thsv.viewer-foundation']));
    await writeFile(join(bundled, 'thsv.user-translate.thsv-addon'), declarativeArchive('thsv.user-translate', 'Translate'));
    await writeFile(join(bundled, 'thsv.accessibility-captions.thsv-addon'), declarativeArchive('thsv.accessibility-captions', 'Accessibility Captions'));
    const service = new AddOnWizardService(packages, state, inbox, bundled);

    await expect(service.setFeatureFamilyEnabled('voice-language', { enabled: true, approvedByCreator: false })).rejects.toThrow('explicit creator approval');
    await expect(service.setFeatureFamilyEnabled('voice-language', { enabled: true, approvedByCreator: true })).resolves.toMatchObject({
      featureId: 'voice-language', enabled: true, installed: ['thsv.voice-relay', 'thsv.user-translate', 'thsv.accessibility-captions'], dependencies: [], restartRequired: true,
    });
    await expect(service.list()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleId: 'thsv.voice-relay', enabled: true }),
      expect.objectContaining({ moduleId: 'thsv.user-translate', enabled: true }),
    ]));
    await expect(service.setFeatureFamilyEnabled('voice-language', { enabled: false, approvedByCreator: true })).resolves.toMatchObject({ enabled: false, installed: [] });
    await expect(service.list()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleId: 'thsv.voice-relay', enabled: false }),
      expect.objectContaining({ moduleId: 'thsv.user-translate', enabled: false }),
    ]));
    await expect(service.viewerFoundation()).resolves.toMatchObject({ moduleId: 'thsv.viewer-foundation', integration: true, required: true, enabled: true });
  });

  it('keeps Viewer Foundation settings in the existing private state while excluding the legacy package from add-ons', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-viewer-foundation-integration-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state');
    const service = new AddOnWizardService(packages, state);
    const integration = await service.viewerFoundation();
    expect(integration.settings).toMatchObject({ enabled: true, currencyName: 'Points' });
    await expect(service.saveViewerFoundationSettings({ ...integration.settings, currencyName: 'Sloth Seeds' })).resolves.toMatchObject({ saved: true, restartRequired: true });
    await expect(service.viewerFoundation()).resolves.toMatchObject({ settings: expect.objectContaining({ currencyName: 'Sloth Seeds' }) as unknown });
    await expect(service.list()).resolves.toEqual([]);
  });

  it('keeps Community Analytics data and settings in its existing private state while exposing it as a built-in integration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-community-analytics-integration-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state');
    const service = new AddOnWizardService(packages, state);
    const integration = await service.communityAnalytics();
    expect(integration).toMatchObject({ moduleId: 'thsv.community-analytics', integration: true, required: false, enabled: true, settings: expect.objectContaining({ enabled: true, retainedSessions: 30 }) as unknown });
    await expect(service.saveCommunityAnalyticsSettings({ ...integration.settings, retainedSessions: 12 })).resolves.toMatchObject({ saved: true, restartRequired: true });
    await expect(service.communityAnalytics()).resolves.toMatchObject({ settings: expect.objectContaining({ retainedSessions: 12 }) as unknown });
    await expect(service.list()).resolves.toEqual([]);
  });

  it('keeps Ko-fi disabled by default while exposing its provider settings as a built-in integration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-kofi-integration-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state');
    const service = new AddOnWizardService(packages, state);
    const integration = await service.kofiDonations();
    expect(integration).toMatchObject({ moduleId: 'thsv.kofi-donations', integration: true, required: false, enabled: true, settings: expect.objectContaining({ enabled: false, channelName: 'Ko-fi' }) as unknown });
    await expect(service.saveKofiDonationsSettings({ ...integration.settings, enabled: true, channelName: 'Village Tips' })).resolves.toMatchObject({ saved: true, restartRequired: true });
    await expect(service.kofiDonations()).resolves.toMatchObject({ settings: expect.objectContaining({ enabled: true, channelName: 'Village Tips' }) as unknown });
    await expect(service.list()).resolves.toEqual([]);
  });

  it('keeps migrated component data private until the creator imports it and chooses whether to enable the component', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-feature-migration-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state');
    const migrationRoot = join(root, 'migration-inbox');
    const service = new AddOnWizardService(packages, state);
    await installAddOnArchive(declarativeArchive(), packages, true, {}, { stateRoot: state });
    await service.setEnabled('sample.status-card', { enabled: false, approvedByCreator: true });
    await mkdir(join(migrationRoot, 'sample.status-card', 'state'), { recursive: true });
    await writeFile(join(migrationRoot, 'sample.status-card', 'state', 'settings.json'), '{"label":"Migrated card","interval":20,"enabled":true,"color":"green","labels":["old"]}\n');
    await writeFile(join(migrationRoot, 'feature-migrations.json'), JSON.stringify({ version: 1, candidates: [{ moduleId: 'sample.status-card', sourceVersion: '0.9.0', discoveredAt: '2026-08-15T00:00:00.000Z', originalEnabled: true }] }));

    await expect(service.listFeatureMigrations()).resolves.toEqual([expect.objectContaining({ moduleId: 'sample.status-card', status: 'pending', stagedData: true, stagedFiles: 1, activeData: false, currentlyEnabled: false })]);
    await expect(service.applyFeatureMigration('sample.status-card', { importData: true, enabled: true, approvedByCreator: false })).rejects.toThrow('explicit creator approval');
    await mkdir(join(state, 'sample.status-card'), { recursive: true });
    await writeFile(join(state, 'sample.status-card', 'settings.json'), '{"label":"Current card","interval":30,"enabled":false,"color":"purple","labels":["new"]}\n');
    await expect(service.applyFeatureMigration('sample.status-card', { importData: true, enabled: true, approvedByCreator: true })).rejects.toThrow('Replace current data');
    await expect(readFile(join(state, 'sample.status-card', 'settings.json'), 'utf8')).resolves.toContain('Current card');
    await expect(service.applyFeatureMigration('sample.status-card', { importData: true, enabled: true, replaceExistingData: true, approvedByCreator: true })).resolves.toMatchObject({ imported: true, enabled: true, dataReplaced: true, restartRequired: true });
    await expect(readFile(join(state, 'sample.status-card', 'settings.json'), 'utf8')).resolves.toContain('Migrated card');
    await expect(service.listFeatureMigrations()).resolves.toEqual([expect.objectContaining({ moduleId: 'sample.status-card', status: 'imported', currentlyEnabled: true, activeData: true })]);
    await expect(service.applyFeatureMigration('sample.status-card', { importData: false, enabled: false, approvedByCreator: true })).rejects.toThrow('already imported');
    await expect(service.applyFeatureMigration('sample.status-card', { importData: true, enabled: false, approvedByCreator: true })).resolves.toMatchObject({ imported: true, enabled: false, dataReplaced: false });
  });

  it('rejects traversal entries before extracting an archive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-addon-traversal-')); temporary.push(root);
    const archive = zipSync({ '../outside.txt': strToU8('unsafe'), 'module-package.json': strToU8('{}') });
    await expect(installAddOnArchive(archive, join(root, 'packages'), true, {}, { stateRoot: join(root, 'state') })).rejects.toThrow('Unsafe archive path');
  });

  it('ignores packages a creator copied into the inbox and installs only an exact staged update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-addon-inbox-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state'); const inbox = join(root, 'inbox');
    await mkdir(inbox, { recursive: true });
    const archive = declarativeArchive();
    const sha256 = createHash('sha256').update(archive).digest('hex');
    // Inbox files left behind by an older version are neither listed, installed, nor deleted.
    await writeFile(join(inbox, 'status-card.thsv-addon'), archive);
    await writeFile(join(inbox, 'damaged.thsv-addon'), 'not a package');
    // So is a trusted third-party publisher registry saved by an older version.
    const publisherRegistry = '[{"publisherId":"creator.example","repository":"example/addons","addedAt":"2026-01-01T00:00:00.000Z"}]\n';
    await mkdir(state, { recursive: true });
    await writeFile(join(state, 'trusted-publishers.json'), publisherRegistry);
    const service = new AddOnWizardService(packages, state, inbox);
    await expect(service.list()).resolves.toEqual([]);
    expect((await readdir(inbox)).sort()).toEqual(['damaged.thsv-addon', 'status-card.thsv-addon']);
    await expect(readFile(join(state, 'trusted-publishers.json'), 'utf8')).resolves.toBe(publisherRegistry);
    await expect(service.installDiscovered({ filename: 'status-card.thsv-addon', sha256, approvedByCreator: false })).rejects.toThrow('explicit creator approval');
    await expect(service.installDiscovered({ filename: '../status-card.thsv-addon', sha256, approvedByCreator: true })).rejects.toThrow('filename is invalid');
    await expect(service.installDiscovered({ filename: 'damaged.thsv-addon', sha256, approvedByCreator: true })).rejects.toThrow('changed after review');
    await expect(service.installDiscovered({ filename: 'status-card.thsv-addon', sha256, approvedByCreator: true })).resolves.toMatchObject({ installed: true, source: 'inbox', moduleId: 'sample.status-card' });
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ moduleId: 'sample.status-card' })]);
    await expect(readFile(join(state, 'trusted-publishers.json'), 'utf8')).resolves.toBe(publisherRegistry);
  });

  it('revalidates a provenance-verified official package before staging it in the inbox', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-addon-official-stage-')); temporary.push(root);
    const packages = join(root, 'packages'); const state = join(root, 'state'); const inbox = join(root, 'inbox');
    const archive = declarativeArchive();
    const sha256 = createHash('sha256').update(archive).digest('hex');
    const service = new AddOnWizardService(packages, state, inbox);
    const verified = {
      moduleId: 'sample.status-card', version: '1.0.0', filename: 'status-card.thsv-addon', archive, sha256,
      outerArchiveName: 'THSV-StreamBridge-AddOn-Sample-1.0.0.zip', outerSha256: 'a'.repeat(64),
      provenance: 'verified' as const, repository: 'surakage/THSV-StreamBridge', workflow: 'expected-workflow',
      streamerBotImports: [{ filename: 'THSV-Sample-1.0.0.sb', archive: new TextEncoder().encode('streamerbot import'), sha256: createHash('sha256').update('streamerbot import').digest('hex') }],
    };
    await expect(service.stageVerifiedOfficialUpdate(verified)).resolves.toMatchObject({ staged: true, moduleId: 'sample.status-card', installRequiresCreatorReview: true, streamerBotImportRequired: true, streamerBotImports: ['THSV-Sample-1.0.0.sb'], restartRequired: false });
    await expect(readFile(join(inbox, 'streamerbot', 'sample.status-card', '1.0.0', 'THSV-Sample-1.0.0.sb'), 'utf8')).resolves.toBe('streamerbot import');
    await expect(readFile(join(inbox, 'status-card.thsv-addon'))).resolves.toEqual(Buffer.from(archive));
    await expect(service.stageVerifiedOfficialUpdate({ ...verified, version: '2.0.0' })).rejects.toThrow('identity does not match');
  });

});
