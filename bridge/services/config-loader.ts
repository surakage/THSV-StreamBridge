import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bridgeConfigSchema, type BridgeConfig } from '../../schemas/config.js';

export class ConfigurationError extends Error {
  public constructor(message: string, public readonly details: readonly string[] = []) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export interface ConfigLoadNotice {
  readonly code: 'archived-config-ignored';
  readonly message: string;
  readonly paths: readonly string[];
}

export interface LoadedConfig {
  readonly config: BridgeConfig;
  readonly notices: readonly ConfigLoadNotice[];
}

export async function loadConfig(path = 'config/bridge.example.json'): Promise<BridgeConfig> {
  return (await loadConfigWithNotices(path)).config;
}

export async function loadConfigWithNotices(path = 'config/bridge.example.json'): Promise<LoadedConfig> {
  const absolutePath = resolve(path);
  let content: string;
  try {
    content = await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new ConfigurationError(`Unable to read configuration at ${absolutePath}`, [formatError(error)]);
  }

  let value: unknown;
  try {
    value = JSON.parse(stripUtf8Bom(content)) as unknown;
  } catch (error) {
    throw new ConfigurationError(`Configuration is not valid JSON: ${absolutePath}`, [formatError(error)]);
  }

  const result = bridgeConfigSchema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
    throw new ConfigurationError(`Configuration validation failed: ${absolutePath}`, details);
  }
  return { config: result.data, notices: legacyConfigNotices(value) };
}

export function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function legacyConfigNotices(value: unknown): readonly ConfigLoadNotice[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const root = value as Record<string, unknown>;
  const paths: string[] = [];
  if (Object.hasOwn(root, 'viewerIdentity')) paths.push('viewerIdentity');
  if (Object.hasOwn(root, 'companion')) paths.push('companion');
  for (const overlayKey of ['browserOverlay', 'meldOverlay']) {
    const overlay = root[overlayKey];
    if (overlay !== null && typeof overlay === 'object' && !Array.isArray(overlay) && Object.hasOwn(overlay, 'maxCompanionQueue')) {
      paths.push(`${overlayKey}.maxCompanionQueue`);
    }
  }
  if (paths.length === 0) return [];
  return [{
    code: 'archived-config-ignored',
    message: 'Archived Viewer Progression or Bloom Companion settings were found and ignored. Their state remains preserved; review the Stage 2 migration guidance before removing legacy data.',
    paths,
  }];
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
