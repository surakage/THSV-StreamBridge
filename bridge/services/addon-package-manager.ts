import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile, copyFile, lstat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import { addOnPackageV2Schema, type AddOnPackageV2 } from '../contracts/v2/addon-package.js';

const DESCRIPTOR_FILE = 'module-package.json';

export class AddOnPackageError extends Error {
  public constructor(message: string) { super(message); this.name = 'AddOnPackageError'; }
}

export interface VerifiedAddOnPackage {
  readonly root: string;
  readonly descriptor: AddOnPackageV2;
}

function safeChild(root: string, relativePath: string): string {
  const candidate = resolve(root, ...relativePath.split('/'));
  const prefix = resolve(root).replace(/[\\/]+$/u, '') + sep;
  if (!candidate.startsWith(prefix)) throw new AddOnPackageError(`Package path leaves its root: ${relativePath}`);
  return candidate;
}

function parseVersion(value: string): readonly [number, number, number, readonly string[]] {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?/u.exec(value);
  if (match === null) throw new AddOnPackageError(`Version is not valid SemVer: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]?.split('.') ?? []];
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left); const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const av = a[index] as number; const bv = b[index] as number;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  const ap = a[3]; const bp = b[3];
  if (ap.length === 0 || bp.length === 0) return ap.length === bp.length ? 0 : (ap.length === 0 ? 1 : -1);
  const count = Math.max(ap.length, bp.length);
  for (let index = 0; index < count; index += 1) {
    const av = ap[index]; const bv = bp[index];
    if (av === undefined || bv === undefined) return av === bv ? 0 : (av === undefined ? -1 : 1);
    if (av === bv) continue;
    const an = /^\d+$/u.test(av); const bn = /^\d+$/u.test(bv);
    if (an && bn) return Number(av) < Number(bv) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

async function listFiles(root: string, current = root): Promise<readonly string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new AddOnPackageError(`Symbolic links are not allowed in add-on packages: ${relative(root, path)}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join('/'));
  }
  return result.sort();
}

async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export async function verifyAddOnPackage(rootPath: string, coreVersion: string = CORE_CONTRACT_VERSION, allowInstallRecord = false): Promise<VerifiedAddOnPackage> {
  const root = resolve(rootPath);
  const descriptorPath = safeChild(root, DESCRIPTOR_FILE);
  let raw: unknown;
  try { raw = JSON.parse(await readFile(descriptorPath, 'utf8')) as unknown; }
  catch (error) { throw new AddOnPackageError(`Unable to read ${DESCRIPTOR_FILE}: ${error instanceof Error ? error.message : String(error)}`); }
  const result = addOnPackageV2Schema.safeParse(raw);
  if (!result.success) throw new AddOnPackageError(`Add-on descriptor validation failed: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const descriptor = result.data;
  if (compareVersions(coreVersion, descriptor.manifest.minimumCoreVersion) < 0) throw new AddOnPackageError(`${descriptor.manifest.moduleId} requires core ${descriptor.manifest.minimumCoreVersion} or later.`);
  if (compareVersions(coreVersion, descriptor.manifest.maximumTestedCoreVersion) > 0) throw new AddOnPackageError(`${descriptor.manifest.moduleId} has only been tested through core ${descriptor.manifest.maximumTestedCoreVersion}.`);

  const expected = new Set([DESCRIPTOR_FILE, ...descriptor.files.map((file) => file.path), ...(allowInstallRecord ? ['installed-package.json'] : [])]);
  const actual = await listFiles(root);
  const unexpected = actual.filter((path) => !expected.has(path));
  const missing = [...expected].filter((path) => !actual.includes(path));
  if (unexpected.length > 0 || missing.length > 0) throw new AddOnPackageError(`Package file list mismatch. Unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}.`);
  for (const file of descriptor.files) {
    const path = safeChild(root, file.path);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== file.size) throw new AddOnPackageError(`Package file size mismatch: ${file.path}`);
    const hash = createHash('sha256').update(await readFile(path)).digest('hex');
    if (hash !== file.sha256) throw new AddOnPackageError(`Package file hash mismatch: ${file.path}`);
  }
  return { root, descriptor };
}

export async function installAddOnPackage(sourceRoot: string, addOnsRoot: string, approvedByCreator: boolean): Promise<VerifiedAddOnPackage> {
  if (!approvedByCreator) throw new AddOnPackageError('Installing an add-on requires explicit creator approval because its JavaScript executes inside StreamBridge.');
  const verified = await verifyAddOnPackage(sourceRoot);
  const root = resolve(addOnsRoot);
  await mkdir(root, { recursive: true });
  const target = safeChild(root, verified.descriptor.manifest.moduleId);
  const suffix = String(Date.now());
  const stage = safeChild(root, `.install-${verified.descriptor.manifest.moduleId}-${suffix}`);
  const rollback = safeChild(root, `.rollback-${verified.descriptor.manifest.moduleId}-${suffix}`);
  try {
    await mkdir(stage, { recursive: true });
    for (const path of [DESCRIPTOR_FILE, ...verified.descriptor.files.map((file) => file.path)]) {
      const destination = safeChild(stage, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(safeChild(verified.root, path), destination);
    }
    if (await pathExists(target)) await rename(target, rollback);
    await rename(stage, target);
    await rm(rollback, { recursive: true, force: true });
    await writeFile(safeChild(target, 'installed-package.json'), JSON.stringify({ moduleId: verified.descriptor.manifest.moduleId, version: verified.descriptor.manifest.version, installedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
    return { root: target, descriptor: verified.descriptor };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    if (await pathExists(rollback)) {
      await rm(target, { recursive: true, force: true });
      await rename(rollback, target);
    }
    throw error;
  }
}

export async function removeAddOnPackage(moduleId: string, addOnsRoot: string, approvedByCreator: boolean): Promise<void> {
  if (!approvedByCreator) throw new AddOnPackageError('Removing an add-on requires explicit creator approval. Owned state is preserved separately.');
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId)) throw new AddOnPackageError('Invalid module ID.');
  const root = resolve(addOnsRoot);
  const target = safeChild(root, moduleId);
  await rm(target, { recursive: true, force: true });
}
