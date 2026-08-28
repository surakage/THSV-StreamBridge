import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const RECOVERY_SUFFIX = '.previous';
const pendingWrites = new Map<string, Promise<void>>();

export type CrashSafeWriteBoundary = 'temporary-written' | 'previous-moved' | 'replacement-installed' | 'recovery-removed';
export interface CrashSafeWriteOptions { readonly onBoundary?: (boundary: CrashSafeWriteBoundary) => void | Promise<void> }

export async function readCrashSafeText(path: string): Promise<string> {
  await waitForPendingWrite(path);
  await recoverCrashSafeFile(path);
  return readFile(path, 'utf8');
}

export async function writeCrashSafeText(path: string, contents: string, options: CrashSafeWriteOptions = {}): Promise<void> {
  const key = resolve(path);
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => await writeCrashSafeTextNow(path, contents, options));
  pendingWrites.set(key, operation);
  try { await operation; }
  finally { if (pendingWrites.get(key) === operation) pendingWrites.delete(key); }
}

async function writeCrashSafeTextNow(path: string, contents: string, options: CrashSafeWriteOptions): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await recoverCrashSafeFileNow(path);
  const recoveryPath = `${path}${RECOVERY_SUFFIX}`;
  const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  let previousMoved = false;
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true });
    await options.onBoundary?.('temporary-written');
    if (await exists(path)) {
      await rm(recoveryPath, { force: true });
      await rename(path, recoveryPath);
      previousMoved = true;
      await options.onBoundary?.('previous-moved');
    }
    await rename(temporaryPath, path);
    await options.onBoundary?.('replacement-installed');
    if (previousMoved) {
      await rm(recoveryPath, { force: true });
      await options.onBoundary?.('recovery-removed');
    }
  } catch (error) {
    if (previousMoved && !await exists(path)) await rename(recoveryPath, path).catch(() => undefined);
    throw error;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function recoverCrashSafeFile(path: string): Promise<void> {
  await waitForPendingWrite(path);
  await recoverCrashSafeFileNow(path);
}

async function recoverCrashSafeFileNow(path: string): Promise<void> {
  const recoveryPath = `${path}${RECOVERY_SUFFIX}`;
  if (await exists(path)) {
    await rm(recoveryPath, { force: true });
    return;
  }
  await rename(recoveryPath, path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
}

async function waitForPendingWrite(path: string): Promise<void> {
  await pendingWrites.get(resolve(path))?.catch(() => undefined);
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
