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
export const TIMED_MESSAGE_CHARACTER_LIMITS = { twitch: 500, youtube: 200, kick: 500, tiktok: 150 } as const;
const platformMessageListsSchema = z.object({
  twitch: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.twitch)).min(2).max(200).optional(),
  youtube: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.youtube)).min(2).max(200).optional(),
  kick: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.kick)).min(2).max(200).optional(),
  tiktok: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.tiktok)).min(2).max(200).optional(),
}).strict().refine((lists) => Object.values(lists).some((messages) => messages !== undefined && messages.length >= 2), 'Platform message rotation requires at least one platform with two messages.');
const timedActionSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed') }).strict(),
  z.object({
    mode: z.literal('shuffle-container'),
    messages: z.array(z.string().min(1).max(500)).min(2).max(200),
  }).strict(),
  z.object({ mode: z.literal('platform-shuffle'), messagesByPlatform: platformMessageListsSchema }).strict(),
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
  sound: z.object({
    mode: z.enum(['none', 'chime', 'soft-bell', 'digital-pop', 'celebration', 'custom']).default('none'),
    volume: z.number().min(0).max(1).default(0.35),
    customUrl: z.string().regex(/^\/overlay\/assets\/[a-f0-9]{64}\.(?:mp3|wav|ogg)$/u).optional(),
  }).strict().superRefine((sound, context) => {
    if (sound.mode === 'custom' && sound.customUrl === undefined) context.addIssue({ code: 'custom', path: ['customUrl'], message: 'Custom alert sound requires an uploaded local sound file.' });
  }).default({ mode: 'none', volume: 0.35 }),
  card: z.object({
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default('#171120'),
    fontFamily: z.enum(['system', 'rounded', 'serif', 'monospace']).default('system'),
    backgroundImageUrl: z.string().regex(/^\/overlay\/assets\/[a-f0-9]{64}\.(?:png|jpg|webp)$/u).optional(),
  }).strict().default({ backgroundColor: '#171120', fontFamily: 'system' }),
  aggregation: z.object({ mode: z.enum(['none', 'sum-quantity']).default('none'), windowMs: z.number().int().min(500).max(30_000).default(5_000) }).strict().default({ mode: 'none', windowMs: 5_000 }),
}).strict();
// Only these alert types are ever produced per platform (cross-checked against
// bridge/adapters/streamerbot-native-adapter.ts and tikfinity-adapter.ts's own event-type
// mappings). "donation" is intentionally absent everywhere: no provider produces it yet.
export const PLATFORM_ALERT_TYPES: Readonly<Record<(typeof TIMED_CHAT_PLATFORM_VALUES)[number], readonly (typeof ALERT_PRESENTATION_TYPE_VALUES)[number][]>> = {
  twitch: ['follow', 'subscription', 'gift-subscription', 'cheer', 'raid'],
  youtube: ['follow', 'membership', 'gift-subscription', 'super-chat'],
  kick: ['follow', 'subscription', 'gift-subscription', 'gift'],
  tiktok: ['follow', 'subscription', 'gift', 'milestone'],
};
export const alertPresentationSchema = z.object({
  profiles: z.partialRecord(
    z.enum(TIMED_CHAT_PLATFORM_VALUES),
    z.partialRecord(z.enum(ALERT_PRESENTATION_TYPE_VALUES), alertPresentationProfileSchema).default({}),
  ).default({}),
}).strict().superRefine((alerts, context) => {
  for (const [platform, platformProfiles] of Object.entries(alerts.profiles)) {
    for (const [alertType, profile] of Object.entries(platformProfiles)) {
      if (profile.aggregation.mode === 'sum-quantity' && !['gift', 'gift-subscription', 'cheer'].includes(alertType)) {
        context.addIssue({ code: 'custom', path: ['profiles', platform, alertType, 'aggregation', 'mode'], message: 'Quantity aggregation is supported only for gifts, gift subscriptions, and cheers/bits.' });
      }
      if (!(PLATFORM_ALERT_TYPES[platform as (typeof TIMED_CHAT_PLATFORM_VALUES)[number]] as readonly string[]).includes(alertType)) {
        context.addIssue({ code: 'custom', path: ['profiles', platform, alertType], message: `${platform} never produces ${alertType} alerts.` });
      }
    }
  }
});

const CHAT_EVENT_TEMPLATE_TOKEN_VALUES = ['actor', 'rewardTitle', 'input', 'amount', 'currency', 'quantity', 'itemName', 'tier', 'message', 'metric', 'value', 'months', 'streakMonths'] as const;
const chatEventTemplateTokens = new Set<string>(CHAT_EVENT_TEMPLATE_TOKEN_VALUES);
const platformChatEventTemplateSchema = z.string().max(500).refine((value) => !/[\p{Cc}]/u.test(value), 'Chat event templates cannot contain control characters.').superRefine((value, context) => {
  for (const match of value.matchAll(/\{([a-z][a-zA-Z]*)\}/gu)) if (!chatEventTemplateTokens.has(match[1] ?? '')) context.addIssue({ code: 'custom', message: `Unknown chat event template token ${match[0]}.` });
});
const chatEventSettingSchema = z.object({ enabled: z.boolean(), template: platformChatEventTemplateSchema }).strict();
export const DEFAULT_CHAT_PLATFORM_EVENTS = {
  twitch: {
    follow: { enabled: true, template: '{actor} followed' }, subscription: { enabled: true, template: '{actor} subscribed {tier}' },
    resubscription: { enabled: true, template: '{actor} resubscribed for {months} months {tier}' }, 'gift-subscription': { enabled: true, template: '{actor} gifted a subscription {tier}' },
    'gift-bomb': { enabled: true, template: '{actor} gifted {quantity} subscriptions {tier}' }, cheer: { enabled: true, template: '{actor} cheered {quantity} bits {message}' },
    raid: { enabled: true, template: '{actor} raided with {quantity} viewers' }, 'reward-redemption': { enabled: true, template: '{actor} redeemed {rewardTitle} · {input}' },
  },
  youtube: {
    subscriber: { enabled: true, template: '{actor} subscribed to the channel' }, member: { enabled: true, template: '{actor} became a paid member {tier}' },
    'membership-gift': { enabled: true, template: '{actor} gifted {quantity} memberships' }, 'member-milestone': { enabled: true, template: '{actor} reached {months} months as a member' },
    'super-chat': { enabled: true, template: '{actor} sent a Super Chat: {amount} {currency} {message}' }, 'super-sticker': { enabled: true, template: '{actor} sent a Super Sticker: {amount} {currency}' },
  },
  kick: {
    follow: { enabled: true, template: '{actor} followed' }, subscription: { enabled: true, template: '{actor} subscribed {tier}' },
    resubscription: { enabled: true, template: '{actor} resubscribed for {months} months {tier}' }, 'gift-subscription': { enabled: true, template: '{actor} gifted a subscription {tier}' },
    'mass-gift-subscription': { enabled: true, template: '{actor} gifted {quantity} subscriptions {tier}' }, 'gifted-kicks': { enabled: true, template: '{actor} gifted {quantity} KICKs' },
    'reward-redemption': { enabled: true, template: '{actor} redeemed {rewardTitle} · {input}' },
  },
  tiktok: {
    follow: { enabled: true, template: '{actor} followed' }, gift: { enabled: true, template: '{actor} sent {quantity} {itemName}' },
    subscription: { enabled: true, template: '{actor} subscribed for month {months}' }, likes: { enabled: true, template: 'TikTok reached {value} likes' },
  },
} as const;
const chatPlatformEventsSchema = z.object({
  twitch: z.object({ follow: chatEventSettingSchema, subscription: chatEventSettingSchema, resubscription: chatEventSettingSchema, 'gift-subscription': chatEventSettingSchema, 'gift-bomb': chatEventSettingSchema, cheer: chatEventSettingSchema, raid: chatEventSettingSchema, 'reward-redemption': chatEventSettingSchema }).strict(),
  youtube: z.object({ subscriber: chatEventSettingSchema, member: chatEventSettingSchema, 'membership-gift': chatEventSettingSchema, 'member-milestone': chatEventSettingSchema, 'super-chat': chatEventSettingSchema, 'super-sticker': chatEventSettingSchema }).strict(),
  kick: z.object({ follow: chatEventSettingSchema, subscription: chatEventSettingSchema, resubscription: chatEventSettingSchema, 'gift-subscription': chatEventSettingSchema, 'mass-gift-subscription': chatEventSettingSchema, 'gifted-kicks': chatEventSettingSchema, 'reward-redemption': chatEventSettingSchema }).strict(),
  tiktok: z.object({ follow: chatEventSettingSchema, gift: chatEventSettingSchema, subscription: chatEventSettingSchema, likes: chatEventSettingSchema }).strict(),
}).strict();
export const DEFAULT_CHAT_PLATFORM_COLORS = { twitch: '#4b267b', youtube: '#7d1717', kick: '#245c18', tiktok: '#172b31' } as const;

export const chatOverlaySchema = z.object({
  layout: z.enum(['regular', 'compact']).default('regular'),
  fontFamily: z.enum(['system', 'rounded', 'monospace']).default('system'),
  fontSizePx: z.number().int().min(12).max(36).default(18),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default('#ffffff'),
  backgroundMode: z.enum(['transparent', 'solid']).default('transparent'),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default('#171120'),
  backgroundOpacity: z.number().min(0).max(1).default(0.9),
  messageBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default('#171120'),
  messageBackgroundOpacity: z.number().min(0).max(1).default(0.96),
  messageColorMode: z.enum(['platform', 'single', 'transparent']).default('platform'),
  platformMessageColors: z.object({ twitch: z.string().regex(/^#[0-9a-fA-F]{6}$/u), youtube: z.string().regex(/^#[0-9a-fA-F]{6}$/u), kick: z.string().regex(/^#[0-9a-fA-F]{6}$/u), tiktok: z.string().regex(/^#[0-9a-fA-F]{6}$/u) }).strict().default(DEFAULT_CHAT_PLATFORM_COLORS),
  showPlatformLabels: z.boolean().default(true),
  showProfilePictures: z.boolean().default(true),
  showBadges: z.boolean().default(true),
  ignoredNames: z.array(z.string().trim().min(1).max(256)).max(500).default([]),
  events: z.object({
    enabled: z.boolean().default(true),
    platforms: z.object({ twitch: z.boolean(), youtube: z.boolean(), kick: z.boolean(), tiktok: z.boolean() }).strict().default({ twitch: true, youtube: true, kick: true, tiktok: true }),
    platformEvents: chatPlatformEventsSchema.default(DEFAULT_CHAT_PLATFORM_EVENTS),
    characterLimits: z.object({
      twitch: z.number().int().min(40).max(500).default(500),
      youtube: z.number().int().min(40).max(500).default(200),
      kick: z.number().int().min(40).max(500).default(500),
      tiktok: z.number().int().min(40).max(500).default(150),
    }).strict().default({ twitch: 500, youtube: 200, kick: 500, tiktok: 150 }),
  }).strict().default({
    enabled: true,
    platforms: { twitch: true, youtube: true, kick: true, tiktok: true },
    platformEvents: DEFAULT_CHAT_PLATFORM_EVENTS,
    characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150 },
  }),
}).strict().superRefine((chat, context) => {
  const seen = new Set<string>();
  for (const [index, name] of chat.ignoredNames.entries()) {
    const normalized = name.toLocaleLowerCase('en-US');
    if (seen.has(normalized)) context.addIssue({ code: 'custom', path: ['ignoredNames', index], message: `Ignored name ${name} is duplicated.` });
    seen.add(normalized);
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
  chat: chatOverlaySchema.default({
    layout: 'regular', fontFamily: 'system', fontSizePx: 18, textColor: '#ffffff', backgroundMode: 'transparent', backgroundColor: '#171120', backgroundOpacity: 0.9,
    messageBackgroundColor: '#171120', messageBackgroundOpacity: 0.96, messageColorMode: 'platform', platformMessageColors: DEFAULT_CHAT_PLATFORM_COLORS, showPlatformLabels: true, showProfilePictures: true, showBadges: true, ignoredNames: [],
    events: { enabled: true, platforms: { twitch: true, youtube: true, kick: true, tiktok: true }, platformEvents: DEFAULT_CHAT_PLATFORM_EVENTS, characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150 } },
  }),
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
    browserOverlay: browserOverlaySchema.default({
      enabled: true, brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7_000, showBots: true, showSimulated: true,
      chat: { layout: 'regular', fontFamily: 'system', fontSizePx: 18, textColor: '#ffffff', backgroundMode: 'transparent', backgroundColor: '#171120', backgroundOpacity: 0.9, messageBackgroundColor: '#171120', messageBackgroundOpacity: 0.96, messageColorMode: 'platform', platformMessageColors: DEFAULT_CHAT_PLATFORM_COLORS, showPlatformLabels: true, showProfilePictures: true, showBadges: true, ignoredNames: [], events: { enabled: true, platforms: { twitch: true, youtube: true, kick: true, tiktok: true }, platformEvents: DEFAULT_CHAT_PLATFORM_EVENTS, characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150 } } },
      alerts: { profiles: {} },
    }),
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
        deliveryStateFile: z.string().min(1).default('data/state/delivery-outbox.json'),
        deliveryMaxAttempts: z.number().int().min(1).max(100).default(8),
        deliveryRetryInitialDelayMs: z.number().int().min(10).max(60_000).default(500),
        deliveryRetryMaxDelayMs: z.number().int().min(10).max(600_000).default(30_000),
        deliveryDeadLetterCapacity: z.number().int().min(1).max(100_000).default(1_000),
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
        if (streamerbot.deliveryRetryMaxDelayMs < streamerbot.deliveryRetryInitialDelayMs) context.addIssue({ code: 'custom', path: ['deliveryRetryMaxDelayMs'], message: 'Maximum delivery retry delay must be at least the initial delay' });
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
    migrateLegacyChatEventConfiguration(overlay);
    migrated['browserOverlay'] = overlay;
  }
  delete migrated['meldOverlay'];
  delete migrated['viewerIdentity'];
  delete migrated['companion'];
  return migrated;
}, bridgeConfigObjectSchema);

function migrateLegacyChatEventConfiguration(overlay: Record<string, unknown>): void {
  if (overlay['chat'] === null || typeof overlay['chat'] !== 'object' || Array.isArray(overlay['chat'])) return;
  const chat = { ...(overlay['chat'] as Record<string, unknown>) };
  if (chat['events'] === null || typeof chat['events'] !== 'object' || Array.isArray(chat['events'])) { overlay['chat'] = chat; return; }
  const events = { ...(chat['events'] as Record<string, unknown>) };
  const categories = objectRecord(events['categories']);
  const platformCategories = objectRecord(events['platformCategories']);
  const templates = objectRecord(events['templates']);
  if (events['platformEvents'] === undefined) {
    const migratedPlatforms: Record<string, unknown> = {};
    for (const [platform, definitions] of Object.entries(DEFAULT_CHAT_PLATFORM_EVENTS)) {
      const migratedDefinitions: Record<string, unknown> = {};
      const perPlatformCategories = objectRecord(platformCategories[platform]);
      const perPlatformTemplates = objectRecord(templates[platform]);
      for (const [eventId, setting] of Object.entries(definitions as Readonly<Record<string, { readonly template: string }>>)) {
        const legacyCategory = legacyChatCategory(platform, eventId);
        const template = perPlatformTemplates[legacyCategory];
        migratedDefinitions[eventId] = {
          enabled: categories[legacyCategory] !== false && perPlatformCategories[legacyCategory] !== false,
          template: typeof template === 'string' ? template : setting.template,
        };
      }
      migratedPlatforms[platform] = migratedDefinitions;
    }
    events['platformEvents'] = migratedPlatforms;
  }
  delete events['categories'];
  delete events['platformCategories'];
  delete events['templates'];
  chat['events'] = events;
  overlay['chat'] = chat;
}

function legacyChatCategory(platform: string, eventId: string): string {
  if (eventId === 'reward-redemption') return 'rewards';
  if (eventId === 'follow' || eventId === 'subscriber') return 'follows';
  if (['subscription', 'resubscription', 'gift-subscription', 'gift-bomb', 'member', 'membership-gift', 'member-milestone', 'mass-gift-subscription'].includes(eventId)) return 'subscriptions';
  if (eventId === 'gift' || eventId === 'gifted-kicks') return 'gifts';
  if (eventId === 'cheer' || eventId === 'super-chat' || eventId === 'super-sticker') return 'support';
  if (eventId === 'raid') return 'raids';
  if (platform === 'tiktok' && eventId === 'likes') return 'milestones';
  return 'milestones';
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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
