import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { MAIN_FEATURE_FAMILIES } from '../core/main-feature-registry.js';
import { VIEWER_FOUNDATION_MODULE_ID, viewerFoundationIntegrationRoot } from '../core/viewer-foundation-integration.js';
import { COMMUNITY_ANALYTICS_MODULE_ID, communityAnalyticsIntegrationRoot } from '../core/community-analytics-integration.js';
import { KOFI_DONATIONS_MODULE_ID, kofiDonationsIntegrationRoot } from '../core/kofi-donations-integration.js';
import { isBuiltInIntegrationModuleId } from '../core/built-in-integrations.js';
import {
  AddOnPackageError,
  installAddOnArchive,
  inspectAddOnArchive,
  listInstalledAddOnPackages,
  removeAddOnPackage,
  safeChild,
  setAddOnApprovedActionIds,
  setAddOnPackageEnabled,
  type InstalledAddOnSummary,
  verifyAddOnPackage,
} from './addon-package-manager.js';
import type { VerifiedAddOnUpdatePackage } from './addon-update-service.js';

const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const MAXIMUM_ARCHIVE_BYTES = 7_500_000;
const MAXIMUM_SETTINGS_BYTES = 65_536;
const MAXIMUM_ACCEPTANCE_BYTES = 131_072;
const MAXIMUM_TRUSTED_PUBLISHERS_BYTES = 32_768;
const MAXIMUM_MIGRATION_LEDGER_BYTES = 131_072;
const MAXIMUM_MIGRATION_FILES = 1_000;
const MAXIMUM_MIGRATION_BYTES = 10_000_000;
const ACCEPTANCE_STATUS = new Set(['pending', 'passed', 'failed', 'not-required']);
const PUBLISHER_ID = /^[a-z][a-z0-9.-]{1,99}$/u;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export class AddOnWizardError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); this.name = 'AddOnWizardError'; }
}

export interface WizardAddOnSummary extends InstalledAddOnSummary {
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface WizardViewerFoundationIntegration extends WizardAddOnSummary {
  readonly integration: true;
  readonly required: true;
}

export interface WizardCommunityAnalyticsIntegration extends WizardAddOnSummary {
  readonly integration: true;
  readonly required: false;
}

export interface WizardKofiDonationsIntegration extends WizardAddOnSummary {
  readonly integration: true;
  readonly required: false;
}

export interface AddOnAcceptanceEntry {
  readonly moduleId: string;
  readonly version: string;
  readonly offlineStatus: 'pending' | 'passed' | 'failed' | 'not-required';
  readonly providerStatus: 'pending' | 'passed' | 'failed' | 'not-required';
  readonly evidence: string;
  readonly updatedAt: string;
}

export interface DiscoveredAddOnSummary {
  readonly filename: string;
  readonly size: number;
  readonly sha256: string;
  readonly health: 'available' | 'rejected';
  readonly moduleId?: string;
  readonly name?: string;
  readonly version?: string;
  readonly author?: string;
  readonly description?: string;
  readonly packageKind?: 'declarative' | 'executable';
  readonly permissions?: readonly string[];
  readonly trustMetadata?: InstalledAddOnSummary['trust'];
  readonly minimumCoreVersion?: string;
  readonly maximumTestedCoreVersion?: string;
  readonly minimumBridgeVersion?: string;
  readonly maximumTestedBridgeVersion?: string;
  readonly trust: 'integrity-only';
  readonly error?: string;
}

export interface TrustedAddOnPublisher {
  readonly publisherId: string;
  readonly repository: string;
  readonly addedAt: string;
}

interface StoredFeatureMigrationCandidate {
  readonly moduleId: string;
  readonly sourceVersion: string;
  readonly discoveredAt: string;
  readonly originalEnabled: boolean;
  readonly decidedAt?: string;
  readonly dataImported?: boolean;
  readonly enabledAfterImport?: boolean;
}

interface FeatureMigrationLedger {
  readonly version: 1;
  readonly candidates: readonly StoredFeatureMigrationCandidate[];
}

export interface FeatureMigrationCandidate extends StoredFeatureMigrationCandidate {
  readonly name: string;
  readonly installed: boolean;
  readonly currentlyEnabled: boolean;
  readonly status: 'pending' | 'imported' | 'skipped';
  readonly stagedData: boolean;
  readonly stagedFiles: number;
  readonly stagedBytes: number;
  readonly activeData: boolean;
}

export class AddOnWizardService {
  public constructor(
    private readonly packagesRoot: string,
    private readonly stateRoot: string,
    private readonly inboxRoot = join(resolve(packagesRoot), 'inbox'),
    private readonly bundledExtensionsRoot = resolve('packages', 'extensions'),
  ) {}

  public async list(): Promise<readonly WizardAddOnSummary[]> {
    const installed = (await listInstalledAddOnPackages(this.packagesRoot)).filter((addOn) => !isBuiltInIntegrationModuleId(addOn.moduleId));
    return Promise.all(installed.map(async (addOn) => {
      if (addOn.health === 'rejected') return { ...addOn, settings: {} };
      try { return { ...addOn, settings: await this.readSettings(addOn.moduleId, addOn.configurationSchema) }; }
      catch (error) { return { ...addOn, enabled: false, health: 'rejected' as const, error: error instanceof Error ? error.message : String(error), settings: {} }; }
    }));
  }

  public async viewerFoundation(): Promise<WizardViewerFoundationIntegration> {
    const verified = await verifyAddOnPackage(await viewerFoundationIntegrationRoot());
    const descriptor = verified.descriptor;
    const configurationSchema = JSON.parse(await readFile(safeChild(verified.root, descriptor.manifest.configurationSchema), 'utf8')) as unknown;
    const settingsUi = descriptor.settingsUi === undefined ? undefined : JSON.parse(await readFile(safeChild(verified.root, descriptor.settingsUi), 'utf8')) as unknown;
    return Object.freeze({
      integration: true,
      required: true,
      moduleId: VIEWER_FOUNDATION_MODULE_ID,
      name: descriptor.manifest.name,
      version: descriptor.manifest.version,
      author: descriptor.author,
      description: descriptor.description,
      changelog: descriptor.changelog,
      packageKind: descriptor.packageKind,
      permissions: descriptor.permissions,
      trust: descriptor.trust,
      enabled: true,
      approvedActionIds: [],
      health: 'installed',
      configurationSchema,
      settings: await this.readSettings(VIEWER_FOUNDATION_MODULE_ID, configurationSchema),
      installationSteps: ['Viewer Foundation is installed and updated with StreamBridge.', ...descriptor.manifest.installationSteps.slice(1)],
      uninstallationSteps: ['Viewer Foundation is a required Bridge integration and cannot be uninstalled separately.'],
      healthChecks: descriptor.manifest.healthChecks,
      commandsProvided: descriptor.manifest.commandsProvided,
      browserSourcesProvided: descriptor.manifest.browserSourcesProvided,
      ...(settingsUi === undefined ? {} : { settingsUi }),
    });
  }

  public async saveViewerFoundationSettings(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const integration = await this.viewerFoundation();
    const settings = validateSettings(integration.configurationSchema, objectInput(input));
    const encoded = `${JSON.stringify(settings, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAXIMUM_SETTINGS_BYTES) throw new AddOnWizardError(413, 'Viewer Foundation settings exceed the 64 KiB safety limit.');
    const path = settingsPath(this.stateRoot, VIEWER_FOUNDATION_MODULE_ID);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
    return { moduleId: VIEWER_FOUNDATION_MODULE_ID, saved: true, restartRequired: true, settings };
  }

  public async communityAnalytics(): Promise<WizardCommunityAnalyticsIntegration> {
    const verified = await verifyAddOnPackage(await communityAnalyticsIntegrationRoot());
    const descriptor = verified.descriptor;
    const configurationSchema = JSON.parse(await readFile(safeChild(verified.root, descriptor.manifest.configurationSchema), 'utf8')) as unknown;
    const settingsUi = descriptor.settingsUi === undefined ? undefined : JSON.parse(await readFile(safeChild(verified.root, descriptor.settingsUi), 'utf8')) as unknown;
    return Object.freeze({
      integration: true,
      required: false,
      moduleId: COMMUNITY_ANALYTICS_MODULE_ID,
      name: descriptor.manifest.name,
      version: descriptor.manifest.version,
      author: descriptor.author,
      description: descriptor.description,
      changelog: descriptor.changelog,
      packageKind: descriptor.packageKind,
      permissions: descriptor.permissions,
      trust: descriptor.trust,
      enabled: true,
      approvedActionIds: [],
      health: 'installed',
      configurationSchema,
      settings: await this.readSettings(COMMUNITY_ANALYTICS_MODULE_ID, configurationSchema),
      installationSteps: ['Community Analytics is installed and updated with StreamBridge.', ...descriptor.manifest.installationSteps.slice(1)],
      uninstallationSteps: ['Community Analytics is a built-in Bridge integration and cannot be uninstalled separately.'],
      healthChecks: descriptor.manifest.healthChecks,
      commandsProvided: descriptor.manifest.commandsProvided,
      browserSourcesProvided: descriptor.manifest.browserSourcesProvided,
      ...(settingsUi === undefined ? {} : { settingsUi }),
    });
  }

  public async saveCommunityAnalyticsSettings(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const integration = await this.communityAnalytics();
    const settings = validateSettings(integration.configurationSchema, objectInput(input));
    const encoded = `${JSON.stringify(settings, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAXIMUM_SETTINGS_BYTES) throw new AddOnWizardError(413, 'Community Analytics settings exceed the 64 KiB safety limit.');
    const path = settingsPath(this.stateRoot, COMMUNITY_ANALYTICS_MODULE_ID);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
    return { moduleId: COMMUNITY_ANALYTICS_MODULE_ID, saved: true, restartRequired: true, settings };
  }

  public async kofiDonations(): Promise<WizardKofiDonationsIntegration> {
    const verified = await verifyAddOnPackage(await kofiDonationsIntegrationRoot());
    const descriptor = verified.descriptor;
    const configurationSchema = JSON.parse(await readFile(safeChild(verified.root, descriptor.manifest.configurationSchema), 'utf8')) as unknown;
    const settingsUi = descriptor.settingsUi === undefined ? undefined : JSON.parse(await readFile(safeChild(verified.root, descriptor.settingsUi), 'utf8')) as unknown;
    return Object.freeze({
      integration: true,
      required: false,
      moduleId: KOFI_DONATIONS_MODULE_ID,
      name: descriptor.manifest.name,
      version: descriptor.manifest.version,
      author: descriptor.author,
      description: descriptor.description,
      changelog: descriptor.changelog,
      packageKind: descriptor.packageKind,
      permissions: descriptor.permissions,
      trust: descriptor.trust,
      enabled: true,
      approvedActionIds: [],
      health: 'installed',
      configurationSchema,
      settings: await this.readSettings(KOFI_DONATIONS_MODULE_ID, configurationSchema),
      installationSteps: ['Ko-fi Donations is installed and updated with StreamBridge.', ...descriptor.manifest.installationSteps.slice(1)],
      uninstallationSteps: ['Ko-fi Donations is a built-in provider integration and cannot be uninstalled separately. Turn it off in Alerts when unused.'],
      healthChecks: descriptor.manifest.healthChecks,
      commandsProvided: descriptor.manifest.commandsProvided,
      browserSourcesProvided: descriptor.manifest.browserSourcesProvided,
      ...(settingsUi === undefined ? {} : { settingsUi }),
    });
  }

  public async saveKofiDonationsSettings(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const integration = await this.kofiDonations();
    const settings = validateSettings(integration.configurationSchema, objectInput(input));
    const encoded = `${JSON.stringify(settings, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAXIMUM_SETTINGS_BYTES) throw new AddOnWizardError(413, 'Ko-fi Donations settings exceed the 64 KiB safety limit.');
    const path = settingsPath(this.stateRoot, KOFI_DONATIONS_MODULE_ID);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
    return { moduleId: KOFI_DONATIONS_MODULE_ID, saved: true, restartRequired: true, settings };
  }

  public async listFeatureMigrations(): Promise<readonly FeatureMigrationCandidate[]> {
    const ledger = await this.readFeatureMigrationLedger();
    const installed = new Map((await listInstalledAddOnPackages(this.packagesRoot)).map((addOn) => [addOn.moduleId, addOn]));
    return Promise.all(ledger.candidates.map(async (candidate) => {
      const addOn = installed.get(candidate.moduleId);
      const staged = await migrationDirectorySummary(this.featureMigrationStatePath(candidate.moduleId));
      const activeData = await directoryHasEntries(join(resolve(this.stateRoot), candidate.moduleId));
      return {
        ...candidate,
        name: addOn?.name ?? candidate.moduleId,
        installed: addOn !== undefined && addOn.health !== 'rejected',
        currentlyEnabled: addOn?.enabled === true,
        status: candidate.decidedAt === undefined ? 'pending' : candidate.dataImported === true ? 'imported' : 'skipped',
        stagedData: staged.files > 0,
        stagedFiles: staged.files,
        stagedBytes: staged.bytes,
        activeData,
      };
    }));
  }

  public async applyFeatureMigration(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
    const body = objectInput(input);
    if (body['approvedByCreator'] !== true) throw new AddOnWizardError(403, 'Importing migrated component data requires explicit creator approval.');
    if (typeof body['importData'] !== 'boolean' || typeof body['enabled'] !== 'boolean') throw new AddOnWizardError(400, 'importData and enabled must be true or false.');
    const replaceExistingData = body['replaceExistingData'] === true;
    const ledger = await this.readFeatureMigrationLedger();
    const candidate = ledger.candidates.find((entry) => entry.moduleId === moduleId);
    if (candidate === undefined) throw new AddOnWizardError(404, 'Migrated component data was not found.');
    const installed = (await listInstalledAddOnPackages(this.packagesRoot)).find((addOn) => addOn.moduleId === moduleId);
    if (installed === undefined || installed.health === 'rejected') throw new AddOnWizardError(409, 'Install or repair the current component package before importing its migrated data.');

    const importWasCompleted = candidate.dataImported === true;
    if (importWasCompleted && !body['importData']) throw new AddOnWizardError(409, 'Migrated data was already imported and remains preserved. Disable the component if you do not want it to run.');
    if (body['importData'] && !importWasCompleted) await this.importFeatureMigrationState(moduleId, replaceExistingData);
    try { await setAddOnPackageEnabled(moduleId, this.packagesRoot, body['enabled'], true); }
    catch (error) { throw asWizardError(error); }
    const updated: StoredFeatureMigrationCandidate = {
      ...candidate,
      decidedAt: new Date().toISOString(),
      dataImported: importWasCompleted || body['importData'],
      enabledAfterImport: body['enabled'],
    };
    await this.writeFeatureMigrationLedger({ version: 1, candidates: ledger.candidates.map((entry) => entry.moduleId === moduleId ? updated : entry) });
    return { moduleId, imported: importWasCompleted || body['importData'], enabled: body['enabled'], dataReplaced: !importWasCompleted && body['importData'] && replaceExistingData, restartRequired: true };
  }

  public async listTrustedPublishers(): Promise<readonly TrustedAddOnPublisher[]> {
    return this.readTrustedPublishers();
  }

  public async saveTrustedPublisher(input: unknown): Promise<TrustedAddOnPublisher> {
    const body = objectInput(input);
    if (body['approvedByCreator'] !== true) throw new AddOnWizardError(403, 'Trusting a third-party publisher requires explicit creator approval.');
    const publisherId = stringInput(body['publisherId'], 'publisherId', 100).toLowerCase();
    const repository = stringInput(body['repository'], 'repository', 200);
    if (!PUBLISHER_ID.test(publisherId)) throw new AddOnWizardError(400, 'Publisher ID must be a lowercase dotted identifier.');
    if (publisherId === 'thsv.streambridge') throw new AddOnWizardError(400, 'The official THSV publisher is already managed by the built-in update source.');
    if (!GITHUB_REPOSITORY.test(repository)) throw new AddOnWizardError(400, 'GitHub repository must use owner/name format.');
    const current = await this.readTrustedPublishers();
    const conflict = current.find((entry) => entry.publisherId === publisherId || entry.repository.toLowerCase() === repository.toLowerCase());
    if (conflict !== undefined && (conflict.publisherId !== publisherId || conflict.repository.toLowerCase() !== repository.toLowerCase())) throw new AddOnWizardError(409, 'That publisher ID or repository is already bound to a different trust record.');
    const entry = { publisherId, repository, addedAt: conflict?.addedAt ?? new Date().toISOString() };
    await this.writeTrustedPublishers([...current.filter((item) => item.publisherId !== publisherId), entry]);
    return entry;
  }

  public async removeTrustedPublisher(publisherId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    if (!PUBLISHER_ID.test(publisherId)) throw new AddOnWizardError(400, 'Invalid publisher ID.');
    const body = objectInput(input);
    if (body['approvedByCreator'] !== true) throw new AddOnWizardError(403, 'Removing a trusted publisher requires explicit creator approval.');
    const current = await this.readTrustedPublishers();
    if (!current.some((entry) => entry.publisherId === publisherId)) throw new AddOnWizardError(404, 'Trusted publisher not found.');
    await this.writeTrustedPublishers(current.filter((entry) => entry.publisherId !== publisherId));
    return { publisherId, removed: true };
  }

  public async install(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const body = objectInput(input);
    const filename = stringInput(body['filename'], 'filename', 250);
    if (!filename.toLowerCase().endsWith('.thsv-addon')) throw new AddOnWizardError(400, 'Choose a .thsv-addon package.');
    const approved = body['approvedByCreator'] === true;
    if (!approved) throw new AddOnWizardError(403, 'Review the publisher, package kind, requested permissions, and compatibility, then approve the installation.');
    const archive = decodeBase64(stringInput(body['contentBase64'], 'contentBase64', Math.ceil(MAXIMUM_ARCHIVE_BYTES * 4 / 3) + 8));
    if (archive.length === 0 || archive.length > MAXIMUM_ARCHIVE_BYTES) throw new AddOnWizardError(413, `Add-on packages must be from 1 through ${String(MAXIMUM_ARCHIVE_BYTES)} bytes.`);
    try {
      const inspected = await inspectAddOnArchive(archive, this.packagesRoot);
      assertOptionalModuleId(inspected.manifest.moduleId);
      const installed = await installAddOnArchive(archive, this.packagesRoot, true, {}, { stateRoot: this.stateRoot });
      return { installed: true, moduleId: installed.descriptor.manifest.moduleId, version: installed.descriptor.manifest.version, restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async discover(): Promise<readonly DiscoveredAddOnSummary[]> {
    await mkdir(this.inboxRoot, { recursive: true, mode: 0o700 });
    const entries = (await readdir(this.inboxRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.thsv-addon')).sort((left, right) => left.name.localeCompare(right.name)).slice(0, 100);
    return Promise.all(entries.map(async (entry): Promise<DiscoveredAddOnSummary> => {
      const filename = entry.name;
      try {
        assertInboxFilename(filename);
        const path = join(this.inboxRoot, filename);
        const information = await lstat(path);
        if (!information.isFile() || information.isSymbolicLink() || information.size < 1 || information.size > MAXIMUM_ARCHIVE_BYTES) throw new AddOnWizardError(400, `Package must be a regular file from 1 through ${String(MAXIMUM_ARCHIVE_BYTES)} bytes.`);
        const archive = await readFile(path);
        const descriptor = await inspectAddOnArchive(archive, this.packagesRoot);
        assertOptionalModuleId(descriptor.manifest.moduleId);
        return { filename, size: information.size, sha256: digest(archive), health: 'available', moduleId: descriptor.manifest.moduleId, name: descriptor.manifest.name, version: descriptor.manifest.version, author: descriptor.author, description: descriptor.description, packageKind: descriptor.packageKind, permissions: descriptor.permissions, trustMetadata: descriptor.trust, minimumCoreVersion: descriptor.manifest.minimumCoreVersion, maximumTestedCoreVersion: descriptor.manifest.maximumTestedCoreVersion, ...(descriptor.manifest.minimumBridgeVersion === undefined ? {} : { minimumBridgeVersion: descriptor.manifest.minimumBridgeVersion }), ...(descriptor.manifest.maximumTestedBridgeVersion === undefined ? {} : { maximumTestedBridgeVersion: descriptor.manifest.maximumTestedBridgeVersion }), trust: 'integrity-only' };
      } catch (error) { return { filename, size: 0, sha256: '0'.repeat(64), health: 'rejected', trust: 'integrity-only', error: error instanceof Error ? error.message : String(error) }; }
    }));
  }

  public async installDiscovered(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const body = objectInput(input);
    const filename = stringInput(body['filename'], 'filename', 250);
    assertInboxFilename(filename);
    if (body['approvedByCreator'] !== true) throw new AddOnWizardError(403, 'Installing a discovered add-on requires explicit creator approval.');
    const expectedSha256 = sha256Input(body['sha256']);
    const path = join(this.inboxRoot, filename);
    const information = await lstat(path).catch((error: unknown) => { throw new AddOnWizardError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500, 'The discovered add-on package is unavailable.'); });
    if (!information.isFile() || information.isSymbolicLink() || information.size < 1 || information.size > MAXIMUM_ARCHIVE_BYTES) throw new AddOnWizardError(400, 'The discovered package is not a safe regular add-on file.');
    try {
      const archive = await readFile(path);
      if (digest(archive) !== expectedSha256) throw new AddOnWizardError(409, 'The discovered package changed after review. Inspect it again before approving installation.');
      const inspected = await inspectAddOnArchive(archive, this.packagesRoot);
      assertOptionalModuleId(inspected.manifest.moduleId);
      const installed = await installAddOnArchive(archive, this.packagesRoot, true, {}, { stateRoot: this.stateRoot });
      return { installed: true, source: 'inbox', filename, moduleId: installed.descriptor.manifest.moduleId, version: installed.descriptor.manifest.version, restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async stageVerifiedOfficialUpdate(update: VerifiedAddOnUpdatePackage): Promise<Readonly<Record<string, unknown>>> {
    assertInboxFilename(update.filename);
    if (update.archive.byteLength === 0 || update.archive.byteLength > MAXIMUM_ARCHIVE_BYTES) throw new AddOnWizardError(413, 'The verified add-on package exceeds the inbox package safety limit.');
    if (digest(update.archive) !== update.sha256) throw new AddOnWizardError(409, 'The verified add-on package changed before it reached the inbox.');
    try {
      const descriptor = await inspectAddOnArchive(update.archive, this.packagesRoot);
      if (descriptor.manifest.moduleId !== update.moduleId || descriptor.manifest.version !== update.version) throw new AddOnWizardError(409, 'The inner add-on identity does not match the official update index.');
      if (descriptor.trust.publisherId !== update.publisherId) throw new AddOnWizardError(409, 'The inner add-on publisher does not match the installed package and official update index.');
      await mkdir(this.inboxRoot, { recursive: true, mode: 0o700 });
      const destination = join(this.inboxRoot, update.filename);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      await writeFile(temporary, update.archive, { flag: 'wx', mode: 0o600 });
      try {
        await rm(destination, { force: true });
        await rename(temporary, destination);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      const streamerBotImportDirectory = join(this.inboxRoot, 'streamerbot', update.moduleId, update.version);
      if (update.streamerBotImports.length > 0) {
        await mkdir(streamerBotImportDirectory, { recursive: true, mode: 0o700 });
        for (const importPackage of update.streamerBotImports) {
          if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,220}\.sb$/u.test(importPackage.filename)) throw new AddOnWizardError(409, 'The verified Streamer.bot import filename is unsafe.');
          if (digest(importPackage.archive) !== importPackage.sha256) throw new AddOnWizardError(409, 'A verified Streamer.bot import changed before staging.');
          const destination = join(streamerBotImportDirectory, importPackage.filename);
          await writeFile(destination, importPackage.archive, { mode: 0o600 });
          await writeFile(`${destination}.sha256`, `${importPackage.sha256}  ${importPackage.filename}\n`, { encoding: 'ascii', mode: 0o600 });
        }
      }
      return {
        staged: true,
        filename: update.filename,
        moduleId: update.moduleId,
        version: update.version,
        sha256: update.sha256,
        provenance: update.provenance,
        repository: update.repository,
        workflow: update.workflow,
        installRequiresCreatorReview: true,
        streamerBotImportRequired: update.streamerBotImports.length > 0,
        streamerBotImports: update.streamerBotImports.map((entry) => entry.filename),
        ...(update.streamerBotImports.length === 0 ? {} : { streamerBotImportDirectory }),
        restartRequired: false,
      };
    } catch (error) { throw asWizardError(error); }
  }

  public async stageVerifiedPublisherUpdate(update: VerifiedAddOnUpdatePackage, publisher: TrustedAddOnPublisher): Promise<Readonly<Record<string, unknown>>> {
    if (update.publisherId !== publisher.publisherId || update.repository.toLowerCase() !== publisher.repository.toLowerCase()) throw new AddOnWizardError(409, 'The verified update does not match the selected trusted publisher.');
    return this.stageVerifiedOfficialUpdate(update);
  }

  public async setEnabled(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
    assertOptionalModuleId(moduleId);
    const body = objectInput(input);
    if (typeof body['enabled'] !== 'boolean') throw new AddOnWizardError(400, 'enabled must be true or false.');
    try {
      await setAddOnPackageEnabled(moduleId, this.packagesRoot, body['enabled'], body['approvedByCreator'] === true);
      return { moduleId, enabled: body['enabled'], restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async setFeatureFamilyEnabled(featureId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const family = MAIN_FEATURE_FAMILIES.find((candidate) => candidate.id === featureId);
    if (family === undefined) throw new AddOnWizardError(404, 'The selected extension group was not found. Refresh the wizard and try again.');
    const body = objectInput(input);
    if (typeof body['enabled'] !== 'boolean') throw new AddOnWizardError(400, 'enabled must be true or false.');
    if (body['approvedByCreator'] !== true) throw new AddOnWizardError(403, 'Changing an extension group requires explicit creator approval.');
    const enabled = body['enabled'];
    const before = new Map((await listInstalledAddOnPackages(this.packagesRoot)).map((addOn) => [addOn.moduleId, addOn]));
    const archives = new Map<string, Uint8Array>();
    const managedModuleIds = new Set(family.modules);
    if (enabled) {
      const inspectBundled = async (moduleId: string): Promise<void> => {
        if (isBuiltInIntegrationModuleId(moduleId)) { managedModuleIds.delete(moduleId); return; }
        if (archives.has(moduleId)) return;
        try {
          const archive = await readFile(join(this.bundledExtensionsRoot, `${moduleId}.thsv-addon`));
          if (archive.byteLength === 0 || archive.byteLength > MAXIMUM_ARCHIVE_BYTES) throw new AddOnWizardError(409, `${family.name} has an invalid bundled component. Repair or update StreamBridge.`);
          const inspected = await inspectAddOnArchive(archive, this.packagesRoot);
          if (inspected.manifest.moduleId !== moduleId) throw new AddOnWizardError(409, `${family.name} has a mismatched bundled component. Repair or update StreamBridge.`);
          archives.set(moduleId, archive);
          for (const dependency of inspected.manifest.dependencies) {
            managedModuleIds.add(dependency);
            await inspectBundled(dependency);
          }
        } catch (error) {
          if (before.has(moduleId)) return;
          if (error instanceof AddOnWizardError) throw error;
          throw new AddOnWizardError(409, `${family.name} cannot be enabled because ${friendlyModuleId(moduleId)} is not bundled with this installation. Repair or update StreamBridge.`);
        }
      };
      for (const moduleId of family.modules) await inspectBundled(moduleId);
    }
    const newlyInstalled: string[] = [];
    const changed: Array<{ readonly moduleId: string; readonly enabled: boolean }> = [];
    try {
      for (const moduleId of enabled ? managedModuleIds : family.modules) {
        const existing = before.get(moduleId);
        if (enabled && existing === undefined) {
          const archive = archives.get(moduleId);
          if (archive === undefined) throw new AddOnWizardError(409, `${family.name} is missing ${friendlyModuleId(moduleId)}. Repair or update StreamBridge.`);
          await installAddOnArchive(archive, this.packagesRoot, true, {}, { stateRoot: this.stateRoot });
          newlyInstalled.push(moduleId);
        } else if (existing !== undefined && existing.enabled !== enabled) {
          changed.push({ moduleId, enabled: existing.enabled });
        }
        if (enabled || existing !== undefined) await setAddOnPackageEnabled(moduleId, this.packagesRoot, enabled, true);
      }
    } catch (error) {
      for (const previous of changed.reverse()) await setAddOnPackageEnabled(previous.moduleId, this.packagesRoot, previous.enabled, true).catch(() => undefined);
      for (const moduleId of newlyInstalled.reverse()) await removeAddOnPackage(moduleId, this.packagesRoot, true).catch(() => undefined);
      throw asWizardError(error);
    }
    return {
      featureId: family.id,
      name: family.name,
      enabled,
      modules: family.modules,
      dependencies: [...managedModuleIds].filter((moduleId) => !family.modules.includes(moduleId)),
      installed: newlyInstalled,
      restartRequired: true,
    };
  }

  public async setApprovedActions(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
    assertOptionalModuleId(moduleId);
    const body = objectInput(input);
    const rawIds = body['actionIds'];
    if (!Array.isArray(rawIds) || !rawIds.every((value) => typeof value === 'string')) throw new AddOnWizardError(400, 'actionIds must be an array of Streamer.bot action IDs.');
    if (body['approvedByCreator'] !== true) throw new AddOnWizardError(403, 'Changing an add-on action grant requires explicit creator approval.');
    try {
      await setAddOnApprovedActionIds(moduleId, this.packagesRoot, rawIds, true);
      return { moduleId, approvedActionIds: rawIds, restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async remove(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
    assertOptionalModuleId(moduleId);
    const body = objectInput(input);
    try {
      await removeAddOnPackage(moduleId, this.packagesRoot, body['approvedByCreator'] === true);
      return { moduleId, removed: true, statePreserved: true, restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async saveSettings(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
    assertOptionalModuleId(moduleId);
    const addOn = (await listInstalledAddOnPackages(this.packagesRoot)).find((candidate) => candidate.moduleId === moduleId);
    if (addOn === undefined) throw new AddOnWizardError(404, 'The add-on is not installed.');
    if (addOn.health === 'rejected') throw new AddOnWizardError(409, 'Rejected add-ons cannot save settings. Repair or uninstall the package first.');
    const settings = validateSettings(addOn.configurationSchema, objectInput(input));
    const encoded = `${JSON.stringify(settings, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAXIMUM_SETTINGS_BYTES) throw new AddOnWizardError(413, 'Add-on settings exceed the 64 KiB limit.');
    const path = settingsPath(this.stateRoot, moduleId);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
    return { moduleId, saved: true, restartRequired: true, settings };
  }

  public async previewSettings(moduleId: string, input: unknown): Promise<WizardAddOnSummary> {
    assertModuleId(moduleId);
    assertOptionalModuleId(moduleId);
    const addOn = (await listInstalledAddOnPackages(this.packagesRoot)).find((candidate) => candidate.moduleId === moduleId);
    if (addOn === undefined) throw new AddOnWizardError(404, 'The add-on is not installed.');
    if (addOn.health === 'rejected') throw new AddOnWizardError(409, 'Rejected add-ons cannot preview settings. Repair or uninstall the package first.');
    const settings = validateSettings(addOn.configurationSchema, objectInput(input));
    return Object.freeze({ ...addOn, settings });
  }

  public async listAcceptance(): Promise<Readonly<Record<string, AddOnAcceptanceEntry>>> {
    const installed = new Map((await listInstalledAddOnPackages(this.packagesRoot)).map((addOn) => [addOn.moduleId, addOn.version]));
    const saved = await this.readAcceptanceFile();
    return Object.freeze(Object.fromEntries([...installed.entries()].map(([moduleId, version]) => {
      const entry = saved[moduleId];
      const current: AddOnAcceptanceEntry = entry === undefined
        ? { moduleId, version, offlineStatus: 'pending', providerStatus: 'pending', evidence: '', updatedAt: '' }
        : { ...entry, moduleId, version };
      return [moduleId, current];
    })));
  }

  public async saveAcceptance(moduleId: string, input: unknown): Promise<AddOnAcceptanceEntry> {
    assertModuleId(moduleId);
    const installed = (await listInstalledAddOnPackages(this.packagesRoot)).find((candidate) => candidate.moduleId === moduleId);
    if (installed === undefined) throw new AddOnWizardError(404, 'The add-on is not installed.');
    const body = objectInput(input);
    if (body['approvedByCreator'] !== true) throw new AddOnWizardError(403, 'Saving acceptance evidence requires explicit creator approval.');
    const offlineStatus = acceptanceStatus(body['offlineStatus'], 'offlineStatus');
    const providerStatus = acceptanceStatus(body['providerStatus'], 'providerStatus');
    const evidence = typeof body['evidence'] === 'string' ? cleanAcceptanceEvidence(body['evidence']) : '';
    if (evidence.length > 500) throw new AddOnWizardError(400, 'Acceptance evidence must be no longer than 500 characters.');
    if ((offlineStatus === 'passed' || providerStatus === 'passed') && evidence.length < 8) throw new AddOnWizardError(400, 'A passed acceptance status requires a short evidence note.');
    if (/https?:\/\/|(?:bearer|token|password)\s*[:=]|gh[opsu]_[A-Za-z0-9_]+/iu.test(evidence)) throw new AddOnWizardError(400, 'Do not store URLs, tokens, passwords, or webhook secrets in acceptance evidence.');
    const entry: AddOnAcceptanceEntry = { moduleId, version: installed.version, offlineStatus, providerStatus, evidence, updatedAt: new Date().toISOString() };
    const saved = await this.readAcceptanceFile();
    saved[moduleId] = entry;
    const encoded = `${JSON.stringify(saved, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAXIMUM_ACCEPTANCE_BYTES) throw new AddOnWizardError(413, 'The add-on acceptance ledger exceeds its private storage limit.');
    const path = acceptancePath(this.stateRoot);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
    return entry;
  }

  private trustedPublishersPath(): string { return join(this.stateRoot, 'trusted-publishers.json'); }

  private featureMigrationRoot(): string { return join(dirname(resolve(this.packagesRoot)), 'migration-inbox'); }
  private featureMigrationLedgerPath(): string { return join(this.featureMigrationRoot(), 'feature-migrations.json'); }
  private featureMigrationStatePath(moduleId: string): string { return join(this.featureMigrationRoot(), moduleId, 'state'); }

  private async readFeatureMigrationLedger(): Promise<FeatureMigrationLedger> {
    try {
      const raw = await readFile(this.featureMigrationLedgerPath(), 'utf8');
      if (Buffer.byteLength(raw) > MAXIMUM_MIGRATION_LEDGER_BYTES) throw new AddOnWizardError(409, 'The feature migration catalogue exceeds its private storage limit.');
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new AddOnWizardError(409, 'The feature migration catalogue is invalid.');
      const record = parsed as Record<string, unknown>;
      if (record['version'] !== 1 || !Array.isArray(record['candidates']) || record['candidates'].length > 100) throw new AddOnWizardError(409, 'The feature migration catalogue is invalid.');
      const candidates = record['candidates'].map((value): StoredFeatureMigrationCandidate => {
        const item = objectInput(value);
        const moduleId = stringInput(item['moduleId'], 'moduleId', 150); assertModuleId(moduleId);
        const sourceVersion = stringInput(item['sourceVersion'], 'sourceVersion', 100);
        const discoveredAt = stringInput(item['discoveredAt'], 'discoveredAt', 100);
        if (typeof item['originalEnabled'] !== 'boolean') throw new AddOnWizardError(409, 'The feature migration catalogue is invalid.');
        const decidedAt = typeof item['decidedAt'] === 'string' ? item['decidedAt'] : undefined;
        const dataImported = typeof item['dataImported'] === 'boolean' ? item['dataImported'] : undefined;
        const enabledAfterImport = typeof item['enabledAfterImport'] === 'boolean' ? item['enabledAfterImport'] : undefined;
        return { moduleId, sourceVersion, discoveredAt, originalEnabled: item['originalEnabled'], ...(decidedAt === undefined ? {} : { decidedAt }), ...(dataImported === undefined ? {} : { dataImported }), ...(enabledAfterImport === undefined ? {} : { enabledAfterImport }) };
      });
      if (new Set(candidates.map((entry) => entry.moduleId)).size !== candidates.length) throw new AddOnWizardError(409, 'The feature migration catalogue contains duplicate components.');
      return { version: 1, candidates };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, candidates: [] };
      if (error instanceof AddOnWizardError) throw error;
      throw new AddOnWizardError(409, 'The feature migration catalogue could not be read.');
    }
  }

  private async writeFeatureMigrationLedger(ledger: FeatureMigrationLedger): Promise<void> {
    const encoded = `${JSON.stringify(ledger, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAXIMUM_MIGRATION_LEDGER_BYTES) throw new AddOnWizardError(413, 'The feature migration catalogue exceeds its private storage limit.');
    const path = this.featureMigrationLedgerPath();
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  }

  private async importFeatureMigrationState(moduleId: string, replaceExistingData: boolean): Promise<void> {
    const source = this.featureMigrationStatePath(moduleId);
    const summary = await migrationDirectorySummary(source);
    if (summary.files === 0) throw new AddOnWizardError(409, 'This migrated component has no saved data to import.');
    const root = resolve(this.stateRoot);
    const target = join(root, moduleId);
    const targetHasData = await directoryHasEntries(target);
    if (targetHasData && !replaceExistingData) throw new AddOnWizardError(409, 'Current component data already exists. Select Replace current data only after reviewing this migration.');
    const suffix = randomUUID();
    const stage = join(root, `.migration-${moduleId}-${suffix}`);
    const rollback = join(root, `.migration-rollback-${moduleId}-${suffix}`);
    let movedCurrent = false;
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await cp(source, stage, { recursive: true, errorOnExist: true, force: false });
      await migrationDirectorySummary(stage);
      if (targetHasData) { await rename(target, rollback); movedCurrent = true; }
      await rename(stage, target);
      if (movedCurrent) await rm(rollback, { recursive: true, force: true });
    } catch (error) {
      await rm(stage, { recursive: true, force: true }).catch(() => undefined);
      if (movedCurrent) {
        await rm(target, { recursive: true, force: true }).catch(() => undefined);
        await rename(rollback, target).catch(() => undefined);
      }
      if (error instanceof AddOnWizardError) throw error;
      throw new AddOnWizardError(500, 'Migrated component data could not be imported; current data was preserved.');
    }
  }

  private async readTrustedPublishers(): Promise<readonly TrustedAddOnPublisher[]> {
    try {
      const raw = await readFile(this.trustedPublishersPath(), 'utf8');
      if (Buffer.byteLength(raw) > MAXIMUM_TRUSTED_PUBLISHERS_BYTES) throw new AddOnWizardError(409, 'Trusted publisher registry exceeds its safety limit.');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length > 50) throw new AddOnWizardError(409, 'Trusted publisher registry is invalid.');
      const seenPublishers = new Set<string>(); const seenRepositories = new Set<string>();
      return parsed.map((value) => {
        const item = objectInput(value); const publisherId = stringInput(item['publisherId'], 'publisherId', 100).toLowerCase(); const repository = stringInput(item['repository'], 'repository', 200); const addedAt = stringInput(item['addedAt'], 'addedAt', 50);
        const normalizedRepository = repository.toLowerCase();
        if (!PUBLISHER_ID.test(publisherId) || !GITHUB_REPOSITORY.test(repository) || seenPublishers.has(publisherId) || seenRepositories.has(normalizedRepository)) throw new AddOnWizardError(409, 'Trusted publisher registry is invalid.');
        seenPublishers.add(publisherId); seenRepositories.add(normalizedRepository);
        return { publisherId, repository, addedAt };
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      if (error instanceof AddOnWizardError) throw error;
      throw new AddOnWizardError(409, 'Trusted publisher registry could not be read safely.');
    }
  }

  private async writeTrustedPublishers(entries: readonly TrustedAddOnPublisher[]): Promise<void> {
    const encoded = `${JSON.stringify([...entries].sort((a, b) => a.publisherId.localeCompare(b.publisherId)), null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAXIMUM_TRUSTED_PUBLISHERS_BYTES) throw new AddOnWizardError(413, 'Trusted publisher registry exceeds its safety limit.');
    const path = this.trustedPublishersPath(); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path);
  }

  public diagnostics(): Readonly<Record<string, unknown>> {
    return { packagesRoot: resolve(this.packagesRoot), stateRoot: resolve(this.stateRoot), inboxRoot: resolve(this.inboxRoot), archiveLimitBytes: MAXIMUM_ARCHIVE_BYTES, settingsLimitBytes: MAXIMUM_SETTINGS_BYTES, acceptanceLimitBytes: MAXIMUM_ACCEPTANCE_BYTES };
  }

  private async readSettings(moduleId: string, schema: unknown): Promise<Readonly<Record<string, unknown>>> {
    const defaults = validateSettings(schema, {}, true);
    try {
      const raw = JSON.parse(await readFile(settingsPath(this.stateRoot, moduleId), 'utf8')) as unknown;
      return validateSettings(schema, objectInput(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaults;
      if (error instanceof SyntaxError) throw new AddOnWizardError(500, `Saved settings for ${moduleId} are not valid JSON.`);
      throw error;
    }
  }

  private async readAcceptanceFile(): Promise<Record<string, AddOnAcceptanceEntry>> {
    try {
      const parsed = JSON.parse(await readFile(acceptancePath(this.stateRoot), 'utf8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Acceptance ledger must be a JSON object.');
      const result: Record<string, AddOnAcceptanceEntry> = {};
      for (const [moduleId, value] of Object.entries(parsed).slice(0, 100)) {
        if (!MODULE_ID.test(moduleId) || typeof value !== 'object' || value === null || Array.isArray(value)) continue;
        const item = value as Record<string, unknown>;
        if (!ACCEPTANCE_STATUS.has(String(item['offlineStatus'])) || !ACCEPTANCE_STATUS.has(String(item['providerStatus']))) continue;
        result[moduleId] = { moduleId, version: typeof item['version'] === 'string' ? item['version'].slice(0, 64) : '', offlineStatus: item['offlineStatus'] as AddOnAcceptanceEntry['offlineStatus'], providerStatus: item['providerStatus'] as AddOnAcceptanceEntry['providerStatus'], evidence: typeof item['evidence'] === 'string' ? item['evidence'].slice(0, 500) : '', updatedAt: typeof item['updatedAt'] === 'string' ? item['updatedAt'].slice(0, 64) : '' };
      }
      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new AddOnWizardError(500, `Saved add-on acceptance ledger is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function assertInboxFilename(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,249}\.thsv-addon$/iu.test(value)) throw new AddOnWizardError(400, 'Discovered add-on filename is invalid.');
}

function assertOptionalModuleId(moduleId: string): void {
  if (moduleId === VIEWER_FOUNDATION_MODULE_ID) throw new AddOnWizardError(409, 'Viewer Foundation is installed and updated with StreamBridge. Manage it from its dedicated Wizard page.');
  if (moduleId === COMMUNITY_ANALYTICS_MODULE_ID) throw new AddOnWizardError(409, 'Community Analytics is installed and updated with StreamBridge. Manage it from its dedicated Wizard page.');
  if (moduleId === KOFI_DONATIONS_MODULE_ID) throw new AddOnWizardError(409, 'Ko-fi Donations is installed and updated with StreamBridge. Manage it from Alerts > Donation provider setup.');
}

function settingsPath(root: string, moduleId: string): string {
  const base = resolve(root);
  const path = resolve(base, moduleId, 'settings.json');
  if (!path.startsWith(base.replace(/[\\/]+$/u, '') + sep)) throw new AddOnWizardError(400, 'Invalid module ID.');
  return path;
}

function acceptancePath(root: string): string { return resolve(root, '.acceptance-ledger.json'); }

function acceptanceStatus(value: unknown, field: string): AddOnAcceptanceEntry['offlineStatus'] {
  if (typeof value !== 'string' || !ACCEPTANCE_STATUS.has(value)) throw new AddOnWizardError(400, `${field} is invalid.`);
  return value as AddOnAcceptanceEntry['offlineStatus'];
}

function cleanAcceptanceEvidence(value: string): string {
  return Array.from(value).map((character) => { const point = character.codePointAt(0) ?? 0; return point <= 31 || point === 127 ? ' ' : character; }).join('').replace(/\s+/gu, ' ').trim();
}

function assertModuleId(value: string): void {
  if (!MODULE_ID.test(value)) throw new AddOnWizardError(400, 'Invalid module ID.');
}

function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new AddOnWizardError(400, 'Request body must be a JSON object.');
  return value as Record<string, unknown>;
}

function stringInput(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) throw new AddOnWizardError(400, `${field} must be a non-empty string no longer than ${String(maximum)} characters.`);
  return value;
}

function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new AddOnWizardError(400, 'contentBase64 is not canonical base64.');
  return Buffer.from(value, 'base64');
}

function sha256Input(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new AddOnWizardError(400, 'sha256 is required and must match the inspected package.');
  return value;
}

function digest(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }

function asWizardError(error: unknown): AddOnWizardError {
  if (error instanceof AddOnWizardError) return error;
  if (error instanceof AddOnPackageError) return new AddOnWizardError(400, error.message);
  return new AddOnWizardError(500, error instanceof Error ? error.message : String(error));
}

async function directoryHasEntries(path: string): Promise<boolean> {
  try { return (await readdir(path)).length > 0; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function migrationDirectorySummary(root: string): Promise<{ readonly files: number; readonly bytes: number }> {
  const pending = [root];
  let files = 0;
  let bytes = 0;
  while (pending.length > 0) {
    const current = pending.pop() as string;
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && current === root) return { files: 0, bytes: 0 };
      throw new AddOnWizardError(409, 'Migrated component data could not be inspected safely.');
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      const information = await lstat(path);
      if (information.isSymbolicLink() || (!information.isDirectory() && !information.isFile())) throw new AddOnWizardError(409, 'Migrated component data contains an unsupported file type.');
      if (information.isDirectory()) pending.push(path);
      else { files += 1; bytes += information.size; }
      if (files > MAXIMUM_MIGRATION_FILES || bytes > MAXIMUM_MIGRATION_BYTES) throw new AddOnWizardError(413, 'Migrated component data exceeds the 1,000 file or 10 MB safety limit.');
    }
  }
  return { files, bytes };
}

export function validateSettings(schemaValue: unknown, input: Record<string, unknown>, useDefaults = false): Readonly<Record<string, unknown>> {
  const schema = objectInput(schemaValue);
  if (schema['type'] !== 'object') throw new AddOnWizardError(400, 'Add-on configuration schemas must have type object.');
  const properties = objectInput(schema['properties'] ?? {});
  if (Object.keys(properties).length > 100) throw new AddOnWizardError(400, 'Add-on configuration schemas may define at most 100 settings.');
  const requiredRaw = schema['required'] ?? [];
  if (!Array.isArray(requiredRaw) || !requiredRaw.every((entry) => typeof entry === 'string' && Object.hasOwn(properties, entry))) throw new AddOnWizardError(400, 'The add-on configuration required list is invalid.');
  const required = new Set(requiredRaw as string[]);
  for (const key of Object.keys(input)) if (!Object.hasOwn(properties, key)) throw new AddOnWizardError(400, `Unknown add-on setting: ${key}`);
  const result: Record<string, unknown> = {};
  for (const [key, rawProperty] of Object.entries(properties)) {
    const property = objectInput(rawProperty);
    let value = input[key];
    if (value === undefined && Object.hasOwn(property, 'default')) value = property['default'];
    if (value === undefined) {
      if (required.has(key) && !useDefaults) throw new AddOnWizardError(400, `${key} is required.`);
      continue;
    }
    result[key] = validateSettingValue(key, property, value);
  }
  const distinctFields = schema['x-distinctFields'];
  if (distinctFields !== undefined) {
    if (!Array.isArray(distinctFields) || distinctFields.length < 2 || distinctFields.length > 20 || !distinctFields.every((entry) => typeof entry === 'string' && Object.hasOwn(properties, entry))) throw new AddOnWizardError(400, 'The add-on configuration distinct-field list is invalid.');
    const fields = distinctFields as string[];
    const normalized = fields.map((key) => typeof result[key] === 'string' ? result[key].trim().toLowerCase() : result[key]);
    if (new Set(normalized).size !== normalized.length) throw new AddOnWizardError(400, `${fields.join(', ')} must use different values.`);
  }
  return Object.freeze(result);
}

function validateSettingValue(key: string, schema: Record<string, unknown>, value: unknown): unknown {
  const enumValues = schema['enum'];
  if (enumValues !== undefined) {
    if (!Array.isArray(enumValues) || enumValues.length === 0 || enumValues.length > 100 || !enumValues.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))) throw new AddOnWizardError(400, `${key} has an invalid enum schema.`);
    if (!enumValues.some((entry) => entry === value)) throw new AddOnWizardError(400, `${key} is not one of the allowed values.`);
  }
  switch (schema['type']) {
    case 'string': {
      if (typeof value !== 'string') throw new AddOnWizardError(400, `${key} must be text.`);
      const minimum = boundedInteger(schema['minLength'], 0, 10_000, 0); const maximum = boundedInteger(schema['maxLength'], minimum, 10_000, 500);
      if (value.length < minimum || value.length > maximum) throw new AddOnWizardError(400, `${key} must contain from ${String(minimum)} through ${String(maximum)} characters.`);
      return value;
    }
    case 'array': {
      if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) throw new AddOnWizardError(400, `${key} must be a list of text values.`);
      const minimumItems = boundedInteger(schema['minItems'], 0, 100, 0); const maximumItems = boundedInteger(schema['maxItems'], minimumItems, 100, 25);
      if (value.length < minimumItems || value.length > maximumItems) throw new AddOnWizardError(400, `${key} must contain from ${String(minimumItems)} through ${String(maximumItems)} items.`);
      const itemSchema = objectInput(schema['items'] ?? { type: 'string' });
      if (itemSchema['type'] !== 'string') throw new AddOnWizardError(400, `${key} supports only text list items.`);
      const itemEnum = itemSchema['enum'];
      if (itemEnum !== undefined && (!Array.isArray(itemEnum) || itemEnum.length === 0 || itemEnum.length > 100 || !itemEnum.every((entry) => typeof entry === 'string'))) throw new AddOnWizardError(400, `${key} has an invalid item enum schema.`);
      const minimumLength = boundedInteger(itemSchema['minLength'], 0, 2_000, 0); const maximumLength = boundedInteger(itemSchema['maxLength'], minimumLength, 2_000, 200);
      const normalized = value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      if (normalized.length !== value.length || normalized.some((entry) => entry.length < minimumLength || entry.length > maximumLength)) throw new AddOnWizardError(400, `${key} contains an empty or incorrectly sized item.`);
      if (itemEnum !== undefined && normalized.some((entry) => !itemEnum.includes(entry))) throw new AddOnWizardError(400, `${key} contains an unsupported choice.`);
      if (new Set(normalized).size !== normalized.length) throw new AddOnWizardError(400, `${key} must not contain duplicate items.`);
      return normalized;
    }
    case 'number': case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema['type'] === 'integer' && !Number.isInteger(value))) throw new AddOnWizardError(400, `${key} must be a finite ${schema['type']}.`);
      const minimum = boundedNumber(schema['minimum'], -1_000_000_000, 1_000_000_000, -1_000_000_000); const maximum = boundedNumber(schema['maximum'], minimum, 1_000_000_000, 1_000_000_000);
      if (value < minimum || value > maximum) throw new AddOnWizardError(400, `${key} must be from ${String(minimum)} through ${String(maximum)}.`);
      return value;
    }
    case 'boolean': if (typeof value !== 'boolean') throw new AddOnWizardError(400, `${key} must be true or false.`); return value;
    default: throw new AddOnWizardError(400, `${key} uses an unsupported setting type. Only string, text lists, number, integer, boolean, and scalar enums are accepted.`);
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function friendlyModuleId(moduleId: string): string {
  return moduleId.replace(/^thsv\./u, '').split(/[.-]/u).filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
