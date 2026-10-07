import { describe, expect, it, vi } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import { CommandDirectoryResponder } from '../../bridge/services/command-directory-responder.js';
import { silentLogger } from '../helpers.js';

function command(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'command-directory-1', eventType: 'command.received', platform: 'twitch',
    source: { adapter: 'fixture', eventId: 'command-directory-1', eventName: 'NormalizedCommand' },
    receivedAt: new Date().toISOString(), channel: { name: 'channel' },
    user: { id: 'viewer-1', name: 'viewer', actorType: 'human', roles: [] },
    payload: { command: 'commands', targetModuleId: 'core.command-directory' }, metadata: { simulated: false },
    ...overrides,
  };
}

describe('CommandDirectoryResponder', () => {
  it('shares the published viewer-safe page on the invoking platform', async () => {
    const route = vi.fn().mockResolvedValue([{ platform: 'twitch', accepted: true, parts: 1 }]);
    const directory = { publicationStatus: () => ({ enabled: true, state: 'published', publicUrl: 'https://example.test/commands/creator' }) };
    const responder = new CommandDirectoryResponder(directory as never, { route }, silentLogger);

    await responder.handle(command());

    expect(route).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Stream commands: https://example.test/commands/creator', routing: 'source', sourcePlatform: 'twitch',
    }));
  });

  it('ignores similarly named creator commands and unsupported platforms', async () => {
    const route = vi.fn();
    const directory = { publicationStatus: () => ({ enabled: true, state: 'published', publicUrl: 'https://example.test/commands/creator' }) };
    const responder = new CommandDirectoryResponder(directory as never, { route }, silentLogger);

    await responder.handle(command({ payload: { command: 'commands', targetModuleId: 'core.creator-configuration' } }));
    await responder.handle(command({ platform: 'system' }));
    await responder.handle(command({ metadata: { simulated: true } }));

    expect(route).not.toHaveBeenCalled();
  });

  it('lists only commands supported on the invoking platform when publishing is off', async () => {
    const route = vi.fn().mockResolvedValue([{ platform: 'youtube', accepted: true, parts: 1 }]);
    const directory = {
      publicationStatus: () => ({ enabled: false, state: 'disabled' }),
      catalogue: () => ({ prefix: '!', categories: [{ commands: [
        { command: 'lurk', platforms: ['youtube', 'tiktok'] },
        { command: 'discord', platforms: ['twitch'] },
        { command: 'points', platforms: ['youtube', 'tiktok'] },
      ] }] }),
    };
    const responder = new CommandDirectoryResponder(directory as never, { route }, silentLogger);

    await responder.handle(command({ platform: 'youtube' }));

    expect(route).toHaveBeenCalledWith({
      message: 'Commands: !lurk, !points',
      routing: 'source', sourcePlatform: 'youtube', overflow: 'reject',
    });
  });

  it('bounds a long inline directory to TikTok\'s output limit', async () => {
    const route = vi.fn().mockResolvedValue([{ platform: 'tiktok', accepted: true, parts: 1 }]);
    const directory = {
      publicationStatus: () => ({ enabled: false, state: 'disabled' }),
      catalogue: () => ({ prefix: '!', categories: [{ commands: Array.from({ length: 50 }, (_, index) => ({ command: `command-${String(index)}`, platforms: ['tiktok'] })) }] }),
    };
    await new CommandDirectoryResponder(directory as never, { route }, silentLogger).handle(command({ platform: 'tiktok' }));
    expect(route).toHaveBeenCalledOnce();
    const request = route.mock.calls[0]?.[0] as { message: string };
    expect(Array.from(request.message).length).toBeLessThanOrEqual(150);
    expect(request.message).toMatch(/…$/u);
  });
});
