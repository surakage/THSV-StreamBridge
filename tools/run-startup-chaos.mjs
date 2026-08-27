import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const startedAt = new Date();
const scenarios = Object.freeze(['early process exit and retry', 'occupied listener ownership', 'real TCP stale-listener release', 'crash-loop circuit breaker', 'transactional installer rollback']);
const vitest = resolve('node_modules', 'vitest', 'vitest.mjs');
const argumentsValue = [vitest, 'run', 'tests/unit/streambridge-start-launcher.test.ts', 'tests/unit/portable-release-installer.test.ts', '--reporter=verbose'];
const child = spawn(process.execPath, argumentsValue, { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, THSV_STARTUP_CHAOS: '1' } });
let output = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
let exitCode = await new Promise((resolveExit, rejectExit) => { child.once('error', rejectExit); child.once('exit', (code) => resolveExit(code ?? 1)); });
if (exitCode === 0) {
  const socketAcceptance = spawn(process.execPath, [resolve('tests', 'windows', 'streamerbot-stale-socket.tests.mjs')], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  socketAcceptance.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
  socketAcceptance.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
  exitCode = await new Promise((resolveExit, rejectExit) => { socketAcceptance.once('error', rejectExit); socketAcceptance.once('exit', (code) => resolveExit(code ?? 1)); });
}
const finishedAt = new Date();
const report = { version: 1, isolated: true, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationMs: finishedAt.getTime() - startedAt.getTime(), scenarios, passed: exitCode === 0, exitCode, outputTail: output.slice(-16_000) };
const reportRoot = resolve('artifacts', 'startup-chaos');
await mkdir(reportRoot, { recursive: true });
await writeFile(join(reportRoot, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`\nStartup chaos report: ${join(reportRoot, 'latest.json')}\n`);
process.exitCode = exitCode;
