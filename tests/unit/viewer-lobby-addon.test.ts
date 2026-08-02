import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerLobby, { projection, stateFor } from '../../addons/viewer-lobby/dist/index.js';
describe('Viewer Lobby', () => {
  it('keeps stable identities private in the public projection', () => { const state = stateFor({ status: 'open', revision: 2, entries: [{ entryId: 'e1', identity: 'twitch:id:42', platform: 'twitch', displayName: 'Alex', gamertag: 'private-tag', joinedAt: 'x', state: 'waiting' }] }); const value = projection(state, { showGamertags: false }); expect(value.entries[0]).toEqual(expect.objectContaining({ displayName: 'Alex', position: 1 })); expect(JSON.stringify(value)).not.toContain('twitch:id:42'); expect(JSON.stringify(value)).not.toContain('private-tag'); });

  it('ignores simulated creator controls and removes departed viewers instead of retaining terminal entries', async () => {
    let state: Record<string, unknown> = { status: 'open', revision: 1, entries: [{ entryId: 'e1', identity: 'twitch:id:42', platform: 'twitch', displayName: 'Alex', gamertag: '', joinedAt: '2026-08-01T00:00:00.000Z', state: 'waiting' }] };
    const context = { settings: { enabled: true, platforms: ['twitch'] }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, overlay: { publish: vi.fn(async () => {}) }, chat: { send: vi.fn(async () => []) } };
    await viewerLobby.start(context);
    await viewerLobby.onEvent({ eventType: 'addon.thsv.viewer-lobby.control', receivedAt: '2026-08-01T00:00:01.000Z', metadata: { simulated: true }, payload: { action: 'clear' } }, context);
    expect((state.entries as unknown[])).toHaveLength(1);
    await viewerLobby.onEvent({ eventId: 'leave-1', eventType: 'chat.message', platform: 'twitch', receivedAt: '2026-08-01T00:00:02.000Z', metadata: { simulated: false }, user: { id: '42', name: 'alex', displayName: 'Alex', actorType: 'human', roles: [] }, payload: { message: '!leave' } }, context);
    expect((state.entries as unknown[])).toHaveLength(0);
    await viewerLobby.stop();
  });

  it('ignores simulated chat and closes only after every live platform is offline', async () => {
    let state: Record<string, unknown> = { status: 'open', revision: 1, entries: [] };
    const context = { settings: { enabled: true, platforms: ['twitch', 'youtube'] }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, overlay: { publish: vi.fn(async () => {}) }, chat: { send: vi.fn(async () => []) } };
    const chat = { eventId: 'join-1', eventType: 'chat.message', platform: 'twitch', receivedAt: '2026-08-01T00:00:00.000Z', user: { id: '42', name: 'alex', displayName: 'Alex', actorType: 'human', roles: [] }, payload: { message: '!join' } };
    await viewerLobby.start(context);
    await viewerLobby.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, context);
    await viewerLobby.onEvent({ eventType: 'stream.online', platform: 'youtube', metadata: { simulated: false } }, context);
    await viewerLobby.onEvent({ ...chat, metadata: { simulated: true } }, context);
    expect((state.entries as unknown[])).toHaveLength(0);
    await viewerLobby.onEvent({ eventType: 'stream.offline', platform: 'twitch', receivedAt: '2026-08-01T00:00:01.000Z', metadata: { simulated: false } }, context);
    expect(state.status).toBe('open');
    await viewerLobby.onEvent({ eventType: 'stream.offline', platform: 'youtube', receivedAt: '2026-08-01T00:00:02.000Z', metadata: { simulated: false } }, context);
    expect(state.status).toBe('closed');
    await viewerLobby.stop();
  });

  it('sanitizes corrupt restored entries and duplicate private identities', () => {
    const state = stateFor({ revision: -5, selectedEntryId: 'missing', entries: [
      { entryId: 'one', identity: 'twitch:id:42', platform: 'twitch', displayName: 'Alex', gamertag: 'tag', joinedAt: 'now', state: 'waiting' },
      { entryId: 'two', identity: 'twitch:id:42', platform: 'twitch', displayName: 'Duplicate', gamertag: '', joinedAt: 'now', state: 'waiting' },
      { entryId: 'bad', identity: 'youtube:id:7', platform: 'twitch', displayName: 'Bad', state: 'waiting' },
    ], audit: [{ action: 'open', at: 'now' }, { action: '<script>', at: 'now' }] });
    expect(state.revision).toBe(0);
    expect(state.selectedEntryId).toBe('');
    expect(state.entries).toHaveLength(1);
    expect(state.audit).toEqual([{ action: 'open', at: 'now' }]);
  });

  it('keeps queue state when optional chat and overlay outputs fail', async () => {
    let state: Record<string, unknown> = { status: 'open', revision: 0, entries: [] };
    const context = { settings: { enabled: true, platforms: ['twitch'] }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, overlay: { publish: vi.fn(async () => { throw new Error('closed'); }) }, chat: { send: vi.fn(async () => { throw new Error('offline'); }) } };
    await expect(viewerLobby.start(context)).resolves.toBeUndefined();
    await viewerLobby.onEvent({ eventId: 'join-safe', eventType: 'chat.message', platform: 'twitch', receivedAt: '2026-08-01T00:00:00.000Z', metadata: { simulated: false }, user: { id: '42', name: 'alex', displayName: 'Alex', actorType: 'human', roles: [] }, payload: { message: '!join' } }, context);
    expect((state.entries as unknown[])).toHaveLength(1);
    await viewerLobby.stop();
  });
});
