import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, target); break; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') || attempt >= 5) throw error;
        // Windows scanners and readers can briefly hold the destination open.
        // Retry the atomic replacement; never remove the last committed state.
        await pause(50 * 2 ** attempt);
      }
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
