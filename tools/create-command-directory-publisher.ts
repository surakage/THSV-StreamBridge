import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const requestedPath = process.argv[2]?.trim();
if (!requestedPath) throw new Error('Usage: tsx tools/create-command-directory-publisher.ts <private-token-file>');

const tokenFile = resolve(requestedPath);
const token = randomBytes(32).toString('base64url');
await mkdir(dirname(tokenFile), { recursive: true });
await writeFile(tokenFile, `${token}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

// The raw token is intentionally never printed. Only its server-side registration hash is shown.
process.stdout.write(`${JSON.stringify({ tokenFile, sha256: createHash('sha256').update(token, 'utf8').digest('hex') })}\n`);
