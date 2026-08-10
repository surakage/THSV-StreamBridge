import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface ActionManifest {
  readonly name: string;
  readonly excludeFromHistory?: boolean;
  readonly excludeFromPending?: boolean;
}

async function actions(packageName: string): Promise<readonly ActionManifest[]> {
  const manifest = JSON.parse(await readFile(`packages/streamerbot/${packageName}/manifest.json`, 'utf8')) as { readonly action?: ActionManifest; readonly actions?: readonly ActionManifest[] };
  return manifest.actions ?? (manifest.action === undefined ? [] : [manifest.action]);
}

describe('background Streamer.bot action visibility', () => {
  it('hides only high-frequency internal workers while preserving creator and side-effect actions', async () => {
    const hidden = new Map<string, readonly string[]>([
      ['random-clip-player', ['THSV Addon - Random Clip Player - Get Clips', 'THSV Addon - Random Clip Player - Get Clip Download']],
      ['clip-library-cache', ['THSV Addon - Clip Library Cache - Refresh']],
      ['automated-shoutouts', ['THSV Addon - Automated Shoutouts - Lookup Twitch Creator']],
      ['user-translate', ['THSV Addon - Translate - Translate Text']],
      ['category-pilot', ['THSV Addon - Category Pilot - Process Probe']],
      ['follower-pulse', ['THSV Addon - Follower Pulse - Snapshot Page']],
      ['free-game-check', ['THSV Addon - Free Game Check - Refresh']],
    ]);
    for (const [packageName, names] of hidden) {
      const packageActions = await actions(packageName);
      for (const name of names) expect(packageActions.find((action) => action.name === name), name).toMatchObject({ excludeFromHistory: true, excludeFromPending: true });
    }

    const visible = [
      ...(await actions('random-clip-player')).filter((action) => / - (?:Enable|Disable)$/u.test(action.name)),
      ...(await actions('clip-courier')).filter((action) => action.name.endsWith(' - Deliver')),
      ...(await actions('automated-shoutouts')).filter((action) => action.name.endsWith(' - Twitch Native Shoutout')),
      ...(await actions('category-pilot')).filter((action) => / - (?:Apply|Dismiss) Suggestion$/u.test(action.name)),
      ...(await actions('follower-pulse')).filter((action) => action.name.endsWith(' - Reconcile Now')),
    ];
    expect(visible.length).toBeGreaterThan(0);
    for (const action of visible) {
      expect(action.excludeFromHistory ?? false, action.name).toBe(false);
      expect(action.excludeFromPending ?? false, action.name).toBe(false);
    }
  });
});
