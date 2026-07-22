import type { NormalizedEvent } from '../../schemas/event.js';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import { moduleManifestV2Schema, type ModuleManifestV2 } from '../contracts/v2/module-manifest.js';
import type { ModuleHealthStatusV2 } from '../contracts/v2/health.js';
import type { Logger } from '../services/logger.js';
import type { ModuleRuntimeContextV2 } from '../contracts/v2/addon-capability.js';
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
      const context = this.broker.contextFor(normalized.capabilityGrant ?? { moduleId: manifest.moduleId, permissions: [], approvedActionIds: [] }, normalized.settings ?? {});
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
    for (const dependency of state.module.manifest.dependencies) visit(dependency);
    visiting.delete(moduleId);
    visited.add(moduleId);
    result.push(moduleId);
  };
  for (const moduleId of states.keys()) visit(moduleId);
  return result;
}
