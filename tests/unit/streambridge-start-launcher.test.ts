import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('installed StreamBridge start launcher', () => {
  it('coalesces overlapping launches and retries only retryable Bridge startup failures', async () => {
    const source = await readFile('launcher/start.mjs', 'utf8');
    expect(source).toContain('waiting for its result');
    expect(source).toContain("outcome: waitedForLauncher ? 'coalesced' : 'already-healthy'");
    expect(source).toContain('error instanceof BridgeRetryableStartupError');
    expect(source).toContain('retrying once');
    expect(source).toContain('error instanceof PortOwnershipError');
    expect(source).toContain('did not finish within 45 seconds');
    expect(source).toContain("outcome: 'in-progress'");
    expect(source).toContain('streambridge-startup-circuit.json');
    expect(source).toContain('crash-loop protection is active');
    expect(source).toContain('readReadinessBlockers');
    expect(source).toContain('THSV_STARTUP_RUN_ID');
    expect(source).toContain('startupRunId');
    expect(source.indexOf('class BridgeRetryableStartupError')).toBeLessThan(source.indexOf('await run().catch'));
    expect(source.indexOf('class PortOwnershipError')).toBeLessThan(source.indexOf('await run().catch'));
  });

  it('reuses a verified healthy owned listener and records that no restart occurred', async () => {
    if (process.platform !== 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'thsv-idempotent-start-'));
    temporaryRoots.push(root);
    await Promise.all([
      mkdir(join(root, 'launcher'), { recursive: true }),
      mkdir(join(root, 'data', 'runtime'), { recursive: true }),
      mkdir(join(root, 'data', 'configuration'), { recursive: true }),
      mkdir(join(root, 'data', 'logs'), { recursive: true }),
    ]);
    await copyFile('launcher/start.mjs', join(root, 'launcher', 'start.mjs'));

    let healthRequests = 0;
    let shutdownRequests = 0;
    const server = createServer((request, response) => {
      if (request.url === '/health') {
        healthRequests += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'healthy', service: 'THSV StreamBridge' }));
        return;
      }
      if (request.url === '/ready') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ready', ready: true, blockers: [] }));
        return;
      }
      if (request.url === '/shutdown') shutdownRequests += 1;
      response.writeHead(404).end();
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');
    await Promise.all([
      writeFile(join(root, 'data', 'runtime', 'install-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', activeVersion: '9.9.9' })),
      writeFile(join(root, 'data', 'runtime', 'streambridge.pid'), `${String(process.pid)}\n`),
      writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), JSON.stringify({ service: { port: address.port } })),
    ]);

    try {
      const result = await runLauncher(join(root, 'launcher', 'start.mjs'), root);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe('');
      expect(healthRequests).toBeGreaterThan(0);
      expect(shutdownRequests).toBe(0);
      const report = JSON.parse(await readFile(join(root, 'data', 'logs', 'last-startup-report.json'), 'utf8')) as Record<string, unknown>;
      expect(report).toMatchObject({ launcher: 'streambridge', requestedAction: 'start', outcome: 'already-healthy', category: 'none', pid: process.pid, port: address.port, version: '9.9.9' });
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    }
  });

  it('waits for an overlapping launcher and then records the shared healthy result', async () => {
    if (process.platform !== 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'thsv-coalesced-start-'));
    temporaryRoots.push(root);
    await Promise.all([
      mkdir(join(root, 'launcher'), { recursive: true }),
      mkdir(join(root, 'data', 'runtime'), { recursive: true }),
      mkdir(join(root, 'data', 'configuration'), { recursive: true }),
      mkdir(join(root, 'data', 'logs'), { recursive: true }),
    ]);
    await copyFile('launcher/start.mjs', join(root, 'launcher', 'start.mjs'));
    const server = createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'healthy', service: 'THSV StreamBridge' }));
        return;
      }
      if (request.url === '/ready') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ready', ready: true, blockers: [] }));
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');
    const lockPath = join(root, 'data', 'runtime', 'streambridge.launch.lock');
    const lockHolder = spawn(process.execPath, ['-e', "setTimeout(()=>require('node:fs').rmSync(process.argv[1],{force:true}),500)", lockPath], { windowsHide: true, stdio: 'ignore' });
    if (lockHolder.pid === undefined) throw new Error('Test lock holder did not expose a PID.');
    await Promise.all([
      writeFile(join(root, 'data', 'runtime', 'install-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', activeVersion: '9.9.9' })),
      writeFile(join(root, 'data', 'runtime', 'streambridge.pid'), `${String(process.pid)}\n`),
      writeFile(lockPath, `${String(lockHolder.pid)}\n`),
      writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), JSON.stringify({ service: { port: address.port } })),
    ]);
    try {
      const result = await runLauncher(join(root, 'launcher', 'start.mjs'), root);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain('waiting for its result');
      const report = JSON.parse(await readFile(join(root, 'data', 'logs', 'last-startup-report.json'), 'utf8')) as Record<string, unknown>;
      expect(report).toMatchObject({ outcome: 'coalesced', category: 'none', pid: process.pid, port: address.port });
    } finally {
      try { lockHolder.kill(); } catch { /* Already stopped. */ }
      await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    }
  });

  it('opens the crash-loop circuit after three matching recent Bridge failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-circuit-start-'));
    temporaryRoots.push(root);
    await Promise.all([
      mkdir(join(root, 'launcher'), { recursive: true }),
      mkdir(join(root, 'data', 'runtime'), { recursive: true }),
      mkdir(join(root, 'data', 'configuration'), { recursive: true }),
    ]);
    await copyFile('launcher/start.mjs', join(root, 'launcher', 'start.mjs'));
    const now = new Date().toISOString();
    await Promise.all([
      writeFile(join(root, 'data', 'runtime', 'install-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', activeVersion: '9.9.9' })),
      writeFile(join(root, 'data', 'runtime', 'streambridge-startup-circuit.json'), JSON.stringify({ version: 1, failures: Array.from({ length: 3 }, () => ({ at: now, fingerprint: 'same-failure' })) })),
      writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), JSON.stringify({ service: { port: 18_789 } })),
    ]);
    const result = await runLauncher(join(root, 'launcher', 'start.mjs'), root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('crash-loop protection is active');
    const report = JSON.parse(await readFile(join(root, 'data', 'logs', 'last-startup-report.json'), 'utf8')) as Record<string, unknown>;
    expect(report).toMatchObject({ outcome: 'failed', category: 'crash-loop-open', phase: 'checking-existing' });
  });

  it.runIf(process.env['THSV_STARTUP_CHAOS'] === '1')('fails closed when another process owns the configured healthy-looking port', async () => {
    if (process.platform !== 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'thsv-port-chaos-')); temporaryRoots.push(root);
    await Promise.all([
      mkdir(join(root, 'launcher'), { recursive: true }), mkdir(join(root, 'app', '9.9.9', 'dist', 'apps'), { recursive: true }),
      mkdir(join(root, 'data', 'runtime'), { recursive: true }), mkdir(join(root, 'data', 'configuration'), { recursive: true }), mkdir(join(root, 'data', 'logs'), { recursive: true }),
    ]);
    await copyFile('launcher/start.mjs', join(root, 'launcher', 'start.mjs'));
    await writeFile(join(root, 'app', '9.9.9', 'dist', 'apps', 'bridge-service.js'), 'setInterval(() => {}, 1000);\n');
    const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ status: 'healthy', service: 'THSV StreamBridge' })); });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address(); if (address === null || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');
    await Promise.all([
      writeFile(join(root, 'data', 'runtime', 'install-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', activeVersion: '9.9.9' })),
      writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), JSON.stringify({ service: { port: address.port } })),
    ]);
    try {
      const result = await runLauncher(join(root, 'launcher', 'start.mjs'), root);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`Port ${String(address.port)} is owned by PID`);
      const report = JSON.parse(await readFile(join(root, 'data', 'logs', 'last-startup-report.json'), 'utf8')) as Record<string, unknown>;
      expect(report).toMatchObject({ outcome: 'failed', category: 'port-conflict', attempt: 1 });
    } finally { await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())); }
  }, 30_000);

  it.runIf(process.env['THSV_STARTUP_CHAOS'] === '1')('records an early Bridge process exit after one bounded retry', async () => {
    if (process.platform !== 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'thsv-exit-chaos-')); temporaryRoots.push(root);
    await Promise.all([
      mkdir(join(root, 'launcher'), { recursive: true }), mkdir(join(root, 'app', '9.9.9', 'dist', 'apps'), { recursive: true }),
      mkdir(join(root, 'data', 'runtime'), { recursive: true }), mkdir(join(root, 'data', 'configuration'), { recursive: true }), mkdir(join(root, 'data', 'logs'), { recursive: true }),
    ]);
    await copyFile('launcher/start.mjs', join(root, 'launcher', 'start.mjs'));
    await writeFile(join(root, 'app', '9.9.9', 'dist', 'apps', 'bridge-service.js'), 'process.exit(23);\n');
    await Promise.all([
      writeFile(join(root, 'data', 'runtime', 'install-manifest.json'), JSON.stringify({ product: 'THSV StreamBridge', activeVersion: '9.9.9' })),
      writeFile(join(root, 'data', 'configuration', 'bridge.local.json'), JSON.stringify({ service: { port: 18_791 } })),
    ]);
    const result = await runLauncher(join(root, 'launcher', 'start.mjs'), root);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('retrying once');
    expect(result.stderr).toContain('exited during startup');
    const report = JSON.parse(await readFile(join(root, 'data', 'logs', 'last-startup-report.json'), 'utf8')) as Record<string, unknown>;
    expect(report).toMatchObject({ outcome: 'failed', category: 'bridge-health-timeout', attempt: 2 });
  }, 30_000);
});

async function runLauncher(path: string, cwd: string): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  const child = spawn(process.execPath, [path, '--wait'], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', resolveExit);
  });
  return { exitCode, stdout, stderr };
}
