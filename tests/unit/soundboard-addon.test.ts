import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import soundboard, { chatCommand, manifest, mayUse, parseSound, resolveRequest, settingsFor, soundUrl } from '../../addons/soundboard/dist/index.js';

const HORN = `/overlay/assets/${'a'.repeat(64)}.mp3`;
const CLAP = `/overlay/assets/${'b'.repeat(64)}.ogg`;

function runtime(settings: Record<string, unknown> = {}) {
  return {
    settings: { enabled: true, sounds: [`Airhorn | ${HORN} | 50 | airhorn | tw-horn | kick-horn`, `Clap | ${CLAP} | | clap | |`], ...settings },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
  };
}

function chat(message: string, platform = 'youtube', userId = 'viewer-1', roles: string[] = []) {
  return { eventId: `chat-${String(Math.random())}`, eventType: 'chat.message', platform, user: { id: userId, displayName: 'Sloth', actorType: 'human', roles }, metadata: { simulated: false }, payload: { message } };
}

function redemption(platform: string, rewardId: string) {
  return { eventId: `r-${String(Math.random())}`, eventType: 'reward.redemption', platform, user: { id: 'viewer-1', displayName: 'Sloth' }, metadata: { simulated: false }, payload: { rewardId, verifiedTransport: true } };
}

describe('Soundboard extension', () => {
  it('ships empty and off', () => {
    const settings = settingsFor({ settings: {} });
    expect(settings.enabled).toBe(false);
    expect(settings.sounds).toEqual([]);
  });

  it('accepts only sounds added in the Wizard or https links', () => {
    expect(soundUrl(HORN)).toBe(HORN);
    expect(soundUrl('https://example.com/horn.mp3')).toBe('https://example.com/horn.mp3');
    expect(soundUrl('http://example.com/horn.mp3')).toBe('');
    expect(soundUrl('/overlay/assets/../../secret.mp3')).toBe('');
    expect(soundUrl('C:\\sounds\\horn.mp3')).toBe('');
    expect(parseSound('No file | | 50 | nofile | |', 0)).toBeUndefined();
    expect(parseSound(`Horn | ${HORN} | 250 | !AirHorn | |`, 2)).toMatchObject({ id: 'sound-3', volume: 100, command: 'airhorn' });
  });

  it('plays a sound from a chat command on the sound page with the combined volume', async () => {
    const context = runtime({ volume: 80 }); await soundboard.start();
    await soundboard.onEvent(chat('!airhorn please'), context);
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.soundboard.sound.play', expect.objectContaining({ url: HORN, volume: 0.4, overlap: true }), { lane: 'independent' });
    await soundboard.stop();
  });

  it('matches rewards per platform, and a points reward by its linked Twitch reward', () => {
    const settings = settingsFor(runtime());
    expect(resolveRequest(redemption('kick', 'kick-horn'), settings)?.sound.name).toBe('Airhorn');
    expect(resolveRequest(redemption('kick', 'tw-horn'), settings)).toBeUndefined();
    expect(resolveRequest({ ...redemption('youtube', 'tw-horn'), payload: { rewardId: 'tw-horn', verifiedTransport: true, pointsReward: true } }, settings)?.paid).toBe(true);
    expect(resolveRequest({ ...redemption('twitch', 'tw-horn'), payload: { rewardId: 'tw-horn' } }, settings)).toBeUndefined();
  });

  it('applies cooldowns to chat but not to rewards or moderators', async () => {
    const context = runtime({ globalCooldownSeconds: 0, viewerCooldownSeconds: 60, cooldownMessage: '{viewer} wait {seconds}s' }); await soundboard.start();
    await soundboard.onEvent(chat('!clap'), context);
    await soundboard.onEvent(chat('!clap'), context);
    expect(context.overlay.publish).toHaveBeenCalledTimes(1);
    expect(context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Sloth wait 60s', sourcePlatform: 'youtube' }));
    await soundboard.onEvent(redemption('twitch', 'tw-horn'), context);
    await soundboard.onEvent(chat('!clap', 'twitch', 'mod-1', ['moderator']), context);
    expect(context.overlay.publish).toHaveBeenCalledTimes(3);
    await soundboard.stop();
  });

  it('limits chat sounds to the chosen viewers and platforms, and ignores bots', () => {
    expect(mayUse(chat('!x'), 'moderators')).toBe(false);
    expect(mayUse(chat('!x', 'twitch', 'v', ['vip']), 'vips')).toBe(true);
    expect(mayUse(chat('!x', 'twitch', 'v', ['subscriber']), 'subscribers')).toBe(true);
    expect(mayUse(chat('!x', 'twitch', 'v', ['broadcaster']), 'moderators')).toBe(true);
    const settings = settingsFor(runtime({ commandPlatforms: ['twitch'] }));
    expect(resolveRequest(chat('!clap', 'youtube'), settings)).toBeUndefined();
    expect(resolveRequest({ ...chat('!clap', 'twitch'), user: { id: 'bot', actorType: 'bot' } }, settings)).toBeUndefined();
    expect(chatCommand(chat('hello !clap'))).toBe('');
  });

  it('lists sound commands and lets only moderators stop the sounds', async () => {
    const context = runtime({ listCommand: 'sounds', stopCommand: 'stopsounds' }); await soundboard.start();
    await soundboard.onEvent(chat('!sounds'), context);
    expect(context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: '🔊 Sounds: !airhorn !clap' }));
    await soundboard.onEvent(chat('!stopsounds'), context);
    expect(context.overlay.publish).not.toHaveBeenCalled();
    await soundboard.onEvent(chat('!stopsounds', 'twitch', 'm', ['moderator']), context);
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.soundboard.sound.stop', {}, { lane: 'independent' });
    await soundboard.stop();
  });

  it('gives every sound a Control Panel button that plays it', async () => {
    const context = runtime(); await soundboard.start();
    const status = await soundboard.controlPanel({ operation: 'status' }, context);
    expect(status.actions.map((action: { action: string }) => action.action)).toEqual(['play-1', 'play-2', 'stop']);
    const played = await soundboard.controlPanel({ operation: 'action', action: 'play-2' }, context);
    expect(played.message).toBe('Playing Clap.');
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.soundboard.sound.play', expect.objectContaining({ url: CLAP }), { lane: 'independent' });
    await expect(soundboard.controlPanel({ operation: 'action', action: 'play-9' }, context)).rejects.toThrow('no longer');
    await soundboard.stop();
  });

  it('keeps its descriptor and manifest in step', async () => {
    const descriptor = JSON.parse(await readFile('addons/soundboard/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(manifest);
    expect(descriptor.permissions).toEqual(['events.subscribe', 'chat.send', 'overlay.publish']);
  });
});
