import { describe, expect, it } from 'vitest';
import { MeldLoopback, type MeldLoopbackRunner } from '../../bridge/services/meld-loopback.js';

const FAMILY = 'MeldStudio.MeldStudio_8wekyb3d8bbwe';
function decoded(args: readonly string[]): string { return Buffer.from(args.at(-1) ?? '', 'base64').toString('utf16le'); }

describe('Meld Studio loopback exemption', () => {
  it('reports Meld as allowed once Windows lists its package', async () => {
    const runner: MeldLoopbackRunner = async () => ({ code: 0, stdout: `family=${FAMILY} allowed=True\r\n` });
    expect(await new MeldLoopback(runner, true).status()).toMatchObject({ supported: true, installed: true, allowed: true });
  });

  it('says Meld is not installed when no Store package is found', async () => {
    const runner: MeldLoopbackRunner = async () => ({ code: 0, stdout: 'family=\r\n' });
    expect(await new MeldLoopback(runner, true).status()).toEqual({ supported: true, installed: false, allowed: false });
    await expect(new MeldLoopback(runner, true).allow()).rejects.toThrow(/not found/u);
  });

  it('asks Windows for permission for Meld only, and checks it took', async () => {
    const scripts: string[] = []; let allowed = false;
    const runner: MeldLoopbackRunner = async (_file, args) => {
      const script = decoded(args); scripts.push(script);
      if (script.includes('Start-Process')) { allowed = true; return { code: 0, stdout: '' }; }
      return { code: 0, stdout: `family=${FAMILY} allowed=${allowed ? 'True' : 'False'}` };
    };
    expect(await new MeldLoopback(runner, true).allow()).toEqual({ supported: true, installed: true, allowed: true });
    expect(scripts.find((script) => script.includes('Start-Process'))).toContain(`'-n=${FAMILY}'`);
  });

  it('explains a declined Windows prompt', async () => {
    const runner: MeldLoopbackRunner = async (_file, args) => decoded(args).includes('Start-Process') ? { code: 1223, stdout: '' } : { code: 0, stdout: `family=${FAMILY} allowed=False` };
    await expect(new MeldLoopback(runner, true).allow()).rejects.toThrow(/choose Yes/u);
  });

  it('does nothing outside Windows', async () => {
    expect(await new MeldLoopback(async () => ({ code: 0, stdout: '' }), false).status()).toEqual({ supported: false, installed: false, allowed: true });
  });
});
