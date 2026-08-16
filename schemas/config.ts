import { z } from 'zod';

// Conservative, editable defaults for well-known service accounts. These names
// supplement actorType=bot because some provider relays do not classify bots.
export const DEFAULT_IGNORED_BOT_NAMES = [
  'nightbot',
  'streamelements',
  'fossabot',
  'moobot',
  'sery_bot',
  'soundalerts',
  'wizebot',
  'kofistreambot',
  'botrix',
  'streamlabs',
] as const;

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
    // Zero keeps retrying indefinitely with the bounded exponential backoff.
    maxAttempts: z.number().int().min(0).max(100),
  })
  .strict()
  .refine((value) => value.maxDelayMs >= value.initialDelayMs, {
    message: 'maxDelayMs must be greater than or equal to initialDelayMs',
  });

// Chat commands may begin with a digit (for example, the conventional !8ball).
const commandNameSchema = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/);

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
const TIMED_MESSAGE_OUTPUT_ACTION_ID = '7d107c29-1127-5bb1-ae8b-6f04d89a71d4';
export const TIMED_CHAT_PLATFORM_VALUES = ['twitch', 'youtube', 'kick', 'tiktok'] as const;
export const TIMED_MESSAGE_CHARACTER_LIMITS = { twitch: 500, youtube: 200, kick: 500, tiktok: 150 } as const;
const platformMessageListsSchema = z.object({
  twitch: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.twitch)).min(2).max(200).optional(),
  youtube: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.youtube)).min(2).max(200).optional(),
  kick: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.kick)).min(2).max(200).optional(),
  tiktok: z.array(z.string().trim().min(1).max(TIMED_MESSAGE_CHARACTER_LIMITS.tiktok)).min(2).max(200).optional(),
}).strict().refine((lists) => Object.values(lists).some((messages) => messages !== undefined && messages.length >= 2), 'Platform message rotation requires at least one platform with two messages.');
const timedMessageGroupSchema = z.object({
  id: timedActionIdSchema,
  name: z.string().trim().min(1).max(80),
  messages: z.array(z.string().trim().min(1).max(500)).min(1).max(200),
}).strict();
const timedActionSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed') }).strict(),
  z.object({
    mode: z.literal('shuffle-container'),
    messages: z.array(z.string().min(1).max(500)).min(2).max(200),
    groups: z.array(timedMessageGroupSchema).min(1).max(50).optional(),
  }).strict(),
  z.object({ mode: z.literal('platform-shuffle'), messagesByPlatform: platformMessageListsSchema }).strict(),
]);

const PROTECTED_TIMED_ACTION_IDS = new Set([
  '143fce1d-c5b0-4108-b766-ee2d0249e2d4', 'f021d77f-7eb8-55d8-87dd-d681c439dfef',
  '04ca0087-578d-5c2e-9e06-249dc072e9f8', 'c1d3a9e2-0f4b-4b78-91c2-7a65d8e309f1',
  'f5b716a8-eb6e-54d3-8e25-d7dd80f6baf2', '8d8e3667-fd96-510f-b2ae-a8affe5b789a',
  '4e9f0946-f33d-5309-b376-a16df5612b32',
]);

const timedActionTargetSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('event-only') }).strict(),
  z.object({
    provider: z.literal('run-existing-action'),
    actionId: z.uuid().refine((value) => !PROTECTED_TIMED_ACTION_IDS.has(value.toLowerCase()), 'protected StreamBridge actions cannot be timed-action targets'),
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
    if (definition.target.provider === 'run-existing-action' && definition.target.actionId.toLowerCase() === TIMED_MESSAGE_OUTPUT_ACTION_ID) {
      if (!definition.gates.requireLive) context.addIssue({ code: 'custom', path: ['definitions', index, 'gates', 'requireLive'], message: 'Timed chat messages must require a verified live stream.' });
      if (definition.target.deliveryPlatforms.length === 0) context.addIssue({ code: 'custom', path: ['definitions', index, 'target', 'deliveryPlatforms'], message: 'Timed chat messages require at least one delivery platform.' });
      const limit = definition.target.deliveryPlatforms.includes('tiktok') ? 150 : definition.target.deliveryPlatforms.includes('youtube') ? 200 : 500;
      if (definition.selection.mode === 'shuffle-container') for (const [messageIndex, message] of definition.selection.messages.entries()) {
        if (Array.from(message).length > limit) context.addIssue({ code: 'custom', path: ['definitions', index, 'selection', 'messages', messageIndex], message: `Timed message exceeds the strictest selected platform limit of ${String(limit)} characters.` });
      }
    }
    if (definition.selection.mode === 'shuffle-container') {
      const canonicalKeys = definition.selection.messages.map((message) => message.trim().toLocaleLowerCase());
      if (new Set(canonicalKeys).size !== canonicalKeys.length) context.addIssue({ code: 'custom', path: ['definitions', index, 'selection', 'messages'], message: 'Timed-message rotations cannot contain duplicate messages.' });
      if (definition.selection.groups) {
        const groupIds = definition.selection.groups.map((group) => group.id);
        if (new Set(groupIds).size !== groupIds.length) context.addIssue({ code: 'custom', path: ['definitions', index, 'selection', 'groups'], message: 'Timed-message group IDs must be unique.' });
        const groupedMessages = definition.selection.groups.flatMap((group) => group.messages);
        const groupedKeys = groupedMessages.map((message) => message.trim().toLocaleLowerCase());
        if (new Set(groupedKeys).size !== groupedKeys.length) context.addIssue({ code: 'custom', path: ['definitions', index, 'selection', 'groups'], message: 'Timed-message groups cannot contain duplicate messages.' });
        if (groupedKeys.length !== canonicalKeys.length || groupedKeys.some((key, messageIndex) => key !== canonicalKeys[messageIndex])) context.addIssue({ code: 'custom', path: ['definitions', index, 'selection', 'groups'], message: 'Timed-message groups must flatten to the shared shuffle list in the same order.' });
      }
    }
  }
});

export const ALERT_PRESENTATION_TYPE_VALUES = ['follow', 'subscription', 'membership', 'gift-subscription', 'gift', 'donation', 'cheer', 'super-chat', 'raid', 'milestone'] as const;
const ALERT_TEMPLATE_TOKEN_VALUES = ['actor', 'alertType', 'platform', 'amount', 'currency', 'quantity', 'itemName', 'tier', 'message', 'metric', 'value'] as const;
const alertTemplateTokens = new Set<string>(ALERT_TEMPLATE_TOKEN_VALUES);
const WINDOWS_1252_BYTES = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91],
  [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function mojibakeScore(value: string): number {
  return (value.match(/[\u00c2\u00c3\u00e2\u00f0\u00ef\ufffd]/gu) ?? []).length;
}

function decodeWindows1252Utf8(value: string): string | undefined {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    const mapped = WINDOWS_1252_BYTES.get(point);
    if (mapped !== undefined) bytes.push(mapped);
    else if (point <= 0xff) bytes.push(point);
    else return undefined;
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); }
  catch { return undefined; }
}

export function repairCommonMojibake(value: string): string {
  // Accept a strict Windows-1252-to-UTF-8 repair only when it reduces suspicious byte markers.
  // This fixes provider text such as emoji and punctuation without changing ordinary Unicode.
  let repaired = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = decodeWindows1252Utf8(repaired);
    if (decoded === undefined || mojibakeScore(decoded) >= mojibakeScore(repaired)) break;
    repaired = decoded;
  }
  return repaired
    .replaceAll('\u00c2\u00b7', '\u00b7')
    .replaceAll('\u00e2\u0153\u00a8', '\u2728')
    .replaceAll('\u00e2\u20ac\u201d', '\u2014')
    .replaceAll('\u00e2\u20ac\u201c', '\u2013')
    .replaceAll('\u00e2\u20ac\u2122', '\u2019')
    .replaceAll('\u00e2\u20ac\u00a6', '\u2026')
    .replaceAll('\u00e2\u20ac\u00a2', '\u2022')
    .replaceAll('\u00f0\u0178\u201d\u00a5', '\ud83d\udd25')
    .replace(/\u00c2(?=$|\s|[.,!?;:)\]])/gu, '');
}
const alertTemplateSchema = z.string().max(500).overwrite(repairCommonMojibake).refine((value) => !/[\p{Cc}]/u.test(value), 'Alert templates cannot contain control characters.').superRefine((value, context) => {
  for (const match of value.matchAll(/\{([a-z][a-zA-Z]*)\}/gu)) {
    if (!alertTemplateTokens.has(match[1] ?? '')) context.addIssue({ code: 'custom', message: `Unknown alert template token ${match[0]}.` });
  }
});
const alertPresentationProfileSchema = z.object({
  enabled: z.boolean().default(true),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  durationMs: z.number().int().min(1_000).max(60_000).optional(),
  titleTemplate: alertTemplateSchema.min(1).optional(),
  showThankYou: z.boolean().optional(),
  thankYouTemplate: alertTemplateSchema.min(1).optional(),
  showViewerMessage: z.boolean().optional(),
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
    backgroundImageUrl: z.string().regex(/^\/overlay\/assets\/[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/u).optional(),
    backgroundVideoUrl: z.string().regex(/^\/overlay\/assets\/[a-f0-9]{64}\.(?:mp4|webm)$/u).optional(),
    layout: z.enum(['classic', 'stacked', 'centered']).default('classic'),
    mediaPlacement: z.enum(['behind', 'below', 'inset']).default('behind'),
    transition: z.enum(['slide-vertical', 'fade', 'slide-horizontal', 'pop', 'none']).default('slide-vertical'),
  }).strict().superRefine((card, context) => {
    if (card.backgroundImageUrl !== undefined && card.backgroundVideoUrl !== undefined) context.addIssue({ code: 'custom', path: ['backgroundVideoUrl'], message: 'Use either a background image or a background video, not both.' });
  }).default({ backgroundColor: '#171120', fontFamily: 'system', layout: 'classic', mediaPlacement: 'behind', transition: 'slide-vertical' }),
  aggregation: z.object({ mode: z.enum(['none', 'sum-quantity']).default('none'), windowMs: z.number().int().min(500).max(30_000).default(5_000) }).strict().default({ mode: 'none', windowMs: 5_000 }),
}).strict();
// Alert presentation can include provider-only integrations that are not chat-output
// destinations. Keep this separate from TIMED_CHAT_PLATFORM_VALUES so Ko-fi can render
// alerts and chat activity without being offered as a timed-message destination.
export const ALERT_PLATFORM_VALUES = [...TIMED_CHAT_PLATFORM_VALUES, 'streamlabs', 'kofi'] as const;
export const PLATFORM_ALERT_TYPES: Readonly<Record<(typeof ALERT_PLATFORM_VALUES)[number], readonly (typeof ALERT_PRESENTATION_TYPE_VALUES)[number][]>> = {
  twitch: ['follow', 'subscription', 'gift-subscription', 'cheer', 'raid'],
  youtube: ['follow', 'membership', 'gift-subscription', 'gift', 'super-chat'],
  kick: ['follow', 'subscription', 'gift-subscription', 'gift'],
  tiktok: ['follow', 'subscription', 'gift', 'milestone'],
  streamlabs: ['donation'],
  kofi: ['donation'],
};
export const alertPresentationSchema = z.object({
  profiles: z.partialRecord(
    z.enum(ALERT_PLATFORM_VALUES),
    z.partialRecord(z.enum(ALERT_PRESENTATION_TYPE_VALUES), alertPresentationProfileSchema).default({}),
  ).default({}),
}).strict().superRefine((alerts, context) => {
  for (const [platform, platformProfiles] of Object.entries(alerts.profiles)) {
    for (const [alertType, profile] of Object.entries(platformProfiles)) {
      if (profile.aggregation.mode === 'sum-quantity' && !['gift', 'gift-subscription', 'cheer'].includes(alertType)) {
        context.addIssue({ code: 'custom', path: ['profiles', platform, alertType, 'aggregation', 'mode'], message: 'Quantity aggregation is supported only for gifts, gift subscriptions, and cheers/bits.' });
      }
      if (!(PLATFORM_ALERT_TYPES[platform as (typeof ALERT_PLATFORM_VALUES)[number]] as readonly string[]).includes(alertType)) {
        context.addIssue({ code: 'custom', path: ['profiles', platform, alertType], message: `${platform} never produces ${alertType} alerts.` });
      }
    }
  }
});

const CHAT_EVENT_TEMPLATE_TOKEN_VALUES = ['actor', 'rewardTitle', 'input', 'amount', 'currency', 'quantity', 'itemName', 'jewelsAmount', 'tier', 'message', 'metric', 'value', 'months', 'streakMonths'] as const;
const chatEventTemplateTokens = new Set<string>(CHAT_EVENT_TEMPLATE_TOKEN_VALUES);
const platformChatEventTemplateSchema = z.string().max(500).overwrite(repairCommonMojibake).refine((value) => !/[\p{Cc}]/u.test(value), 'Chat event templates cannot contain control characters.').superRefine((value, context) => {
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
    'jewels-gift': { enabled: true, template: '{actor} sent {quantity} {itemName} worth {jewelsAmount} Jewels' },
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
  kofi: {
    donation: { enabled: true, template: '{actor} supported with {amount} {currency} {message}' },
  },
  streamlabs: {
    donation: { enabled: true, template: '{actor} donated {amount} {currency} {message}' },
  },
} as const;
const chatPlatformEventsSchema = z.object({
  twitch: z.object({ follow: chatEventSettingSchema, subscription: chatEventSettingSchema, resubscription: chatEventSettingSchema, 'gift-subscription': chatEventSettingSchema, 'gift-bomb': chatEventSettingSchema, cheer: chatEventSettingSchema, raid: chatEventSettingSchema, 'reward-redemption': chatEventSettingSchema }).strict(),
  youtube: z.object({ subscriber: chatEventSettingSchema, member: chatEventSettingSchema, 'membership-gift': chatEventSettingSchema, 'member-milestone': chatEventSettingSchema, 'super-chat': chatEventSettingSchema, 'super-sticker': chatEventSettingSchema, 'jewels-gift': chatEventSettingSchema }).strict(),
  kick: z.object({ follow: chatEventSettingSchema, subscription: chatEventSettingSchema, resubscription: chatEventSettingSchema, 'gift-subscription': chatEventSettingSchema, 'mass-gift-subscription': chatEventSettingSchema, 'gifted-kicks': chatEventSettingSchema, 'reward-redemption': chatEventSettingSchema }).strict(),
  tiktok: z.object({ follow: chatEventSettingSchema, gift: chatEventSettingSchema, subscription: chatEventSettingSchema, likes: chatEventSettingSchema }).strict(),
  streamlabs: z.object({ donation: chatEventSettingSchema }).strict(),
  kofi: z.object({ donation: chatEventSettingSchema }).strict(),
}).strict();
const LEGACY_CHAT_PLATFORM_COLORS = { twitch: '#4b267b', youtube: '#7d1717', kick: '#245c18', tiktok: '#172b31', streamlabs: '#1f8f6a', kofi: '#174a63' } as const;
export const DEFAULT_CHAT_PLATFORM_COLORS = { twitch: '#321b52', youtube: '#571313', kick: '#153e12', tiktok: '#10272c', streamlabs: '#125a47', kofi: '#123b52' } as const;

export const chatOverlaySchema = z.object({
  layout: z.enum(['regular', 'compact', 'minimal', 'classic']).default('regular'),
  orientation: z.enum(['vertical', 'horizontal']).default('vertical'),
  newMessagePosition: z.enum(['end', 'start']).default('end'),
  animation: z.enum(['slide', 'fade', 'pop', 'none']).default('slide'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  fontFamily: z.enum(['system', 'rounded', 'monospace']).default('system'),
  // Accept the former persisted range so upgrades remain recoverable, then normalize it to the
  // OBS-safe range exposed by the wizard. This prevents old extreme values from warping chat.
  fontSizePx: z.number().int().min(12).max(36).transform((value) => Math.max(14, Math.min(28, value))).default(18),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default('#ffffff'),
  backgroundMode: z.enum(['transparent', 'solid']).default('transparent'),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default('#171120'),
  backgroundOpacity: z.number().min(0).max(1).default(0.9),
  messageBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default('#171120'),
  messageBackgroundOpacity: z.number().min(0).max(1).default(0.96),
  messageColorMode: z.enum(['platform', 'single', 'transparent']).default('platform'),
  platformMessageColors: z.object({ twitch: z.string().regex(/^#[0-9a-fA-F]{6}$/u), youtube: z.string().regex(/^#[0-9a-fA-F]{6}$/u), kick: z.string().regex(/^#[0-9a-fA-F]{6}$/u), tiktok: z.string().regex(/^#[0-9a-fA-F]{6}$/u), streamlabs: z.string().regex(/^#[0-9a-fA-F]{6}$/u), kofi: z.string().regex(/^#[0-9a-fA-F]{6}$/u) }).strict().default(DEFAULT_CHAT_PLATFORM_COLORS),
  showPlatformLabels: z.boolean().default(true),
  showProfilePictures: z.boolean().default(true),
  showBadges: z.boolean().default(true),
  ignoredNames: z.array(z.string().trim().min(1).max(256)).max(500).default([...DEFAULT_IGNORED_BOT_NAMES]),
  events: z.object({
    enabled: z.boolean().default(true),
    platforms: z.object({ twitch: z.boolean(), youtube: z.boolean(), kick: z.boolean(), tiktok: z.boolean(), streamlabs: z.boolean(), kofi: z.boolean() }).strict().default({ twitch: true, youtube: true, kick: true, tiktok: true, streamlabs: true, kofi: true }),
    platformEvents: chatPlatformEventsSchema.default(DEFAULT_CHAT_PLATFORM_EVENTS),
    characterLimits: z.object({
      twitch: z.number().int().min(40).max(500).default(500),
      youtube: z.number().int().min(40).max(500).default(200),
      kick: z.number().int().min(40).max(500).default(500),
      tiktok: z.number().int().min(40).max(500).default(150),
      streamlabs: z.number().int().min(40).max(500).default(500),
      kofi: z.number().int().min(40).max(500).default(500),
    }).strict().default({ twitch: 500, youtube: 200, kick: 500, tiktok: 150, streamlabs: 500, kofi: 500 }),
  }).strict().default({
    enabled: true,
    platforms: { twitch: true, youtube: true, kick: true, tiktok: true, streamlabs: true, kofi: true },
    platformEvents: DEFAULT_CHAT_PLATFORM_EVENTS,
    characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150, streamlabs: 500, kofi: 500 },
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
  overlayGapMs: z.number().int().min(250).max(10_000).default(1_000),
  showBots: z.boolean().default(true),
  showSimulated: z.boolean().default(true),
  chat: chatOverlaySchema.default({
    layout: 'regular', orientation: 'vertical', newMessagePosition: 'end', animation: 'slide', textAlign: 'left', fontFamily: 'system', fontSizePx: 18, textColor: '#ffffff', backgroundMode: 'transparent', backgroundColor: '#171120', backgroundOpacity: 0.9,
    messageBackgroundColor: '#171120', messageBackgroundOpacity: 0.96, messageColorMode: 'platform', platformMessageColors: DEFAULT_CHAT_PLATFORM_COLORS, showPlatformLabels: true, showProfilePictures: true, showBadges: true, ignoredNames: [...DEFAULT_IGNORED_BOT_NAMES],
    events: { enabled: true, platforms: { twitch: true, youtube: true, kick: true, tiktok: true, streamlabs: true, kofi: true }, platformEvents: DEFAULT_CHAT_PLATFORM_EVENTS, characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150, streamlabs: 500, kofi: 500 } },
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
      enabled: true, brandLabel: 'THE HIDDEN SLOTH VILLAGE', maxChatMessages: 8, maxAlertQueue: 20, alertDurationMs: 7_000, overlayGapMs: 1_000, showBots: true, showSimulated: true,
      chat: { layout: 'regular', orientation: 'vertical', newMessagePosition: 'end', animation: 'slide', textAlign: 'left', fontFamily: 'system', fontSizePx: 18, textColor: '#ffffff', backgroundMode: 'transparent', backgroundColor: '#171120', backgroundOpacity: 0.9, messageBackgroundColor: '#171120', messageBackgroundOpacity: 0.96, messageColorMode: 'platform', platformMessageColors: DEFAULT_CHAT_PLATFORM_COLORS, showPlatformLabels: true, showProfilePictures: true, showBadges: true, ignoredNames: [...DEFAULT_IGNORED_BOT_NAMES], events: { enabled: true, platforms: { twitch: true, youtube: true, kick: true, tiktok: true, streamlabs: true, kofi: true }, platformEvents: DEFAULT_CHAT_PLATFORM_EVENTS, characterLimits: { twitch: 500, youtube: 200, kick: 500, tiktok: 150, streamlabs: 500, kofi: 500 } } },
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
  if (migrated['platforms'] !== null && typeof migrated['platforms'] === 'object' && !Array.isArray(migrated['platforms'])) {
    migrated['platforms'] = Object.fromEntries(Object.entries(migrated['platforms'] as Record<string, unknown>).filter(([, value]) => {
      return value === null || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>)['adapter'] !== 'streamerbot-addon-relay';
    }));
  }
  return migrated;
}, bridgeConfigObjectSchema);

function migrateLegacyChatEventConfiguration(overlay: Record<string, unknown>): void {
  if (overlay['chat'] === null || typeof overlay['chat'] !== 'object' || Array.isArray(overlay['chat'])) return;
  const chat = { ...(overlay['chat'] as Record<string, unknown>) };
  const savedPlatformColors = objectRecord(chat['platformMessageColors']);
  const platformMessageColors: Record<string, unknown> = { ...DEFAULT_CHAT_PLATFORM_COLORS, ...savedPlatformColors };
  for (const platform of Object.keys(DEFAULT_CHAT_PLATFORM_COLORS) as (keyof typeof DEFAULT_CHAT_PLATFORM_COLORS)[]) {
    if (savedPlatformColors[platform] === LEGACY_CHAT_PLATFORM_COLORS[platform]) platformMessageColors[platform] = DEFAULT_CHAT_PLATFORM_COLORS[platform];
  }
  chat['platformMessageColors'] = platformMessageColors;
  if (chat['events'] === null || typeof chat['events'] !== 'object' || Array.isArray(chat['events'])) { overlay['chat'] = chat; return; }
  const events = { ...(chat['events'] as Record<string, unknown>) };
  const categories = objectRecord(events['categories']);
  const platformCategories = objectRecord(events['platformCategories']);
  const templates = objectRecord(events['templates']);
  const migratedPlatforms: Record<string, unknown> = { ...objectRecord(events['platformEvents']) };
  for (const [platform, definitions] of Object.entries(DEFAULT_CHAT_PLATFORM_EVENTS)) {
    const migratedDefinitions: Record<string, unknown> = { ...objectRecord(migratedPlatforms[platform]) };
    if (events['platformEvents'] === undefined) {
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
    } else {
      for (const [eventId, setting] of Object.entries(definitions)) {
        if (migratedDefinitions[eventId] === undefined) migratedDefinitions[eventId] = setting;
      }
    }
    migratedPlatforms[platform] = migratedDefinitions;
  }
  events['platformEvents'] = migratedPlatforms;
  events['platforms'] = { twitch: true, youtube: true, kick: true, tiktok: true, streamlabs: true, kofi: true, ...objectRecord(events['platforms']) };
  events['characterLimits'] = { twitch: 500, youtube: 200, kick: 500, tiktok: 150, streamlabs: 500, kofi: 500, ...objectRecord(events['characterLimits']) };
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
  if (eventId === 'gift' || eventId === 'gifted-kicks' || eventId === 'jewels-gift') return 'gifts';
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
  if (hasHazardousQuantifiedGroup(pattern)) return 'Quantified groups may not contain alternation or another quantifier.';
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

function hasHazardousQuantifiedGroup(pattern: string): boolean {
  const stack: boolean[] = [];
  let escaped = false; let inClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === '[') { inClass = true; continue; }
    if (character === ']' && inClass) { inClass = false; continue; }
    if (inClass) continue;
    if (character === '(') { stack.push(false); continue; }
    if (character === '|' || character === '*' || character === '+' || character === '?' || character === '{') {
      if (stack.length > 0) stack[stack.length - 1] = true;
      continue;
    }
    if (character !== ')' || stack.length === 0) continue;
    const hazardous = stack.pop() === true;
    if (hazardous && stack.length > 0) stack[stack.length - 1] = true;
    const next = pattern[index + 1];
    if (hazardous && next !== undefined && ['*', '+', '?', '{'].includes(next)) return true;
  }
  return false;
}

function countQuantifiers(pattern: string): number {
  const withoutEscapedLiterals = pattern.replace(/\\[+*?]/gu, '');
  const withoutNonCapturingMarkers = withoutEscapedLiterals.replace(/\(\?:/gu, '(');
  return (withoutNonCapturingMarkers.match(/[+*?]|\{\d+(?:,\d*)?\}/gu) ?? []).length;
}
