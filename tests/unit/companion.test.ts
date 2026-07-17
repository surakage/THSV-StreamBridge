import { describe, expect, it } from 'vitest';
import { CompanionEngine } from '../../bridge/core/companion.js';
import { ViewerProgressionEngine } from '../../bridge/core/viewer-progression.js';
import type { CompanionStore } from '../../bridge/services/companion-store.js';
import type { ViewerProgressionStore } from '../../bridge/services/viewer-progression-store.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { testConfig } from '../helpers.js';

class MemoryStore implements CompanionStore, ViewerProgressionStore {
  public constructor(public value?: unknown) {}
  public async load(): Promise<unknown> { return this.value; }
  public async save(value: unknown): Promise<void> { this.value = structuredClone(value); }
  public scheduleSave(value: unknown): void { this.value = structuredClone(value); }
  public async flush(): Promise<void> { return Promise.resolve(); }
  public status(): Readonly<Record<string, unknown>> { return { type: 'memory' }; }
}

class FailingCompanionStore extends MemoryStore {
  public override async save(): Promise<void> { throw new Error('companion disk unavailable'); }
}

async function setup(includeSimulated = true): Promise<{ companion: CompanionEngine; wallet: ViewerProgressionEngine; store: MemoryStore }> {
  const config = await testConfig();
  config.viewerIdentity.enabled = true;
  config.companion.enabled = true;
  config.companion.includeSimulated = includeSimulated;
  config.companion.minimumActionIntervalMs = 0;
  config.companion.rewards.eat.cooldownMs = 30_000;
  const wallet = new ViewerProgressionEngine(config.viewerIdentity, new MemoryStore());
  await wallet.start();
  const store = new MemoryStore();
  const companion = new CompanionEngine(config.companion, store, wallet);
  await companion.start();
  return { companion, wallet, store };
}

describe('Bloom companion', () => {
  it('spends unified viewer points and persists bounded shared stats', async () => {
    const { companion, wallet, store } = await setup();
    await wallet.adjust({ viewerId: 'village-friend', operation: 'add', amount: 100, performedBy: 'test', reason: 'test balance' });
    const result = await companion.process(commandEvent('bloom-feed'));
    expect(result).toMatchObject({ status: 'accepted', action: 'eat', remainingPoints: 75, event: { eventType: 'companion.action', payload: { happiness: 78, fullness: 90, energy: 77 } } });
    expect(store.value).toMatchObject({ version: 1, totalInteractions: 1, stats: { happiness: 78, fullness: 90, energy: 77 } });
  });

  it('rejects insufficient balances without spending or changing companion state', async () => {
    const { companion } = await setup();
    expect(await companion.process(commandEvent('bloom-feed'))).toMatchObject({ status: 'rejected', action: 'eat', code: 'insufficient-points' });
    expect(companion.status()).toMatchObject({ totalInteractions: 0, stats: { happiness: 75, fullness: 75, energy: 75 } });
  });

  it('enforces per-viewer action cooldowns and simulation opt-in', async () => {
    const enabled = await setup();
    await enabled.wallet.adjust({ viewerId: 'village-friend', operation: 'add', amount: 100, performedBy: 'test', reason: 'test balance' });
    expect((await enabled.companion.process(commandEvent('bloom-feed'))).status).toBe('accepted');
    expect(await enabled.companion.process(commandEvent('bloom-feed', 'command-2'))).toMatchObject({ status: 'rejected', code: 'cooldown' });
    const disabled = await setup(false);
    expect(await disabled.companion.process(commandEvent('bloom-wave'))).toMatchObject({ status: 'rejected', code: 'simulated-disabled' });
  });

  it('refuses malformed persisted state instead of silently resetting Bloom', async () => {
    const config = await testConfig();
    config.viewerIdentity.enabled = true; config.companion.enabled = true;
    const wallet = new ViewerProgressionEngine(config.viewerIdentity, new MemoryStore()); await wallet.start();
    const companion = new CompanionEngine(config.companion, new MemoryStore({ version: 1, stats: { happiness: 900 } }), wallet);
    await expect(companion.start()).rejects.toThrow('Companion state is invalid');
  });

  it('refunds points and rolls back state when companion persistence fails', async () => {
    const config = await testConfig();
    config.viewerIdentity.enabled = true; config.companion.enabled = true; config.companion.includeSimulated = true; config.companion.minimumActionIntervalMs = 0;
    const walletStore = new MemoryStore();
    const wallet = new ViewerProgressionEngine(config.viewerIdentity, walletStore); await wallet.start();
    await wallet.adjust({ viewerId: 'village-friend', operation: 'add', amount: 100, performedBy: 'test', reason: 'test balance' });
    const companion = new CompanionEngine(config.companion, new FailingCompanionStore(), wallet); await companion.start();
    await expect(companion.process(commandEvent('bloom-feed'))).rejects.toThrow('companion disk unavailable');
    expect(companion.status()).toMatchObject({ totalInteractions: 0, stats: { happiness: 75, fullness: 75, energy: 75 } });
    await expect(wallet.spend('village-friend', 100)).resolves.toMatchObject({ totalPoints: 0 });
  });
});

function commandEvent(command: string, eventId = 'command-1'): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId, eventType: 'command.received', platform: 'twitch', source: { adapter: 'fixture', eventId, eventName: 'NormalizedCommand' }, receivedAt: new Date().toISOString(), channel: { name: 'test' }, user: { id: 'fixture-user', name: 'Viewer', displayName: 'Example Viewer', roles: [], actorType: 'human' }, payload: { command, invokedAs: command, arguments: [], rawInput: `!${command}`, prefix: '!', minimumRole: 'viewer', allowBots: false }, metadata: { bridgeSequence: 1, viewerId: 'village-friend', simulated: true } };
}
