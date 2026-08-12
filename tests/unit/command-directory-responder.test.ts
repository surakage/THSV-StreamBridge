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

    expect(route).not.toHaveBeenCalled();
  });

  it('fails closed to a retry message until publication supplies a public URL', async () => {
    const route = vi.fn().mockResolvedValue([{ platform: 'youtube', accepted: true, parts: 1 }]);
    const directory = { publicationStatus: () => ({ enabled: true, state: 'ready' }) };
    const responder = new CommandDirectoryResponder(directory as never, { route }, silentLogger);

    await responder.handle(command({ platform: 'youtube' }));

    expect(route).toHaveBeenCalledWith({
      message: 'The stream command page is not available yet. Please try again shortly.',
      routing: 'source', sourcePlatform: 'youtube', overflow: 'reject',
    });
  });
});
