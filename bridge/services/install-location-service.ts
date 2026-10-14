import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

// The Streamer.bot Bridge Launcher, Shutdown and Open Setup Wizard actions read this file
// (packages/streamerbot/bridge-launcher/src/LaunchBridge.cs, RememberedInstallFile) when their
// thsvBridgeInstallPath argument is blank or still the shipped default. Re-importing those actions
// resets the argument, so StreamBridge records where it runs from on every start and the
// installer records it on install and update.
export const INSTALL_LOCATION_PRODUCT_FOLDER = 'THSV StreamBridge';
export const INSTALL_LOCATION_FILE_NAME = 'install-location.txt';

export function installLocationFilePath(localAppData: string | undefined): string | undefined {
  const root = localAppData?.trim();
  return root === undefined || root.length === 0 ? undefined : join(root, INSTALL_LOCATION_PRODUCT_FOLDER, INSTALL_LOCATION_FILE_NAME);
}

/** True for the managed layout LaunchBridge.cs accepts: runtime\node.exe plus launcher\start.mjs. */
export function isManagedInstallRoot(folder: string): boolean {
  return existsSync(join(folder, 'runtime', 'node.exe')) && existsSync(join(folder, 'launcher', 'start.mjs'));
}

/**
 * Finds the managed install root this process runs from. The managed launcher passes it as
 * THSV_STREAMBRIDGE_INSTALL_ROOT; older launchers start the service with its working directory at
 * <install root>\app\<version>, so that layout is recognised too. Source checkouts and test runs
 * return undefined so a developer's `npm start` never redirects the creator's Streamer.bot actions.
 */
export function detectManagedInstallRoot(environment: NodeJS.ProcessEnv, workingDirectory: string): string | undefined {
  const declared = environment['THSV_STREAMBRIDGE_INSTALL_ROOT']?.trim();
  if (declared !== undefined && declared.length > 0) {
    const root = resolve(declared);
    return isManagedInstallRoot(root) ? root : undefined;
  }
  const appVersionDirectory = resolve(workingDirectory);
  const appDirectory = dirname(appVersionDirectory);
  if (basename(appDirectory).toLowerCase() !== 'app') return undefined;
  const root = dirname(appDirectory);
  return isManagedInstallRoot(root) ? root : undefined;
}

export type InstallLocationWriteResult = 'written' | 'unchanged' | 'skipped';

/** Records installRoot in %LOCALAPPDATA%\THSV StreamBridge\install-location.txt, replacing the file atomically. */
export async function rememberInstallLocation(installRoot: string, localAppData: string | undefined): Promise<InstallLocationWriteResult> {
  const path = installLocationFilePath(localAppData);
  if (path === undefined) return 'skipped';
  const value = resolve(installRoot);
  try {
    if ((await readFile(path, 'utf8')).split(/\r?\n/u)[0]?.trim() === value) return 'unchanged';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    // LaunchBridge.cs reads only the first line and trims it; no BOM, no trailing newline.
    await writeFile(temporary, value, 'utf8');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return 'written';
}
