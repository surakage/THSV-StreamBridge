import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function downloadGitHubArtifact({ repository, artifactId, expectedDigest, outputPath, token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '', fetcher = fetch }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error('Repository must use the owner/name format.');
  if (!/^\d+$/u.test(String(artifactId))) throw new Error('Artifact ID must be numeric.');
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedDigest)) throw new Error('GitHub artifact digest must be a lowercase SHA-256 digest.');
  if (!token) throw new Error('GH_TOKEN or GITHUB_TOKEN is required to download a GitHub Actions artifact.');
  const response = await fetcher(`https://api.github.com/repos/${repository}/actions/artifacts/${String(artifactId)}/zip`, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub artifact download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actualDigest !== expectedDigest) throw new Error(`GitHub artifact digest mismatch. Expected ${expectedDigest}; received ${actualDigest}.`);
  const destination = resolve(outputPath); const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, destination);
  return { schemaVersion: 1, repository, artifactId: Number(artifactId), digest: actualDigest, bytes: bytes.length, outputPath: destination };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [repository, artifactId, expectedDigest, outputPath] = process.argv.slice(2);
  downloadGitHubArtifact({ repository, artifactId, expectedDigest, outputPath }).then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
