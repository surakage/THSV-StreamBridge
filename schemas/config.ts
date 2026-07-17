import { z } from 'zod';

export const CAPABILITY_VALUES = [
  'chatInput',
  'chatOutput',
  'follows',
  'subscriptions',
  'gifts',
  'donations',
  'raids',
  'moderation',
  'engagement',
  'channelUpdates',
  'timedActions',
] as const;

const reconnectSchema = z
  .object({
    enabled: z.boolean(),
    initialDelayMs: z.number().int().min(10).max(60_000),
    maxDelayMs: z.number().int().min(10).max(300_000),
    maxAttempts: z.number().int().min(0).max(100),
  })
  .strict()
  .refine((value) => value.maxDelayMs >= value.initialDelayMs, {
    message: 'maxDelayMs must be greater than or equal to initialDelayMs',
  });

const commandNameSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);

const commandsSchema = z
  .object({
    enabled: z.boolean(),
    prefix: z.string().refine((value) => value.length === 1 && !/\s/u.test(value), 'prefix must be one non-whitespace character'),
    definitions: z.array(z.object({
      name: commandNameSchema,
      aliases: z.array(commandNameSchema).max(20).default([]),
      minimumRole: z.enum(['viewer', 'subscriber', 'moderator', 'broadcaster']).default('viewer'),
      allowBots: z.boolean().default(false),
    }).strict()).max(200),
  })
  .strict()
  .superRefine((commands, context) => {
    const seen = new Map<string, number>();
    for (const [index, definition] of commands.definitions.entries()) {
      for (const name of [definition.name, ...definition.aliases]) {
        const previous = seen.get(name);
        if (previous !== undefined) {
          context.addIssue({ code: 'custom', path: ['definitions', index, 'aliases'], message: `Command name or alias ${name} is already used by definition ${String(previous)}.` });
        } else seen.set(name, index);
      }
    }
  });

const timedActionIdSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);
const timedActionSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed') }).strict(),
  z.object({
    mode: z.literal('shuffle-container'),
    messages: z.array(z.string().min(1).max(500)).min(2).max(200),
  }).strict(),
]);

const timedActionsSchema = z.object({
  stateFile: z.string().min(1).default('data/state/timed-actions.json'),
  definitions: z.array(z.object({
    id: timedActionIdSchema,
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    everyMinutes: z.number().int().min(1).max(1_440),
    firstRunAfterMinutes: z.number().int().min(0).max(1_440).optional(),
    missedRunPolicy: z.enum(['skip', 'fire-once']).default('skip'),
    payload: z.record(z.string(), z.json()).default({}),
    selection: timedActionSelectionSchema.default({ mode: 'fixed' }),
  }).strict()).max(200),
}).strict().superRefine((timedActions, context) => {
  const seen = new Set<string>();
  for (const [index, definition] of timedActions.definitions.entries()) {
    if (seen.has(definition.id)) context.addIssue({ code: 'custom', path: ['definitions', index, 'id'], message: `Timed action ID ${definition.id} is duplicated.` });
    seen.add(definition.id);
  }
});

const browserOverlaySchema = z.object({
  enabled: z.boolean().default(true),
  brandLabel: z.string().trim().max(60).default('THE HIDDEN SLOTH VILLAGE'),
  maxChatMessages: z.number().int().min(1).max(200).default(8),
  maxAlertQueue: z.number().int().min(1).max(200).default(20),
  maxCompanionQueue: z.number().int().min(1).max(200).default(20),
  alertDurationMs: z.number().int().min(1_000).max(60_000).default(7_000),
  showBots: z.boolean().default(true),
  showSimulated: z.boolean().default(true),
}).strict();

const viewerIdSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);
const viewerAccountSchema = z.object({
  platform: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  userId: z.string().min(1).max(256),
}).strict();
const progressionEventTypeSchema = z.enum([
  'chat.message',
  'channel.follow',
  'channel.subscription',
  'channel.membership',
  'channel.gift-subscription',
  'engagement.gift',
  'engagement.donation',
  'engagement.cheer',
  'engagement.super-chat',
  'channel.raid',
  'engagement.milestone',
]);
const viewerIdentitySchema = z.object({
  enabled: z.boolean().default(false),
  stateFile: z.string().min(1).default('data/state/viewer-progression.json'),
  includeSimulated: z.boolean().default(false),
  processedEventTtlMs: z.number().int().min(60_000).max(2_592_000_000).default(86_400_000),
  maxProcessedEvents: z.number().int().min(100).max(100_000).default(10_000),
  links: z.array(z.object({
    viewerId: viewerIdSchema,
    accounts: z.array(viewerAccountSchema).min(1).max(20),
  }).strict()).max(5_000).default([]),
  progression: z.object({
    enabled: z.boolean().default(true),
    points: z.partialRecord(progressionEventTypeSchema, z.number().int().min(0).max(100_000)).default({
      'chat.message': 1,
      'channel.follow': 10,
      'channel.subscription': 25,
      'channel.membership': 25,
      'channel.gift-subscription': 25,
      'engagement.gift': 5,
      'engagement.donation': 20,
      'engagement.cheer': 10,
      'engagement.super-chat': 20,
      'channel.raid': 25,
      'engagement.milestone': 5,
    }),
    cooldownsMs: z.partialRecord(progressionEventTypeSchema, z.number().int().min(0).max(86_400_000)).default({ 'chat.message': 60_000 }),
    levelThresholds: z.array(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)).min(1).max(200).default([0, 100, 250, 500, 1_000]),
  }).strict().default({ enabled: true, points: {}, cooldownsMs: {}, levelThresholds: [0, 100, 250, 500, 1_000] }),
}).strict().superRefine((value, context) => {
  const viewerIds = new Set<string>();
  const accounts = new Set<string>();
  for (const [linkIndex, link] of value.links.entries()) {
    if (viewerIds.has(link.viewerId)) context.addIssue({ code: 'custom', path: ['links', linkIndex, 'viewerId'], message: `Viewer ID ${link.viewerId} is duplicated.` });
    viewerIds.add(link.viewerId);
    for (const [accountIndex, account] of link.accounts.entries()) {
      const key = `${account.platform}\u0000${account.userId}`;
      if (accounts.has(key)) context.addIssue({ code: 'custom', path: ['links', linkIndex, 'accounts', accountIndex], message: 'A platform account may belong to only one viewer.' });
      accounts.add(key);
    }
  }
  for (let index = 0; index < value.progression.levelThresholds.length; index += 1) {
    const current = value.progression.levelThresholds[index] ?? 0;
    if (index === 0 && current !== 0) context.addIssue({ code: 'custom', path: ['progression', 'levelThresholds', index], message: 'The first level threshold must be 0.' });
    if (index > 0 && current <= (value.progression.levelThresholds[index - 1] ?? 0)) context.addIssue({ code: 'custom', path: ['progression', 'levelThresholds', index], message: 'Level thresholds must be strictly increasing.' });
  }
});

const companionActionNameSchema = z.enum(['wave', 'eat', 'sleep', 'wake', 'celebrate']);
const companionRewardSchema = z.object({
  enabled: z.boolean().default(true),
  command: commandNameSchema,
  cost: z.number().int().min(0).max(1_000_000),
  cooldownMs: z.number().int().min(0).max(86_400_000),
  happiness: z.number().int().min(-100).max(100).default(0),
  fullness: z.number().int().min(-100).max(100).default(0),
  energy: z.number().int().min(-100).max(100).default(0),
}).strict();
const wakeRewardDefault = { enabled: true, command: 'bloom-wake', cost: 0, cooldownMs: 5_000, happiness: 0, fullness: 0, energy: 0 } as const;
const wakeRewardMigrationDefault = { ...wakeRewardDefault, enabled: false } as const;
const companionRewardsSchema = z.preprocess((input) => {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || 'wake' in input) return input;
  return { ...input, wake: wakeRewardMigrationDefault };
}, z.record(companionActionNameSchema, companionRewardSchema));
const companionSchema = z.object({
  enabled: z.boolean().default(false),
  stateFile: z.string().min(1).default('data/state/companion.json'),
  includeSimulated: z.boolean().default(false),
  minimumActionIntervalMs: z.number().int().min(0).max(60_000).default(1_000),
  maxTrackedCooldowns: z.number().int().min(100).max(100_000).default(10_000),
  initialState: z.object({
    happiness: z.number().int().min(0).max(100).default(75),
    fullness: z.number().int().min(0).max(100).default(75),
    energy: z.number().int().min(0).max(100).default(75),
  }).strict().default({ happiness: 75, fullness: 75, energy: 75 }),
  rewards: companionRewardsSchema.default({
    wave: { enabled: true, command: 'bloom-wave', cost: 0, cooldownMs: 10_000, happiness: 2, fullness: 0, energy: 0 },
    eat: { enabled: true, command: 'bloom-feed', cost: 25, cooldownMs: 30_000, happiness: 3, fullness: 15, energy: 2 },
    sleep: { enabled: true, command: 'bloom-rest', cost: 10, cooldownMs: 60_000, happiness: 2, fullness: -2, energy: 20 },
    wake: wakeRewardDefault,
    celebrate: { enabled: true, command: 'bloom-celebrate', cost: 50, cooldownMs: 60_000, happiness: 15, fullness: -3, energy: -5 },
  }),
}).strict().superRefine((value, context) => {
  const commands = new Set<string>();
  for (const [action, reward] of Object.entries(value.rewards)) {
    if (commands.has(reward.command)) context.addIssue({ code: 'custom', path: ['rewards', action, 'command'], message: `Companion command ${reward.command} is duplicated.` });
    commands.add(reward.command);
  }
});

export const platformSchema = z
  .object({
    enabled: z.boolean(),
    inputEnabled: z.boolean(),
    outputEnabled: z.boolean(),
    adapter: z.string().min(1).max(100),
    capabilities: z.array(z.enum(CAPABILITY_VALUES)).max(CAPABILITY_VALUES.length),
    reconnect: reconnectSchema,
  })
  .strict();

export const outputSchema = z.object({
  enabled: z.boolean(),
  adapter: z.string().min(1).max(100),
  settings: z.record(z.string(), z.json()).default({}),
}).strict();

const bridgeConfigObjectSchema = z
  .object({
    configVersion: z.literal('1.0.0'),
    service: z
      .object({
        name: z.string().min(1).max(100),
        host: z.string().min(1).max(255),
        port: z.number().int().min(1024).max(65_535),
        allowNetworkAccess: z.boolean(),
        shutdownTimeoutMs: z.number().int().min(100).max(60_000),
      })
      .strict()
      .refine((service) => service.allowNetworkAccess || ['127.0.0.1', 'localhost', '::1'].includes(service.host), {
        message: 'Non-loopback hosts require allowNetworkAccess=true',
        path: ['host'],
      }),
    security: z
      .object({
        maxPayloadBytes: z.number().int().min(1_024).max(10_485_760),
        preserveRawPayloads: z.boolean(),
        controlTokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).default('THSV_STREAMBRIDGE_CONTROL_TOKEN'),
        controlTokenFile: z.string().min(1).default('data/runtime/control-token'),
        allowedOrigins: z.array(z.url()).max(20).default([]),
        maxRequestsPerMinute: z.number().int().min(1).max(10_000).default(60),
        maxConcurrentRequests: z.number().int().min(1).max(100).default(4),
      })
      .strict(),
    logging: z
      .object({
        level: z.enum(['debug', 'info', 'warn', 'error']),
        directory: z.string().min(1),
        maxFileBytes: z.number().int().min(1_024).max(1_073_741_824),
        backups: z.number().int().min(1).max(20),
      })
      .strict(),
    deduplication: z
      .object({
        ttlMs: z.number().int().min(1_000).max(86_400_000),
        maxEntries: z.number().int().min(10).max(1_000_000),
        persistAcrossRestarts: z.boolean().default(true),
        stateFile: z.string().min(1).default('data/state/deduplication.json'),
      })
      .strict(),
    commands: commandsSchema.default({ enabled: false, prefix: '!', definitions: [] }),
    timedActions: timedActionsSchema.default({ stateFile: 'data/state/timed-actions.json', definitions: [] }),
    browserOverlay: browserOverlaySchema.default({ enabled: true, brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, maxCompanionQueue: 20, alertDurationMs: 7_000, showBots: true, showSimulated: true }),
    viewerIdentity: viewerIdentitySchema.default({ enabled: false, stateFile: 'data/state/viewer-progression.json', includeSimulated: false, processedEventTtlMs: 86_400_000, maxProcessedEvents: 10_000, links: [], progression: { enabled: true, points: { 'chat.message': 1, 'channel.follow': 10, 'channel.subscription': 25, 'channel.membership': 25, 'channel.gift-subscription': 25, 'engagement.gift': 5, 'engagement.donation': 20, 'engagement.cheer': 10, 'engagement.super-chat': 20, 'channel.raid': 25, 'engagement.milestone': 5 }, cooldownsMs: { 'chat.message': 60_000 }, levelThresholds: [0, 100, 250, 500, 1_000] } }),
    companion: companionSchema.default({ enabled: false, stateFile: 'data/state/companion.json', includeSimulated: false, minimumActionIntervalMs: 1_000, maxTrackedCooldowns: 10_000, initialState: { happiness: 75, fullness: 75, energy: 75 }, rewards: { wave: { enabled: true, command: 'bloom-wave', cost: 0, cooldownMs: 10_000, happiness: 2, fullness: 0, energy: 0 }, eat: { enabled: true, command: 'bloom-feed', cost: 25, cooldownMs: 30_000, happiness: 3, fullness: 15, energy: 2 }, sleep: { enabled: true, command: 'bloom-rest', cost: 10, cooldownMs: 60_000, happiness: 2, fullness: -2, energy: 20 }, wake: wakeRewardDefault, celebrate: { enabled: true, command: 'bloom-celebrate', cost: 50, cooldownMs: 60_000, happiness: 15, fullness: -3, energy: -5 } } }),
    streamerbot: z
      .object({
        enabled: z.boolean(),
        url: z.url(),
        allowRemote: z.boolean().default(false),
        passwordEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
        actionAlias: z.string().min(1).max(200),
        actionId: z.uuid().optional(),
        acknowledgementTimeoutMs: z.number().int().min(100).max(60_000),
        maxPendingRequests: z.number().int().min(1).max(1_000).default(16),
        deliveryQueueCapacity: z.number().int().min(1).max(100_000).default(100),
        deliveryConcurrency: z.number().int().min(1).max(32).default(2),
        deliveryFailureThreshold: z.number().int().min(1).max(100).default(3),
        testMode: z.boolean(),
        reconnect: reconnectSchema,
      })
      .strict()
      .superRefine((streamerbot, context) => {
        const url = new URL(streamerbot.url);
        const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
        if (!['ws:', 'wss:'].includes(url.protocol)) context.addIssue({ code: 'custom', path: ['url'], message: 'URL must use ws:// or wss://' });
        if (url.username.length > 0 || url.password.length > 0 || url.search.length > 0) context.addIssue({ code: 'custom', path: ['url'], message: 'URL must not contain credentials or query parameters; use environment variables for secrets' });
        if (!loopback && !streamerbot.allowRemote) context.addIssue({ code: 'custom', path: ['url'], message: 'Remote Streamer.bot URLs require allowRemote=true' });
        if (!loopback && url.protocol !== 'wss:') context.addIssue({ code: 'custom', path: ['url'], message: 'Remote Streamer.bot URLs must use wss://' });
      }),
    platforms: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), platformSchema),
    outputs: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), outputSchema).default({
      streamerbot: { enabled: true, adapter: 'streamerbot', settings: {} },
    }),
  })
  .strict()
  .superRefine((config, context) => {
    if (!config.companion.enabled) return;
    if (!config.viewerIdentity.enabled || !config.viewerIdentity.progression.enabled) context.addIssue({ code: 'custom', path: ['companion', 'enabled'], message: 'Companion rewards require viewer identity and progression to be enabled.' });
    const configuredCommands = new Set(config.commands.definitions.flatMap((definition) => [definition.name, ...definition.aliases]));
    for (const [action, reward] of Object.entries(config.companion.rewards)) {
      if (reward.enabled && !configuredCommands.has(reward.command)) context.addIssue({ code: 'custom', path: ['companion', 'rewards', action, 'command'], message: `Enabled companion command ${reward.command} must be defined in commands.definitions.` });
    }
  })
  .refine((config) => Object.values(config.platforms).some((platform) => platform.adapter === 'mock'), {
    message: 'At least one platform entry must use the mock adapter for simulation',
    path: ['platforms'],
  });

export const bridgeConfigSchema = z.preprocess((input) => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const migrated = { ...(input as Record<string, unknown>) };
  if (migrated['browserOverlay'] === undefined && migrated['meldOverlay'] !== undefined) migrated['browserOverlay'] = migrated['meldOverlay'];
  delete migrated['meldOverlay'];
  return migrated;
}, bridgeConfigObjectSchema);

export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;
export type PlatformConfig = z.infer<typeof platformSchema>;
export type OutputConfig = z.infer<typeof outputSchema>;
export type CommandsConfig = z.infer<typeof commandsSchema>;
export type TimedActionsConfig = z.infer<typeof timedActionsSchema>;
export type TimedActionDefinition = TimedActionsConfig['definitions'][number];
export type BrowserOverlayConfig = z.infer<typeof browserOverlaySchema>;
export type ViewerIdentityConfig = z.infer<typeof viewerIdentitySchema>;
export type CompanionConfig = z.infer<typeof companionSchema>;
export type CompanionActionName = z.infer<typeof companionActionNameSchema>;
export type Capability = (typeof CAPABILITY_VALUES)[number];
