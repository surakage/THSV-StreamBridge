import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { sourceFingerprint } from '../bridge/services/streamerbot-import-drift.js';

// Records a fingerprint of every C# action source StreamBridge has ever shipped, so Stream Doctor can tell an
// action from an older release (safe to re-import) from one the creator edited (protected). Run before a release:
//   npx tsx tools/build-streamerbot-source-history.ts

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const hashes = new Set<string>();
const seenBlobs = new Set<string>();
for (const line of git('log', '--format=%H', '--', 'packages/streamerbot').split('\n')) {
  const commit = line.trim();
  if (commit === '') continue;
  for (const entry of git('ls-tree', '-r', commit, '--', 'packages/streamerbot').split('\n')) {
    const match = /^\d+ blob ([0-9a-f]+)\t(packages\/streamerbot\/[^/]+\/src\/.+\.cs)$/u.exec(entry);
    if (match?.[1] === undefined || seenBlobs.has(match[1])) continue;
    seenBlobs.add(match[1]);
    hashes.add(sourceFingerprint(git('cat-file', 'blob', match[1])));
  }
}
const output = { schemaVersion: 1, purpose: 'Fingerprints of every released Streamer.bot action source, used to tell older imports from creator edits.', hashes: [...hashes].sort() };
await writeFile('packages/streamerbot/source-history.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(`Recorded ${String(hashes.size)} released action sources.`);
