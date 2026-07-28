import type { NormalizedEvent } from '../../schemas/event.js';
import { z } from 'zod';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import { moduleManifestV2Schema, type ModuleManifestV2 } from '../contracts/v2/module-manifest.js';
import type { ModuleHealthStatusV2 } from '../contracts/v2/health.js';
import type { Logger } from '../services/logger.js';
import type { ChatGuardAdminRequestV1, ChatGuardAdminResultV1, CommunityAnalyticsAdminRequestV1, CommunityAnalyticsAdminResultV1, ModuleRuntimeContextV2, ViewerFoundationAdminRequestV1, ViewerFoundationAdminResultV1, ViewerSpotlightAdminRequestV1, ViewerSpotlightAdminResultV1 } from '../contracts/v2/addon-capability.js';
import { AddOnCapabilityBroker, type ModuleCapabilityGrant } from './addon-capability-broker.js';

export interface FrameworkModule {
  readonly manifest: ModuleManifestV2;
  readonly required: boolean;
  /** Assigned by the verified package loader. Add-on code cannot expand this grant. */
  readonly capabilityGrant?: ModuleCapabilityGrant;
  /** The add-on's own creator-saved settings, validated against its configurationSchema with defaults applied. Assigned by the loader; not settable by add-on code. */
  readonly settings?: Readonly<Record<string, unknown>>;
  start?(context: ModuleRuntimeContextV2): Promise<void>;
  stop?(context: ModuleRuntimeContextV2): Promise<void>;
  onEvent?(event: NormalizedEvent, context: ModuleRuntimeContextV2): Promise<void>;
  /** Host-only administration; never exposed through ModuleRuntimeContextV2. */
  administerCommunityAnalytics?(request: CommunityAnalyticsAdminRequestV1, context: ModuleRuntimeContextV2): Promise<CommunityAnalyticsAdminResultV1>;
  administerViewerSpotlight?(request: ViewerSpotlightAdminRequestV1, context: ModuleRuntimeContextV2): Promise<ViewerSpotlightAdminResultV1>;
  administerChatGuard?(request: ChatGuardAdminRequestV1, context: ModuleRuntimeContextV2): Promise<ChatGuardAdminResultV1>;
}

interface ModuleRuntimeState {
  readonly module: FrameworkModule;
  readonly context: ModuleRuntimeContextV2;
  status: 'stopped' | 'healthy' | 'failed';
  message: string | undefined;
}

export class ModuleRegistry {
  private readonly states = new Map<string, ModuleRuntimeState>();
  private readonly order: readonly string[];

  private readonly broker: AddOnCapabilityBroker;

  public constructor(modules: readonly FrameworkModule[], private readonly logger: Logger, private readonly optionalModuleTimeoutMs = 5_000, broker?: AddOnCapabilityBroker) {
    this.broker = broker ?? new AddOnCapabilityBroker(logger, 'data/addons/.state');
    for (const module of modules) {
      const manifest = moduleManifestV2Schema.parse(module.manifest);
      if (this.states.has(manifest.moduleId)) throw new Error(`Module ${manifest.moduleId} is registered more than once.`);
      if (module.capabilityGrant !== undefined && module.capabilityGrant.moduleId !== manifest.moduleId) throw new Error(`Capability grant for ${module.capabilityGrant.moduleId} cannot be assigned to ${manifest.moduleId}.`);
      const normalized = { ...module, manifest };
      const context = this.broker.contextFor(normalized.capabilityGrant ?? { moduleId: manifest.moduleId, permissions: [], approvedActionIds: [] }, normalized.settings ?? {}, manifest.dependencies);
      this.states.set(manifest.moduleId, { module: normalized, context, status: 'stopped', message: undefined });
    }
    this.order = resolveModuleOrder(this.states);
  }

  public async start(): Promise<void> {
    for (const moduleId of this.order) {
      const state = this.states.get(moduleId);
      if (state === undefined) continue;
      const unavailableDependency = state.module.manifest.dependencies.find((dependency) => this.states.get(dependency)?.status !== 'healthy');
      if (unavailableDependency !== undefined) {
        state.status = 'failed';
        state.message = `Dependency ${unavailableDependency} is unavailable.`;
        this.logger.error('Framework module dependency is unavailable', { moduleId, dependency: unavailableDependency });
        continue;
      }
      try {
        await this.runWithIsolation(state.module, 'start', state.module.start === undefined ? undefined : () => state.module.start?.(state.context));
        state.status = 'healthy';
        state.message = undefined;
        this.logger.info('Framework module started', { moduleId, version: state.module.manifest.version });
      } catch (error) {
        state.status = 'failed';
        state.message = error instanceof Error ? error.message : String(error);
        this.broker.cleanup(moduleId);
        this.logger.error('Framework module failed to start; other modules remain active', { moduleId, required: state.module.required, error });
      }
    }
  }

  public async stop(): Promise<void> {
    for (const moduleId of [...this.order].reverse()) {
      const state = this.states.get(moduleId);
      if (state === undefined || state.status === 'stopped') continue;
      try { await this.runWithIsolation(state.module, 'stop', state.module.stop === undefined ? undefined : () => state.module.stop?.(state.context)); }
      catch (error) { this.logger.warn('Framework module stop failed', { moduleId, error }); }
      this.broker.cleanup(moduleId);
      state.status = 'stopped';
      state.message = undefined;
    }
  }

  public async publish(event: NormalizedEvent, blockedModuleIds: ReadonlySet<string> = new Set()): Promise<void> {
    for (const moduleId of this.order) {
      if (blockedModuleIds.has(moduleId)) continue;
      const state = this.states.get(moduleId);
      if (state?.status !== 'healthy' || state.module.onEvent === undefined) continue;
      if (!state.module.manifest.eventSubscriptions.includes(event.eventType)) continue;
      try { await this.runWithIsolation(state.module, 'event handler', () => state.module.onEvent?.(event, state.context)); }
      catch (error) {
        state.status = 'failed';
        state.message = error instanceof Error ? error.message : String(error);
        this.broker.cleanup(moduleId);
        this.logger.error('Framework module event handler failed; event delivery continues', { moduleId, eventId: event.eventId, eventType: event.eventType, required: state.module.required, error });
      }
    }
  }

  public ready(): boolean {
    return [...this.states.values()].every((state) => !state.module.required || state.status === 'healthy');
  }

  public statuses(): readonly ModuleHealthStatusV2[] {
    const checkedAt = new Date().toISOString();
    return this.order.map((moduleId) => {
      const state = this.states.get(moduleId);
      if (state === undefined) throw new Error(`Module state disappeared: ${moduleId}`);
      const status = state.status === 'failed' ? 'failed' : state.status;
      const failures = state.message === undefined ? [] : [{ checkId: `${moduleId}.runtime`, message: state.message }];
      return {
        contractVersion: CORE_CONTRACT_VERSION,
        moduleId,
        status,
        checkedAt,
        failures,
        ...(state.message === undefined ? {} : { message: state.message }),
      };
    });
  }

  public capabilityDiagnostics(): Readonly<Record<string, unknown>> { return this.broker.diagnostics(); }

  public administerViewerFoundation(request: ViewerFoundationAdminRequestV1): Promise<ViewerFoundationAdminResultV1> {
    return this.broker.administerViewerFoundation(request);
  }

  public async administerCommunityAnalytics(request: CommunityAnalyticsAdminRequestV1): Promise<CommunityAnalyticsAdminResultV1> {
    const parsed = communityAnalyticsAdminSchema.parse(request) as CommunityAnalyticsAdminRequestV1;
    const state = this.states.get('thsv.community-analytics');
    if (state?.status !== 'healthy' || state.module.administerCommunityAnalytics === undefined) throw new Error('Community Analytics is unavailable. Enable it and restart StreamBridge.');
    const result = await withTimeout(state.module.administerCommunityAnalytics(parsed, state.context), this.optionalModuleTimeoutMs, 'Community Analytics administration');
    return Object.freeze(communityAnalyticsAdminResultSchema.parse(result));
  }

  public async administerViewerSpotlight(request: ViewerSpotlightAdminRequestV1): Promise<ViewerSpotlightAdminResultV1> {
    const parsed = viewerSpotlightAdminSchema.parse(request) as ViewerSpotlightAdminRequestV1;
    const state = this.states.get('thsv.viewer-spotlight');
    if (state?.status !== 'healthy' || state.module.administerViewerSpotlight === undefined) throw new Error('Viewer Spotlight is unavailable. Enable it and restart StreamBridge.');
    const result = await withTimeout(state.module.administerViewerSpotlight(parsed, state.context), this.optionalModuleTimeoutMs, 'Viewer Spotlight administration');
    return Object.freeze(viewerSpotlightAdminResultSchema.parse(result));
  }

  public async administerChatGuard(request: ChatGuardAdminRequestV1): Promise<ChatGuardAdminResultV1> {
    const parsed = chatGuardAdminSchema.parse(request) as ChatGuardAdminRequestV1;
    const state = this.states.get('thsv.chat-guard');
    if (state?.status !== 'healthy' || state.module.administerChatGuard === undefined) throw new Error('Chat Guard is unavailable. Enable it and restart StreamBridge.');
    const result = await withTimeout(state.module.administerChatGuard(parsed, state.context), this.optionalModuleTimeoutMs, 'Chat Guard administration');
    return Object.freeze(chatGuardAdminResultSchema.parse(result));
  }

  private async runWithIsolation(module: FrameworkModule, operation: string, callback: (() => Promise<void> | undefined) | undefined): Promise<void> {
    if (callback === undefined) return;
    const pending = callback();
    if (pending === undefined || module.required) { await pending; return; }
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new Error(`Optional module ${module.manifest.moduleId} ${operation} exceeded ${String(this.optionalModuleTimeoutMs)}ms.`)); }, this.optionalModuleTimeoutMs); }),
      ]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

const viewerIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const communityAnalyticsAdminSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('export'), viewerId: viewerIdSchema }).strict(),
  z.object({ operation: z.literal('delete'), viewerId: viewerIdSchema, approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('report'), reportKind: z.enum(['session-json', 'viewers-csv']) }).strict(),
]);
const communityAnalyticsAdminResultSchema = z.record(z.string().min(1).max(100), z.json()).refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 65_536, 'Community Analytics administration result exceeded the safe response size.');
const viewerSpotlightAdminSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('stream-score'), approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('display'), platform: z.enum(['twitch', 'youtube', 'kick', 'tiktok']), userId: z.string().trim().min(1).max(256), displayName: z.string().trim().min(1).max(80), avatarUrl: z.url().max(2_048).refine((value) => new URL(value).protocol === 'https:', 'avatarUrl must use HTTPS').optional(), sendDiscord: z.boolean().optional(), approvedByCreator: z.literal(true) }).strict(),
]);
const viewerSpotlightAdminResultSchema = z.record(z.string().min(1).max(100), z.json()).refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 65_536, 'Viewer Spotlight administration result exceeded the safe response size.');
const chatGuardAdminSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('test'), message: z.string().trim().min(1).max(2_000), priorMatchingMessages: z.number().int().min(0).max(9) }).strict(),
  z.object({ operation: z.literal('permit'), platform: z.enum(['twitch', 'youtube', 'kick', 'tiktok']), userId: z.string().trim().min(1).max(256), durationMinutes: z.number().int().min(1).max(1_440), maximumUses: z.number().int().min(1).max(20), approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('clear-permits'), approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('review'), incidentId: z.string().regex(/^[a-f0-9]{64}$/u), decision: z.enum(['confirmed', 'false-positive']), approvedByCreator: z.literal(true) }).strict(),
  z.object({ operation: z.literal('clear'), approvedByCreator: z.literal(true) }).strict(),
]);
const chatGuardAdminResultSchema = z.record(z.string().min(1).max(100), z.json()).refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 65_536, 'Chat Guard administration result exceeded the safe response size.');

async function withTimeout<T>(pending: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([pending, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${String(timeoutMs)}ms.`)), timeoutMs); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

function resolveModuleOrder(states: ReadonlyMap<string, ModuleRuntimeState>): readonly string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: string[] = [];
  const visit = (moduleId: string): void => {
    if (visited.has(moduleId)) return;
    if (visiting.has(moduleId)) throw new Error(`Module dependency cycle includes ${moduleId}.`);
    const state = states.get(moduleId);
    if (state === undefined) throw new Error(`Module dependency ${moduleId} is not installed.`);
    visiting.add(moduleId);
    for (const dependency of state.module.manifest.dependencies) {
      if (!states.has(dependency)) {
        if (state.module.required) throw new Error(`Module dependency ${dependency} is not installed.`);
        continue;
      }
      visit(dependency);
    }
    visiting.delete(moduleId);
    visited.add(moduleId);
    result.push(moduleId);
  };
  for (const moduleId of states.keys()) visit(moduleId);
  return result;
}
