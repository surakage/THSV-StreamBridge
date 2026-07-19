import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('development launcher', () => {
  it('routes npm dev through the single-instance supervisor', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(packageJson.scripts.dev).toBe('node tools/dev.mjs');
  });

  it('uses authenticated replacement and refuses a second instance when shutdown fails', async () => {
    const source = await readFile('tools/dev.mjs', 'utf8');
    expect(source).toContain("authorization: `Bearer ${token}`");
    expect(source).toContain('/shutdown');
    expect(source).toContain('refusing to start a second instance');
    expect(source).toContain('streambridge.pid');
    expect(source).toContain('active-config.txt');
    expect(source).toContain("open(startupLockPath, 'wx')");
    expect(source).toContain('waitForInitialHealth(baseUrl, child)');
    expect(source).not.toContain('taskkill');
    expect(source).not.toContain("child_process.exec");
  });
});
