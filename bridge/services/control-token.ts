import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const MINIMUM_TOKEN_LENGTH = 32;

export async function resolveControlToken(environmentName: string, filePath: string): Promise<string> {
  const fromEnvironment = process.env[environmentName]?.trim();
  if (fromEnvironment !== undefined && fromEnvironment.length >= MINIMUM_TOKEN_LENGTH) return fromEnvironment;

  const target = resolve(filePath);
  const existing = await readExistingToken(target);
  if (existing !== undefined) return existing;

  const token = randomBytes(32).toString('base64url');
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(target, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(target, 0o600);
    return token;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const raced = await readExistingToken(target);
    if (raced === undefined) throw new Error('Control-token creation raced but no valid token exists', { cause: error });
    return raced;
  }
}

async function readExistingToken(target: string): Promise<string | undefined> {
  let value: string;
  try {
    value = (await readFile(target, 'utf8')).trim();
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (value.length < MINIMUM_TOKEN_LENGTH) {
    throw new Error(`Existing control token at ${target} is invalid; refusing to replace it automatically`);
  }
  if (process.platform !== 'win32') {
    const permissions = (await stat(target)).mode & 0o777;
    if ((permissions & 0o077) !== 0) throw new Error(`Control token at ${target} is accessible to other users`);
  }
  return value;
}
