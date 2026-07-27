import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import communityAnalytics from '../../addons/community-analytics/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerFoundation from '../../addons/viewer-foundation/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerSpotlight from '../../addons/viewer-spotlight/dist/index.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { createBuiltinModules } from '../../bridge/core/builtin-modules.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('Viewer Spotlight integration', () => {
  it('publishes a bounded card through both privacy-preserving providers without persisting presentation identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-viewer-spotlight-')); temporary.push(root);
    const published: Array<{ moduleId: string; topic: string; payload: Readonly<Record<string, unknown>> }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, root, { publishOverlay: async (moduleId, topic, payload) => { published.push({ moduleId, topic, payload }); } });
    const foundation = { ...viewerFoundation, settings: { enabled: true, accountLinks: ['alex|twitch|123456'], chatCooldownSeconds: 0 }, capabilityGrant: { moduleId: 'thsv.viewer-foundation', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.provide'] as const, approvedActionIds: [] } };
    const analytics = { ...communityAnalytics, settings: { enabled: true }, capabilityGrant: { moduleId: 'thsv.community-analytics', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.read', 'community.analytics.provide'] as const, approvedActionIds: [] } };
    const spotlight = { ...viewerSpotlight, settings: { enabled: true, disclosureAccepted: true, commandName: 'card', showObservedCommands: true }, capabilityGrant: { moduleId: 'thsv.viewer-spotlight', permissions: ['events.subscribe', 'state.private', 'overlay.publish', 'schedule.bounded', 'viewer.foundation.read', 'community.analytics.read'] as const, approvedActionIds: [] } };
    const registry = new ModuleRegistry([spotlight, analytics, foundation], silentLogger, 5_000, broker); await registry.start();
    const command: NormalizedEvent = { schemaVersion: '1.0.0', eventId: 'card-one', eventType: 'command.received', platform: 'twitch', source: { adapter: 'fixture', eventId: 'card-one', eventName: 'Command' }, receivedAt: '2026-07-26T12:00:00.000Z', channel: { name: 'channel' }, user: { id: '123456', name: 'alex_login', displayName: 'Alex Display', avatarUrl: 'https://example.com/alex.png', actorType: 'human', roles: [] }, payload: { command: 'card', arguments: [] }, metadata: { simulated: false } };
    await registry.publish(command);
    expect(published).toEqual([{ moduleId: 'thsv.viewer-spotlight', topic: 'thsv.viewer-spotlight.card.show', payload: expect.objectContaining({ title: 'Alex Display • Twitch', text: '0 points • Level 1 • 1 observed commands', imageUrl: 'https://example.com/alex.png' }) }]);
    const spotlightState = await readFile(join(root, 'thsv.viewer-spotlight', 'runtime-state.json'), 'utf8');
    expect(spotlightState).toContain('alex'); expect(spotlightState).not.toContain('Alex Display'); expect(spotlightState).not.toContain('123456'); expect(spotlightState).not.toContain('alex.png');
    await expect(registry.administerViewerSpotlight({ operation: 'status' })).resolves.toMatchObject({ enabled: true, activeCard: true, cardsThisSession: 1 });
    await expect(registry.administerViewerSpotlight({ operation: 'display', platform: 'twitch', userId: '', displayName: 'Invalid', approvedByCreator: true })).rejects.toThrow();
    await expect(registry.administerViewerFoundation({ operation: 'delete', viewerId: 'alex', approvedByCreator: true })).resolves.toMatchObject({ operation: 'delete', viewerId: 'alex', accountLinksRequireRemoval: true });
    await expect(registry.administerViewerSpotlight({ operation: 'status' })).resolves.toMatchObject({ activeCard: false, queuedRequests: 0 });
    expect(published.at(-1)).toEqual({ moduleId: 'thsv.viewer-spotlight', topic: 'thsv.viewer-spotlight.card.hide', payload: {} });
    expect(await readFile(join(root, 'thsv.viewer-spotlight', 'runtime-state.json'), 'utf8')).not.toContain('alex');
    expect(await readFile(join(root, 'thsv.community-analytics', 'runtime-state.json'), 'utf8')).not.toContain('alex');
    await registry.stop();
  });

  it('isolates an overlay publication failure and continues delivering the event to unrelated modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-viewer-spotlight-failure-')); temporary.push(root);
    const broker = new AddOnCapabilityBroker(silentLogger, root, { publishOverlay: async () => { throw new Error('overlay transport unavailable'); } });
    const foundation = { ...viewerFoundation, settings: { enabled: true, accountLinks: ['alex|twitch|123456'], chatCooldownSeconds: 0 }, capabilityGrant: { moduleId: 'thsv.viewer-foundation', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.provide'] as const, approvedActionIds: [] } };
    const analytics = { ...communityAnalytics, settings: { enabled: true }, capabilityGrant: { moduleId: 'thsv.community-analytics', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.read', 'community.analytics.provide'] as const, approvedActionIds: [] } };
    const spotlight = { ...viewerSpotlight, settings: { enabled: true, disclosureAccepted: true, commandName: 'card' }, capabilityGrant: { moduleId: 'thsv.viewer-spotlight', permissions: ['events.subscribe', 'state.private', 'overlay.publish', 'schedule.bounded', 'viewer.foundation.read', 'community.analytics.read'] as const, approvedActionIds: [] } };
    const unrelatedHandler = vi.fn();
    const unrelated = {
      manifest: { ...viewerSpotlight.manifest, moduleId: 'test.unrelated-overlay-consumer', name: 'Unrelated overlay consumer', dependencies: [], requiredCapabilities: [], browserSourcesProvided: [], dataStorageOwned: [] },
      required: false,
      onEvent: unrelatedHandler,
    };
    const registry = new ModuleRegistry([...createBuiltinModules(), spotlight, unrelated, analytics, foundation], silentLogger, 5_000, broker); await registry.start();
    const command: NormalizedEvent = { schemaVersion: '1.0.0', eventId: 'card-overlay-failure', eventType: 'command.received', platform: 'twitch', source: { adapter: 'fixture', eventId: 'card-overlay-failure', eventName: 'Command' }, receivedAt: '2026-07-26T12:00:00.000Z', channel: { name: 'channel' }, user: { id: '123456', name: 'alex_login', displayName: 'Alex Display', actorType: 'human', roles: [] }, payload: { command: 'card', arguments: [] }, metadata: { simulated: false } };
    await expect(registry.publish(command)).resolves.toBeUndefined();
    expect(unrelatedHandler).toHaveBeenCalledOnce();
    expect(registry.statuses()).toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleId: 'thsv.viewer-spotlight', status: 'failed', message: 'overlay transport unavailable' }),
      expect.objectContaining({ moduleId: 'test.unrelated-overlay-consumer', status: 'healthy' }),
      expect.objectContaining({ moduleId: 'core.chat', status: 'healthy' }),
      expect.objectContaining({ moduleId: 'core.alerts', status: 'healthy' }),
    ]));
    await registry.stop();
  });
});
