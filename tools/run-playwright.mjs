import { spawnSync } from 'node:child_process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

export function playwrightEnvironment(source = process.env) {
  const environment = { ...source };
  // Playwright deliberately adds FORCE_COLOR to its web server and worker processes.
  // Do not forward an inherited NO_COLOR value that would conflict with it.
  delete environment.NO_COLOR;
  delete environment.FORCE_COLOR;
  return environment;
}

export function runPlaywright(argumentsList = process.argv.slice(2)) {
  const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'test', ...argumentsList], {
    cwd: process.cwd(),
    env: playwrightEnvironment(),
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPlaywright();
}
