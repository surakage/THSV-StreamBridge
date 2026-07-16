import type { BridgeConfig, OutputConfig, PlatformConfig } from '../../schemas/config.js';
import type { Logger } from '../services/logger.js';
import type { InputAdapter, OutputAdapter } from './adapter.js';
import { MockAdapter } from './mock-adapter.js';
import { PlaceholderAdapter } from './placeholder-adapter.js';
import { StreamerBotAdapter } from './streamerbot-adapter.js';
import { TimedActionsAdapter } from './timed-actions-adapter.js';

export type InputAdapterFactory = (name: string, config: PlatformConfig) => InputAdapter;
export type OutputAdapterFactory = (name: string, config: OutputConfig) => OutputAdapter;

export class AdapterRegistry {
  private readonly inputFactories = new Map<string, InputAdapterFactory>();
  private readonly outputFactories = new Map<string, OutputAdapterFactory>();

  public registerInput(provider: string, factory: InputAdapterFactory): this {
    if (this.inputFactories.has(provider)) throw new Error(`Input adapter provider is already registered: ${provider}`);
    this.inputFactories.set(provider, factory);
    return this;
  }

  public registerOutput(provider: string, factory: OutputAdapterFactory): this {
    if (this.outputFactories.has(provider)) throw new Error(`Output adapter provider is already registered: ${provider}`);
    this.outputFactories.set(provider, factory);
    return this;
  }

  public createInputs(platforms: Readonly<Record<string, PlatformConfig>>): InputAdapter[] {
    return Object.entries(platforms).map(([name, config]) => {
      const factory = this.inputFactories.get(config.adapter);
      if (factory === undefined) throw new Error(`No input adapter registered for provider ${config.adapter} (platform ${name})`);
      return factory(name, config);
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
  registry.registerInput('mock', (name, platform) => new MockAdapter(name, platform));
  registry.registerInput('timed-actions', (name, platform) => new TimedActionsAdapter(name, platform, config.timedActions));
  for (const provider of ['twitch-placeholder', 'youtube-placeholder', 'kick-placeholder', 'tikfinity-placeholder', 'facebook-placeholder']) {
    registry.registerInput(provider, (name, platform) => new PlaceholderAdapter(name, platform, `${provider} has no production transport in Milestone 1.`));
  }
  registry.registerOutput('streamerbot', (name) => new StreamerBotAdapter(config.streamerbot, logger, name));
  return registry;
}
