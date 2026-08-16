import { spawnSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installRoot = updateInstallRoot(process.argv.slice(2));
const logRoot = join(installRoot, 'data', 'updates');
const logPath = join(logRoot, 'last-update.log');
await mkdir(logRoot, { recursive: true });
await appendFile(logPath, `[${new Date().toISOString()}] Verified update helper started.\n`, 'utf8');

// Give the authenticated HTTP response time to reach the wizard before the installer
// asks the existing launcher to stop StreamBridge.
await delay(1_500);
const result = spawnSync(process.execPath, [join(sourceRoot, 'installer', 'install.mjs'), '--install-root', installRoot], {
  cwd: sourceRoot,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 180_000,
});
const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim();
await appendFile(logPath, `[${new Date().toISOString()}] Installer exit ${String(result.status ?? 1)}.${output ? `\n${output}\n` : '\n'}`, 'utf8');
process.exitCode = result.status === 0 ? 0 : 1;

function updateInstallRoot(argumentsValue) {
  const index = argumentsValue.indexOf('--install-root');
  const value = index >= 0 ? argumentsValue[index + 1] : undefined;
  if (typeof value !== 'string' || !isAbsolute(value) || value.trim().length === 0) throw new Error('A managed absolute installation root is required.');
  return resolve(value);
}
