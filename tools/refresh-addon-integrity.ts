import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const addOns = process.argv.slice(2);
if (addOns.length === 0) throw new Error('Usage: tsx tools/refresh-addon-integrity.ts <add-on-folder> [...]');

for (const folder of addOns) {
  if (!/^[a-z][a-z0-9-]*$/u.test(folder)) throw new Error(`Invalid add-on folder: ${folder}`);
  const root = resolve('addons', folder);
  const descriptorPath = join(root, 'module-package.json');
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as { files?: Array<{ path: string; size: number; sha256: string }> };
  if (!Array.isArray(descriptor.files)) throw new Error(`${folder} has no package file list.`);
  descriptor.files = await Promise.all(descriptor.files.map(async (entry) => {
    const bytes = await readFile(join(root, ...entry.path.split('/')));
    return { path: entry.path, size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');
  process.stdout.write(`Refreshed ${folder}\n`);
}
