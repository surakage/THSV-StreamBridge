import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bridgeConfigSchema, type BridgeConfig } from '../../schemas/config.js';

export class ConfigurationError extends Error {
  public constructor(message: string, public readonly details: readonly string[] = []) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export async function loadConfig(path = 'config/bridge.example.json'): Promise<BridgeConfig> {
  const absolutePath = resolve(path);
  let content: string;
  try {
    content = await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new ConfigurationError(`Unable to read configuration at ${absolutePath}`, [formatError(error)]);
  }

  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    throw new ConfigurationError(`Configuration is not valid JSON: ${absolutePath}`, [formatError(error)]);
  }

  const result = bridgeConfigSchema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
    throw new ConfigurationError(`Configuration validation failed: ${absolutePath}`, details);
  }
  return result.data;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
