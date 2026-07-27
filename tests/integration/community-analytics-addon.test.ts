import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import communityAnalytics from '../../addons/community-analytics/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerFoundation from '../../addons/viewer-foundation/dist/index.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import type { CommunityAnalyticsSessionProjectionV1, CommunityAnalyticsViewerProjectionV1, ModuleRuntimeContextV2 } from '../../bridge/contracts/v2/addon-capability.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('Community Analytics integration', () => {
  it('uses Viewer Foundation identity and exposes only authenticated host administration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-community-analytics-')); temporary.push(root);
    const broker = new AddOnCapabilityBroker(silentLogger, root);
    const foundation = { ...viewerFoundation, settings: { enabled: true, accountLinks: ['alex|twitch|123456'] }, capabilityGrant: { moduleId: 'thsv.viewer-foundation', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.provide'] as const, approvedActionIds: [] } };
    const analytics = { ...communityAnalytics, settings: { enabled: true }, capabilityGrant: { moduleId: 'thsv.community-analytics', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.read', 'community.analytics.provide'] as const, approvedActionIds: [] } };
    let viewerProjection: CommunityAnalyticsViewerProjectionV1 | undefined; let sessionProjection: CommunityAnalyticsSessionProjectionV1 | undefined;
    const consumer = { required: false, capabilityGrant: { moduleId: 'sample.analytics-consumer', permissions: ['community.analytics.read'] as const, approvedActionIds: [] }, manifest: { contractVersion: '2.0.0-preview.1' as const, moduleId: 'sample.analytics-consumer', name: 'Analytics Consumer', version: '1.0.0', minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies: ['thsv.community-analytics'], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: ['chat.message'], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [], installationSteps: ['Install analytics.'], uninstallationSteps: ['Remove consumer.'], migrations: [], healthChecks: [] }, async onEvent(_event: NormalizedEvent, context: ModuleRuntimeContextV2) { viewerProjection = await context.communityAnalytics.getViewerProjection('alex'); sessionProjection = await context.communityAnalytics.getSessionProjection(); } };
    const registry = new ModuleRegistry([consumer, analytics, foundation], silentLogger, 5_000, broker); await registry.start();
    const event: NormalizedEvent = { schemaVersion: '1.0.0', eventId: 'chat-one', eventType: 'chat.message', platform: 'twitch', source: { adapter: 'fixture', eventId: 'chat-one', eventName: 'ChatMessage' }, receivedAt: '2026-07-26T12:00:00.000Z', channel: { name: 'channel' }, user: { id: '123456', name: 'Alex', actorType: 'human', roles: [] }, payload: { message: 'not retained' }, metadata: { simulated: false } };
    await registry.publish(event);
    expect(viewerProjection).toMatchObject({ viewerId: 'alex', observed: true, counters: { messages: 1 } }); expect(sessionProjection).toMatchObject({ active: true, uniqueViewers: 1 });
    await expect(registry.administerCommunityAnalytics({ operation: 'status' })).resolves.toMatchObject({ trackedViewerCount: 1, activeSession: true });
    await expect(registry.administerCommunityAnalytics({ operation: 'export', viewerId: 'alex' })).resolves.toMatchObject({ found: true, viewerId: 'alex' });
    await expect(registry.administerCommunityAnalytics({ operation: 'delete', viewerId: 'alex', approvedByCreator: true })).resolves.toMatchObject({ removed: true });
    await expect(registry.administerCommunityAnalytics({ operation: 'export', viewerId: 'alex' })).resolves.toMatchObject({ found: false });
    await registry.stop();
  });
});
