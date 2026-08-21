import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveAcceptanceError, LiveAcceptanceService } from '../../bridge/services/live-acceptance-service.js';
import { normalizedEventSchema } from '../../schemas/event.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('LiveAcceptanceService', () => {
  it('requires re-acceptance when a relevant add-on binding changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-binding-')); roots.push(root);
    const base = { coreVersion: '4.0.1', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), adapters: { 'streamerbot-scene-relay': '1', streamerbot: '3' }, components: { overlay: 'overlay-1' }, addOns: { 'thsv.starting-soon-countdown': '1.0.0' } };
    const first = new LiveAcceptanceService(root, base); await first.start();
    first.confirm('countdown-scene', { status: 'accepted', note: 'Observed the exact program scene.', approvedByCreator: true }); await first.flush();
    expect((first.status().confirmations as Record<string, { status: string }>)['countdown-scene']?.status).toBe('accepted');
    const changed = new LiveAcceptanceService(root, { ...base, addOns: { 'thsv.starting-soon-countdown': '1.1.0' } }); await changed.start();
    expect((changed.status().confirmations as Record<string, { status: string; stale: boolean; staleReasons: string[] }>)['countdown-scene']).toMatchObject({ status: 'stale', stale: true, staleReasons: ['thsv.starting-soon-countdown version changed from 1.0.0 to 1.1.0.'] });
    await changed.flush();
  });

  it('explains configuration, trigger, component, and add-on settings changes without exposing settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-reasons-')); roots.push(root);
    const base = { coreVersion: '4.0.1', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), configurationSections: { streamerbot: 'b'.repeat(64), browserOverlay: 'b'.repeat(64) }, triggerPackages: { 'starting-soon-countdown': 'c'.repeat(64) }, adapters: { 'streamerbot-scene-relay': '1', streamerbot: '3' }, components: { overlay: `sha256:${'9'.repeat(64)}` }, addOns: { 'thsv.starting-soon-countdown': `1.0.0:${'d'.repeat(64)}` } };
    const first = new LiveAcceptanceService(root, base); await first.start(); first.confirm('countdown-scene', { status: 'accepted', note: 'Countdown passed end to end.', approvedByCreator: true }); await first.flush();
    const changed = new LiveAcceptanceService(root, { ...base, buildFingerprint: 'e'.repeat(64), configurationFingerprint: 'f'.repeat(64), triggerContractFingerprint: '1'.repeat(64), configurationSections: { streamerbot: 'f'.repeat(64), browserOverlay: 'b'.repeat(64) }, triggerPackages: { 'starting-soon-countdown': '1'.repeat(64) }, components: { overlay: `sha256:${'8'.repeat(64)}` }, addOns: { 'thsv.starting-soon-countdown': `1.0.0:${'2'.repeat(64)}` } }); await changed.start();
    const confirmation = (changed.status().confirmations as Record<string, { staleReasons: string[] }>)['countdown-scene'];
    expect(confirmation?.staleReasons).toEqual(expect.arrayContaining(['streamerbot configuration section changed (bbbbbbbbbbbb to ffffffffffff).', 'starting-soon-countdown Streamer.bot package changed (cccccccccccc to 111111111111).', 'overlay core component changed (sha256:99999 to sha256:88888).', 'thsv.starting-soon-countdown settings changed.']));
    expect(confirmation?.staleReasons).not.toContain('Installed build changed (aaaaaaaaaaaa to eeeeeeeeeeee).');
    await changed.flush();
  });

  it('migrates legacy numeric adapter bindings without forcing a one-time recheck', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-migration-')); roots.push(root);
    const legacy = { coreVersion: '4.0.2', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), adapters: { 'streamerbot-scene-relay': '2', streamerbot: '3' }, addOns: { 'thsv.starting-soon-countdown': '1.0.0' } };
    const first = new LiveAcceptanceService(root, legacy); await first.start(); first.confirm('countdown-scene', { status: 'accepted', note: 'Countdown passed end to end.', approvedByCreator: true }); await first.flush();
    const statePath = join(root, 'live-acceptance.json'); const legacyState = JSON.parse(await readFile(statePath, 'utf8')) as { confirmations: Record<string, { binding: unknown }> };
    const legacyConfirmation = legacyState.confirmations['countdown-scene']; expect(legacyConfirmation).toBeDefined();
    if (legacyConfirmation === undefined) throw new Error('Expected the legacy confirmation fixture.');
    legacyConfirmation.binding = { coreContractVersion: '2', configurationFingerprint: legacy.configurationFingerprint, triggerContractFingerprint: legacy.triggerContractFingerprint, adapters: legacy.adapters, addOns: legacy.addOns };
    await writeFile(statePath, `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8');
    const current = { ...legacy, adapters: { 'streamerbot-scene-relay': `sha256:${'1'.repeat(64)}`, streamerbot: `sha256:${'2'.repeat(64)}` }, adapterLegacyAliases: { 'streamerbot-scene-relay': ['2'], streamerbot: ['3'] }, components: { overlay: `sha256:${'3'.repeat(64)}` }, configurationSections: { streamerbot: `sha256:${'4'.repeat(64)}`, browserOverlay: `sha256:${'5'.repeat(64)}` }, triggerPackages: { 'starting-soon-countdown': `sha256:${'6'.repeat(64)}` } };
    const migrated = new LiveAcceptanceService(root, current); await migrated.start();
    expect((migrated.status().confirmations as Record<string, { status: string }>)['countdown-scene']?.status).toBe('accepted');
    await migrated.flush();
    const saved = await readFile(join(root, 'live-acceptance.json'), 'utf8');
    expect(saved).toContain('configurationSections');
    expect(saved).toContain(`sha256:${'1'.repeat(64)}`);
  });

  it('invalidates only checks bound to the changed configuration section or trigger package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-scope-')); roots.push(root);
    const base = { coreVersion: '4.0.3', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), configurationSections: { browserOverlay: '1', streamerbot: '2', platforms: '3', outputs: '4' }, triggerPackages: { 'starting-soon-countdown': '5', 'native-platform-intake': '6', 'core-receiver': '7', 'multi-chat': '8' }, adapters: { 'streamerbot-scene-relay': 'relay', 'streamerbot-native': 'native', streamerbot: 'output' }, components: { overlay: 'overlay', delivery: 'delivery' }, addOns: { 'thsv.starting-soon-countdown': '1.0.0' } };
    const first = new LiveAcceptanceService(root, base); await first.start();
    first.confirm('countdown-scene', { status: 'accepted', note: 'Countdown lifecycle passed.', approvedByCreator: true });
    first.confirm('shared-overlay', { status: 'accepted', note: 'Overlay placement passed.', approvedByCreator: true }); await first.flush();
    const changed = new LiveAcceptanceService(root, { ...base, triggerPackages: { ...base.triggerPackages, 'starting-soon-countdown': 'changed' } }); await changed.start();
    const confirmations = changed.status().confirmations as Record<string, { status: string }>;
    expect(confirmations['countdown-scene']?.status).toBe('stale');
    expect(confirmations['shared-overlay']?.status).toBe('accepted');
    await changed.flush();
  });

  it('keeps acceptance current across unrelated version and build changes but invalidates the relevant core component', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-components-')); roots.push(root);
    const base = { coreVersion: '4.0.2', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), adapters: {}, components: { overlay: `sha256:${'1'.repeat(64)}`, startup: `sha256:${'2'.repeat(64)}` }, addOns: {} };
    const first = new LiveAcceptanceService(root, base); await first.start(); first.confirm('shared-overlay', { status: 'accepted', note: 'Overlay placement passed.', approvedByCreator: true }); await first.flush();
    const unrelatedBuild = new LiveAcceptanceService(root, { ...base, coreVersion: '4.0.3', buildFingerprint: 'd'.repeat(64), components: { ...base.components, startup: `sha256:${'3'.repeat(64)}` } }); await unrelatedBuild.start();
    expect((unrelatedBuild.status().confirmations as Record<string, { status: string }>)['shared-overlay']?.status).toBe('accepted');
    const overlayChanged = new LiveAcceptanceService(root, { ...base, components: { ...base.components, overlay: `sha256:${'4'.repeat(64)}` } }); await overlayChanged.start();
    expect((overlayChanged.status().confirmations as Record<string, { staleReasons: string[] }>)['shared-overlay']?.staleReasons).toContain('overlay core component changed (sha256:11111 to sha256:44444).');
    await overlayChanged.flush();
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
    const service = new LiveAcceptanceService(root, undefined, () => now); await service.start(); service.confirm('bridge-startup', { status: 'accepted', note: 'Startup recovery passed.', approvedByCreator: true }); await service.flush();
    expect((service.status().confirmations as Record<string, { status: string; dueAt: string }>)['bridge-startup']).toMatchObject({ status: 'accepted', dueAt: '2026-04-01T00:00:00.000Z' });
    now = Date.parse('2026-04-01T00:00:00.000Z');
    expect((service.status().confirmations as Record<string, { status: string; due: boolean; dueReason: string }>)['bridge-startup']).toMatchObject({ status: 'due', due: true, dueReason: 'Periodic live acceptance is due after 90 days.' });
  });

  it('warns 14 days before a periodic check and invalidates only relevant adapter contracts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-adapter-')); roots.push(root); let now = Date.parse('2026-01-01T00:00:00.000Z');
    const base = { coreVersion: '4.0.2', coreContractVersion: '2', buildFingerprint: 'a'.repeat(64), configurationFingerprint: 'b'.repeat(64), triggerContractFingerprint: 'c'.repeat(64), adapters: { 'streamerbot-native': '3', streamerbot: '3', 'timed-actions': '2' }, components: { overlay: 'overlay-1' }, addOns: {} };
    const service = new LiveAcceptanceService(root, base, () => now); await service.start();
    service.confirm('provider-reconnect', { status: 'accepted', note: 'Reconnect passed cleanly.', approvedByCreator: true });
    service.confirm('countdown-scene', { status: 'accepted', note: 'Countdown lifecycle passed.', approvedByCreator: true }); await service.flush();
    now = Date.parse('2026-03-19T00:00:00.000Z');
    expect((service.status().confirmations as Record<string, { dueSoon: boolean }>)['provider-reconnect']).toMatchObject({ status: 'accepted', dueSoon: true });
    expect(service.attentionSummary()).toMatchObject({ due: 0, dueSoon: 1, stale: 0, attention: 1 });
    const changed = new LiveAcceptanceService(root, { ...base, adapters: { ...base.adapters, 'timed-actions': '3' } }, () => now); await changed.start();
    expect((changed.status().confirmations as Record<string, { staleReasons: string[] }>)['provider-reconnect']?.staleReasons).toContain('timed-actions adapter contract changed from 2 to 3.');
    expect((changed.status().confirmations as Record<string, { status: string }>)['countdown-scene']?.status).toBe('accepted');
    await changed.flush();
  });

  it('persists creator reminder choices and a privacy-safe acceptance audit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-live-reminders-')); roots.push(root); let now = Date.parse('2026-08-21T12:00:00.000Z');
    const service = new LiveAcceptanceService(root, undefined, () => now); await service.start();
    service.confirm('bridge-startup', { status: 'accepted', note: 'A private operational note.', approvedByCreator: true });
    expect(service.setReminder({ action: 'snooze', hours: 24, approvedByCreator: true })).toMatchObject({ notificationsSnoozed: true, snoozedUntil: '2026-08-22T12:00:00.000Z' });
    await service.flush();
    const restarted = new LiveAcceptanceService(root, undefined, () => now); await restarted.start();
    const status = restarted.status() as { reminders: Record<string, unknown>; audit: Array<{ kind: string; changes: string[] }> };
    expect(status.reminders).toMatchObject({ notificationsSnoozed: true });
    expect(status.audit[0]).toMatchObject({ kind: 'creator-confirmed', changes: ['Creator set this check to accepted.'] });
    expect(JSON.stringify(status.audit)).not.toContain('private operational note');
    expect(restarted.attentionSummary()).toMatchObject({ notificationsSnoozed: true, snoozedUntil: '2026-08-22T12:00:00.000Z' });
    expect(restarted.setReminder({ action: 'resume', approvedByCreator: true })).toEqual({ notificationsSnoozed: false });
    expect(() => restarted.setReminder({ action: 'snooze', hours: 48, approvedByCreator: true })).toThrow(LiveAcceptanceError);
    now += 25 * 3_600_000;
  });
});
