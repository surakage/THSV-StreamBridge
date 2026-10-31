import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './atomic-state.js';

/**
 * How the creator unlocks the Setup Wizard on this PC.
 * - `password`: the generated control token (the launchers unlock automatically; typing it is the fallback).
 * - `this-pc`: one click on the wizard page unlocks it. Only the StreamBridge page itself, opened on this
 *   computer, can do that: other websites and other devices are still refused.
 */
export type WizardAccessMode = 'password' | 'this-pc';

export class WizardAccessStore {
  private cached: WizardAccessMode | undefined;

  public constructor(private readonly dataRoot: string) {}

  public async mode(): Promise<WizardAccessMode> {
    if (this.cached !== undefined) return this.cached;
    try {
      const parsed = JSON.parse(await readFile(this.path(), 'utf8')) as unknown;
      this.cached = typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>)['mode'] === 'this-pc' ? 'this-pc' : 'password';
    } catch { this.cached = 'password'; }
    return this.cached;
  }

  public async setMode(mode: WizardAccessMode): Promise<void> {
    await writeJsonAtomic(this.path(), { mode, changedAt: new Date().toISOString() });
    this.cached = mode;
  }

  private path(): string { return join(this.dataRoot, 'state', 'wizard-access.json'); }
}
