import { Buffer } from 'node:buffer';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { verify } from 'sigstore';

const [mode, repository, value, destination] = process.argv.slice(2);
if (!['list', 'download', 'attestations', 'verify-attestations'].includes(mode) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? '')) throw new Error('Usage: public-github-release.mjs <list|download|attestations|verify-attestations> <owner/repository> [value] [destination]');
const headers = { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge-release-verifier', 'x-github-api-version': '2022-11-28' };

async function json(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GitHub public API returned ${String(response.status)} for ${url}.`);
  return response.json();
}

async function download(url, path) {
  const target = resolve(path); const temporary = `${target}.download`;
  await mkdir(dirname(target), { recursive: true });
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    if (!response.ok || response.body === null) throw new Error(`GitHub release download returned ${String(response.status)}.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'w' }));
    await rename(temporary, target);
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}

if (mode === 'list') {
  const releases = await json(`https://api.github.com/repos/${repository}/releases?per_page=100`);
  process.stdout.write(`${JSON.stringify(releases.map((release) => ({ tagName: release.tag_name, isPrerelease: release.prerelease === true, isDraft: release.draft === true })))}\n`);
} else if (mode === 'download') {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value ?? '') || destination === undefined) throw new Error('Download requires a release tag and destination directory.');
  const release = await json(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(value)}`);
  if (release.draft === true || release.prerelease === true) throw new Error(`Release ${value} is not a published stable release.`);
  for (const assetName of process.argv.slice(6)) {
    if (assetName !== assetName.split(/[\\/]/u).pop()) throw new Error(`Unsafe release asset name: ${assetName}`);
    const asset = release.assets.find((candidate) => candidate.name === assetName);
    if (asset === undefined) throw new Error(`Release ${value} does not contain ${assetName}.`);
    await download(asset.browser_download_url, resolve(destination, assetName));
  }
} else if (mode === 'attestations') {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value ?? '') || destination === undefined) throw new Error('Attestation retrieval requires a sha256 digest and output path.');
  const result = await json(`https://api.github.com/repos/${repository}/attestations/${encodeURIComponent(value)}`);
  const bundles = Array.isArray(result.attestations) ? result.attestations.map((entry) => entry.bundle ?? entry) : [];
  if (bundles.length === 0) throw new Error(`No public GitHub attestations were found for ${value}.`);
  await writeFile(resolve(destination), `${bundles.map((bundle) => JSON.stringify(bundle)).join('\n')}\n`, 'utf8');
} else {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value ?? '') || destination === undefined) throw new Error('Attestation verification requires a sha256 digest and bundle path.');
  const expectedDigest = value.slice('sha256:'.length);
  const lines = (await readFile(resolve(destination), 'utf8')).split(/\r?\n/u).filter(Boolean);
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const identity = `^https://github\\.com/${escapedRepository}/\\.github/workflows/[^@]+@refs/tags/v\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$`;
  let verified = false;
  const tufCachePath = await mkdtemp(join(tmpdir(), 'thsv-sigstore-tuf-'));
  try {
    for (const line of lines) {
      const bundle = JSON.parse(line);
      try {
        await verify(bundle, { certificateIssuer: 'https://token.actions.githubusercontent.com', certificateIdentityURI: identity, tufCachePath });
        const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
        const subjectMatches = Array.isArray(statement.subject) && statement.subject.some((subject) => subject?.digest?.sha256 === expectedDigest);
        if (statement.predicateType === 'https://slsa.dev/provenance/v1' && subjectMatches) { verified = true; break; }
      } catch { /* Another attestation for the same digest may be the required provenance bundle. */ }
    }
  } finally { await rm(tufCachePath, { recursive: true, force: true }); }
  if (!verified) throw new Error(`No cryptographically valid tagged ${repository} SLSA provenance attestation matched ${value}.`);
  process.stdout.write(`${JSON.stringify({ provenanceVerified: true, repository, digest: value })}\n`);
}
