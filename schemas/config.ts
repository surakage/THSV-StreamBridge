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
  'rewards',
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
      // 'manual' definitions are creator-authored and are never overwritten by a sync.
      // 'synced' definitions are a mirror of a Streamer.bot-owned command and are
      // replaced wholesale on each sync pass rather than hand-edited in place.
      source: z.enum(['manual', 'synced']).default('manual'),
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
export const TIMED_CHAT_PLATFORM_VALUES = ['twitch', 'youtube', 'kick', 'tiktok'] as const;
const timedActionSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed') }).strict(),
  z.object({
    mode: z.literal('shuffle-container'),
    messages: z.array(z.string().min(1).max(500)).min(2).max(200),
  }).strict(),
]);

const timedActionTargetSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('event-only') }).strict(),
  z.object({
    provider: z.literal('run-existing-action'),
    actionId: z.uuid(),
    actionName: z.string().min(1).max(200),
    approvedByCreator: z.literal(true),
    deliveryPlatforms: z.array(z.enum(TIMED_CHAT_PLATFORM_VALUES)).max(TIMED_CHAT_PLATFORM_VALUES.length).refine((platforms) => new Set(platforms).size === platforms.length, 'delivery platforms must be unique').default([]),
  }).strict(),
]);

const timedActionGatesSchema = z.object({
  requireLive: z.boolean().default(true),
  platforms: z.array(z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/)).max(16).default([]),
  scenes: z.array(z.string().trim().min(1).max(200)).max(32).default([]),
  activity: z.object({
    minimumMessages: z.number().int().min(0).max(10_000).default(0),
    windowMinutes: z.number().int().min(1).max(1_440).default(5),
  }).strict().default({ minimumMessages: 0, windowMinutes: 5 }),
}).strict().default({ requireLive: true, platforms: [], scenes: [], activity: { minimumMessages: 0, windowMinutes: 5 } });

export const timedActionsSchema = z.object({
  stateFile: z.string().min(1).default('data/state/timed-actions.json'),
  definitions: z.array(z.object({
    id: timedActionIdSchema,
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    intervalMode: z.enum(['fixed', 'random']).default('fixed'),
    everyMinutes: z.number().int().min(1).max(1_440),
    minimumMinutes: z.number().int().min(1).max(1_440).optional(),
    maximumMinutes: z.number().int().min(1).max(1_440).optional(),
    firstRunAfterMinutes: z.number().int().min(0).max(1_440).optional(),
    missedRunPolicy: z.enum(['skip', 'fire-once']).default('skip'),
    payload: z.record(z.string(), z.json()).default({}),
    selection: timedActionSelectionSchema.default({ mode: 'fixed' }),
    gates: timedActionGatesSchema,
    target: timedActionTargetSchema.default({ provider: 'event-only' }),
  }).strict()).max(200),
}).strict().superRefine((timedActions, context) => {
  const seen = new Set<string>();
  for (const [index, definition] of timedActions.definitions.entries()) {
    if (seen.has(definition.id)) context.addIssue({ code: 'custom', path: ['definitions', index, 'id'], message: `Timed action ID ${definition.id} is duplicated.` });
    seen.add(definition.id);
    if (definition.intervalMode === 'random') {
      if (definition.minimumMinutes === undefined || definition.maximumMinutes === undefined) {
        context.addIssue({ code: 'custom', path: ['definitions', index], message: 'Random intervals require minimumMinutes and maximumMinutes.' });
      } else if (definition.maximumMinutes < definition.minimumMinutes) {
        context.addIssue({ code: 'custom', path: ['definitions', index, 'maximumMinutes'], message: 'maximumMinutes must be greater than or equal to minimumMinutes.' });
      }
    }
  }
});

export const ALERT_PRESENTATION_TYPE_VALUES = ['follow', 'subscription', 'membership', 'gift-subscription', 'gift', 'donation', 'cheer', 'super-chat', 'raid', 'milestone'] as const;
const ALERT_TEMPLATE_TOKEN_VALUES = ['actor', 'alertType', 'platform', 'amount', 'currency', 'quantity', 'itemName', 'tier', 'message', 'metric', 'value'] as const;
const alertTemplateTokens = new Set<string>(ALERT_TEMPLATE_TOKEN_VALUES);
const alertTemplateSchema = z.string().max(500).refine((value) => !/[\p{Cc}]/u.test(value), 'Alert templates cannot contain control characters.').superRefine((value, context) => {
  for (const match of value.matchAll(/\{([a-z][a-zA-Z]*)\}/gu)) {
    if (!alertTemplateTokens.has(match[1] ?? '')) context.addIssue({ code: 'custom', message: `Unknown alert template token ${match[0]}.` });
  }
});
const alertPresentationProfileSchema = z.object({
  enabled: z.boolean().default(true),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  durationMs: z.number().int().min(1_000).max(60_000).optional(),
  titleTemplate: alertTemplateSchema.min(1).optional(),
  detailTemplate: alertTemplateSchema.optional(),
  sound: z.object({ mode: z.enum(['none', 'chime']).default('none'), volume: z.number().min(0).max(1).default(0.35) }).strict().default({ mode: 'none', volume: 0.35 }),
  aggregation: z.object({ mode: z.enum(['none', 'sum-quantity']).default('none'), windowMs: z.number().int().min(500).max(30_000).default(5_000) }).strict().default({ mode: 'none', windowMs: 5_000 }),
}).strict();
export const alertPresentationSchema = z.object({
  profiles: z.partialRecord(z.enum(ALERT_PRESENTATION_TYPE_VALUES), alertPresentationProfileSchema).default({}),
}).strict().superRefine((alerts, context) => {
  for (const [alertType, profile] of Object.entries(alerts.profiles)) {
    if (profile.aggregation.mode === 'sum-quantity' && alertType !== 'gift' && alertType !== 'gift-subscription') {
      context.addIssue({ code: 'custom', path: ['profiles', alertType, 'aggregation', 'mode'], message: 'Quantity aggregation is supported only for gift and gift-subscription alerts.' });
    }
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
  alerts: alertPresentationSchema.default({ profiles: {} }),
}).strict();

const filterRuleSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  scope: z.enum(['display', 'command', 'module']),
  moduleIds: z.array(z.string().min(3).max(128).regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)).max(32).default([]),
  platforms: z.array(z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/)).max(32).default([]),
  actorTypes: z.array(z.enum(['human', 'bot', 'system'])).max(3).default([]),
  target: z.enum(['message', 'user.id', 'user.name', 'user.displayName']),
  match: z.object({
    kind: z.enum(['contains', 'exact', 'regex']),
    value: z.string().min(1).max(200),
    caseSensitive: z.boolean().default(false),
  }).strict(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((rule, context) => {
  if (rule.scope !== 'module' && rule.moduleIds.length > 0) {
    context.addIssue({ code: 'custom', path: ['moduleIds'], message: 'moduleIds may only be set for module-scoped blocker rules.' });
  }
  if (rule.match.kind === 'regex') {
    const reason = unsafeRegexReason(rule.match.value);
    if (reason !== undefined) context.addIssue({ code: 'custom', path: ['match', 'value'], message: reason });
  }
});

export const filtersSchema = z.object({
  enabled: z.boolean().default(true),
  rules: z.array(filterRuleSchema).max(500).default([]),
}).strict().superRefine((filters, context) => {
  const seen = new Set<string>();
  for (const [index, rule] of filters.rules.entries()) {
    if (seen.has(rule.id)) context.addIssue({ code: 'custom', path: ['rules', index, 'id'], message: `Filter rule ID ${rule.id} is duplicated.` });
    seen.add(rule.id);
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
    browserOverlay: browserOverlaySchema.default({ enabled: true, brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7_000, showBots: true, showSimulated: true, alerts: { profiles: {} } }),
    filters: filtersSchema.default({ enabled: true, rules: [] }),
    streamerbot: z
      .object({
        enabled: z.boolean(),
        url: z.url(),
        allowRemote: z.boolean().default(false),
        passwordEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
        actionAlias: z.string().min(1).max(200),
        actionId: z.uuid().optional(),
        // Command Administration is invoked directly by the bridge (Stage 5 Tier 1), the same
        // way actionAlias's receiver action is, not chained as a child of another action.
        commandAdministrationActionAlias: z.string().min(1).max(200).default('THSV StreamBridge - Command Administration'),
        rewardAdministrationActionAlias: z.string().min(1).max(200).default('THSV StreamBridge - Reward Administration'),
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
export type CommandDefinition = CommandsConfig['definitions'][number];
export type TimedActionsConfig = z.infer<typeof timedActionsSchema>;
export type TimedActionDefinition = TimedActionsConfig['definitions'][number];
export type BrowserOverlayConfig = z.infer<typeof browserOverlaySchema>;
export type AlertPresentationConfig = z.infer<typeof alertPresentationSchema>;
export type AlertPresentationProfile = z.infer<typeof alertPresentationProfileSchema>;
export type FiltersConfig = z.infer<typeof filtersSchema>;
export type FilterRule = FiltersConfig['rules'][number];
export type Capability = (typeof CAPABILITY_VALUES)[number];

const MAX_REGEX_QUANTIFIERS = 4;

function unsafeRegexReason(pattern: string): string | undefined {
  if (pattern.length > 200) return 'Regular expressions are limited to 200 characters.';
  if (/\\[1-9]/u.test(pattern)) return 'Regular-expression backreferences are not allowed.';
  if (/\(\?[=!<]/u.test(pattern)) return 'Regular-expression lookarounds are not allowed.';
  if (/\([^)]*\|[^)]*\)[+*{]/u.test(pattern)) return 'Quantified alternation groups are not allowed.';
  if (/\([^)]*[+*][^)]*\)[+*{]/u.test(pattern)) return 'Nested quantified groups are not allowed.';
  if (/(?:\.[+*]|\[[^\]]+\][+*]|\\[dDsSwW][+*])[+*{]/u.test(pattern)) return 'Nested quantifiers are not allowed.';
  // A chain of many adjacent quantified atoms (e.g. "a?a?a?...") contains no nesting or
  // alternation for the checks above to catch, but still produces exponential backtracking
  // cost on a non-matching input. Bounding the total quantifier count keeps that search
  // space small regardless of shape.
  if (countQuantifiers(pattern) > MAX_REGEX_QUANTIFIERS) {
    return `Regular expressions may use at most ${String(MAX_REGEX_QUANTIFIERS)} quantifiers (+, *, ?, or {n,m}).`;
  }
  try { new RegExp(pattern, 'u'); } catch { return 'Regular expression is invalid.'; }
  return undefined;
}

function countQuantifiers(pattern: string): number {
  const withoutEscapedLiterals = pattern.replace(/\\[+*?]/gu, '');
  const withoutNonCapturingMarkers = withoutEscapedLiterals.replace(/\(\?:/gu, '(');
  return (withoutNonCapturingMarkers.match(/[+*?]|\{\d+(?:,\d*)?\}/gu) ?? []).length;
}
