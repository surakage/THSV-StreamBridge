import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { zipSync } from 'fflate';
import { inspectAddOnArchive, verifyAddOnPackage } from '../bridge/services/addon-package-manager.js';

const source = process.argv[2];
if (source === undefined) throw new Error('Usage: npm run addon:package -- <package-directory> [output.thsv-addon]');
const verified = await verifyAddOnPackage(source);
const output = resolve(process.argv[3] ?? join('dist', 'addons', `${verified.descriptor.manifest.moduleId}-${verified.descriptor.manifest.version}.thsv-addon`));
const entries: Record<string, Uint8Array> = {};
for (const path of ['module-package.json', ...verified.descriptor.files.map((file) => file.path)]) entries[path] = await readFile(join(verified.root, ...path.split('/')));
const archive = zipSync(entries, { level: 9 });
// Re-open the immutable bytes that will be published. This closes the gap between
// validating a mutable source directory and reading it into the release archive.
await mkdir(dirname(output), { recursive: true });
await inspectAddOnArchive(archive, dirname(output));
await writeFile(output, archive, { mode: 0o600 });
process.stdout.write(`${output}\n`);
