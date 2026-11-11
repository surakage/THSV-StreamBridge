import { describe, expect, it } from 'vitest';
import { SIGN_IN_START_VALUE, SignInStartError, SignInStartService, type SignInStartRunner } from '../../bridge/services/sign-in-start-service.js';

/** A stand-in for reg.exe that keeps the Run list in memory. */
function fakeRegistry(): { runner: SignInStartRunner; values: Map<string, string>; calls: string[][] } {
  const values = new Map<string, string>(); const calls: string[][] = [];
  const runner: SignInStartRunner = (file, args) => {
    calls.push([file, ...args]);
    const name = args[args.indexOf('/v') + 1] ?? '';
    if (args[0] === 'query') { const value = values.get(name); return value === undefined ? Promise.reject(new Error('not found')) : Promise.resolve(`\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    ${name}    REG_SZ    ${value}\r\n`); }
    if (args[0] === 'add') { values.set(name, args[args.indexOf('/d') + 1] ?? ''); return Promise.resolve(''); }
    if (args[0] === 'delete') { return values.delete(name) ? Promise.resolve('') : Promise.reject(new Error('not found')); }
    return Promise.reject(new Error('unexpected'));
  };
  return { runner, values, calls };
}

describe('Start with Windows', () => {
  it('is off until switched on, and only touches its own value in the signed-in user Run list', async () => {
    const registry = fakeRegistry();
    const service = new SignInStartService('C:\\StreamBridge', registry.runner, true);
    expect(await service.status()).toEqual({ supported: true, enabled: false });
    expect(await service.setEnabled(true)).toEqual({ supported: true, enabled: true });
    expect(registry.values.get(SIGN_IN_START_VALUE)).toContain('tray.ps1" -StartBridge');
    expect(registry.values.get(SIGN_IN_START_VALUE)).toContain('-WindowStyle Hidden');
    expect(await service.setEnabled(false)).toEqual({ supported: true, enabled: false });
    expect(registry.values.size).toBe(0);
    expect(await service.setEnabled(false)).toEqual({ supported: true, enabled: false });
    for (const call of registry.calls) { expect(call[0]).toBe('reg.exe'); expect(call[2]).toBe('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'); expect(call).toContain(SIGN_IN_START_VALUE); }
  });

  it('counts an entry that starts a copy in another folder as off', async () => {
    const registry = fakeRegistry();
    await new SignInStartService('C:\\Old copy', registry.runner, true).setEnabled(true);
    expect(await new SignInStartService('C:\\StreamBridge', registry.runner, true).status()).toEqual({ supported: true, enabled: false });
  });

  it('refuses a folder too long for Windows and anything that is not Windows', async () => {
    const registry = fakeRegistry();
    await expect(new SignInStartService(`C:\\${'a'.repeat(240)}`, registry.runner, true).setEnabled(true)).rejects.toThrow(/shorter folder/u);
    expect(registry.values.size).toBe(0);
    const other = new SignInStartService('/opt/streambridge', registry.runner, false);
    expect(await other.status()).toEqual({ supported: false, enabled: false });
    await expect(other.setEnabled(true)).rejects.toBeInstanceOf(SignInStartError);
    expect(registry.calls.filter((call) => call[1] !== 'query')).toHaveLength(0);
  });

  it('reports a failure when Windows does not keep the setting', async () => {
    const service = new SignInStartService('C:\\StreamBridge', (_file, args) => args[0] === 'add' ? Promise.resolve('') : Promise.reject(new Error('denied')), true);
    await expect(service.setEnabled(true)).rejects.toThrow(/did not save/u);
  });
});
