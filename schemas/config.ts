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
  alertDurationMs: z.number().int().min(1_000).max(60_000).default(7_000),
  showBots: z.boolean().default(true),
  showSimulated: z.boolean().default(true),
}).strict();

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
    browserOverlay: browserOverlaySchema.default({ enabled: true, brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7_000, showBots: true, showSimulated: true }),
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
  .refine((config) => Object.values(config.platforms).some((platform) => platform.adapter === 'mock'), {
    message: 'At least one platform entry must use the mock adapter for simulation',
    path: ['platforms'],
  });

export const bridgeConfigSchema = z.preprocess((input) => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const migrated = { ...(input as Record<string, unknown>) };
  if (migrated['browserOverlay'] === undefined && migrated['meldOverlay'] !== undefined) migrated['browserOverlay'] = migrated['meldOverlay'];
  if (migrated['browserOverlay'] !== null && typeof migrated['browserOverlay'] === 'object' && !Array.isArray(migrated['browserOverlay'])) {
    const overlay = { ...(migrated['browserOverlay'] as Record<string, unknown>) };
    delete overlay['maxCompanionQueue'];
    migrated['browserOverlay'] = overlay;
  }
  delete migrated['meldOverlay'];
  delete migrated['viewerIdentity'];
  delete migrated['companion'];
  return migrated;
}, bridgeConfigObjectSchema);

export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;
export type PlatformConfig = z.infer<typeof platformSchema>;
export type OutputConfig = z.infer<typeof outputSchema>;
export type CommandsConfig = z.infer<typeof commandsSchema>;
export type TimedActionsConfig = z.infer<typeof timedActionsSchema>;
export type TimedActionDefinition = TimedActionsConfig['definitions'][number];
export type BrowserOverlayConfig = z.infer<typeof browserOverlaySchema>;
export type Capability = (typeof CAPABILITY_VALUES)[number];
