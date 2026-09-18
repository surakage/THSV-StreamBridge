import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { VoiceRelayHandoffService } from '../../bridge/services/voice-relay-handoff-service.js';
import { assertSecureVoiceRelayArguments, VOICE_RELAY_SPEAK_ACTION_ID } from '../../bridge/contracts/voice-relay-handoff.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function dataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-voice-handoff-')); roots.push(root); return root;
}

describe('VoiceRelayHandoffService', () => {
  it('replaces speech with a one-use opaque filename and cleans it up', async () => {
    const root = await dataRoot(); const service = new VoiceRelayHandoffService(root);
    const prepared = await service.prepare('thsv.voice-relay', VOICE_RELAY_SPEAK_ACTION_ID, { voiceRelayMessage: 'Private spoken phrase', voiceRelayVoiceAlias: 'THSV Male' });
    expect(prepared.argumentsValue).not.toHaveProperty('voiceRelayMessage');
    expect(prepared.argumentsValue).toMatchObject({ voiceRelayVoiceAlias: 'THSV Male' });
    expect(prepared.argumentsValue).toHaveProperty('voiceRelayHandoffRoot', join(root, 'runtime', 'voice-relay-inbox'));
    const filenameValue = prepared.argumentsValue['voiceRelayMessageHandoff'];
    expect(typeof filenameValue).toBe('string');
    const filename = typeof filenameValue === 'string' ? filenameValue : '';
    expect(filename).toMatch(/^voice-[0-9a-f-]{36}\.txt$/u);
    const path = join(root, 'runtime', 'voice-relay-inbox', filename);
    await expect(readFile(path, 'utf8')).resolves.toBe('Private spoken phrase');
    await prepared.dispose(false);
    await expect(readFile(path, 'utf8')).rejects.toThrow();
  });

  it('leaves unrelated add-on actions unchanged', async () => {
    const root = await dataRoot(); const service = new VoiceRelayHandoffService(root); const input = { voiceRelayMessage: 'not routed here' };
    const prepared = await service.prepare('sample.other', VOICE_RELAY_SPEAK_ACTION_ID, input);
    expect(prepared.argumentsValue).toBe(input);
    await expect(readdir(join(root, 'runtime', 'voice-relay-inbox'))).rejects.toThrow();
  });

  it('drops unexpected representations and the final boundary rejects plaintext', async () => {
    const root = await dataRoot(); const service = new VoiceRelayHandoffService(root);
    const prepared = await service.prepare('thsv.voice-relay', VOICE_RELAY_SPEAK_ACTION_ID, { voiceRelayMessage: 'Private phrase', voiceRelayVoiceAlias: 'THSV Male', nested: { voiceRelayMessage: 'copy' }, VoiceRelayMessage: 'case copy' });
    expect(Object.keys(prepared.argumentsValue).sort()).toEqual(['voiceRelayHandoffRoot', 'voiceRelayMessageHandoff', 'voiceRelayVoiceAlias']);
    expect(() => assertSecureVoiceRelayArguments(VOICE_RELAY_SPEAK_ACTION_ID, { ...prepared.argumentsValue, thsvAddonRelayToken: 'a'.repeat(20) })).not.toThrow();
    expect(() => assertSecureVoiceRelayArguments(VOICE_RELAY_SPEAK_ACTION_ID, { ...prepared.argumentsValue, voiceRelayMessage: 'leak', thsvAddonRelayToken: 'a'.repeat(20) })).toThrow('unexpected or plaintext');
    expect(() => assertSecureVoiceRelayArguments(VOICE_RELAY_SPEAK_ACTION_ID, { ...prepared.argumentsValue, nested: { text: 'leak' }, thsvAddonRelayToken: 'a'.repeat(20) })).toThrow('unexpected or plaintext');
    await prepared.dispose(false);
  });

  it('does not persist speech in test mode and retains accepted handoffs until the consumer or shutdown removes them', async () => {
    const root = await dataRoot(); const service = new VoiceRelayHandoffService(root);
    const dryRun = await service.prepare('thsv.voice-relay', VOICE_RELAY_SPEAK_ACTION_ID, { voiceRelayMessage: 'dry run phrase', voiceRelayVoiceAlias: 'THSV Male' }, true);
    await dryRun.dispose(true);
    await expect(readdir(join(root, 'runtime', 'voice-relay-inbox'))).rejects.toThrow();
    const accepted = await service.prepare('thsv.voice-relay', VOICE_RELAY_SPEAK_ACTION_ID, { voiceRelayMessage: 'queued phrase', voiceRelayVoiceAlias: 'THSV Male' });
    const filename = accepted.argumentsValue['voiceRelayMessageHandoff'];
    expect(typeof filename).toBe('string');
    const path = join(root, 'runtime', 'voice-relay-inbox', typeof filename === 'string' ? filename : '');
    await accepted.dispose(true);
    await expect(readFile(path, 'utf8')).resolves.toBe('queued phrase');
    await service.stop();
    await expect(readFile(path, 'utf8')).rejects.toThrow();
  });

  it('rejects invalid phrases and removes stale handoffs without touching other files', async () => {
    const root = await dataRoot(); const inbox = join(root, 'runtime', 'voice-relay-inbox'); await mkdir(inbox, { recursive: true });
    const stale = join(inbox, 'voice-11111111-1111-4111-8111-111111111111.txt'); const unrelated = join(inbox, 'keep.json');
    await writeFile(stale, 'stale'); await writeFile(unrelated, 'keep'); await utimes(stale, new Date(0), new Date(0));
    const service = new VoiceRelayHandoffService(root, () => 600_001);
    await service.start();
    expect(await readdir(inbox)).not.toContain('voice-11111111-1111-4111-8111-111111111111.txt');
    await expect(service.prepare('thsv.voice-relay', VOICE_RELAY_SPEAK_ACTION_ID, { voiceRelayMessage: ' ' })).rejects.toThrow('non-empty');
    const prepared = await service.prepare('thsv.voice-relay', VOICE_RELAY_SPEAK_ACTION_ID, { voiceRelayMessage: 'fresh', voiceRelayVoiceAlias: 'THSV Male' });
    await expect(readFile(unrelated, 'utf8')).resolves.toBe('keep'); await prepared.dispose(false); await service.stop();
  });
});
