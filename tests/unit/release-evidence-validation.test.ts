import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { attestationStatementMatches, validatePublicReleaseAssets } from '../../scripts/release-evidence-validation.mjs';

const repository = 'surakage/THSV-StreamBridge';
const tag = 'v4.0.9';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('offline public release evidence validation', () => {
  it('accepts a complete bounded fixture and rejects malformed SBOM, evidence, and index records', async () => {
    const valid = await fixture();
    await expect(validatePublicReleaseAssets(valid)).resolves.toMatchObject({ addOnArchives: ['THSV-StreamBridge-AddOn-Test-4.0.9.zip'] });

    const badSbom = await fixture();
    await writeFile(join(badSbom.directory, 'THSV-StreamBridge-v4.0.9.cdx.json'), '{"bomFormat":"SPDX","metadata":{"component":{"version":"4.0.9"}}}');
    await expect(validatePublicReleaseAssets(badSbom)).rejects.toThrow('CycloneDX SBOM identity');

    const badEvidence = await fixture();
    const evidencePath = join(badEvidence.directory, 'THSV-StreamBridge-v4.0.9.release-evidence.json');
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as Record<string, unknown>;
    evidence['tag'] = 'v9.9.9'; await writeFile(evidencePath, JSON.stringify(evidence)); await checksum(badEvidence.directory, 'THSV-StreamBridge-v4.0.9.release-evidence.json');
    await expect(validatePublicReleaseAssets(badEvidence)).rejects.toThrow('Release evidence identity');

    const badIndex = await fixture();
    const indexPath = join(badIndex.directory, 'THSV-StreamBridge-AddOns-index.json');
    await writeFile(indexPath, JSON.stringify({ packages: [{ archiveName: '../escape.zip', sha256: '0'.repeat(64) }] })); await checksum(badIndex.directory, 'THSV-StreamBridge-AddOns-index.json');
    await expect(validatePublicReleaseAssets(badIndex)).rejects.toThrow('Add-on index archives');

    const badBinding = await fixture();
    const bindingPath = join(badBinding.directory, 'THSV-StreamBridge-v4.0.9.release-evidence.json');
    const binding = JSON.parse(await readFile(bindingPath, 'utf8')) as { coreArchive: { sourceCommitSha: string } };
    binding.coreArchive.sourceCommitSha = 'c'.repeat(40); await writeFile(bindingPath, JSON.stringify(binding)); await checksum(badBinding.directory, 'THSV-StreamBridge-v4.0.9.release-evidence.json');
    await expect(validatePublicReleaseAssets(badBinding)).rejects.toThrow('exact source commit');
  });

  it('rejects malformed, wrong-subject, wrong-kind, and mismatched SBOM attestation statements', () => {
    const digest = 'a'.repeat(64); const sbom = { bomFormat: 'CycloneDX', components: [{ name: 'bridge' }] };
    const provenance = { subject: [{ digest: { sha256: digest } }], predicateType: 'https://slsa.dev/provenance/v1', predicate: {} };
    const sbomStatement = { subject: [{ digest: { sha256: digest } }], predicateType: 'https://cyclonedx.org/bom', predicate: sbom };
    expect(attestationStatementMatches(provenance, { expectedDigest: digest, kind: 'provenance' })).toBe(true);
    expect(attestationStatementMatches(sbomStatement, { expectedDigest: digest, kind: 'sbom', expectedSbom: sbom })).toBe(true);
    expect(attestationStatementMatches(null, { expectedDigest: digest, kind: 'provenance' })).toBe(false);
    expect(attestationStatementMatches({ ...provenance, subject: [] }, { expectedDigest: digest, kind: 'provenance' })).toBe(false);
    expect(attestationStatementMatches(provenance, { expectedDigest: digest, kind: 'sbom', expectedSbom: sbom })).toBe(false);
    expect(attestationStatementMatches(sbomStatement, { expectedDigest: digest, kind: 'sbom', expectedSbom: { bomFormat: 'CycloneDX', components: [] } })).toBe(false);
  });
});

async function fixture(): Promise<{ directory: string; repository: string; tag: string; releaseAssets: Array<{ name: string; size: number }> }> {
  const directory = await mkdtemp(join(tmpdir(), 'thsv-release-evidence-')); await mkdir(directory, { recursive: true });
  roots.push(directory);
  const archive = 'THSV-StreamBridge-4.0.9.zip'; const addon = 'THSV-StreamBridge-AddOn-Test-4.0.9.zip'; const index = 'THSV-StreamBridge-AddOns-index.json'; const sbom = 'THSV-StreamBridge-v4.0.9.cdx.json'; const evidence = 'THSV-StreamBridge-v4.0.9.release-evidence.json';
  await writeFile(join(directory, archive), 'core'); await checksum(directory, archive);
  await writeFile(join(directory, addon), 'addon'); await checksum(directory, addon);
  await writeFile(join(directory, sbom), JSON.stringify({ bomFormat: 'CycloneDX', metadata: { component: { version: '4.0.9' } } }));
  await writeFile(join(directory, index), JSON.stringify({ packages: [{ archiveName: addon, sha256: await hash(join(directory, addon)) }] })); await checksum(directory, index);
  const evidenceAssets = [archive, `${archive}.sha256`, addon, `${addon}.sha256`, index, `${index}.sha256`, sbom];
  const commitSha = 'b'.repeat(40); const archiveSha256 = await hash(join(directory, archive));
  await writeFile(join(directory, evidence), JSON.stringify({ schemaVersion: 2, tag, version: '4.0.9', repository, commitSha, coreArchive: { name: archive, size: 4, sha256: archiveSha256, sourceCommitSha: commitSha }, assets: await Promise.all(evidenceAssets.map(async (name) => ({ name, sha256: await hash(join(directory, name)) }))) })); await checksum(directory, evidence);
  const names = [...evidenceAssets, evidence, `${evidence}.sha256`];
  return { directory, repository, tag, releaseAssets: await Promise.all(names.map(async (name) => ({ name, size: (await readFile(join(directory, name))).length }))) };
}

async function checksum(directory: string, name: string): Promise<void> { await writeFile(join(directory, `${name}.sha256`), `${await hash(join(directory, name))}  ${name}\n`); }
async function hash(path: string): Promise<string> { return createHash('sha256').update(await readFile(path)).digest('hex'); }
