import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerFoundation from '../../addons/viewer-foundation/dist/index.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry, type FrameworkModule } from '../../bridge/core/module-registry.js';
import type { ViewerFoundationMutationResultV1, ViewerFoundationProjectionV1 } from '../../bridge/contracts/v2/addon-capability.js';
import { silentLogger } from '../helpers.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('Viewer Foundation integration', () => {
  it('serves a dependent consumer through the broker without sharing private state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-viewer-foundation-'));
    temporary.push(root);
    const broker = new AddOnCapabilityBroker(silentLogger, root);
    let projection: ViewerFoundationProjectionV1 | undefined;
    let mutation: ViewerFoundationMutationResultV1 | undefined;
    const consumer: FrameworkModule = {
      required: false,
      capabilityGrant: { moduleId: 'sample.viewer-consumer', permissions: ['viewer.foundation.read', 'viewer.foundation.mutate'], approvedActionIds: [] },
      manifest: {
        contractVersion: '2.0.0-preview.1', moduleId: 'sample.viewer-consumer', name: 'Viewer Consumer', version: '1.0.0',
        minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', dependencies: ['thsv.viewer-foundation'],
        requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: [], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
        installationSteps: ['Install Viewer Foundation first.'], uninstallationSteps: ['Remove this consumer.'], migrations: [], healthChecks: [],
      },
      async start(context) {
        projection = await context.viewerFoundation.getProjection({ platform: 'twitch', userId: '123456' });
        if (projection === undefined) throw new Error('Expected Viewer Foundation projection.');
        mutation = await context.viewerFoundation.mutate({ viewerId: projection.viewerId, operation: 'add', amount: 10, reason: 'integration award', idempotencyKey: 'event-1' });
      },
    };
    const foundation = {
      ...viewerFoundation,
      settings: { enabled: true, accountLinks: ['alex|twitch|123456'], levelStepPoints: 100 },
      capabilityGrant: { moduleId: 'thsv.viewer-foundation', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.provide', 'chat.send'] as const, approvedActionIds: [] },
    };
    const registry = new ModuleRegistry([consumer, foundation], silentLogger, 5_000, broker);
    await registry.start();
    expect(registry.ready()).toBe(true);
    expect(projection).toEqual({ contractVersion: '1.0.0', viewerId: 'alex', linked: true, currencyName: 'Village Points', points: 0, level: 1, nextLevelAt: 100 });
    expect(mutation).toMatchObject({ viewerId: 'alex', points: 10, previousPoints: 0, duplicate: false });
    await expect(registry.administerViewerFoundation({ operation: 'correct', viewerId: 'alex', adjustment: 'add', amount: 15, reason: 'integration correction', approvedByCreator: true })).resolves.toMatchObject({ points: 25 });
    await expect(registry.administerViewerFoundation({ operation: 'export', viewerId: 'alex' })).resolves.toMatchObject({ found: true, projection: { points: 25 } });
    await expect(readFile(join(root, 'thsv.viewer-foundation', 'runtime-state.json'), 'utf8')).resolves.not.toContain('123456');
    await registry.stop();
  });
});
