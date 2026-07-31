import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const EXPECTED_GROUPS: Readonly<Record<string, string>> = Object.freeze({
  'random-clip-player': 'THSV Addon - Random Clip Player',
  'automated-shoutouts': 'THSV Addon - Automated Shoutouts',
  'user-translate': 'THSV Addon - Translate',
  'kofi-donations': 'THSV Addon - Ko-fi Donations',
  'subathon-timer': 'THSV Addon - Subathon Timer',
  'starting-soon-countdown': 'THSV Addon - Stream Launch Countdown',
  'scene-actions': 'THSV Addon - Scene Actions',
  'first-five': 'THSV Addon - First Five',
  'fan-crown': 'THSV Addon - Fan Crown',
  'raid-scout': 'THSV Addon - Raid Scout',
  'quote-vault': 'THSV Addon - Quote Vault',
  'discord-chat-archive': 'THSV Addon - Discord Chat Archive',
  'creator-controls': 'THSV Addon - Creator Controls',
  'category-pilot': 'THSV Addon - Category Pilot',
  'live-beacon': 'THSV Addon - Live Beacon',
  'clip-courier': 'THSV Addon - Clip Courier',
  'viewer-lobby': 'THSV Addon - Viewer Lobby',
  'voice-relay': 'THSV Addon - Voice Relay',
  'follower-pulse': 'THSV Addon - Follower Pulse',
  'chat-guard': 'THSV Addon - Chat Guard',
  'clip-library-cache': 'THSV Addon - Clip Library Cache',
  'viewer-spotlight': 'THSV Addon - Viewer Spotlight',
});

describe('Streamer.bot add-on groups', () => {
  it('places every action from each optional add-on in one dedicated human-readable group', async () => {
    const used = new Set<string>();
    for (const [folder, expectedGroup] of Object.entries(EXPECTED_GROUPS)) {
      const manifest = JSON.parse(await readFile(`packages/streamerbot/${folder}/manifest.json`, 'utf8')) as {
        action?: { group: string };
        actions?: Array<{ group: string }>;
      };
      const actions = manifest.actions ?? (manifest.action === undefined ? [] : [manifest.action]);
      expect(actions.length, folder).toBeGreaterThan(0);
      expect(new Set(actions.map((action) => action.group)), folder).toEqual(new Set([expectedGroup]));
      expect(used.has(expectedGroup), `${expectedGroup} must belong to only one add-on`).toBe(false);
      used.add(expectedGroup);
    }
  });
});
