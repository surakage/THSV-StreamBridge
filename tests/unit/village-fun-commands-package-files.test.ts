import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Village Fun Commands package', () => {
  it('registers commands automatically and keeps its helper triggerless in its own group', async () => {
    const descriptor = JSON.parse(await readFile('addons/village-fun-commands/module-package.json', 'utf8')) as { permissions: string[]; manifest: { commandsProvided: Array<{ id: string }>; installationSteps: string[] } };
    const manifest = JSON.parse(await readFile('packages/streamerbot/village-fun-commands/manifest.json', 'utf8')) as { actions: Array<{ group: string; excludeFromHistory: boolean; excludeFromPending: boolean }>; commands: unknown[]; manualTriggerSetup: unknown[] };
    expect(descriptor.manifest.commandsProvided.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      'village-fun.sloth-fact', 'village-fun.joke', 'village-fun.eight-ball', 'village-fun.hug', 'village-fun.hugs', 'village-fun.timezone',
    ]));
    expect(descriptor.permissions).toContain('schedule.bounded');
    expect(descriptor.manifest.installationSteps.join(' ')).toContain('do not create separate Streamer.bot Command objects');
    expect(manifest.commands).toEqual([]);
    expect(manifest.manualTriggerSetup).toEqual([]);
    expect(manifest.actions).toHaveLength(2);
    expect(manifest.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'THSV Addon - Village Fun Commands', excludeFromHistory: true, excludeFromPending: true }),
      expect.objectContaining({ group: 'THSV Addon - Village Fun Commands', excludeFromHistory: true, excludeFromPending: true }),
    ]));
  });

  it('uses only fixed HTTPS providers, bounded reads, short timeouts, and no viewer data', async () => {
    const source = await readFile('packages/streamerbot/village-fun-commands/src/FetchFunContent.cs', 'utf8');
    expect(source).toContain('https://catfact.ninja/fact');
    expect(source).toContain('https://v2.jokeapi.dev/joke/');
    expect(source).toContain('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
    expect(source).toContain('https://numbersapi.com/');
    expect(source).toContain('https://api.chucknorris.io/jokes/random');
    expect(source).toContain('request.AllowAutoRedirect = false');
    expect(source).toContain('request.Timeout = 3000');
    expect(source).toContain('MaximumResponseCharacters = 65536');
    expect(source).not.toMatch(/userId|userName|rawInput|messageText/u);
  });

  it('uses Streamer.bot-held Twitch credentials for a fixed, bounded follow-age lookup', async () => {
    const source = await readFile('packages/streamerbot/village-fun-commands/src/FetchFollowAge.cs', 'utf8');
    expect(source).toContain('https://api.twitch.tv/helix/channels/followers?broadcaster_id=');
    expect(source).toContain('CPH.TwitchOAuthToken');
    expect(source).toContain('CPH.TwitchClientId');
    expect(source).toContain('request.AllowAutoRedirect = false');
    expect(source).toContain('MaximumResponseCharacters = 65536');
    expect(source).not.toMatch(/LogInfo\(|LogVerbose\(|rawPayload|SetGlobalVar/u);
  });
});
