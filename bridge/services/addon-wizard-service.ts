import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  AddOnPackageError,
  installAddOnArchive,
  listInstalledAddOnPackages,
  removeAddOnPackage,
  setAddOnApprovedActionIds,
  setAddOnPackageEnabled,
  type InstalledAddOnSummary,
} from './addon-package-manager.js';

const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const MAXIMUM_ARCHIVE_BYTES = 7_500_000;
const MAXIMUM_SETTINGS_BYTES = 65_536;

export class AddOnWizardError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); this.name = 'AddOnWizardError'; }
}

export interface WizardAddOnSummary extends InstalledAddOnSummary {
  readonly settings: Readonly<Record<string, unknown>>;
}

export class AddOnWizardService {
  public constructor(private readonly packagesRoot: string, private readonly stateRoot: string) {}

  public async list(): Promise<readonly WizardAddOnSummary[]> {
    const installed = await listInstalledAddOnPackages(this.packagesRoot);
    return Promise.all(installed.map(async (addOn) => {
      if (addOn.health === 'rejected') return { ...addOn, settings: {} };
      try { return { ...addOn, settings: await this.readSettings(addOn.moduleId, addOn.configurationSchema) }; }
      catch (error) { return { ...addOn, enabled: false, health: 'rejected' as const, error: error instanceof Error ? error.message : String(error), settings: {} }; }
    }));
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
      const installed = await installAddOnArchive(archive, this.packagesRoot, true);
      return { installed: true, moduleId: installed.descriptor.manifest.moduleId, version: installed.descriptor.manifest.version, restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async setEnabled(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
    const body = objectInput(input);
    if (typeof body['enabled'] !== 'boolean') throw new AddOnWizardError(400, 'enabled must be true or false.');
    try {
      await setAddOnPackageEnabled(moduleId, this.packagesRoot, body['enabled'], body['approvedByCreator'] === true);
      return { moduleId, enabled: body['enabled'], restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async setApprovedActions(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
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
    const body = objectInput(input);
    try {
      await removeAddOnPackage(moduleId, this.packagesRoot, body['approvedByCreator'] === true);
      return { moduleId, removed: true, statePreserved: true, restartRequired: true };
    } catch (error) { throw asWizardError(error); }
  }

  public async saveSettings(moduleId: string, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    assertModuleId(moduleId);
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

  public diagnostics(): Readonly<Record<string, unknown>> {
    return { packagesRoot: resolve(this.packagesRoot), stateRoot: resolve(this.stateRoot), archiveLimitBytes: MAXIMUM_ARCHIVE_BYTES, settingsLimitBytes: MAXIMUM_SETTINGS_BYTES };
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
}

function settingsPath(root: string, moduleId: string): string {
  const base = resolve(root);
  const path = resolve(base, moduleId, 'settings.json');
  if (!path.startsWith(base.replace(/[\\/]+$/u, '') + sep)) throw new AddOnWizardError(400, 'Invalid module ID.');
  return path;
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

function asWizardError(error: unknown): AddOnWizardError {
  if (error instanceof AddOnWizardError) return error;
  if (error instanceof AddOnPackageError) return new AddOnWizardError(400, error.message);
  return new AddOnWizardError(500, error instanceof Error ? error.message : String(error));
}

function validateSettings(schemaValue: unknown, input: Record<string, unknown>, useDefaults = false): Readonly<Record<string, unknown>> {
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
    case 'number': case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema['type'] === 'integer' && !Number.isInteger(value))) throw new AddOnWizardError(400, `${key} must be a finite ${schema['type']}.`);
      const minimum = boundedNumber(schema['minimum'], -1_000_000_000, 1_000_000_000, -1_000_000_000); const maximum = boundedNumber(schema['maximum'], minimum, 1_000_000_000, 1_000_000_000);
      if (value < minimum || value > maximum) throw new AddOnWizardError(400, `${key} must be from ${String(minimum)} through ${String(maximum)}.`);
      return value;
    }
    case 'boolean': if (typeof value !== 'boolean') throw new AddOnWizardError(400, `${key} must be true or false.`); return value;
    default: throw new AddOnWizardError(400, `${key} uses an unsupported setting type. Only string, number, integer, boolean, and scalar enums are accepted.`);
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}
