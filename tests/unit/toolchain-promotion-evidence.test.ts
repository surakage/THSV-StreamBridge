import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const script = resolve('scripts/test-toolchain-promotion-evidence.ps1');
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const runIds = [101, 102, 103];
const headShas = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)];
const lanes = ['typescript-7', 'node-types-26', 'combined'] as const;

async function createEvidenceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-toolchain-promotion-'));
  for (const [runIndex, runId] of runIds.entries()) {
    for (const lane of lanes) {
      const directory = join(root, String(runId), `toolchain-next-major-${lane}-${String(runId)}`);
      await mkdir(directory, { recursive: true });
      const typecheck = lane === 'node-types-26' ? 'typecheck' : 'typecheck-ts7';
      await writeFile(join(directory, 'latest.json'), JSON.stringify({
        schemaVersion: 3, checkedAt: new Date().toISOString(), sourceCommitSha: headShas[runIndex], lane, isolated: true, productionManifestChanged: false,
        typescript: '7.0.2', nodeTypes: '26.4.0', passed: true,
        checks: ['lint', typecheck, 'test:unit', 'build'].map((name) => ({ name, passed: true })),
      }));
    }
  }
  return root;
}

async function validate(root: string): Promise<string> {
  const { stdout } = await run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-EvidenceRoot', root, '-RunIdsCsv', runIds.join(','), '-ExpectedHeadShasCsv', headShas.join(',')]);
  return stdout;
}

describe('toolchain promotion evidence', () => {
  it('accepts three complete runs with all three passing isolated lanes', async () => {
    await expect(validate(await createEvidenceFixture())).resolves.toContain('True');
  });

  it('rejects a lane whose production manifest changed', async () => {
    const root = await createEvidenceFixture();
    const path = join(root, '102', 'toolchain-next-major-combined-102', 'latest.json');
    const typecheck = 'typecheck-ts7';
    await writeFile(path, JSON.stringify({ schemaVersion: 3, checkedAt: new Date().toISOString(), sourceCommitSha: headShas[1], lane: 'combined', isolated: true, productionManifestChanged: true, typescript: '7.0.2', nodeTypes: '26.4.0', passed: true, checks: ['lint', typecheck, 'test:unit', 'build'].map((name) => ({ name, passed: true })) }));
    await expect(validate(root)).rejects.toThrow('complete passing schema-v3 evidence');
  });

  it('rejects evidence produced from a different workflow head commit', async () => {
    const root = await createEvidenceFixture(); const path = join(root, '101', 'toolchain-next-major-typescript-7-101', 'latest.json');
    const evidence = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>; evidence.sourceCommitSha = 'f'.repeat(40); await writeFile(path, JSON.stringify(evidence));
    await expect(validate(root)).rejects.toThrow(`head SHA ${String(headShas[0])}`);
  });
});
