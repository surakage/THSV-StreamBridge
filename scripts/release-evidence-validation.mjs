import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function validatePublicReleaseAssets({ directory, repository, tag, releaseAssets }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) || !/^v\d+\.\d+\.\d+$/u.test(tag)) throw new Error('Release evidence identity is invalid.');
  if (!Array.isArray(releaseAssets)) throw new Error('Release asset metadata must be an array.');
  const version = tag.slice(1);
  const archiveName = `THSV-StreamBridge-${version}.zip`;
  const sbomName = `THSV-StreamBridge-${tag}.cdx.json`;
  const evidenceName = `THSV-StreamBridge-${tag}.release-evidence.json`;
  const indexName = 'THSV-StreamBridge-AddOns-index.json';
  const required = [archiveName, `${archiveName}.sha256`, sbomName, evidenceName, `${evidenceName}.sha256`, indexName, `${indexName}.sha256`];
  const names = releaseAssets.map((asset) => typeof asset?.name === 'string' ? asset.name : '');
  if (new Set(names).size !== names.length || names.some((name) => !safeName(name))) throw new Error('Release asset metadata contains a duplicate or unsafe filename.');
  for (const name of required) if (!names.includes(name)) throw new Error(`Required release asset is missing: ${name}`);
  const addOnArchives = names.filter((name) => /^THSV-StreamBridge-AddOn-.+-\d+\.\d+\.\d+\.zip$/u.test(name)).sort();
  if (addOnArchives.length === 0) throw new Error('No optional add-on archives were published.');
  for (const name of addOnArchives) if (!names.includes(`${name}.sha256`)) throw new Error(`Optional add-on checksum is missing: ${name}`);
  const selectedNames = [...required, ...addOnArchives, ...addOnArchives.map((name) => `${name}.sha256`)];
  const selected = releaseAssets.filter((asset) => selectedNames.includes(asset.name));
  if (selected.length !== selectedNames.length || selected.some((asset) => !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > 1024 ** 3) || selected.reduce((sum, asset) => sum + asset.size, 0) > 2 * 1024 ** 3) throw new Error('Release asset metadata failed bounded-size validation.');

  await assertChecksum(directory, evidenceName);
  await assertChecksum(directory, indexName);
  for (const name of addOnArchives) await assertChecksum(directory, name);
  const sbom = await readJson(join(directory, sbomName), 'CycloneDX SBOM');
  if (sbom.bomFormat !== 'CycloneDX' || sbom.metadata?.component?.version !== version) throw new Error('Released CycloneDX SBOM identity does not match the release.');
  const index = await readJson(join(directory, indexName), 'add-on index');
  if (!Array.isArray(index.packages)) throw new Error('Add-on index packages must be an array.');
  const indexedArchives = index.packages.map((item) => item?.archiveName).sort();
  if (indexedArchives.some((name) => typeof name !== 'string') || indexedArchives.join('\n') !== addOnArchives.join('\n')) throw new Error('Add-on index archives do not exactly match the published optional add-on archives.');
  for (const item of index.packages) if (!/^[a-f0-9]{64}$/u.test(item.sha256 ?? '') || await sha256(join(directory, item.archiveName)) !== item.sha256) throw new Error(`Add-on index digest mismatch for ${String(item.archiveName)}.`);
  const evidence = await readJson(join(directory, evidenceName), 'release evidence');
  const commitBindingRequired = versionAtLeast(version, '4.0.9');
  if (![1, 2].includes(evidence.schemaVersion) || (commitBindingRequired && evidence.schemaVersion !== 2) || evidence.tag !== tag || evidence.version !== version || evidence.repository !== repository || !/^[a-f0-9]{40}$/u.test(evidence.commitSha ?? '') || !Array.isArray(evidence.assets)) throw new Error('Release evidence identity does not match the public release.');
  if (evidence.schemaVersion === 2) {
    const coreEvidence = evidence.coreArchive;
    if (coreEvidence?.name !== archiveName || coreEvidence?.sourceCommitSha !== evidence.commitSha || !/^[a-f0-9]{64}$/u.test(coreEvidence?.sha256 ?? '') || coreEvidence.sha256 !== await sha256(join(directory, archiveName))) throw new Error('Release evidence does not bind the core archive to the exact source commit.');
  }
  for (const asset of evidence.assets) {
    if (typeof asset?.name !== 'string' || !selectedNames.includes(asset.name) || !/^[a-f0-9]{64}$/u.test(asset.sha256 ?? '') || await sha256(join(directory, asset.name)) !== asset.sha256) throw new Error(`Release evidence digest mismatch for ${String(asset?.name)}.`);
  }
  return Object.freeze({ archiveName, sbomName, evidenceName, indexName, addOnArchives, selectedNames, provenanceAssets: [archiveName, ...addOnArchives, indexName, evidenceName, `${evidenceName}.sha256`] });
}

export function attestationStatementMatches(statement, { expectedDigest, kind, expectedSbom }) {
  if (statement === null || typeof statement !== 'object' || !/^[a-f0-9]{64}$/u.test(expectedDigest)) return false;
  const subjectMatches = Array.isArray(statement.subject) && statement.subject.some((subject) => subject?.digest?.sha256 === expectedDigest);
  if (!subjectMatches) return false;
  if (kind === 'provenance') return statement.predicateType === 'https://slsa.dev/provenance/v1';
  return kind === 'sbom' && typeof statement.predicateType === 'string' && statement.predicateType.toLowerCase().includes('cyclonedx') && stableJson(statement.predicate) === stableJson(expectedSbom);
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function assertChecksum(directory, payloadName) {
  const checksum = (await readFile(join(directory, `${payloadName}.sha256`), 'utf8')).trim().match(/^([a-f0-9]{64})\s+\*?([^\s]+)$/iu);
  if (checksum === null || checksum[2] !== payloadName || checksum[1]?.toLowerCase() !== await sha256(join(directory, payloadName))) throw new Error(`Checksum verification failed for ${payloadName}.`);
}

async function readJson(path, label) {
  try { return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, '')); }
  catch (error) { throw new Error(`Released ${label} is not valid JSON.`, { cause: error }); }
}

async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
function safeName(value) { return value !== '' && value === value.split(/[\\/]/u).pop() && !value.includes('..'); }
function versionAtLeast(value, minimum) { const current = value.split('.').map(Number); const floor = minimum.split('.').map(Number); for (let index = 0; index < floor.length; index += 1) { if (current[index] > floor[index]) return true; if (current[index] < floor[index]) return false; } return true; }
