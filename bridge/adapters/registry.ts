import type { BridgeConfig, Capability, OutputConfig, PlatformConfig } from '../../schemas/config.js';
import { PLATFORM_CAPABILITY_IDS, type PlatformCapabilityId, type PlatformCapabilityReport } from '../contracts/v2/capability.js';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import type { Logger } from '../services/logger.js';
import type { InputAdapter, OutputAdapter } from './adapter.js';
import { MockAdapter } from './mock-adapter.js';
import { PlaceholderAdapter } from './placeholder-adapter.js';
import { StreamerBotAdapter } from './streamerbot-adapter.js';
import { TimedActionsAdapter } from './timed-actions-adapter.js';
import { StreamerBotEventRelay } from './streamerbot-event-relay.js';
import { TikfinityAdapter } from './tikfinity-adapter.js';
import { StreamerBotNativeAdapter } from './streamerbot-native-adapter.js';
import { StreamerBotAddOnRelayAdapter } from './streamerbot-addon-relay-adapter.js';

export type InputAdapterFactory = (name: string, config: PlatformConfig) => InputAdapter;
export type OutputAdapterFactory = (name: string, config: OutputConfig) => OutputAdapter;
export type InternalInputAdapterFactory = () => InputAdapter;

export interface InputProviderCapabilities {
  readonly legacy: readonly Capability[];
  readonly supported: readonly PlatformCapabilityId[];
  readonly verification: 'verified' | 'unverified';
  readonly limitations?: readonly string[];
  readonly allowUnsupportedLegacyClaims?: true;
}

export type InputProviderDeclaration = (platform: string) => InputProviderCapabilities;

interface RegisteredInputProvider {
  readonly factory: InputAdapterFactory;
  readonly declaration?: InputProviderDeclaration;
}

export class AdapterRegistry {
  private readonly inputFactories = new Map<string, RegisteredInputProvider>();
  private readonly internalInputFactories = new Map<string, InternalInputAdapterFactory>();
  private readonly outputFactories = new Map<string, OutputAdapterFactory>();

  public registerInput(provider: string, factory: InputAdapterFactory, declaration?: InputProviderDeclaration): this {
    if (this.inputFactories.has(provider)) throw new Error(`Input adapter provider is already registered: ${provider}`);
    this.inputFactories.set(provider, { factory, ...(declaration === undefined ? {} : { declaration }) });
    return this;
  }

  public registerOutput(provider: string, factory: OutputAdapterFactory): this {
    if (this.outputFactories.has(provider)) throw new Error(`Output adapter provider is already registered: ${provider}`);
    this.outputFactories.set(provider, factory);
    return this;
  }

  public registerInternalInput(provider: string, factory: InternalInputAdapterFactory): this {
    if (this.inputFactories.has(provider) || this.internalInputFactories.has(provider)) throw new Error(`Input adapter provider is already registered: ${provider}`);
    this.internalInputFactories.set(provider, factory);
    return this;
  }

  public createInputs(platforms: Readonly<Record<string, PlatformConfig>>): InputAdapter[] {
    const configured = Object.entries(platforms).filter(([, config]) => !this.internalInputFactories.has(config.adapter)).map(([name, config]) => {
      const provider = this.inputFactories.get(config.adapter);
      if (provider === undefined) throw new Error(`No input adapter registered for provider ${config.adapter} (platform ${name})`);
      const declared = provider.declaration?.(name);
      if (declared !== undefined) {
        const unsupportedClaims = config.capabilities.filter((capability) => !declared.legacy.includes(capability));
        if (unsupportedClaims.length > 0 && declared.allowUnsupportedLegacyClaims !== true) throw new Error(`Platform ${name} claims capabilities not declared by provider ${config.adapter}: ${unsupportedClaims.join(', ')}`);
      }
      const authoritativeConfig = declared === undefined ? { ...config, enabled: config.enabled && config.inputEnabled } : { ...config, enabled: config.enabled && config.inputEnabled, capabilities: [...declared.legacy] };
      return provider.factory(name, authoritativeConfig);
    });
    return [...configured, ...[...this.internalInputFactories.values()].map((factory) => factory())];
  }

  public capabilityReports(platforms: Readonly<Record<string, PlatformConfig>>): readonly PlatformCapabilityReport[] {
    return Object.entries(platforms).filter(([, config]) => !this.internalInputFactories.has(config.adapter)).map(([platform, config]) => {
      const registered = this.inputFactories.get(config.adapter);
      if (registered === undefined) throw new Error(`No input adapter registered for provider ${config.adapter} (platform ${platform})`);
      const declaration = registered.declaration?.(platform);
      const supported = new Set(declaration?.supported ?? []);
      const verification = declaration?.verification ?? 'unverified';
      return {
        contractVersion: CORE_CONTRACT_VERSION,
        platform,
        adapterId: config.adapter,
        reportedAt: new Date().toISOString(),
        capabilities: Object.fromEntries(PLATFORM_CAPABILITY_IDS.map((id) => [id, supported.has(id)
          ? { supported: true, verification }
          : { supported: false, verification: 'unsupported', reason: 'The selected provider does not declare this capability.' }])) as PlatformCapabilityReport['capabilities'],
        limitations: [...(declaration?.limitations ?? ['This third-party provider has not published an authoritative capability declaration.'])],
      };
    });
  }

  public createOutputs(outputs: Readonly<Record<string, OutputConfig>>): OutputAdapter[] {
    return Object.entries(outputs).filter(([, config]) => config.enabled).map(([name, config]) => {
      const factory = this.outputFactories.get(config.adapter);
      if (factory === undefined) throw new Error(`No output adapter registered for provider ${config.adapter} (output ${name})`);
      return factory(name, config);
    });
  }
}

export function createDefaultAdapterRegistry(config: BridgeConfig, logger: Logger): AdapterRegistry {
  const registry = new AdapterRegistry();
  const streamerBotEventRelay = new StreamerBotEventRelay();
  registry.registerInput('mock', (name, platform) => new MockAdapter(name, platform), () => ({
    legacy: ['chatInput', 'follows', 'subscriptions', 'gifts', 'donations', 'raids', 'moderation', 'engagement', 'channelUpdates', 'timedActions', 'rewards'],
    supported: ['chat.input', 'commands', 'follows', 'subscriptions', 'gift-subscriptions', 'raids', 'cheers', 'donations', 'gifts', 'moderation', 'stream-status', 'channel-rewards.redemptions'],
    verification: 'verified', limitations: ['Verified simulator only; this is not a production platform transport.'],
  }));
  registry.registerInput('timed-actions', (name, platform) => new TimedActionsAdapter(name, platform, config.timedActions), () => ({
    legacy: ['timedActions'], supported: [], verification: 'verified', limitations: ['Internal timer source; platform capability IDs do not apply.'],
  }));
  registry.registerInput('tikfinity-streamerbot', (name, platform) => new TikfinityAdapter(name, platform, streamerBotEventRelay), () => ({
    legacy: ['chatInput', 'follows', 'subscriptions', 'gifts', 'engagement'], supported: ['chat.input', 'commands', 'follows', 'subscriptions', 'gifts'], verification: 'unverified',
    limitations: ['TikFinity field mappings remain third-party and must be verified against the installed version.'],
  }));
  registry.registerInput('streamerbot-native', (name, platform) => new StreamerBotNativeAdapter(name, platform, streamerBotEventRelay), nativeCapabilities);
  registry.registerInternalInput('streamerbot-addon-relay', () => new StreamerBotAddOnRelayAdapter('addons', {
    enabled: config.streamerbot.enabled,
    inputEnabled: true,
    outputEnabled: false,
    adapter: 'streamerbot-addon-relay',
    capabilities: [],
    reconnect: { enabled: false, initialDelayMs: 10, maxDelayMs: 10, maxAttempts: 0 },
  }, streamerBotEventRelay));
  for (const provider of ['twitch-placeholder', 'youtube-placeholder', 'kick-placeholder', 'tikfinity-placeholder']) {
    registry.registerInput(provider, (name, platform) => new PlaceholderAdapter(name, platform, `${provider} has no production transport in Milestone 1.`), () => ({ legacy: [], supported: [], verification: 'unverified', limitations: ['Placeholder provider has no production transport.'], allowUnsupportedLegacyClaims: true }));
  }
  registry.registerOutput('streamerbot', (name) => new StreamerBotAdapter(config.streamerbot, logger, name, streamerBotEventRelay));
  return registry;
}

function nativeCapabilities(platform: string): InputProviderCapabilities {
  if (platform === 'twitch') return {
    legacy: ['chatInput', 'follows', 'subscriptions', 'gifts', 'donations', 'raids', 'engagement', 'rewards'],
    supported: ['chat.input', 'commands', 'follows', 'subscriptions', 'gift-subscriptions', 'raids', 'cheers', 'channel-rewards.read', 'channel-rewards.redemptions', 'channel-rewards.update', 'channel-rewards.fulfill', 'channel-rewards.cancel'], verification: 'verified',
    limitations: ['The legacy donations flag is retained for configuration compatibility; native Twitch intake reports cheers, not inferred donations.'],
  };
  if (platform === 'youtube') return {
    legacy: ['chatInput', 'follows', 'subscriptions', 'gifts', 'donations', 'engagement'],
    supported: ['chat.input', 'commands', 'follows', 'subscriptions', 'gift-subscriptions', 'donations'], verification: 'verified',
    limitations: ['YouTube Super Chat and Super Sticker are normalized as monetary alerts.'],
  };
  if (platform === 'kick') return {
    legacy: ['chatInput', 'follows', 'subscriptions', 'gifts', 'rewards'], supported: ['chat.input', 'commands', 'follows', 'subscriptions', 'gift-subscriptions', 'channel-rewards.redemptions'], verification: 'verified', limitations: ['Kick reward redemption intake is documented in Streamer.bot 1.0.2+. Kick reward mutation controls remain hidden because their official documentation is missing.'],
  };
  return { legacy: [], supported: [], verification: 'unverified', limitations: [`Streamer.bot native intake is not implemented for ${platform}.`] };
}
