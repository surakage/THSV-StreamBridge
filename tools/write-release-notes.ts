import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { releaseNotesFromChangelog } from './release-notes.js';

// Writes docs/releases/<version>.md from that version's CHANGELOG section. The release workflow
// uses the file as the text of the published release, so people see what changed.
const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
const version = process.argv[2] ?? packageJson.version;
const notes = releaseNotesFromChangelog(await readFile(join(root, 'CHANGELOG.md'), 'utf8'), version);
if (notes === undefined) throw new Error(`CHANGELOG.md has no entries under "## [${version}]". Add them first.`);
await mkdir(join(root, 'docs', 'releases'), { recursive: true });
await writeFile(join(root, 'docs', 'releases', `${version}.md`), notes, 'utf8');
process.stdout.write(`Wrote docs/releases/${version}.md\n`);
