import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Gives each test run its own temp folder and removes it afterwards. Tests create
 * thousands of `thsv-*` folders with mkdtemp; without this they piled up in the
 * system temp folder (tens of GB on a developer PC).
 */
export default function setup(): () => void {
  const root = mkdtempSync(join(tmpdir(), 'thsv-test-run-'));
  for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = root;
  return () => {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* A file still held open by Windows is left for the next cleanup; never fail the run for it. */ }
  };
}
