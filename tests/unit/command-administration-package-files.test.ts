import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly action: { readonly name: string; readonly group: string; readonly source: string; readonly importFile: string };
  readonly contract: {
    readonly operations: readonly string[];
    readonly requiredInputArguments: readonly string[];
    readonly outputArguments: readonly string[];
    readonly safety: { readonly requiresCreatorApproval: boolean; readonly directTriggers: boolean; readonly cooldownSupport: string };
  };
  readonly verificationStatus: string;
}

describe('Command Administration Streamer.bot package', () => {
  it('contains a reproducible triggerless import with the reviewed enable/disable boundary', async () => {
    const root = 'packages/streamerbot/command-administration';
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Manifest;
    const decoded = Buffer.from((await readFile(`${root}/${manifest.action.importFile}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as {
      meta: { name: string; version: string; author: string; description: string };
      data: { actions: Array<{ name: string; group: string; concurrent: boolean; triggers: unknown[]; subActions: Array<{ type: number; enabled: boolean; byteCode?: string }> }> };
    };
    expect(exported.meta).toMatchObject({ name: manifest.name, version: manifest.version, author: manifest.author, description: manifest.description });
    const action = exported.data.actions[0];
    expect(action).toMatchObject({ name: manifest.action.name, group: manifest.action.group, concurrent: true, triggers: [] });

    const code = action?.subActions.find((item) => item.type === 99_999 && item.enabled);
    const exportedSource = Buffer.from(code?.byteCode ?? '', 'base64').toString('utf8').replaceAll('\r\n', '\n').trimEnd();
    const reviewedSource = (await readFile(`${root}/${manifest.action.source}`, 'utf8')).replaceAll('\r\n', '\n').trimEnd();
    expect(exportedSource).toBe(reviewedSource);

    for (const argument of [...manifest.contract.requiredInputArguments, ...manifest.contract.outputArguments]) {
      expect(reviewedSource).toContain(`"${argument}"`);
    }
    for (const operation of manifest.contract.operations) expect(reviewedSource).toContain(`"${operation}"`);

    // This package only wraps documented, existing Streamer.bot behavior — it must never gain
    // the ability to create, delete, or chain into other actions, and it must always require
    // explicit creator approval before dispatching anything.
    expect(manifest.contract.safety).toEqual({
      requiresCreatorApproval: true, directTriggers: false,
      cooldownSupport: 'deferred until CPH cooldown method signatures are live-confirmed',
    });
    expect(reviewedSource).toContain('Command administration operations require explicit creator approval.');
    expect(reviewedSource).toContain('CPH.EnableCommand(commandId)');
    expect(reviewedSource).toContain('CPH.DisableCommand(commandId)');
    expect(reviewedSource).not.toMatch(/CPH\.SetGlobalVar|CPH\.RunAction|Process\.Start|PowerShell|cmd\.exe/);

    // Both enable and disable were dispatched against a real, live Streamer.bot command and
    // confirmed to actually flip its enabled state - this must stay explicit and accurate, the
    // same discipline that kept it honestly marked "pending" before this was confirmed.
    expect(manifest.verificationStatus).toBe('confirmed live: enable and disable both verified against a real Streamer.bot v1.0.5-alpha.31 command');
  });
});
