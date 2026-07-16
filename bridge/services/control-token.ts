import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export async function resolveControlToken(environmentName: string, filePath: string): Promise<string> {
  const fromEnvironment = process.env[environmentName]?.trim();
  if (fromEnvironment !== undefined && fromEnvironment.length >= 32) return fromEnvironment;

  const target = resolve(filePath);
  const existing = await readFile(target, 'utf8').then((value) => value.trim()).catch(() => '');
  if (existing.length >= 32) return existing;

  const token = randomBytes(32).toString('base64url');
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true });
  await writeFile(target, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }).catch(async (error: unknown) => {
    const raced = await readFile(target, 'utf8').then((value) => value.trim()).catch(() => '');
    if (raced.length < 32) throw error;
  });
  return readFile(target, 'utf8').then((value) => value.trim()).catch(() => token);
}
