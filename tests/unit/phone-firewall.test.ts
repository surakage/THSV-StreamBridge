import { describe, expect, it } from 'vitest';
import { PhoneFirewall, PhoneFirewallError, type PhoneFirewallRunner } from '../../bridge/services/phone-firewall.js';

const decode = (args: readonly string[]): string => Buffer.from(args[args.length - 1] ?? '', 'base64').toString('utf16le');

describe('PhoneFirewall', () => {
  it('needs nothing on other systems', async () => {
    expect(await new PhoneFirewall(8788, 'node', undefined, false).status()).toEqual({ supported: false, allowed: true, blocked: false });
  });

  it('reads the rule and Windows block entries without changing anything', async () => {
    const scripts: string[] = [];
    let answer = 'rule=1 blocks=0';
    const runner: PhoneFirewallRunner = async (_file, args) => { scripts.push(decode(args)); return { code: 0, stdout: answer }; };
    const firewall = new PhoneFirewall(8788, "C:\\Stream's\\node.exe", runner, true);
    expect(await firewall.status()).toEqual({ supported: true, allowed: true, blocked: false });
    answer = 'rule=1 blocks=2';
    expect(await firewall.status()).toEqual({ supported: true, allowed: false, blocked: true });
    answer = 'rule=0 blocks=0';
    expect(await firewall.status()).toMatchObject({ allowed: false });
    expect(scripts[0]).toContain("'C:\\Stream''s\\node.exe'");
    expect(scripts.join('\n')).not.toMatch(/Remove-NetFirewallRule|New-NetFirewallRule|Set-NetFirewall/u);
  });

  it('adds only the phone port for the home network, through the Windows administrator prompt', async () => {
    const scripts: string[] = [];
    const runner: PhoneFirewallRunner = async (_file, args) => { scripts.push(decode(args)); return { code: 0, stdout: 'rule=1 blocks=0' }; };
    expect(await new PhoneFirewall(8788, 'C:\\sb\\node.exe', runner, true).allow()).toMatchObject({ allowed: true });
    expect(scripts[0]).toContain('-Verb RunAs');
    const elevated = Buffer.from(/'-EncodedCommand','([^']+)'/u.exec(scripts[0] ?? '')?.[1] ?? '', 'base64').toString('utf16le');
    expect(elevated).toContain('-LocalPort 8788 -RemoteAddress LocalSubnet');
    expect(elevated).toContain("-Program 'C:\\sb\\node.exe'");
  });

  it('explains when the creator says no on the Windows prompt', async () => {
    const runner: PhoneFirewallRunner = async () => ({ code: 1223, stdout: '' });
    await expect(new PhoneFirewall(8788, 'node', runner, true).allow()).rejects.toBeInstanceOf(PhoneFirewallError);
  });
});
