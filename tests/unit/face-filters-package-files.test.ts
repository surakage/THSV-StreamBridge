import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { manifest as runtimeManifest } from '../../addons/face-filters/dist/index.js';

describe('Face Filters package files', () => {
  it('ships one triggerless broker action that guards the request and then runs Streamfog Activate Lens by Name', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/face-filters/manifest.json', 'utf8')) as { actions: Array<{ id: string; importFile: string }> };
    expect(manifest.actions).toHaveLength(1);
    expect(manifest.actions[0]).toMatchObject({ id: '5b0f3c2e-7a1d-4e8b-9c64-2f1a8d7e3b51', brokerDispatched: true, mustRemainTriggerless: true });
    const runtime = await readFile('addons/face-filters/dist/index.js', 'utf8');
    expect(runtime).toContain(`ACTIVATE_ACTION_ID = '${manifest.actions[0]?.id ?? ''}'`);
    const decoded = Buffer.from((await readFile(`packages/streamerbot/face-filters/${manifest.actions[0]?.importFile ?? ''}`, 'utf8')).trim(), 'base64');
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('SBAE');
    const exported = JSON.parse(gunzipSync(decoded.subarray(4)).toString('utf8')) as { data: { actions: Array<{ triggers: unknown[]; subActions: Array<Record<string, unknown>> }> } };
    const action = exported.data.actions[0];
    expect(action?.triggers).toEqual([]);
    expect(action?.subActions.map((step) => step['type'])).toEqual([99_999, 37_004]);
    expect(action?.subActions[1]).toMatchObject({ lensName: '%faceFilterLensName%', duration: '%faceFilterDuration%' });
    const guard = await readFile('packages/streamerbot/face-filters/src/ActivateLens.cs', 'utf8');
    expect(guard).toContain('thsvAddonRelayToken');
    expect(guard).toContain('seconds < 5 || seconds > 600');
  });

  it('keeps the descriptor manifest identical to the runtime manifest', async () => {
    const descriptor = JSON.parse(await readFile('addons/face-filters/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(JSON.parse(JSON.stringify(runtimeManifest)));
    expect([...descriptor.permissions].sort()).toEqual(['chat.send', 'events.subscribe', 'schedule.bounded', 'streamerbot.run-approved-action']);
  });
});
