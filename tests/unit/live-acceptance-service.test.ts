import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveAcceptanceError, LiveAcceptanceService } from '../../bridge/services/live-acceptance-service.js';
import { normalizedEventSchema } from '../../schemas/event.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('LiveAcceptanceService', () => {
  it('requires re-acceptance when a relevant build binding changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-binding-')); roots.push(root);
    const base = { coreVersion: '4.0.1', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), adapters: { 'streamerbot-scene-relay': '1', streamerbot: '3' }, addOns: { 'thsv.starting-soon-countdown': '1.0.0' } };
    const first = new LiveAcceptanceService(root, base); await first.start();
    first.confirm('countdown-scene', { status: 'accepted', note: 'Observed the exact program scene.', approvedByCreator: true }); await first.flush();
    expect((first.status().confirmations as Record<string, { status: string }>)['countdown-scene']?.status).toBe('accepted');
    const changed = new LiveAcceptanceService(root, { ...base, addOns: { 'thsv.starting-soon-countdown': '1.1.0' } }); await changed.start();
    expect((changed.status().confirmations as Record<string, { status: string; stale: boolean; staleReasons: string[] }>)['countdown-scene']).toMatchObject({ status: 'stale', stale: true, staleReasons: ['thsv.starting-soon-countdown version changed from 1.0.0 to 1.1.0.'] });
  });

  it('explains build, configuration, trigger, and add-on settings changes without exposing settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-reasons-')); roots.push(root);
    const base = { coreVersion: '4.0.1', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), adapters: { 'streamerbot-scene-relay': '1', streamerbot: '3' }, addOns: { 'thsv.starting-soon-countdown': `1.0.0:${'d'.repeat(64)}` } };
    const first = new LiveAcceptanceService(root, base); await first.start(); first.confirm('countdown-scene', { status: 'accepted', note: 'Countdown passed end to end.', approvedByCreator: true }); await first.flush();
    const changed = new LiveAcceptanceService(root, { ...base, buildFingerprint: 'e'.repeat(64), configurationFingerprint: 'f'.repeat(64), triggerContractFingerprint: '1'.repeat(64), addOns: { 'thsv.starting-soon-countdown': `1.0.0:${'2'.repeat(64)}` } }); await changed.start();
    const confirmation = (changed.status().confirmations as Record<string, { staleReasons: string[] }>)['countdown-scene'];
    expect(confirmation?.staleReasons).toEqual(expect.arrayContaining(['Installed build changed (aaaaaaaaaaaa to eeeeeeeeeeee).', 'StreamBridge configuration changed (bbbbbbbbbbbb to ffffffffffff).', 'Streamer.bot trigger catalogue changed (cccccccccccc to 111111111111).', 'thsv.starting-soon-countdown settings changed.']));
  });

  it('captures genuine upstream IDs without viewer or message content and requires creator confirmation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-acceptance-')); roots.push(root);
    const service = new LiveAcceptanceService(root); await service.start();
    service.observe(normalizedEventSchema.parse({ schemaVersion: '1.0.0', eventId: 'bridge-1', eventType: 'chat.message', platform: 'twitch', source: { adapter: 'streamerbot', eventId: 'upstream-1', eventName: 'Twitch.ChatMessage' }, receivedAt: new Date().toISOString(), channel: { name: 'channel' }, user: { id: 'viewer-secret', name: 'private-name', roles: [] }, payload: { message: 'private chat text' }, metadata: { simulated: false } }));
    service.observe(normalizedEventSchema.parse({ schemaVersion: '1.0.0', eventId: 'bridge-2', eventType: 'chat.message', platform: 'twitch', source: { adapter: 'mock', eventId: 'simulated-1', eventName: 'test' }, receivedAt: new Date().toISOString(), channel: { name: 'channel' }, payload: { message: 'simulation' }, metadata: { simulated: true } }));
    await service.flush();
    const status = service.status() as { evidence: Array<{ id: string }> };
    expect(status.evidence).toEqual([expect.objectContaining({ id: 'twitch:upstream-1' })]);
    expect(JSON.stringify(status)).not.toContain('private-name');
    expect(JSON.stringify(status)).not.toContain('private chat text');
    expect(() => service.confirm('twitch-chat', { status: 'accepted', note: 'Observed exactly once.', approvedByCreator: true })).toThrow(LiveAcceptanceError);
    expect(service.confirm('twitch-chat', { status: 'accepted', evidenceId: 'twitch:upstream-1', note: 'Observed exactly once.', approvedByCreator: true })).toMatchObject({ status: 'accepted', evidenceId: 'twitch:upstream-1' });
    await service.flush();
    const saved = await readFile(join(root, 'live-acceptance.json'), 'utf8');
    expect(saved).toContain('upstream-1');
    expect(saved).not.toContain('private-name');
  });

  it('marks accepted checks due on their documented periodic schedule', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-due-')); roots.push(root); let now = Date.parse('2026-01-01T00:00:00.000Z');
    const service = new LiveAcceptanceService(root, undefined, () => now); await service.start(); service.confirm('bridge-startup', { status: 'accepted', note: 'Startup recovery passed.', approvedByCreator: true });
    expect((service.status().confirmations as Record<string, { status: string; dueAt: string }>)['bridge-startup']).toMatchObject({ status: 'accepted', dueAt: '2026-04-01T00:00:00.000Z' });
    now = Date.parse('2026-04-01T00:00:00.000Z');
    expect((service.status().confirmations as Record<string, { status: string; due: boolean; dueReason: string }>)['bridge-startup']).toMatchObject({ status: 'due', due: true, dueReason: 'Periodic live acceptance is due after 90 days.' });
  });

  it('warns 14 days before a periodic check and invalidates only relevant adapter contracts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-adapter-')); roots.push(root); let now = Date.parse('2026-01-01T00:00:00.000Z');
    const base = { coreVersion: '4.0.2', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), adapters: { 'streamerbot-native': '3', streamerbot: '3', 'timed-actions': '2' }, addOns: {} };
    const service = new LiveAcceptanceService(root, base, () => now); await service.start();
    service.confirm('provider-reconnect', { status: 'accepted', note: 'Reconnect passed cleanly.', approvedByCreator: true });
    service.confirm('countdown-scene', { status: 'accepted', note: 'Countdown lifecycle passed.', approvedByCreator: true }); await service.flush();
    now = Date.parse('2026-03-19T00:00:00.000Z');
    expect((service.status().confirmations as Record<string, { dueSoon: boolean }>)['provider-reconnect']).toMatchObject({ status: 'accepted', dueSoon: true });
    const changed = new LiveAcceptanceService(root, { ...base, adapters: { ...base.adapters, 'timed-actions': '3' } }, () => now); await changed.start();
    expect((changed.status().confirmations as Record<string, { staleReasons: string[] }>)['provider-reconnect']?.staleReasons).toContain('timed-actions adapter contract changed from 2 to 3.');
    expect((changed.status().confirmations as Record<string, { status: string }>)['countdown-scene']?.status).toBe('accepted');
  });
});
