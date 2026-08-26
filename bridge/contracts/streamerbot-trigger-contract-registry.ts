export interface StreamerBotTriggerContract {
  readonly packageId: string;
  readonly actionName: string;
  readonly triggerTypes: readonly number[];
  readonly triggerLabels: readonly string[];
  readonly unavailableAliases?: readonly string[];
}

export interface StreamerBotTriggerRegistry {
  readonly version: string;
  readonly aliases: Readonly<Record<string, string>>;
  readonly unavailable: Readonly<Record<string, string>>;
  readonly contracts: readonly StreamerBotTriggerContract[];
  readonly defaults: Readonly<Record<number, Readonly<Record<string, string | number | boolean>>>>;
}

export const STREAMERBOT_TRIGGER_REGISTRY_107: StreamerBotTriggerRegistry = Object.freeze({
  version: '1.0.7',
  aliases: Object.freeze({
    TwitchChatMessage: 'Twitch > Chat > Chat Message',
    YouTubeMessage: 'YouTube > Chat > Chat Message',
    YouTubeMembershipGift: 'YouTube > Membership > Gift Membership Received',
    YouTubeBroadcastStarted: 'YouTube > Broadcast > Broadcast Monitoring Started',
    KickChatMessage: 'Kick > Chat > Chat Message',
  }),
  unavailable: Object.freeze({
    TwitchSub: 'Streamer.bot 1.0.7 does not expose a separate plain Subscription picker in this installation.',
    KickSubscription: 'Streamer.bot 1.0.7 does not expose a separate plain Subscription picker in this installation.',
  }),
  contracts: Object.freeze([
    Object.freeze({
      packageId: 'native-platform-intake', actionName: 'THSV Twitch - Intake',
      triggerTypes: Object.freeze([133, 101, 102, 104, 105, 106, 107, 112, 154, 155]),
      triggerLabels: Object.freeze(['Chat Message', 'Follow', 'Cheer', 'Subscription/Resubscription', 'Gift Subscription/Gift Bomb', 'Raid', 'Reward Redemption', 'Stream Online', 'Stream Offline']),
      unavailableAliases: Object.freeze(['TwitchSub']),
    }),
    Object.freeze({
      packageId: 'native-platform-intake', actionName: 'THSV YouTube - Intake',
      triggerTypes: Object.freeze([4003, 4006, 4007, 4030, 4018, 4008, 4009, 4015, 4019, 4002]),
      triggerLabels: Object.freeze(['Chat Message', 'Super Chat', 'Super Sticker', 'Jewels Gifted', 'New Subscriber', 'New Sponsor', 'Member Milestone', 'Gift Membership Received', 'Broadcast Monitoring Started', 'Broadcast Ended']),
    }),
    Object.freeze({
      packageId: 'native-platform-intake', actionName: 'THSV Kick - Intake',
      triggerTypes: Object.freeze([35010, 35011, 35016, 35015, 35017, 35025, 35024, 35012, 35013]),
      triggerLabels: Object.freeze(['Chat Message', 'Follow', 'Resubscription', 'Gift Subscription', 'Mass Gift Subscription', 'Kicks Gifted', 'Reward Redemption', 'Stream Online', 'Stream Offline']),
      unavailableAliases: Object.freeze(['KickSubscription']),
    }),
  ]),
  defaults: Object.freeze({
    102: Object.freeze({ min: -1, max: -1 }),
    104: Object.freeze({ tiers: 16, min: -1, max: -1 }),
    105: Object.freeze({ tiers: 16, min: -1, max: -1, subType: 0, monthsGifted: 15 }),
    106: Object.freeze({ tiers: 16, min: -1, max: -1, subType: 0 }),
    107: Object.freeze({ min: -1, max: -1 }),
    112: Object.freeze({ rewardId: '' }),
    4006: Object.freeze({ min: -1, max: -1 }),
    4007: Object.freeze({ min: -1, max: -1 }),
    4030: Object.freeze({ min: -1, max: -1 }),
    35017: Object.freeze({ min: -1, max: -1 }),
    35025: Object.freeze({ min: -1, max: -1 }),
    35024: Object.freeze({ rewardId: '' }),
  }),
});

export function normalizeStreamerBotVersion(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value.trim());
  return match === null ? undefined : match.slice(1, 4).join('.');
}
