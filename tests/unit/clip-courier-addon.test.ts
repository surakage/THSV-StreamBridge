import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import clipCourier, { validClip, withinObservedStream } from '../../addons/clip-courier/dist/index.js';
// @ts-expect-error add-on migrations are intentionally plain JavaScript
import { migrate } from '../../addons/clip-courier/migrations/001-current-stream-only.mjs';

describe('Clip Courier', () => {
  it('routes the intake-owned Twitch clip command to the approved create helper once', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: Array<{ id: string; arguments: Record<string, unknown> }> = [];
    const context = {
      settings: { enabled: true },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      streamerbot: { runApprovedAction: async (id: string, arguments_: Record<string, unknown>) => { calls.push({ id, arguments: arguments_ }); } },
    };
    await clipCourier.onEvent({ eventType: 'command.received', platform: 'twitch', metadata: { simulated: false }, user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer', actorType: 'human' }, payload: { command: 'clip' } }, context);
    expect(calls).toEqual([{ id: '6cd2c22e-631c-4b78-91bd-c67169ce989b', arguments: { commandSource: 'twitch', userId: 'viewer-1', userName: 'Viewer' } }]);
  });

  it('migrates 2.5.0 scan settings to the current-stream-only model', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'clip-courier-migration-'));
    await writeFile(join(storageRoot, 'settings.json'), JSON.stringify({ enabled: true, scanMinutes: 15, clipCount: 20, publishExistingOnFirstScan: false, messageTemplate: 'A â€” B' }));
    await migrate({ storageRoot, fromVersion: '2.5.0', toVersion: '2.5.1', moduleId: 'thsv.clip-courier' });
    const settings = JSON.parse(await readFile(join(storageRoot, 'settings.json'), 'utf8')) as Record<string, unknown>;
    expect(settings).toEqual({ enabled: true, automaticCurrentStreamClips: false, messageTemplate: 'A — B' });
  });

  it('accepts stable Twitch clips and rejects arbitrary URLs', () => {
    expect(validClip({ id: 'Clip_123', url: 'https://clips.twitch.tv/Clip_123', title: 'Nice', creatorName: 'Alex', createdAt: '2026-07-30T01:00:00.000Z' })?.id).toBe('Clip_123');
    expect(validClip({ id: 'Clip_123', url: 'https://evil.example/clip' })).toBeUndefined();
  });

  it('publishes a command-created clip immediately without scanning the clip library', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: Array<{ id: string; arguments: Record<string, unknown> }> = [];
    const context = {
      settings: { enabled: true, destinationMode: 'channel', maximumHistory: 300, messageTemplate: '{title} - clipped by {creator}\n{url}' },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      streamerbot: { runApprovedAction: async (id: string, arguments_: Record<string, unknown>) => { calls.push({ id, arguments: arguments_ }); } },
    };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-courier.clip-created', receivedAt: '2026-07-30T01:00:01.000Z', metadata: { simulated: false }, payload: { id: 'CommandClip', url: 'https://clips.twitch.tv/CommandClip', title: 'Viewer clip', creatorName: 'HelpfulViewer', createdAt: '2026-07-30T01:00:00.000Z', durationSeconds: 30, source: 'command' } }, context);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: 'd4c4d0c6-5466-4a30-b437-7fd582f69038', arguments: { clipCourierMessage: expect.stringContaining('HelpfulViewer') as string } });
    expect(JSON.stringify(calls)).not.toContain('Get Clips');
  });

  it('accepts automatic clips only inside the observed Twitch stream window', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: Array<{ id: string; arguments: Record<string, unknown> }> = [];
    const context = {
      settings: { enabled: true, automaticCurrentStreamClips: true, destinationMode: 'channel', maximumHistory: 300 },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      streamerbot: { runApprovedAction: async (id: string, arguments_: Record<string, unknown>) => { calls.push({ id, arguments: arguments_ }); } },
    };
    await clipCourier.onEvent({ eventType: 'stream.online', platform: 'twitch', receivedAt: '2026-07-30T02:00:00.000Z', metadata: { simulated: false }, payload: { streamId: 'stream-1', startedAt: '2026-07-30T01:55:00.000Z' } }, context);
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-library-cache.snapshot', receivedAt: '2026-07-30T02:10:00.000Z', metadata: { simulated: false }, payload: { clips: [
      { id: 'OldClip', url: 'https://clips.twitch.tv/OldClip', title: 'Old', creatorName: 'Viewer', createdAt: '2026-07-29T20:00:00.000Z' },
      { id: 'CurrentClip', url: 'https://clips.twitch.tv/CurrentClip', title: 'Current', creatorName: 'Viewer', createdAt: '2026-07-30T02:05:00.000Z' },
    ] } }, context);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.arguments['clipCourierMessage']).toContain('Current');
    expect(calls[0]?.arguments['clipCourierMessage']).not.toContain('Old');
    expect(withinObservedStream(validClip({ id: 'OldClip', url: 'https://clips.twitch.tv/OldClip', createdAt: '2026-07-29T20:00:00.000Z' }), (stored['stream'] as object))).toBe(false);
  });

  it('fails closed when no Twitch stream boundary was observed', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [] };
    const calls: unknown[] = [];
    const context = {
      settings: { enabled: true, automaticCurrentStreamClips: true },
      state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } },
      streamerbot: { runApprovedAction: async (...arguments_: unknown[]) => { calls.push(arguments_); } },
    };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-library-cache.snapshot', receivedAt: '2026-07-30T02:10:00.000Z', metadata: { simulated: false }, payload: { clips: [{ id: 'UnknownSession', url: 'https://clips.twitch.tv/UnknownSession', createdAt: '2026-07-30T02:05:00.000Z' }] } }, context);
    expect(calls).toHaveLength(0);
  });

  it('stores confirmed Discord identities without retaining the webhook', async () => {
    let stored: Record<string, unknown> = { published: [], queue: [], pending: { requestId: 'clip-request-1', clipId: 'Clip_123', clip: { id: 'Clip_123', url: 'https://clips.twitch.tv/Clip_123', title: 'Clip', creator: 'Viewer', source: 'command' } } };
    const context = { settings: { enabled: true, destinationMode: 'forum', maximumHistory: 300 }, state: { read: async () => stored, write: async (value: Record<string, unknown>) => { stored = value; } }, streamerbot: { runApprovedAction: async () => undefined } };
    await clipCourier.onEvent({ eventType: 'addon.thsv.clip-courier.delivery-result', receivedAt: '2026-07-27T12:00:00.000Z', payload: { requestId: 'clip-request-1', success: true, messageId: '123456789', threadId: '987654321' } }, context);
    expect(stored['published']).toEqual([expect.objectContaining({ clipId: 'Clip_123', messageId: '123456789', threadId: '987654321' })]);
    expect(JSON.stringify(stored)).not.toContain('webhook');
  });
});
