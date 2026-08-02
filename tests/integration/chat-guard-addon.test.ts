import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import chatGuard from '../../addons/chat-guard/dist/index.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('Chat Guard integration', () => {
  it('routes observed chat and authenticated administration through the module registry without exposing raw identity or content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-chat-guard-')); temporary.push(root);
    const broker = new AddOnCapabilityBroker(silentLogger, root);
    const module = {
      ...chatGuard,
      settings: {
        enabled: true,
        blockedDomains: ['blocked.test'],
        detectLinks: false,
        detectCaps: false,
        detectRepeatedCharacters: false,
        detectLongMessages: false,
        detectRepeatedMessages: false,
      },
      capabilityGrant: {
        moduleId: 'thsv.chat-guard',
        permissions: ['events.subscribe', 'state.private'] as const,
        approvedActionIds: [],
      },
    };
    const registry = new ModuleRegistry([module], silentLogger, 5_000, broker);
    await registry.start();

    const observed: NormalizedEvent = {
      schemaVersion: '1.0.0', eventId: 'chat-guard-integration-one', eventType: 'chat.message', platform: 'twitch',
      source: { adapter: 'fixture', eventId: 'chat-guard-integration-one', eventName: 'ChatMessage' },
      receivedAt: '2026-07-27T12:00:00.000Z', channel: { name: 'channel' },
      user: { id: 'private-stable-id', name: 'Private Display Name', actorType: 'human', roles: [] },
      payload: { message: 'please visit https://blocked.test/private-path' }, metadata: { simulated: false },
    };
    await registry.publish(observed);

    const status = await registry.administerChatGuard({ operation: 'status' });
    expect(status).toMatchObject({
      mode: 'observe', incidentCount: 1, byRule: { 'blocked-domain': 1 },
      providerCapabilities: { twitch: { observe: true, warn: true, delete: true, timeout: true, ban: true } },
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('private-stable-id');
    expect(serialized).not.toContain('Private Display Name');
    expect(serialized).not.toContain('blocked.test/private-path');

    const recentIncidents = status['recentIncidents'];
    if (!Array.isArray(recentIncidents) || recentIncidents.length === 0) throw new Error('Expected one recent Chat Guard incident.');
    const recentIncident = recentIncidents[0];
    if (recentIncident === null || typeof recentIncident !== 'object' || Array.isArray(recentIncident)) throw new Error('Expected structured Chat Guard incident metadata.');
    const incidentId = recentIncident['incidentId'];
    if (typeof incidentId !== 'string') throw new Error('Expected a pseudonymous Chat Guard incident ID.');
    await expect(registry.administerChatGuard({ operation: 'incidents', platform: 'twitch', rule: 'blocked-domain', review: 'unreviewed', enforcementStatus: 'none', offset: 0, limit: 25 })).resolves.toMatchObject({
      operation: 'incidents', totalMatching: 1, hasMore: false,
      incidents: [expect.objectContaining({ incidentId, viewerFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/u), enforcement: { mode: 'observe', status: 'none', error: '' } })],
    });
    await expect(registry.administerChatGuard({ operation: 'review', incidentId, decision: 'false-positive', approvedByCreator: true })).resolves.toMatchObject({
      incidentId, decision: 'false-positive', enforcementPerformed: false,
    });
    await expect(registry.administerChatGuard({ operation: 'test', message: 'https://blocked.test/test-only', priorMatchingMessages: 0 })).resolves.toMatchObject({
      operation: 'test', flagged: true, rules: ['blocked-domain'], persisted: false, enforcementPerformed: false,
    });
    await expect(registry.administerChatGuard({ operation: 'status' })).resolves.toMatchObject({
      incidentCount: 1, byReview: { unreviewed: 0, confirmed: 0, 'false-positive': 1 },
    });
    await registry.stop();
  });
});
