import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requestedRootIndex = process.argv.indexOf('--install-root');
const requestedRoot = requestedRootIndex >= 0 ? process.argv[requestedRootIndex + 1] : undefined;
const installRoot = requestedRoot ? resolve(requestedRoot) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recordPath = join(installRoot, 'data', 'runtime', 'install-manifest.json');
const record = JSON.parse(await readFile(recordPath, 'utf8'));
if (record.product !== 'THSV StreamBridge' || resolve(record.installRoot) !== installRoot) throw new Error('This directory is not a managed THSV StreamBridge installation.');
const deleteEverything = process.argv.includes('--delete-user-data');
if (deleteEverything && !process.argv.includes('--confirm-delete-everything')) throw new Error('Deleting creator data requires both --delete-user-data and --confirm-delete-everything.');
spawnSync(process.execPath, [join(installRoot, 'launcher', 'stop.mjs')], { stdio: 'inherit', timeout: 10_000 });
// The public uninstall wrapper removes itself after this process exits. Deleting the
// currently executing batch file here makes cmd.exe report a false failure on return.
for (const entry of ['app', 'runtime', 'launcher', 'Install THSV StreamBridge.cmd', 'Start THSV StreamBridge.cmd', 'Stop THSV StreamBridge.cmd', 'Open THSV Setup Wizard.cmd']) await rm(join(installRoot, entry), { recursive: true, force: true });
if (deleteEverything) {
  await rm(installRoot, { recursive: true, force: true });
  process.stdout.write('THSV StreamBridge and all creator data were removed.\n');
} else {
  await rm(recordPath, { force: true });
  await mkdir(installRoot, { recursive: true });
  await writeFile(join(installRoot, 'REINSTALL.txt'), 'THSV StreamBridge was uninstalled. Creator configuration, add-ons, state, logs, backups, and secrets were preserved. Reinstall the main bridge to use them again.\n', 'utf8');
  process.stdout.write(`THSV StreamBridge was removed. Creator data remains in ${join(installRoot, 'data')} and ${join(installRoot, 'addons')}.\n`);
}
