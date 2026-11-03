import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import localClock, { clockView, describeTime, manifest, settingsFor, validTimeZone } from '../../addons/local-clock/dist/index.js';

function runtime(settings: Record<string, unknown> = {}) {
  return {
    settings: { enabled: true, ...settings },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
  };
}

function chatCommand(platform: string, name: string) {
  return { eventId: `${platform}-${name}-${String(Math.random())}`, eventType: 'command.received', platform, user: { id: 'viewer-1', displayName: 'Sloth' }, metadata: { simulated: false }, payload: { command: name, arguments: [] } };
}

describe('Local Clock extension', () => {
  it('publishes the clock look once on start and hides it when switched off', async () => {
    const context = runtime({ clockStyle: 'analog', timeZone: 'America/Chicago', hourFormat: '24', label: 'My local time' });
    await localClock.start(context);
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.local-clock.clock.update', expect.objectContaining({ clockStyle: 'analog', timeZone: 'America/Chicago', hourFormat: '24', label: 'My local time' }), { lane: 'persistent' });
    const off = runtime({ enabled: false });
    await localClock.controlPanel({ operation: 'settings-changed' }, off);
    expect(off.overlay.publish).toHaveBeenCalledWith('thsv.local-clock.clock.hide', {}, { lane: 'persistent' });
    await localClock.stop();
  });

  it('falls back to safe values and to this PC time zone for unknown zones', () => {
    expect(validTimeZone('Europe/London')).toBe('Europe/London');
    expect(validTimeZone('Mars/Olympus')).toBe('');
    const settings = settingsFor(runtime({ clockStyle: 'sundial', hourFormat: '13', textColor: 'red', timeZone: 'nowhere' }));
    expect(clockView(settings)).toMatchObject({ clockStyle: 'text', hourFormat: '12', timeZone: '', style: { textColor: '#ffffff' } });
  });

  it('describes the time in the chosen zone for the chat reply', () => {
    const settings = settingsFor(runtime({ timeZone: 'Asia/Tokyo', hourFormat: '24' }));
    const result = describeTime(settings, new Date('2025-10-19T01:44:01Z'));
    expect(result.time).toBe('10:44');
    expect(result.date).toBe('Sunday, October 19');
  });

  it('answers the optional time command in the chat it came from, with a cooldown', async () => {
    const context = runtime({ command: '!time', commandMessage: 'It is {time} on {date}.' });
    await localClock.start(context);
    await localClock.onEvent(chatCommand('twitch', 'time'), context);
    await localClock.onEvent(chatCommand('twitch', 'time'), context);
    expect(context.chat.send).toHaveBeenCalledTimes(1);
    expect(context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ routing: 'source', sourcePlatform: 'twitch', message: expect.stringMatching(/^It is .+ on .+\.$/u) }));
    await localClock.onEvent(chatCommand('youtube', 'other'), context);
    expect(context.chat.send).toHaveBeenCalledTimes(1);
    await localClock.stop();
  });

  it('ships a package manifest that matches the runtime manifest', async () => {
    const descriptor = JSON.parse(await readFile('addons/local-clock/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(manifest);
    expect(descriptor.permissions).toEqual(['events.subscribe', 'chat.send', 'overlay.publish']);
  });
});
