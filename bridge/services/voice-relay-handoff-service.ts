import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AddOnActionArgumentsV2 } from '../contracts/v2/addon-capability.js';
import { VOICE_RELAY_MODULE_ID, VOICE_RELAY_SPEAK_ACTION_ID } from '../contracts/voice-relay-handoff.js';

const HANDOFF_NAME = /^voice-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.txt$/iu;
const MAXIMUM_MESSAGE_CHARACTERS = 400;
const MAXIMUM_MESSAGE_BYTES = 4_096;
const STALE_HANDOFF_MS = 5 * 60_000;
const CLEANUP_INTERVAL_MS = 60_000;
const MAXIMUM_ACTIVE_HANDOFF_MS = 24 * 60 * 60_000;

export interface PreparedStreamerBotAction {
  readonly argumentsValue: AddOnActionArgumentsV2;
  readonly dispose: (accepted: boolean) => Promise<void>;
}

/** Keeps Village Voice speech out of Streamer.bot's verbose WebSocket request log. */
export class VoiceRelayHandoffService {
  private readonly inboxRoot: string;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private readonly pending = new Map<string, number>();

  public constructor(dataRoot: string, private readonly now: () => number = Date.now) {
    this.inboxRoot = resolve(dataRoot, 'runtime', 'voice-relay-inbox');
  }

  public async start(): Promise<void> {
    await this.ensureInbox();
    await this.removeStaleHandoffs();
    if (this.cleanupTimer !== undefined) return;
    this.cleanupTimer = setInterval(() => void this.reconcileHandoffs().catch(() => undefined), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  public async stop(): Promise<void> {
    if (this.cleanupTimer !== undefined) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
    const paths = [...this.pending.keys()]; this.pending.clear();
    await Promise.all(paths.map(async (path) => await rm(path, { force: true })));
  }

  public async prepare(moduleId: string, actionId: string, argumentsValue: AddOnActionArgumentsV2, dryRun = false): Promise<PreparedStreamerBotAction> {
    if (moduleId !== VOICE_RELAY_MODULE_ID || actionId.toLowerCase() !== VOICE_RELAY_SPEAK_ACTION_ID) return unchanged(argumentsValue);
    const message = argumentsValue['voiceRelayMessage'];
    if (typeof message !== 'string' || message.trim().length === 0) throw new Error('Village Voice requires a non-empty speech message.');
    const alias = argumentsValue['voiceRelayVoiceAlias'];
    if (typeof alias !== 'string' || alias.trim().length === 0 || alias.length > 80) throw new Error('Village Voice requires a bounded Speaker.bot voice alias.');
    const boundedMessage = message.trim();
    if (boundedMessage.length > MAXIMUM_MESSAGE_CHARACTERS || Buffer.byteLength(boundedMessage, 'utf8') > MAXIMUM_MESSAGE_BYTES) throw new Error('Village Voice speech exceeds the secure handoff limit.');

    const filename = `voice-${randomUUID()}.txt`;
    const protectedArguments = Object.freeze({ voiceRelayMessageHandoff: filename, voiceRelayHandoffRoot: this.inboxRoot, voiceRelayVoiceAlias: alias.trim() });
    if (dryRun) return Object.freeze({ argumentsValue: protectedArguments, dispose: async () => undefined });
    await this.ensureInbox();
    await this.removeStaleHandoffs();
    const path = join(this.inboxRoot, filename);
    await writeFile(path, boundedMessage, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await chmod(path, 0o600).catch(() => undefined);
    this.pending.set(path, this.now());
    return Object.freeze({
      argumentsValue: protectedArguments,
      // A successful DoAction response means accepted, not necessarily executed. The
      // C# consumer owns successful deletion so a busy Streamer.bot queue cannot race it.
      dispose: async (accepted: boolean) => {
        if (accepted) return;
        this.pending.delete(path);
        await rm(path, { force: true });
      },
    });
  }

  private async ensureInbox(): Promise<void> {
    await mkdir(this.inboxRoot, { recursive: true, mode: 0o700 });
    await chmod(this.inboxRoot, 0o700).catch(() => undefined);
  }

  private async removeStaleHandoffs(): Promise<void> {
    const cutoff = this.now() - STALE_HANDOFF_MS;
    const names = await readdir(this.inboxRoot).catch(() => [] as string[]);
    await Promise.all(names.filter((name) => HANDOFF_NAME.test(name)).map(async (name) => {
      const path = join(this.inboxRoot, name);
      if (this.pending.has(path)) return;
      const information = await stat(path).catch(() => undefined);
      if (information?.isFile() === true && information.mtimeMs < cutoff) await rm(path, { force: true });
    }));
  }

  private async reconcileHandoffs(): Promise<void> {
    for (const [path, createdAt] of this.pending) {
      const information = await stat(path).catch(() => undefined);
      if (information === undefined) { this.pending.delete(path); continue; }
      if (this.now() - createdAt > MAXIMUM_ACTIVE_HANDOFF_MS) { this.pending.delete(path); await rm(path, { force: true }); }
    }
    await this.removeStaleHandoffs();
  }
}

function unchanged(argumentsValue: AddOnActionArgumentsV2): PreparedStreamerBotAction {
  return Object.freeze({ argumentsValue, dispose: async () => undefined });
}
