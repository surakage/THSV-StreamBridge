import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Chat Play Pack Streamer.bot package', () => {
  it('ships twenty editable Trivia and Unscramble fallback entries', async () => {
    const schema = JSON.parse(await readFile('addons/chat-play-pack/schemas/config.json', 'utf8')) as { properties: { triviaQuestions: { default: string[] }; unscrambleWords: { default: string[] } } };
    expect(schema.properties.triviaQuestions.default).toHaveLength(20);
    expect(schema.properties.unscrambleWords.default).toHaveLength(20);
    expect(schema.properties.triviaQuestions.default.every((entry) => entry.includes('|'))).toBe(true);
    expect(schema.properties.unscrambleWords.default.every((entry) => entry.includes('|'))).toBe(true);
  });

  it('fetches only bounded OpenTDB question data and relays it through the owned namespace', async () => {
    const source = await readFile('packages/streamerbot/chat-play-pack/src/FetchTriviaQuestions.cs', 'utf8');
    expect(source).toContain('https://opentdb.com/api.php?amount=');
    expect(source).toContain('MaximumResponseCharacters = 262144');
    expect(source).toContain('request.Timeout = timeoutSeconds * 1000');
    expect(source).toContain('addon.thsv.chat-play-pack.trivia-received');
    expect(source).toContain('thsvAddonRelayToken');
    expect(source).not.toContain('ReadToEnd()');
    expect(source).not.toMatch(/Process\.Start|powershell|cmd\.exe/iu);
    expect(source).not.toMatch(/viewerId|displayName|chatMessage|pointBalance/u);
  });

  it('pins two triggerless broker actions while Bridge owns the command set', async () => {
    const manifest = JSON.parse(await readFile('packages/streamerbot/chat-play-pack/manifest.json', 'utf8')) as { actions: Array<{ id: string; references: string[]; excludeFromHistory: boolean; triggers?: unknown[] }>; commands: Array<{ name: string; command: string; enabled: boolean; sources: number }>; manualTriggerSetup: unknown[] };
    expect(manifest.actions).toHaveLength(2);
    expect(manifest.actions[0]?.id).toBe('d72d0873-8cbd-4dd5-a171-6b7122cd125e');
    expect(manifest.actions[1]?.id).toBe('08cf5035-09ce-45b7-bef5-c5f7081d17f6');
    for (const action of manifest.actions) { expect(action.excludeFromHistory).toBe(true); expect(action.triggers).toBeUndefined(); expect(action.references).not.toContain('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Net.Http.dll'); }
    expect(manifest.commands).toEqual([]);
    expect(manifest.manualTriggerSetup).toEqual([]);
  });

  it('bounds dictionary word fetching and never sends viewer or chat data', async () => {
    const source = await readFile('packages/streamerbot/chat-play-pack/src/FetchUnscrambleWords.cs', 'utf8');
    expect(source).toContain('https://random-word-api.herokuapp.com/word?number=');
    expect(source).toContain('https://api.dictionaryapi.dev/api/v2/entries/en/');
    expect(source).toContain('OverallTimeoutSeconds = 15');
    expect(source).toContain('MaximumResponseCharacters = 262144');
    expect(source).toContain('addon.thsv.chat-play-pack.unscramble-received');
    expect(source).toContain('thsvAddonRelayToken');
    expect(source).not.toContain('ReadToEnd()');
    expect(source).not.toMatch(/Process\.Start|powershell|cmd\.exe/iu);
    expect(source).not.toMatch(/viewerId|displayName|chatMessage|pointBalance/u);
  });
});
