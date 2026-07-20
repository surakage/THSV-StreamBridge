import { z } from 'zod';
import { CORE_CONTRACT_VERSION } from './common.js';

// A SyncedCommand mirrors a command that actually exists in Streamer.bot, discovered
// through inspection. It is never the source of truth for whether a command exists —
// Streamer.bot is. This record only tracks what the bridge last observed and whether
// that observation has since drifted from the live state.
export const syncedCommandSchema = z.object({
  contractVersion: z.literal(CORE_CONTRACT_VERSION),
  streamerBotId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).max(20).default([]),
  // 'framework' entries came from a package this project ships (core-receiver,
  // multi-commands, etc.). 'wizard-generated' entries were created by staging a Tier 2
  // package through the wizard and confirming the import via re-inspection.
  source: z.enum(['framework', 'wizard-generated']),
  lastSeenAt: z.iso.datetime({ offset: true }),
  driftStatus: z.enum(['in-sync', 'renamed', 'missing']),
}).strict();

export type SyncedCommand = z.infer<typeof syncedCommandSchema>;

export const commandSyncStateSchema = z.object({
  version: z.literal(1),
  commands: z.array(syncedCommandSchema).max(1_000),
}).strict();

export type CommandSyncState = z.infer<typeof commandSyncStateSchema>;
