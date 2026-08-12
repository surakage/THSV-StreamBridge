import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const sourcePath = argument('--source');
const targetPath = argument('--target');
const backupRoot = argument('--backup-root');
const write = process.argv.includes('--write');
if (!sourcePath || !targetPath || (write && !backupRoot)) {
  throw new Error('Usage: node tools/import-streamerbot-quotes.mjs --source <old-quotes.dat> --target <current-quotes.dat> [--backup-root <directory> --write]');
}

const [sourceText, targetText] = await Promise.all([fs.readFile(sourcePath, 'utf8'), fs.readFile(targetPath, 'utf8')]);
const source = JSON.parse(stripBom(sourceText));
const target = JSON.parse(stripBom(targetText));
validateStore(source, 'Exported');
validateStore(target, 'Current');

const merged = structuredClone(target);
const usedIds = new Set(merged.quotes.map((quote) => quote.id));
const fingerprints = new Set(merged.quotes.map(fingerprint));
let nextId = Math.max(0, ...usedIds, ...source.quotes.map((quote) => quote.id)) + 1;
const imported = [];
const duplicates = [];
const remapped = [];

for (const original of source.quotes) {
  const quote = normalizeQuote(original);
  const key = fingerprint(quote);
  if (fingerprints.has(key)) {
    duplicates.push({ sourceId: quote.id, user: quote.user, text: quote.quote });
    continue;
  }
  const sourceId = quote.id;
  if (usedIds.has(quote.id)) {
    while (usedIds.has(nextId)) nextId += 1;
    quote.id = nextId;
    nextId += 1;
    remapped.push({ sourceId, importedId: quote.id });
  }
  usedIds.add(quote.id);
  fingerprints.add(key);
  merged.quotes.push(quote);
  imported.push({ sourceId, importedId: quote.id, platform: quote.platform, user: quote.user });
}

merged.quotes.sort((left, right) => left.id - right.id);
merged.version = Math.max(3, Number(merged.version) || 0);
merged.t = new Date().toISOString();
validateStore(merged, 'Merged');
assert.equal(new Set(merged.quotes.map((quote) => quote.id)).size, merged.quotes.length, 'Merged quote IDs are not unique');

let backupDirectory;
if (write) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  backupDirectory = path.join(backupRoot, `quote-import-${stamp}`);
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.copyFile(targetPath, path.join(backupDirectory, 'quotes.dat'));
  try { await fs.copyFile(`${targetPath}.bak`, path.join(backupDirectory, 'quotes.dat.bak')); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await fs.copyFile(sourcePath, path.join(backupDirectory, 'source-quotes.dat'));
  const temporaryPath = `${targetPath}.thsv-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(merged), { encoding: 'utf8', flag: 'wx' });
  validateStore(JSON.parse(await fs.readFile(temporaryPath, 'utf8')), 'Temporary merged');
  await fs.rename(temporaryPath, targetPath);
}

process.stdout.write(`${JSON.stringify({ mode: write ? 'write' : 'dry-run', sourceCount: source.quotes.length, previousCount: target.quotes.length, importedCount: imported.length, duplicateCount: duplicates.length, finalCount: merged.quotes.length, remapped, duplicates, backupDirectory }, null, 2)}\n`);

function stripBom(value) { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }

function validateStore(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} quote store is not an object`);
  assert.ok(Array.isArray(value.quotes), `${label} quote store has no quotes array`);
  for (const quote of value.quotes) normalizeQuote(quote);
}

function normalizeQuote(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Quote is not an object');
  const id = Number(value.id);
  assert.ok(Number.isSafeInteger(id) && id > 0, 'Quote ID is invalid');
  const platform = String(value.platform || '').trim().toLowerCase();
  assert.ok(['twitch', 'youtube', 'kick'].includes(platform), `Unsupported quote platform: ${platform}`);
  const quote = String(value.quote || '').trim();
  const user = String(value.user || '').trim();
  assert.ok(quote.length > 0 && quote.length <= 1_000, 'Quote text is invalid');
  assert.ok(user.length > 0 && user.length <= 100, 'Quoted user is invalid');
  const timestamp = String(value.timestamp || '').trim();
  assert.ok(Number.isFinite(Date.parse(timestamp)), 'Quote timestamp is invalid');
  return { timestamp, id, userId: String(value.userId || '').trim().slice(0, 150), user, platform, gameName: String(value.gameName || '').trim().slice(0, 200), quote };
}

function fingerprint(value) {
  return [value.platform, String(value.userId || '').trim().toLowerCase(), String(value.user || '').trim().toLowerCase(), String(value.quote || '').trim().replace(/\s+/gu, ' ').toLowerCase()].join('\u0000');
}
