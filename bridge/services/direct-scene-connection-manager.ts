import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';
import type { DirectSceneSnapshot } from './obs-direct-scene-client.js';
import { ObsDirectSceneClient } from './obs-direct-scene-client.js';
import { MeldDirectSceneClient, StreamlabsDirectSceneClient } from './direct-broadcast-scene-clients.js';
import type { BroadcastConnectionProvider, BroadcastConnectionVaultService, ResolvedBroadcastConnection } from './broadcast-connection-vault-service.js';

export interface DirectSceneConnectionClient { getSceneList(): Promise<DirectSceneSnapshot>; watchChanges(onChange: () => void, signal: AbortSignal): Promise<void> }
export type DirectSceneConnectionClientFactory = (profile: ResolvedBroadcastConnection) => DirectSceneConnectionClient;
export interface DirectSceneApplicationState { readonly configured: boolean; readonly running: boolean; readonly executableName?: string; readonly processId?: number; readonly differentInstallationProcessId?: number; readonly state?: string }
export type DirectSceneApplicationStateProvider = (profile: ResolvedBroadcastConnection) => Promise<DirectSceneApplicationState>;
interface ConnectionRuntime { readonly profile: ResolvedBroadcastConnection; state: 'connecting' | 'connected' | 'reconnecting' | 'paused' | 'stopped'; lastConnectedAt?: string; lastSnapshotAt?: string; lastError?: string; pauseReason?: string; reconnectCount: number; lastLatencyMs?: number; applicationExecutableName?: string; applicationProcessId?: number; differentInstallationProcessId?: number }
interface ConnectionEvent { readonly timestamp: string; readonly connectionId: string; readonly connectionName: string; readonly provider: BroadcastConnectionProvider; readonly type: 'configured' | 'connected' | 'snapshot' | 'reconnecting' | 'paused' | 'resumed' | 'stopped' | 'test-succeeded' | 'test-failed'; readonly latencyMs?: number; readonly sceneCount?: number; readonly detail?: string }
interface AcceptanceResult { readonly provider: BroadcastConnectionProvider; readonly outcome: string; readonly processId?: number; readonly executable?: string; readonly sceneCount?: number; readonly latencyMs?: number }
interface AcceptanceReceipt { readonly checkedAt: string; readonly results: readonly AcceptanceResult[] }
interface AcceptanceBaseline { readonly approvedAt: string; readonly receiptCheckedAt: string }
interface ReliabilitySnapshot { readonly capturedAt: string; readonly profiles: readonly Readonly<Record<string, unknown>>[] }
interface BroadcastConnectionProfileLike { readonly id: string; readonly name: string; readonly enabled: boolean; readonly hasCredential: boolean; readonly credentialVerifiedAt?: string }
const MAXIMUM_EVENTS = 100;
const WARNING_RECONNECT_THRESHOLD = 3;
const WARNING_LATENCY_MS = 2_000;

export class DirectSceneConnectionManager {
  private controller: AbortController | undefined;
  private runtimes = new Map<string, ConnectionRuntime>();
  private listener: ((provider: BroadcastConnectionProvider, snapshot: DirectSceneSnapshot) => void) | undefined;
  private tasks: Promise<void>[] = [];
  private readonly refreshes = new Set<string>();
  private events: ConnectionEvent[] = [];
  private acceptanceReceipts: AcceptanceReceipt[] = [];
  private acceptanceBaseline: AcceptanceBaseline | undefined;
  private readonly degradationSince = new Map<string, number>();
  private reliabilitySnapshots: ReliabilitySnapshot[] = [];
  private eventWrites: Promise<void> = Promise.resolve();

  public constructor(private readonly vault: BroadcastConnectionVaultService, private readonly environmentDefaults: readonly ResolvedBroadcastConnection[] = [], private readonly createClient: DirectSceneConnectionClientFactory = client, private readonly historyPath?: string, private readonly applicationState?: DirectSceneApplicationStateProvider, private readonly pausePollMs = 2_000) {}

  public async start(listener: (provider: BroadcastConnectionProvider, snapshot: DirectSceneSnapshot) => void): Promise<void> { this.listener = listener; await Promise.all([this.loadHistory(), this.loadAcceptanceReceipts(), this.loadAcceptanceBaseline(), this.loadReliabilitySnapshots()]); await this.reload(); }

  public async reload(): Promise<void> {
    await this.stopWatchers();
    const profiles = await this.profiles(); this.controller = new AbortController(); this.runtimes = new Map(profiles.map((profile) => [profile.id, { profile, state: 'connecting', reconnectCount: 0 }]));
    for (const profile of profiles) this.recordEvent(profile, 'configured');
    this.tasks = profiles.map((profile) => this.watchLoop(profile, this.controller?.signal ?? AbortSignal.abort()));
  }

  public async stop(): Promise<void> { this.listener = undefined; await this.stopWatchers(); await this.eventWrites; }

  public async activeProfiles(): Promise<readonly Readonly<{ id: string; name: string; provider: BroadcastConnectionProvider; url: string }>[] > {
    return (await this.profiles()).map(({ id, name, provider, url }) => ({ id, name, provider, url }));
  }

  public async refresh(provider: BroadcastConnectionProvider, connectionIndex: number): Promise<DirectSceneSnapshot | undefined> {
    const profile = (await this.profiles()).filter((connection) => connection.provider === provider)[connectionIndex];
    if (profile === undefined) return undefined;
    const startedAt = Date.now(); const snapshot = await this.createClient(profile).getSceneList(); this.recordSnapshot(profile, Date.now() - startedAt, snapshot.scenes.length); return snapshot;
  }

  public async testCandidate(profile: ResolvedBroadcastConnection): Promise<Readonly<Record<string, unknown>>> { return await this.runTest(profile, 0, false); }

  public async discover(input?: unknown): Promise<Readonly<Record<string, unknown>>> {
    const profiles = await this.profiles();
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const customRequested = request['port'] !== undefined || request['provider'] !== undefined;
    let candidates: Array<{ provider: BroadcastConnectionProvider; url: string; credentialRequired: boolean }>;
    if (customRequested) {
      const provider = request['provider']; const port = request['port'];
      if (provider !== 'obs' && provider !== 'meld' && provider !== 'streamlabs') throw new DirectSceneConnectionError(400, 'Choose OBS, Meld, or Streamlabs for custom discovery.');
      if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65_535) throw new DirectSceneConnectionError(400, 'Custom discovery requires one port from 1 through 65535. Port ranges are not allowed.');
      candidates = [{ provider, url: `ws://127.0.0.1:${String(port)}${provider === 'streamlabs' ? '/api/websocket' : ''}`, credentialRequired: provider !== 'meld' }];
    } else candidates = [{ provider: 'obs', url: 'ws://127.0.0.1:4455', credentialRequired: true }, { provider: 'meld', url: 'ws://127.0.0.1:13376', credentialRequired: false }, { provider: 'streamlabs', url: 'ws://127.0.0.1:59650/api/websocket', credentialRequired: true }];
    const discovered = await Promise.all(candidates.map(async (candidate) => { const profile: ResolvedBroadcastConnection = { id: `discovery-${candidate.provider}`, name: `${providerLabel(candidate.provider)} discovery`, provider: candidate.provider, url: candidate.url, enabled: true, hasCredential: false, credential: '' }; const application = await this.applicationState?.(profile).catch(() => undefined); return { ...candidate, listening: await portListening(new URL(candidate.url)), profileConfigured: profiles.some((saved) => saved.provider === candidate.provider && saved.url === candidate.url), application: application === undefined ? { configured: false, running: false } : application }; }));
    return { scannedAt: new Date().toISOString(), mutationFree: true, scope: customRequested ? 'single-explicit-loopback-port' : 'documented-loopback-defaults-only', candidates: discovered };
  }

  public async recordAcceptance(results: readonly Readonly<Record<string, unknown>>[]): Promise<Readonly<Record<string, unknown>>> {
    const receipt: AcceptanceReceipt = { checkedAt: new Date().toISOString(), results: results.flatMap((result) => sanitizeAcceptanceResult(result)) };
    const previous = this.acceptanceComparisonReceipt(true);
    this.acceptanceReceipts = [...this.acceptanceReceipts, receipt].slice(-50);
    await this.writeAcceptanceReceipts();
    return { receipt, comparison: compareAcceptance(previous, receipt), receiptCount: this.acceptanceReceipts.length };
  }

  public async approveAcceptanceBaseline(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (request['approvedByCreator'] !== true) throw new DirectSceneConnectionError(403, 'Explicit creator approval is required to replace the acceptance baseline.');
    const latest = this.acceptanceReceipts.at(-1);
    if (latest === undefined) throw new DirectSceneConnectionError(409, 'Run installed-app acceptance before approving a baseline.');
    this.acceptanceBaseline = { approvedAt: new Date().toISOString(), receiptCheckedAt: latest.checkedAt };
    await this.writeAcceptanceBaseline();
    return { approved: true, baseline: this.acceptanceBaseline, comparison: compareAcceptance(latest, latest) };
  }

  public async conflictAssistant(): Promise<Readonly<Record<string, unknown>>> {
    const profiles = await this.profiles();
    const issues: Readonly<Record<string, unknown>>[] = [];
    const ports = new Map<number, ResolvedBroadcastConnection[]>();
    for (const profile of profiles) { const port = Number(new URL(profile.url).port); ports.set(port, [...(ports.get(port) ?? []), profile]); }
    for (const [port, selected] of ports) if (selected.length > 1) issues.push({ type: 'duplicate-port', severity: 'warning', port, profileIds: selected.map(({ id }) => id), profileNames: selected.map(({ name }) => name), guidance: 'Give each running broadcast application its own WebSocket port, then retest each profile.' });
    for (const profile of profiles) {
      const state = await this.applicationState?.(profile).catch(() => undefined);
      if (state?.differentInstallationProcessId !== undefined) issues.push({ type: 'wrong-installation', severity: 'error', profileId: profile.id, profileName: profile.name, provider: profile.provider, processId: state.differentInstallationProcessId, guidance: 'Close the other installation or reselect the executable that owns this WebSocket port.' });
    }
    return { checkedAt: new Date().toISOString(), mutationFree: true, ready: issues.length === 0, issues };
  }

  public async suggestUnusedPorts(input: unknown): Promise<Readonly<Record<string, unknown>>> { const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}; const provider = request['provider']; if (provider !== 'obs' && provider !== 'meld' && provider !== 'streamlabs') throw new DirectSceneConnectionError(400, 'Choose OBS, Meld, or Streamlabs for port suggestions.'); const profiles = await this.profiles(); const used = new Set(profiles.map((profile) => Number(new URL(profile.url).port))); const start = provider === 'obs' ? 4455 : provider === 'meld' ? 13_376 : 59_650; const suggestions: number[] = []; for (let port = start; port < start + 50 && suggestions.length < 5; port += 1) if (!used.has(port) && !await portListening(new URL(`ws://127.0.0.1:${String(port)}`))) suggestions.push(port); return { checkedAt: new Date().toISOString(), mutationFree: true, provider, suggestions, excludedSavedPorts: [...used].sort((left, right) => left - right) }; }

  public async captureReliabilitySnapshot(): Promise<Readonly<Record<string, unknown>>> { const status = this.status(); const profiles = Array.isArray(status['connections']) ? (status['connections'] as Readonly<Record<string, unknown>>[]).map((profile) => ({ name: profile['name'], provider: profile['provider'], state: profile['state'], reconnectCount: profile['reconnectCount'], lastLatencyMs: profile['lastLatencyMs'], reliability: profile['reliability'] })) : []; const snapshot: ReliabilitySnapshot = { capturedAt: new Date().toISOString(), profiles }; const previous = this.reliabilitySnapshots.at(-1); this.reliabilitySnapshots = [...this.reliabilitySnapshots, snapshot].slice(-30); await this.writeReliabilitySnapshots(); return { current: snapshot, comparison: compareReliabilitySnapshots(previous, snapshot), snapshotCount: this.reliabilitySnapshots.length }; }

  public reliabilityHistory(): Readonly<Record<string, unknown>> {
    const snapshots = this.reliabilitySnapshots.map((snapshot, index) => ({
      ...snapshot,
      comparison: compareReliabilitySnapshots(index === 0 ? undefined : this.reliabilitySnapshots[index - 1], snapshot)
    })).reverse();
    return { redacted: true, snapshotCount: snapshots.length, snapshots };
  }

  public async test(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const request = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const provider = request['provider']; if (provider !== 'obs' && provider !== 'meld' && provider !== 'streamlabs') throw new DirectSceneConnectionError(400, 'provider must be obs, meld, or streamlabs.');
    const connectionIndex = request['connectionIndex'] ?? 0; if (!Number.isInteger(connectionIndex) || (connectionIndex as number) < 0 || (connectionIndex as number) > 23) throw new DirectSceneConnectionError(400, 'connectionIndex must be an integer from 0 through 23.');
    const profile = (await this.profiles()).filter((connection) => connection.provider === provider)[connectionIndex as number];
    if (profile === undefined) return { available: false, provider, connectionIndex, transport: 'streamerbot-fallback', message: 'No enabled native connection profile is saved. Streamer.bot fallback remains available when configured.' };
    const result = await this.runTest(profile, connectionIndex as number);
    if (result['available'] === true && profile.hasCredential) await this.vault.markCredentialVerified(profile.id);
    return result;
  }

  public status(): Readonly<Record<string, unknown>> {
    const runtimes = [...this.runtimes.values()];
    const issues = runtimes.filter((runtime) => runtime.state !== 'paused' && ((runtime.state === 'reconnecting' && runtime.reconnectCount >= WARNING_RECONNECT_THRESHOLD) || (runtime.lastLatencyMs ?? 0) >= (runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS)));
    const attention = issues.length === 0 ? { level: 'ready', affectedConnections: 0, message: 'Native scene connections are within reconnect and latency thresholds.' } : { level: 'warning', affectedConnections: issues.length, reconnectThreshold: WARNING_RECONNECT_THRESHOLD, latencyThresholdMs: WARNING_LATENCY_MS, message: `${String(issues.length)} native scene connection${issues.length === 1 ? '' : 's'} need attention due to repeated reconnects or latency of ${String(WARNING_LATENCY_MS)} ms or more.` };
    const trends = connectionTrends(this.events); const reliability = reliabilityScores(runtimes, trends, this.acceptanceReceipts.at(-1)); const reliabilityAlerts = this.sustainedReliabilityAlerts(reliability, runtimes);
    const latest = this.acceptanceReceipts.at(-1); const comparisonReceipt = this.acceptanceComparisonReceipt();
    return { subscriptionsActive: this.controller !== undefined && !this.controller.signal.aborted, attention, trends, strictGate: this.strictGate(), reliability: { profiles: reliability, alerts: reliabilityAlerts }, acceptance: { receiptCount: this.acceptanceReceipts.length, latest, approvedBaseline: this.acceptanceBaseline, comparison: compareAcceptance(comparisonReceipt, latest) }, notification: { ...notificationSummary(runtimes, trends), reliabilitySignature: reliabilityAlerts.filter((item) => item.alerting === true).map((item) => `${String(item.connectionId)}:${String(item.score)}`).join('|'), reliabilityBreaches: reliabilityAlerts.filter((item) => item.alerting === true) }, connections: runtimes.map((runtime) => ({ id: runtime.profile.id, name: runtime.profile.name, provider: runtime.profile.provider, url: runtime.profile.url, hasCredential: runtime.profile.hasCredential, maintenanceUntil: runtime.profile.maintenanceUntil, maintenanceReason: runtime.profile.maintenanceReason, latencyWarningMs: runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS, state: runtime.state, reconnectCount: runtime.reconnectCount, lastLatencyMs: runtime.lastLatencyMs, lastConnectedAt: runtime.lastConnectedAt, lastSnapshotAt: runtime.lastSnapshotAt, lastError: runtime.lastError, pauseReason: runtime.pauseReason, applicationExecutableName: runtime.applicationExecutableName, applicationProcessId: runtime.applicationProcessId, differentInstallationProcessId: runtime.differentInstallationProcessId, reliability: reliability.find((score) => score.connectionId === runtime.profile.id) })), events: this.events };
  }

  private sustainedReliabilityAlerts(scores: readonly Readonly<Record<string, unknown>>[], runtimes: readonly ConnectionRuntime[]): readonly Readonly<Record<string, unknown>>[] { const now = Date.now(); const requiredMs = this.vault.reliabilityPolicy().sustainedAlertMinutes * 60_000; const active = new Set(runtimes.map((runtime) => runtime.profile.id)); for (const id of this.degradationSince.keys()) if (!active.has(id)) this.degradationSince.delete(id); return scores.flatMap((score) => { const id = String(score['connectionId']); const runtime = runtimes.find((item) => item.profile.id === id); const degraded = typeof score['score'] === 'number' && score['score'] < 90 && runtime?.profile.maintenanceUntil === undefined; if (!degraded) { this.degradationSince.delete(id); return []; } const since = this.degradationSince.get(id) ?? now; this.degradationSince.set(id, since); return [{ connectionId: id, connectionName: score['connectionName'], provider: score['provider'], score: score['score'], degradedSince: new Date(since).toISOString(), sustainedMinutes: Math.floor((now - since) / 60_000), requiredMinutes: this.vault.reliabilityPolicy().sustainedAlertMinutes, alerting: now - since >= requiredMs }]; }); }

  private strictGate(): Readonly<Record<string, unknown>> {
    const policy = this.vault.reliabilityPolicy();
    if (!policy.strictMode) return { enabled: false, ready: true, blockers: [], message: 'Strict pre-stream freshness gating is off.' };
    const now = Date.now(); const blockers: Readonly<Record<string, unknown>>[] = []; const latest = this.acceptanceReceipts.at(-1);
    if (latest === undefined || now - Date.parse(latest.checkedAt) > policy.acceptanceMaxAgeDays * 86_400_000) blockers.push({ type: 'acceptance-stale', message: `Installed-app acceptance must be run within ${String(policy.acceptanceMaxAgeDays)} day(s).` });
    const connections = this.vault.status()['connections'];
    if (Array.isArray(connections)) for (const value of connections) { const profile = value as BroadcastConnectionProfileLike; if (!profile.enabled || !profile.hasCredential) continue; if (typeof profile.credentialVerifiedAt !== 'string' || now - Date.parse(profile.credentialVerifiedAt) > policy.credentialMaxAgeDays * 86_400_000) blockers.push({ type: 'credential-stale', profileId: profile.id, profileName: profile.name, message: `Retest ${profile.name} to refresh credential verification.` }); }
    return { enabled: true, ready: blockers.length === 0, policy, blockers, message: blockers.length === 0 ? 'Strict connection freshness requirements are satisfied.' : `${String(blockers.length)} strict connection freshness requirement(s) need attention.` };
  }

  private async runTest(profile: ResolvedBroadcastConnection, connectionIndex: number, record = true): Promise<Readonly<Record<string, unknown>>> { const startedAt = Date.now(); try { const snapshot = await this.createClient(profile).getSceneList(); const latencyMs = Date.now() - startedAt; if (record) { this.recordSnapshot(profile, latencyMs, snapshot.scenes.length); this.recordEvent(profile, 'test-succeeded', { latencyMs, sceneCount: snapshot.scenes.length }); } return { available: true, provider: profile.provider, connectionIndex, connectionId: profile.id, connectionName: profile.name, transport: 'direct-websocket', sceneCount: snapshot.scenes.length, currentScene: snapshot.currentScene, latencyMs, message: `Direct ${providerLabel(profile.provider)} WebSocket connected and returned ${String(snapshot.scenes.length)} scene(s).` }; } catch (error) { if (record) { this.recordError(profile, error); this.recordEvent(profile, 'test-failed', { detail: safeError(error) }); } return { available: false, provider: profile.provider, connectionIndex, connectionId: profile.id, connectionName: profile.name, transport: 'streamerbot-fallback', message: `Native connection failed: ${safeError(error)} Streamer.bot fallback remains available when configured.` }; } }

  private async profiles(): Promise<readonly ResolvedBroadcastConnection[]> {
    const stored = await this.vault.resolved(); const configured = new Set(stored.map((profile) => profile.provider)); return [...stored, ...this.environmentDefaults.filter((profile) => !configured.has(profile.provider))];
  }

  private async watchLoop(profile: ResolvedBroadcastConnection, signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      if (profile.maintenanceUntil !== undefined && Date.parse(profile.maintenanceUntil) > Date.now()) { this.pauseForMaintenance(profile); await delay(Math.min(this.pausePollMs, Math.max(250, Date.parse(profile.maintenanceUntil) - Date.now())), undefined, { signal }).catch(() => undefined); continue; }
      const application = await this.applicationState?.(profile).catch(() => ({ configured: false, running: true }));
      this.recordApplication(profile, application);
      if (application?.configured === true && !application.running) {
        this.pause(profile);
        await delay(this.pausePollMs, undefined, { signal }).catch(() => undefined);
        continue;
      }
      this.resume(profile);
      try {
        this.setState(profile, 'connecting'); const instance = this.createClient(profile); const startedAt = Date.now(); const snapshot = await instance.getSceneList(); this.recordSnapshot(profile, Date.now() - startedAt, snapshot.scenes.length); this.listener?.(profile.provider, snapshot); this.setState(profile, 'connected'); failures = 0;
        const applicationClosed = await this.watchUntilApplicationCloses(profile, instance, signal);
        if (applicationClosed) continue;
      } catch (error) { if (isActive(signal)) { failures += 1; this.recordError(profile, error); this.setState(profile, 'reconnecting'); } }
      if (isActive(signal)) await delay(Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5)), undefined, { signal }).catch(() => undefined);
    }
    this.setState(profile, 'stopped'); this.recordEvent(profile, 'stopped');
  }

  private async refreshAfterEvent(profile: ResolvedBroadcastConnection, instance: DirectSceneConnectionClient): Promise<void> { if (this.refreshes.has(profile.id)) return; this.refreshes.add(profile.id); const startedAt = Date.now(); try { const updated = await instance.getSceneList(); this.recordSnapshot(profile, Date.now() - startedAt, updated.scenes.length); this.listener?.(profile.provider, updated); } catch (error) { this.recordError(profile, error); } finally { this.refreshes.delete(profile.id); } }
  private async watchUntilApplicationCloses(profile: ResolvedBroadcastConnection, instance: DirectSceneConnectionClient, signal: AbortSignal): Promise<boolean> {
    if (this.applicationState === undefined) { await instance.watchChanges(() => { void this.refreshAfterEvent(profile, instance); }, signal); return false; }
    const local = new AbortController(); const stop = () => local.abort(); signal.addEventListener('abort', stop, { once: true });
    try {
      const watching = instance.watchChanges(() => { void this.refreshAfterEvent(profile, instance); }, local.signal);
      const applicationClosed = this.waitForApplicationClose(profile, local.signal);
      const outcome = await Promise.race([watching.then(() => 'watch-ended' as const), applicationClosed.then(() => 'application-closed' as const)]);
      local.abort(); await Promise.allSettled([watching, applicationClosed]);
      return outcome === 'application-closed' && isActive(signal);
    } finally { signal.removeEventListener('abort', stop); local.abort(); }
  }
  private async waitForApplicationClose(profile: ResolvedBroadcastConnection, signal: AbortSignal): Promise<void> {
    while (isActive(signal)) {
      await delay(this.pausePollMs, undefined, { signal }).catch(() => undefined);
      if (!isActive(signal)) return;
      const application = await this.applicationState?.(profile).catch(() => ({ configured: false, running: true }));
      if (application?.configured === true && !application.running) return;
    }
  }
  private pause(profile: ResolvedBroadcastConnection): void { const current = this.runtimes.get(profile.id); if (current?.state === 'paused') return; this.runtimes.set(profile.id, { ...(current ?? { profile, reconnectCount: 0 }), state: 'paused', pauseReason: `${providerLabel(profile.provider)} is not running. The native subscription will resume automatically after the app opens.` }); this.recordEvent(profile, 'paused', { detail: 'Application process is not running; reconnect attempts are paused.' }); }
  private pauseForMaintenance(profile: ResolvedBroadcastConnection): void { const current = this.runtimes.get(profile.id); const reason = `Maintenance snoozed until ${new Date(profile.maintenanceUntil ?? '').toLocaleString()}${profile.maintenanceReason === undefined ? '' : `: ${profile.maintenanceReason}`}.`; if (current?.state === 'paused' && current.pauseReason === reason) return; this.runtimes.set(profile.id, { ...(current ?? { profile, reconnectCount: 0 }), state: 'paused', pauseReason: reason }); this.recordEvent(profile, 'paused', { detail: 'Creator-approved maintenance snooze is active; reconnect and reliability alerts are paused.' }); }
  private recordApplication(profile: ResolvedBroadcastConnection, application: DirectSceneApplicationState | undefined): void { if (application === undefined) return; const current = this.runtimes.get(profile.id) ?? { profile, state: 'connecting' as const, reconnectCount: 0 }; const next: ConnectionRuntime = { ...current, ...(application.executableName === undefined ? {} : { applicationExecutableName: application.executableName }), ...(application.processId === undefined ? {} : { applicationProcessId: application.processId }), ...(application.differentInstallationProcessId === undefined ? {} : { differentInstallationProcessId: application.differentInstallationProcessId }) }; if (application.processId === undefined) delete next.applicationProcessId; if (application.differentInstallationProcessId === undefined) delete next.differentInstallationProcessId; this.runtimes.set(profile.id, next); }
  private resume(profile: ResolvedBroadcastConnection): void { const current = this.runtimes.get(profile.id); if (current?.state !== 'paused') return; const next: ConnectionRuntime = { ...current, state: 'connecting' }; delete next.pauseReason; this.runtimes.set(profile.id, next); this.recordEvent(profile, 'resumed', { detail: 'Application process detected; native subscription is resuming.' }); }
  private setState(profile: ResolvedBroadcastConnection, state: ConnectionRuntime['state']): void { const current = this.runtimes.get(profile.id) ?? { profile, state, reconnectCount: 0 }; const next: ConnectionRuntime = { ...current, state, ...(state === 'connected' ? { lastConnectedAt: new Date().toISOString() } : {}) }; if (state === 'connected') delete next.lastError; this.runtimes.set(profile.id, next); }
  private recordSnapshot(profile: ResolvedBroadcastConnection, latencyMs: number, sceneCount: number): void { const current = this.runtimes.get(profile.id) ?? { profile, state: 'connected' as const, reconnectCount: 0 }; const next: ConnectionRuntime = { ...current, state: 'connected', lastConnectedAt: current.lastConnectedAt ?? new Date().toISOString(), lastSnapshotAt: new Date().toISOString(), lastLatencyMs: latencyMs }; delete next.lastError; this.runtimes.set(profile.id, next); this.recordEvent(profile, current.lastSnapshotAt === undefined ? 'connected' : 'snapshot', { latencyMs, sceneCount }); }
  private recordError(profile: ResolvedBroadcastConnection, error: unknown): void { const current = this.runtimes.get(profile.id) ?? { profile, state: 'reconnecting' as const, reconnectCount: 0 }; const detail = safeError(error); this.runtimes.set(profile.id, { ...current, reconnectCount: current.reconnectCount + 1, lastError: detail }); this.recordEvent(profile, 'reconnecting', { detail }); }
  private async stopWatchers(): Promise<void> { this.controller?.abort(); this.controller = undefined; await Promise.allSettled(this.tasks); this.tasks = []; }
  private recordEvent(profile: ResolvedBroadcastConnection, type: ConnectionEvent['type'], detail: Pick<ConnectionEvent, 'latencyMs' | 'sceneCount' | 'detail'> = {}): void { this.events = [...this.events, { timestamp: new Date().toISOString(), connectionId: profile.id, connectionName: profile.name, provider: profile.provider, type, ...detail }].slice(-MAXIMUM_EVENTS); this.queueHistoryWrite(); }
  private async loadHistory(): Promise<void> { if (this.historyPath === undefined) return; try { const value = JSON.parse(await readFile(this.historyPath, 'utf8')) as unknown; if (Array.isArray(value)) this.events = value.flatMap(parseEvent).slice(-MAXIMUM_EVENTS); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.events = []; } }
  private async loadAcceptanceReceipts(): Promise<void> { const path = this.acceptanceHistoryPath(); if (path === undefined) return; try { const value = JSON.parse(await readFile(path, 'utf8')) as unknown; if (Array.isArray(value)) this.acceptanceReceipts = value.flatMap(parseAcceptanceReceipt).slice(-50); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.acceptanceReceipts = []; } }
  private async loadAcceptanceBaseline(): Promise<void> { const path = this.acceptanceBaselinePath(); if (path === undefined) return; try { const value = JSON.parse(await readFile(path, 'utf8')) as unknown; if (value !== null && typeof value === 'object' && !Array.isArray(value)) { const item = value as Record<string, unknown>; if (item['version'] === 1 && typeof item['approvedAt'] === 'string' && typeof item['receiptCheckedAt'] === 'string' && Number.isFinite(Date.parse(item['approvedAt'])) && Number.isFinite(Date.parse(item['receiptCheckedAt']))) this.acceptanceBaseline = { approvedAt: item['approvedAt'], receiptCheckedAt: item['receiptCheckedAt'] }; } } catch { this.acceptanceBaseline = undefined; } }
  private acceptanceComparisonReceipt(forNewReceipt = false): AcceptanceReceipt | undefined { return this.acceptanceBaseline === undefined ? this.acceptanceReceipts.at(forNewReceipt ? -1 : -2) : this.acceptanceReceipts.findLast((receipt) => receipt.checkedAt === this.acceptanceBaseline?.receiptCheckedAt) ?? this.acceptanceReceipts.at(forNewReceipt ? -1 : -2); }
  private acceptanceHistoryPath(): string | undefined { return this.historyPath === undefined ? undefined : join(dirname(this.historyPath), 'broadcast-acceptance-receipts.json'); }
  private acceptanceBaselinePath(): string | undefined { return this.historyPath === undefined ? undefined : join(dirname(this.historyPath), 'broadcast-acceptance-baseline.json'); }
  private reliabilitySnapshotsPath(): string | undefined { return this.historyPath === undefined ? undefined : join(dirname(this.historyPath), 'broadcast-reliability-snapshots.json'); }
  private async writeAcceptanceReceipts(): Promise<void> { const path = this.acceptanceHistoryPath(); if (path === undefined) return; await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify(this.acceptanceReceipts, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
  private async writeAcceptanceBaseline(): Promise<void> { const path = this.acceptanceBaselinePath(); if (path === undefined || this.acceptanceBaseline === undefined) return; await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify({ version: 1, ...this.acceptanceBaseline }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
  private async loadReliabilitySnapshots(): Promise<void> { const path = this.reliabilitySnapshotsPath(); if (path === undefined) return; try { const value = JSON.parse(await readFile(path, 'utf8')) as unknown; if (Array.isArray(value)) this.reliabilitySnapshots = value.flatMap(parseReliabilitySnapshot).slice(-30); } catch { this.reliabilitySnapshots = []; } }
  private async writeReliabilitySnapshots(): Promise<void> { const path = this.reliabilitySnapshotsPath(); if (path === undefined) return; await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify(this.reliabilitySnapshots, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, path); }
  private queueHistoryWrite(): void { if (this.historyPath === undefined) return; const snapshot = this.events; this.eventWrites = this.eventWrites.then(async () => { await mkdir(dirname(this.historyPath as string), { recursive: true }); const temporary = `${this.historyPath as string}.${String(process.pid)}.tmp`; await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, this.historyPath as string); }).catch(() => undefined); }
}

export class DirectSceneConnectionError extends Error { public constructor(public readonly statusCode: number, message: string) { super(message); } }

function client(profile: ResolvedBroadcastConnection): DirectSceneConnectionClient {
  if (profile.provider === 'obs') return new ObsDirectSceneClient(profile.url, profile.credential, 4_000, profile.id, profile.name);
  if (profile.provider === 'meld') return new MeldDirectSceneClient(profile.url, 4_000, profile.id, profile.name);
  return new StreamlabsDirectSceneClient(profile.url, profile.credential, 4_000, profile.id, profile.name);
}
function safeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replaceAll(/\b(?:password|token|secret)\s*[:=]\s*\S+/giu, '[REDACTED]').slice(0, 500); }
function providerLabel(provider: BroadcastConnectionProvider): string { return provider === 'obs' ? 'OBS' : provider === 'meld' ? 'Meld Studio' : 'Streamlabs Desktop'; }
function isActive(signal: AbortSignal): boolean { return !signal.aborted; }
function parseEvent(value: unknown): ConnectionEvent[] { if (value === null || typeof value !== 'object' || Array.isArray(value)) return []; const item = value as Record<string, unknown>; const type = item['type']; const provider = item['provider']; if (typeof item['timestamp'] !== 'string' || typeof item['connectionId'] !== 'string' || typeof item['connectionName'] !== 'string' || (provider !== 'obs' && provider !== 'meld' && provider !== 'streamlabs') || !['configured', 'connected', 'snapshot', 'reconnecting', 'paused', 'resumed', 'stopped', 'test-succeeded', 'test-failed'].includes(String(type))) return []; return [{ timestamp: item['timestamp'], connectionId: item['connectionId'], connectionName: item['connectionName'], provider, type: type as ConnectionEvent['type'], ...(typeof item['latencyMs'] === 'number' ? { latencyMs: item['latencyMs'] } : {}), ...(typeof item['sceneCount'] === 'number' ? { sceneCount: item['sceneCount'] } : {}), ...(typeof item['detail'] === 'string' ? { detail: safeError(item['detail']) } : {}) }]; }
function sanitizeAcceptanceResult(value: Readonly<Record<string, unknown>>): AcceptanceResult[] { const provider = value['provider']; if (provider !== 'obs' && provider !== 'meld' && provider !== 'streamlabs' || typeof value['outcome'] !== 'string') return []; return [{ provider, outcome: value['outcome'].slice(0, 40), ...(Number.isInteger(value['processId']) ? { processId: value['processId'] as number } : {}), ...(typeof value['executable'] === 'string' ? { executable: value['executable'].slice(0, 120) } : {}), ...(Number.isInteger(value['sceneCount']) ? { sceneCount: value['sceneCount'] as number } : {}), ...(Number.isInteger(value['latencyMs']) ? { latencyMs: value['latencyMs'] as number } : {}) }]; }
function parseAcceptanceReceipt(value: unknown): AcceptanceReceipt[] { if (value === null || typeof value !== 'object' || Array.isArray(value)) return []; const item = value as Record<string, unknown>; if (typeof item['checkedAt'] !== 'string' || !Number.isFinite(Date.parse(item['checkedAt'])) || !Array.isArray(item['results'])) return []; return [{ checkedAt: item['checkedAt'], results: item['results'].flatMap((result) => result !== null && typeof result === 'object' && !Array.isArray(result) ? sanitizeAcceptanceResult(result as Record<string, unknown>) : []) }]; }
function parseReliabilitySnapshot(value: unknown): ReliabilitySnapshot[] { if (value === null || typeof value !== 'object' || Array.isArray(value)) return []; const item = value as Record<string, unknown>; if (typeof item['capturedAt'] !== 'string' || !Number.isFinite(Date.parse(item['capturedAt'])) || !Array.isArray(item['profiles'])) return []; const profiles = item['profiles'].flatMap((profile) => { if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) return []; const entry = profile as Record<string, unknown>; if (typeof entry['name'] !== 'string' || typeof entry['provider'] !== 'string') return []; const reliability = entry['reliability']; const safeReliability = reliability !== null && typeof reliability === 'object' && !Array.isArray(reliability) ? reliability as Record<string, unknown> : {}; return [{ name: entry['name'].slice(0, 60), provider: entry['provider'].slice(0, 20), state: typeof entry['state'] === 'string' ? entry['state'].slice(0, 20) : '', reconnectCount: typeof entry['reconnectCount'] === 'number' ? entry['reconnectCount'] : 0, ...(typeof entry['lastLatencyMs'] === 'number' ? { lastLatencyMs: entry['lastLatencyMs'] } : {}), reliability: { score: typeof safeReliability['score'] === 'number' ? safeReliability['score'] : 0, label: typeof safeReliability['label'] === 'string' ? safeReliability['label'].slice(0, 20) : 'unknown' } }]; }); return [{ capturedAt: item['capturedAt'], profiles }]; }
function compareReliabilitySnapshots(previous: ReliabilitySnapshot | undefined, current: ReliabilitySnapshot): Readonly<Record<string, unknown>> { if (previous === undefined) return { available: false, changes: [], regressions: 0, improvements: 0, summary: 'First redacted reliability snapshot saved.' }; const changes = current.profiles.flatMap((profile) => { const before = previous.profiles.find((candidate) => candidate['name'] === profile['name'] && candidate['provider'] === profile['provider']); const beforeReliability = before?.['reliability'] as Readonly<Record<string, unknown>> | undefined; const currentReliability = profile['reliability'] as Readonly<Record<string, unknown>> | undefined; const beforeScore = typeof beforeReliability?.['score'] === 'number' ? beforeReliability['score'] : undefined; const currentScore = typeof currentReliability?.['score'] === 'number' ? currentReliability['score'] : undefined; return beforeScore === undefined || currentScore === undefined || beforeScore === currentScore ? [] : [{ name: profile['name'], provider: profile['provider'], beforeScore, currentScore, change: currentScore - beforeScore, severity: currentScore < beforeScore ? 'regression' : 'improvement' }]; }); const regressions = changes.filter((change) => change.severity === 'regression').length; const improvements = changes.filter((change) => change.severity === 'improvement').length; return { available: true, previousCapturedAt: previous.capturedAt, currentCapturedAt: current.capturedAt, changes, regressions, improvements, summary: regressions > 0 ? `${String(regressions)} reliability regression${regressions === 1 ? '' : 's'} since the previous snapshot.` : improvements > 0 ? `${String(improvements)} reliability improvement${improvements === 1 ? '' : 's'} since the previous snapshot.` : 'No reliability score changes since the previous snapshot.' }; }
function compareAcceptance(previous?: AcceptanceReceipt, current?: AcceptanceReceipt): Readonly<Record<string, unknown>> { if (current === undefined) return { available: false, regressions: [], improvements: [], summary: 'Run installed-app acceptance to create the first receipt.' }; if (previous === undefined) return { available: true, baseline: true, regressions: [], improvements: [], summary: 'First sanitized acceptance baseline recorded.' }; const regressions: Readonly<Record<string, unknown>>[] = []; const improvements: Readonly<Record<string, unknown>>[] = []; for (const result of current.results) { const before = previous.results.find((entry) => entry.provider === result.provider); if (before === undefined) continue; if (before.outcome === 'passed' && result.outcome !== 'passed') regressions.push({ provider: result.provider, kind: 'outcome', before: before.outcome, after: result.outcome }); else if (before.outcome !== 'passed' && result.outcome === 'passed') improvements.push({ provider: result.provider, kind: 'outcome', before: before.outcome, after: result.outcome }); if (before.outcome === 'passed' && result.outcome === 'passed' && before.sceneCount !== undefined && result.sceneCount !== undefined && result.sceneCount < before.sceneCount) regressions.push({ provider: result.provider, kind: 'scene-count', before: before.sceneCount, after: result.sceneCount }); if (before.latencyMs !== undefined && result.latencyMs !== undefined && result.latencyMs >= Math.max(250, before.latencyMs * 2) && result.latencyMs - before.latencyMs >= 100) regressions.push({ provider: result.provider, kind: 'latency', beforeMs: before.latencyMs, afterMs: result.latencyMs }); } return { available: true, baseline: false, previousCheckedAt: previous.checkedAt, currentCheckedAt: current.checkedAt, regressions, improvements, summary: regressions.length > 0 ? `${String(regressions.length)} installed-app acceptance regression${regressions.length === 1 ? '' : 's'} detected.` : improvements.length > 0 ? `${String(improvements.length)} installed-app acceptance improvement${improvements.length === 1 ? '' : 's'} detected.` : 'No installed-app acceptance regressions detected.' }; }
async function portListening(url: URL): Promise<boolean> { return await new Promise<boolean>((resolve) => { const socket = createConnection({ host: url.hostname.replace(/^\[|\]$/gu, ''), port: Number(url.port) }); const done = (value: boolean) => { socket.destroy(); resolve(value); }; socket.setTimeout(500); socket.once('connect', () => done(true)); socket.once('timeout', () => done(false)); socket.once('error', () => done(false)); }); }
function connectionTrends(events: readonly ConnectionEvent[]): Readonly<Record<string, unknown>> { const cutoff = Date.now() - 30 * 60_000; const recent = events.filter((event) => Date.parse(event.timestamp) >= cutoff); const ids = [...new Set(recent.map((event) => event.connectionId))]; return { windowMinutes: 30, generatedAt: new Date().toISOString(), connections: ids.map((id) => { const selected = recent.filter((event) => event.connectionId === id); const latencies = selected.flatMap((event) => event.latencyMs === undefined ? [] : [event.latencyMs]).sort((a, b) => a - b); const sample = selected[0]; return { connectionId: id, connectionName: sample?.connectionName, provider: sample?.provider, latencySamples: latencies.length, averageLatencyMs: latencies.length === 0 ? undefined : Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length), maximumLatencyMs: latencies.at(-1), p95LatencyMs: latencies.length === 0 ? undefined : latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)], reconnects: selected.filter((event) => event.type === 'reconnecting').length, pauses: selected.filter((event) => event.type === 'paused').length, failedTests: selected.filter((event) => event.type === 'test-failed').length }; }) }; }
function reliabilityScores(runtimes: readonly ConnectionRuntime[], trends: Readonly<Record<string, unknown>>, latest?: AcceptanceReceipt): readonly Readonly<Record<string, unknown>>[] { const trendConnections = Array.isArray(trends['connections']) ? trends['connections'] as Readonly<Record<string, unknown>>[] : []; return runtimes.map((runtime) => { const trend = trendConnections.find((item) => item['connectionId'] === runtime.profile.id); const reconnects = typeof trend?.['reconnects'] === 'number' ? trend['reconnects'] : runtime.reconnectCount; const failedTests = typeof trend?.['failedTests'] === 'number' ? trend['failedTests'] : 0; const p95 = typeof trend?.['p95LatencyMs'] === 'number' ? trend['p95LatencyMs'] : runtime.lastLatencyMs; const factors: string[] = []; let score = 100; if (reconnects > 0) { const deduction = Math.min(30, reconnects * 6); score -= deduction; factors.push(`${String(reconnects)} reconnect(s): -${String(deduction)}`); } if (failedTests > 0) { const deduction = Math.min(30, failedTests * 10); score -= deduction; factors.push(`${String(failedTests)} failed test(s): -${String(deduction)}`); } if (p95 !== undefined && p95 >= (runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS)) { score -= 25; factors.push(`p95 latency ${String(p95)} ms crossed threshold: -25`); } const acceptance = latest?.results.find((result) => result.provider === runtime.profile.provider); if (acceptance !== undefined && acceptance.outcome !== 'passed' && acceptance.outcome !== 'not-installed') { score -= 25; factors.push(`latest acceptance ${acceptance.outcome}: -25`); } score = Math.max(0, score); return { connectionId: runtime.profile.id, connectionName: runtime.profile.name, provider: runtime.profile.provider, score, label: score >= 90 ? 'stable' : score >= 70 ? 'watch' : 'attention', factors: factors.length === 0 ? ['No recent reliability deductions.'] : factors }; }); }
function notificationSummary(runtimes: readonly ConnectionRuntime[], trends: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { const processBindings = runtimes.filter((runtime) => runtime.applicationProcessId !== undefined).map((runtime) => ({ connectionId: runtime.profile.id, connectionName: runtime.profile.name, provider: runtime.profile.provider, processId: runtime.applicationProcessId, executable: runtime.applicationExecutableName })).sort((left, right) => left.connectionId.localeCompare(right.connectionId)); const trendConnections = Array.isArray(trends['connections']) ? trends['connections'] as Readonly<Record<string, unknown>>[] : []; const latencyBreaches = runtimes.flatMap((runtime) => { const thresholdMs = runtime.profile.latencyWarningMs ?? WARNING_LATENCY_MS; const trend = trendConnections.find((item) => item['connectionId'] === runtime.profile.id); const observedMs = typeof trend?.['p95LatencyMs'] === 'number' ? trend['p95LatencyMs'] : runtime.lastLatencyMs; return observedMs !== undefined && observedMs >= thresholdMs ? [{ connectionId: runtime.profile.id, connectionName: runtime.profile.name, provider: runtime.profile.provider, observedMs, thresholdMs }] : []; }); return { processSignature: processBindings.map((item) => `${item.connectionId}:${String(item.processId)}:${item.executable ?? ''}`).join('|'), processBindings, latencySignature: latencyBreaches.map((item) => `${item.connectionId}:${String(item.thresholdMs)}`).join('|'), latencyBreaches }; }
