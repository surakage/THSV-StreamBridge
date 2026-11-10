import { randomUUID } from 'node:crypto';
import type { NormalizedEvent } from '../../schemas/event.js';
import { buildNormalizedEvent } from '../adapters/normalization.js';
import type { ControlPanelRequestV1, ControlPanelResultV1 } from '../contracts/v2/addon-capability.js';
import type { RunningModuleSnapshot } from '../core/module-registry.js';
import { MAIN_FEATURE_FAMILIES } from '../core/main-feature-registry.js';

// The Control Panel: one pop-out window with a tab per extension. A tab is usable only while its extension is
// enabled and running. Each tab offers the extension's creator actions and a few settings that are safe to change
// while it runs (lists like exercises, flavors or wheel choices); those apply live, with no restart.

export const CONTROL_PANEL_SOURCE_ADAPTER = 'control-panel';

export interface ControlPanelInput {
  readonly name: string;
  readonly label: string;
  readonly type: 'number' | 'text';
  readonly minimum?: number;
  readonly maximum?: number;
  readonly defaultValue?: number | string;
  readonly maxLength?: number;
}

export interface ControlPanelActionSpec {
  readonly action: string;
  readonly label: string;
  readonly style?: 'primary' | 'danger';
  readonly confirm?: string;
  readonly inputs?: readonly ControlPanelInput[];
}

export interface ControlPanelSpec {
  readonly moduleId: string;
  readonly title: string;
  readonly summary: string;
  /** Settings shown in the tab and applied live. Only fields an extension reads each time it runs belong here. */
  readonly fields: readonly string[];
  /** Actions for an extension without its own Control Panel hook; they become its creator-control event. */
  readonly actions?: readonly ControlPanelActionSpec[];
  readonly controlEvent?: string;
  readonly payload?: (action: string, values: Readonly<Record<string, string | number | boolean>>) => Readonly<Record<string, string | number | boolean>> | undefined;
  /** Row-list columns for lists whose extension does not describe them itself (same shape as ui/settings.json fields). */
  readonly ui?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Short names for the tab's quick controls; the settings schema's longer titles are for the Wizard. */
  readonly titles?: Readonly<Record<string, string>>;
}

const simple = (allowed: readonly string[]) => (action: string): Readonly<Record<string, string | number | boolean>> | undefined => (allowed.includes(action) ? { action } : undefined);
const seconds = (values: Readonly<Record<string, string | number | boolean>>, name = 'minutes'): number => Math.round(Number(values[name]) * 60);

export const CONTROL_PANEL_SPECS: readonly ControlPanelSpec[] = Object.freeze([
  {
    moduleId: 'thsv.streamer-punishments', title: 'Streamer Punishments', summary: 'Owed exercises, effects and Bean Boozle. Mark exercises done, trigger one yourself, and edit the lists.',
    fields: ['beanEnabled', 'graceSeconds', 'exerciseLimitPerStream', 'exercises', 'effects', 'beanPairs'],
    titles: { beanEnabled: 'Bean Boozle wheel', graceSeconds: 'Countdown (seconds)', exerciseLimitPerStream: 'Exercises per stream' },
  },
  {
    moduleId: 'thsv.prize-wheel', title: 'Prize Wheel', summary: 'Spin the wheel and change its choices and colours.',
    fields: ['spinSeconds', 'cooldownSeconds', 'options', 'wheelColors'],
    titles: { spinSeconds: 'Spin length (seconds)', cooldownSeconds: 'Cooldown (seconds)' },
  },
  {
    moduleId: 'thsv.village-jukebox', title: 'Village Jukebox', summary: 'The video queue: approve, play, skip and block. The Jukebox remote has the full player.',
    fields: ['approveRequests', 'maximumTrackMinutes', 'maximumQueueSize'],
    titles: { approveRequests: 'Review before playing', maximumTrackMinutes: 'Longest video (minutes)', maximumQueueSize: 'Queue size' },
  },
  {
    moduleId: 'thsv.scoreboard', title: 'Scoreboard', summary: 'This stream\'s numbers next to your records. Correct a row or reset for a new stream.',
    fields: ['showRecords', 'hideZeroRows', 'rows'],
    titles: { showRecords: 'Show records', hideZeroRows: 'Hide empty rows', rows: 'Rows shown' },
  },
  {
    moduleId: 'thsv.goal-bars', title: 'Goal Bars', summary: 'Your goals and how close they are. Add or remove progress by hand and change the targets.',
    fields: [1, 2, 3].flatMap((goal) => [`goal${String(goal)}Enabled`, `goal${String(goal)}Target`]),
    titles: { goal1Enabled: 'Show goal 1', goal1Target: 'Goal 1 target', goal2Enabled: 'Show goal 2', goal2Target: 'Goal 2 target', goal3Enabled: 'Show goal 3', goal3Target: 'Goal 3 target' },
  },
  {
    moduleId: 'thsv.village-draw', title: 'Village Draw', summary: 'Run a giveaway: start it, see who joined, draw winners, draw again if someone is away, and end it.',
    fields: ['giveawayName', 'prizeItem', 'winnerCount', 'entryMode', 'ticketCost', 'autoCloseMinutes', 'claimSeconds'],
    titles: { giveawayName: 'Giveaway name', prizeItem: 'Prize', winnerCount: 'Winners', entryMode: 'Entry', ticketCost: 'Points per ticket', autoCloseMinutes: 'Close after (min, 0 = off)', claimSeconds: 'Claim time (s, 0 = off)' },
  },
  {
    moduleId: 'thsv.village-polls', title: 'Village Polls', summary: 'Start a poll across every platform, watch the votes and post the results.',
    fields: ['pollDurationSeconds', 'showPercentages'],
    titles: { pollDurationSeconds: 'Poll length (seconds)', showPercentages: 'Show percentages' },
  },
  {
    moduleId: 'thsv.chat-play-pack', title: 'Chat Play Pack', summary: 'Pick where questions come from and add your own trivia questions and Unscramble words.',
    fields: ['triviaSource', 'unscrambleSource', 'triviaQuestions', 'unscrambleWords'],
    titles: { triviaSource: 'Trivia questions from', unscrambleSource: 'Unscramble words from' },
    ui: {
      triviaQuestions: { control: 'row-list', itemLabel: 'question', columns: [{ label: 'Question', placeholder: 'What is the slowest mammal?', maxLength: 240, required: true }, { label: 'Answer', placeholder: 'Sloth', maxLength: 240, required: true }, { label: 'Other answers', hint: 'Optional, separated by ;', placeholder: 'three-toed sloth', maxLength: 240 }] },
      unscrambleWords: { control: 'row-list', itemLabel: 'word', columns: [{ label: 'Word', placeholder: 'canopy', maxLength: 180, required: true }, { label: 'Hint', hint: 'Optional', placeholder: 'The top of the forest', maxLength: 180 }] },
    },
  },
  {
    moduleId: 'thsv.reward-timers', title: 'Reward Timers', summary: 'See running timers, start, stop or clear them, and change your timer list.',
    fields: ['timers', 'repeatMode', 'position', 'maxOnScreen'],
    titles: { repeatMode: 'When redeemed again', position: 'Where the timers show', maxOnScreen: 'Most on screen' },
  },
  {
    moduleId: 'thsv.chat-first', title: 'Chat First', summary: 'This stream\'s first chatters. Reset them for a new stream or change the card.',
    fields: ['layout', 'position', 'displayMode', 'showSeconds', 'showCount'],
  },
  {
    moduleId: 'thsv.stream-bingo', title: 'Stream Bingo', summary: 'Start a card, mark squares, see who is playing and this month\'s winners. Change the look live.',
    fields: ['layout', 'position', 'cardSize', 'markColor', 'showNumbers', 'showPlayers', 'showRecent', 'winSeconds', 'title', 'gridSize', 'freeCenter', 'winPattern', 'afterWin', 'newCardSeconds', 'winnerPoints', 'joinPoints', 'blackoutBonus', 'hypeMinutes', 'suggestionsEnabled', 'confirmJoins', 'announceNewCard', 'squarePack', 'squares', 'gamingPack', 'chattingPack'],
    titles: { layout: 'Layout', position: 'Where it shows', cardSize: 'Size', markColor: 'Marked color', showNumbers: 'Square numbers', showPlayers: 'Players count', showRecent: 'Latest squares', winSeconds: 'Winner banner (seconds)', title: 'Title', gridSize: 'Card size (next card)', freeCenter: 'Free middle square (next card)', winPattern: 'What wins (next card)', afterWin: 'After a bingo', newCardSeconds: 'Seconds to next card', winnerPoints: 'Winner points', joinPoints: 'Join points', blackoutBonus: 'Full card bonus (next card)', hypeMinutes: 'Hype after quiet minutes', suggestionsEnabled: 'Viewers can suggest squares', confirmJoins: 'Reply when someone joins', announceNewCard: 'Announce new cards', squarePack: 'Square pack (next card)', squares: 'Your squares', gamingPack: 'Gaming pack', chattingPack: 'Just Chatting pack' },
  },
  {
    moduleId: 'thsv.critter-catch', title: 'Critter Catch', summary: 'Send a critter now, pause visits, watch the throws and see this month\'s top Keepers. Change the look live.',
    fields: ['position', 'critterSize', 'showKeepers', 'jarCost', 'honeyCost', 'moonCost', 'catchMode', 'spawnMinMinutes', 'spawnMaxMinutes', 'onlyWhenChatting', 'glimmerOdds', 'announceSpawns', 'announceMisses', 'announceLeaves', 'critterSet', 'customCritters', 'rewardThrows'],
    titles: { position: 'Where critters wander in', critterSize: 'Size', showKeepers: 'Show who threw', jarCost: 'Jar cost', honeyCost: 'Honey Jar cost', moonCost: 'Moon Jar cost', catchMode: 'Who catches it', spawnMinMinutes: 'Shortest wait (minutes)', spawnMaxMinutes: 'Longest wait (minutes)', onlyWhenChatting: 'Only while chat is active', glimmerOdds: 'Glimmer odds (1 in ...)', announceSpawns: 'Announce visits', announceMisses: 'Tell misses', announceLeaves: 'Announce when it leaves', critterSet: 'Which critters', customCritters: 'Your own critters', rewardThrows: 'Rewards and gifts that throw' },
  },
  {
    moduleId: 'thsv.local-clock', title: 'Local Clock', summary: 'Switch the clock style and what it shows.',
    fields: ['clockStyle', 'hourFormat', 'showSeconds', 'showDate', 'clockSize', 'backgroundMode'],
  },
  {
    moduleId: 'thsv.magic-eight-ball', title: 'Magic Eight Ball', summary: 'Write your own answers.',
    fields: ['answers'],
  },
  {
    moduleId: 'thsv.village-fun-commands', title: 'Village Fun Commands', summary: 'Add your own sloth facts, jokes and fun facts.',
    fields: ['additionalSlothFacts', 'additionalCatFacts', 'additionalJokes', 'additionalFunFacts', 'additionalNumberFacts', 'additionalChuckNorrisJokes'],
  },
  {
    moduleId: 'thsv.chat-guard', title: 'Chat Guard', summary: 'Add blocked words and links while you are live.',
    fields: ['blockedTerms', 'banTerms', 'blockedDomains', 'allowedDomains'],
  },
  {
    moduleId: 'thsv.face-filters', title: 'Face Filters', summary: 'Edit the lenses viewers can pick.',
    fields: ['lenses'],
  },
  {
    moduleId: 'thsv.quote-vault', title: 'Quote Vault', summary: 'Add quotes, approve ones viewers suggested, and remove or restore them.',
    fields: [],
  },
  {
    moduleId: 'thsv.raid-scout', title: 'Raid Scout', summary: 'Find a raid target, let viewers suggest channels, or run Finish Stream (clip, ad, raid and stop streaming) when you are done.',
    fields: ['viewerSuggestionsEnabled', 'viewerSuggestionRewardId', 'maximumViewerSuggestions'],
    titles: { viewerSuggestionsEnabled: 'Viewer raid suggestions', viewerSuggestionRewardId: 'Twitch suggestion reward ID', maximumViewerSuggestions: 'Suggestions per stream' },
    controlEvent: 'addon.thsv.raid-scout.control',
    actions: [
      { action: 'suggest', label: 'Suggest a raid target', style: 'primary' },
      { action: 'finish', label: 'Finish Stream', style: 'danger', confirm: 'Start Finish Stream? It runs your clip, ad and raid steps and then stops streaming.' },
      { action: 'cancel', label: 'Cancel', confirm: 'Cancel what Raid Scout is doing?' },
    ],
    payload: simple(['suggest', 'finish', 'cancel']),
  },
  {
    moduleId: 'thsv.custom-counter', title: 'Custom Counter', summary: 'Count up, down, set or reset the counter.',
    fields: ['defaultCounterName'],
    titles: { defaultCounterName: 'Counter name' },
    controlEvent: 'addon.thsv.custom-counter.control',
    actions: [
      { action: 'increment', label: '+1', style: 'primary' }, { action: 'decrement', label: '−1' },
      { action: 'add', label: 'Add', inputs: [{ name: 'amount', label: 'Amount', type: 'number', minimum: 1, maximum: 1_000_000, defaultValue: 5 }] },
      { action: 'set', label: 'Set to', inputs: [{ name: 'amount', label: 'Value', type: 'number', minimum: -1_000_000, maximum: 1_000_000, defaultValue: 0 }] },
      { action: 'reset', label: 'Reset', style: 'danger', confirm: 'Reset the counter?' },
    ],
    payload: (action, values) => (['increment', 'decrement', 'reset'].includes(action) ? { operation: action } : ['add', 'set'].includes(action) ? { operation: action, amount: Math.trunc(Number(values['amount'])) } : undefined),
  },
  {
    moduleId: 'thsv.subathon-timer', title: 'Subathon Timer', summary: 'Start, pause or add time, and change how much time each event adds.',
    fields: ['followSeconds', 'subscriptionSeconds', 'raidBaseSeconds'],
    titles: { followSeconds: 'Seconds per follow', subscriptionSeconds: 'Seconds per sub', raidBaseSeconds: 'Seconds per raid' },
    controlEvent: 'addon.thsv.subathon-timer.control',
    actions: [
      { action: 'start', label: 'Start', style: 'primary' }, { action: 'pause', label: 'Pause' }, { action: 'resume', label: 'Resume' },
      { action: 'add-time', label: 'Add time', inputs: [{ name: 'minutes', label: 'Minutes', type: 'number', minimum: 1, maximum: 1440, defaultValue: 5 }] },
      { action: 'reset', label: 'Reset', style: 'danger', confirm: 'Reset the subathon timer to its starting time?' },
    ],
    payload: (action, values) => (['start', 'pause', 'resume', 'reset'].includes(action) ? { action } : action === 'add-time' ? { action, seconds: seconds(values) } : undefined),
  },
  {
    moduleId: 'thsv.starting-soon-countdown', title: 'Starting Soon Countdown', summary: 'Start, pause or set the starting-soon countdown.',
    fields: [],
    controlEvent: 'addon.thsv.starting-soon-countdown.control',
    actions: [
      { action: 'start', label: 'Start', style: 'primary' }, { action: 'pause', label: 'Pause' }, { action: 'resume', label: 'Resume' },
      { action: 'set-and-start', label: 'Set and start', inputs: [{ name: 'minutes', label: 'Minutes', type: 'number', minimum: 1, maximum: 1440, defaultValue: 5 }] },
      { action: 'complete', label: 'Finish now' }, { action: 'stop', label: 'Stop' }, { action: 'reset', label: 'Reset', style: 'danger' },
    ],
    payload: (action, values) => (['start', 'stop', 'pause', 'resume', 'reset', 'complete'].includes(action) ? { action } : action === 'set-and-start' ? { action, seconds: seconds(values) } : undefined),
  },
  {
    moduleId: 'thsv.stream-session-guard', title: 'Stream Break & End Guard', summary: 'Pause or resume the break and end-of-stream automation while you are live.',
    fields: [],
    controlEvent: 'addon.thsv.stream-session-guard.control',
    actions: [{ action: 'pause', label: 'Pause automation' }, { action: 'resume', label: 'Resume automation', style: 'primary' }],
    payload: simple(['pause', 'resume']),
  },
  {
    moduleId: 'thsv.viewer-lobby', title: 'Viewer Lobby', summary: 'Open or close the lobby and pick the next player.',
    fields: ['allowGamertag', 'maximumEntries'],
    titles: { allowGamertag: 'Ask for gamertag', maximumEntries: 'Lobby size' },
    controlEvent: 'addon.thsv.viewer-lobby.control',
    actions: [
      { action: 'open', label: 'Open', style: 'primary' }, { action: 'close', label: 'Close' }, { action: 'pause', label: 'Pause' }, { action: 'resume', label: 'Resume' },
      { action: 'next', label: 'Next player', style: 'primary' }, { action: 'random', label: 'Random player' }, { action: 'complete', label: 'Done with player' },
      { action: 'clear', label: 'Clear lobby', style: 'danger', confirm: 'Clear everyone from the lobby?' },
    ],
    payload: simple(['open', 'close', 'pause', 'resume', 'next', 'random', 'complete', 'clear']),
  },
  {
    moduleId: 'thsv.village-hydration-station', title: 'Village Hydration Station', summary: 'Log a drink, snooze or send the reminder, and change your goal.',
    fields: ['speakerEnabled', 'sipAnimation', 'goalOunces', 'defaultServingOunces'],
    titles: { speakerEnabled: 'Spoken reminders', sipAnimation: 'Sip-break animation', goalOunces: 'Daily goal (oz)', defaultServingOunces: 'Drink size (oz)' },
    controlEvent: 'addon.thsv.village-hydration-station.control',
    actions: [
      { action: 'log', label: 'Log a drink', style: 'primary', inputs: [{ name: 'ounces', label: 'Ounces', type: 'number', minimum: 1, maximum: 128, defaultValue: 8 }] },
      { action: 'undo', label: 'Undo last' }, { action: 'snooze', label: 'Snooze reminder' }, { action: 'remind', label: 'Remind now' },
      { action: 'reset', label: 'Reset today', style: 'danger', confirm: 'Reset today\'s water total?' },
    ],
    payload: (action, values) => (action === 'log' ? { action, amountText: `${String(Math.trunc(Number(values['ounces'])))} oz`, source: 'control-panel' } : ['undo', 'snooze', 'remind', 'reset'].includes(action) ? { action, source: 'control-panel' } : undefined),
  },
  {
    moduleId: 'thsv.voice-relay', title: 'Village Voice', summary: 'Pause, resume or stop text-to-speech.',
    fields: ['blockedTerms'],
    controlEvent: 'addon.thsv.voice-relay.control',
    actions: [{ action: 'pause', label: 'Pause' }, { action: 'resume', label: 'Resume', style: 'primary' }, { action: 'stop', label: 'Stop speaking', style: 'danger' }],
    payload: simple(['pause', 'resume', 'stop']),
  },
  {
    moduleId: 'thsv.random-clip-player', title: 'Random Clip Player', summary: 'Start or stop playing your clips.',
    fields: [],
    controlEvent: 'addon.thsv.random-clip-player.control',
    actions: [{ action: 'start', label: 'Start clips', style: 'primary' }, { action: 'stop', label: 'Stop clips' }],
    payload: (action) => (action === 'start' ? { enabled: true } : action === 'stop' ? { enabled: false } : undefined),
  },
  {
    moduleId: 'thsv.fan-crown', title: 'Fan Crown', summary: 'Reset the crown or the month.',
    fields: [],
    controlEvent: 'addon.thsv.fan-crown.control',
    actions: [{ action: 'reset-crown', label: 'Reset crown', confirm: 'Reset the Fan Crown?' }, { action: 'reset-month', label: 'Reset month', style: 'danger', confirm: 'Reset this month\'s Fan Crown standings?' }],
    payload: simple(['reset-crown', 'reset-month']),
  },
  {
    moduleId: 'thsv.first-five', title: 'First Five', summary: 'See who claimed a place this stream, and reset First Five for a new stream.',
    fields: ['notifyRejectedClaims'],
    titles: { notifyRejectedClaims: 'Message on a second claim' },
    controlEvent: 'addon.thsv.first-five.control',
    actions: [{ action: 'reset', label: 'Reset', style: 'danger', confirm: 'Reset First Five?' }],
    payload: simple(['reset']),
  },
  {
    moduleId: 'thsv.category-pilot', title: 'Category Pilot', summary: 'Apply or dismiss the suggested category.',
    fields: [],
    controlEvent: 'addon.thsv.category-pilot.control',
    actions: [{ action: 'apply', label: 'Apply suggestion', style: 'primary' }, { action: 'dismiss', label: 'Dismiss' }],
    payload: simple(['apply', 'dismiss']),
  },
  {
    moduleId: 'thsv.ad-break-companion', title: 'Ad Break Companion', summary: 'Preview the ad-break overlay or hide it.',
    fields: [],
    controlEvent: 'addon.thsv.ad-break-companion.control',
    actions: [{ action: 'preview-upcoming', label: 'Preview "ad coming"' }, { action: 'preview-active', label: 'Preview "ad running"' }, { action: 'hide', label: 'Hide' }],
    payload: simple(['preview-upcoming', 'preview-active', 'hide']),
  },
  // Look and wording tabs: every field below is read each time the extension runs, so changes apply live.
  {
    moduleId: 'thsv.automated-shoutouts', title: 'Automated Shoutouts', summary: 'Turn raid and first-chat shoutouts on or off, change the card and skip names.',
    fields: ['triggerOnRaids', 'minimumRaidViewers', 'triggerOnFirstChat', 'showOverlayCard', 'overlayDurationSeconds', 'ignoredUsers'],
    titles: { triggerOnRaids: 'Shout out raiders', minimumRaidViewers: 'Smallest raid', triggerOnFirstChat: 'Welcome first chatters', showOverlayCard: 'Show the card', overlayDurationSeconds: 'Card time (seconds)', ignoredUsers: 'Never shout out' },
  },
  {
    moduleId: 'thsv.chatter-greeting', title: 'Chatter Greeting', summary: 'Change the welcome messages, where the greeting shows and who is skipped.',
    fields: ['position', 'durationSeconds', 'showChatMessage', 'greetReturning', 'newMessage', 'returningMessage', 'regularMessage', 'skipNames'],
    titles: { position: 'Where it shows', durationSeconds: 'Time on screen (seconds)', showChatMessage: 'Show their message', greetReturning: 'Greet returning chatters', newMessage: 'First-time message', returningMessage: 'Returning message', regularMessage: 'Regular message', skipNames: 'Never greet' },
  },
  {
    moduleId: 'thsv.end-credits', title: 'End Credits', summary: 'Change the wording, speed and look of the credits.',
    fields: ['headline', 'subtitle', 'endMessage', 'scrollSpeed', 'columns', 'loop', 'fontFamily', 'fontSize', 'backgroundMode', 'backgroundColor', 'backgroundOpacity', 'accentColor', 'textColor'],
    titles: { headline: 'Headline', subtitle: 'Subtitle', endMessage: 'Closing line', scrollSpeed: 'Scroll speed', columns: 'Columns', loop: 'Roll again after the end', fontFamily: 'Font', fontSize: 'Text size', backgroundMode: 'Background', backgroundColor: 'Background color', backgroundOpacity: 'Background opacity', accentColor: 'Accent color', textColor: 'Text color' },
  },
  {
    moduleId: 'thsv.polls-predictions', title: 'Polls & Predictions', summary: 'Change where the cards show and what they show.',
    fields: ['position', 'maximumCards', 'showTimer', 'showCounts', 'showPercentages', 'resultSeconds', 'hideAfterResult', 'playSounds', 'soundVolume'],
    titles: { position: 'Where it shows', maximumCards: 'Most cards at once', showTimer: 'Time left', showCounts: 'Vote counts', showPercentages: 'Percentages', resultSeconds: 'Result time (seconds)', hideAfterResult: 'Hide after the result', playSounds: 'Sounds', soundVolume: 'Sound volume' },
  },
  {
    moduleId: 'thsv.stream-labels', title: 'Stream Labels', summary: 'Pick which labels show and change their look.',
    fields: ['enabledLabels', 'showLabelTitle', 'showPlatform', 'textAlign', 'fontFamily', 'fontSize', 'backgroundMode', 'backgroundColor', 'backgroundOpacity', 'accentColor', 'textColor'],
    titles: { enabledLabels: 'Labels', showLabelTitle: 'Label titles', showPlatform: 'Platform name', textAlign: 'Text alignment', fontFamily: 'Font', fontSize: 'Text size', backgroundMode: 'Background', backgroundColor: 'Background color', backgroundOpacity: 'Background opacity', accentColor: 'Accent color', textColor: 'Text color' },
  },
  {
    moduleId: 'thsv.user-translate', title: 'Translate', summary: 'Slow translations down or skip names while you are live.',
    fields: ['userCooldownSeconds', 'globalCooldownSeconds', 'automaticIgnoredNames'],
    titles: { userCooldownSeconds: 'Wait per viewer (seconds)', globalCooldownSeconds: 'Wait between translations (seconds)', automaticIgnoredNames: 'Never translate' },
  },
  {
    moduleId: 'thsv.viewer-spotlight', title: 'Viewer Spotlight', summary: 'Pick what the Spotlight card shows and change its look.',
    fields: ['durationSeconds', 'showAvatar', 'showPlatformBadge', 'showPoints', 'showLevel', 'showLatestAchievement', 'showEngagementScore', 'fontFamily', 'backgroundMode', 'backgroundColor', 'backgroundOpacity', 'accentColor', 'textColor'],
    titles: { durationSeconds: 'Time on screen (seconds)', showAvatar: 'Profile picture', showPlatformBadge: 'Platform badge', showPoints: 'Points', showLevel: 'Level', showLatestAchievement: 'Latest achievement', showEngagementScore: 'Engagement', fontFamily: 'Font', backgroundMode: 'Background', backgroundColor: 'Background color', backgroundOpacity: 'Background opacity', accentColor: 'Accent color', textColor: 'Text color' },
  },
  {
    moduleId: 'thsv.village-roll-call', title: 'Village Roll Call', summary: 'Change the leaderboard card and the check-in messages.',
    fields: ['showLeaderboardCard', 'cardSeconds', 'leaderboardSize', 'announceDuplicates', 'successfulMessage', 'duplicateMessage'],
    titles: { showLeaderboardCard: 'Show the leaderboard card', cardSeconds: 'Card time (seconds)', leaderboardSize: 'Places shown', announceDuplicates: 'Reply to a second check-in', successfulMessage: 'Check-in message', duplicateMessage: 'Second check-in message' },
  },
  {
    moduleId: 'thsv.accessibility-captions', title: 'Accessibility Captions', summary: 'Pick what is captioned and make the captions easier to read.',
    fields: ['showChat', 'showEvents', 'durationSeconds', 'maximumCharacters', 'fontSize', 'highContrast', 'backgroundMode', 'backgroundColor', 'textColor'],
    titles: { showChat: 'Chat messages', showEvents: 'Stream events', durationSeconds: 'Time on screen (seconds)', maximumCharacters: 'Longest caption', fontSize: 'Text size', highContrast: 'High contrast', backgroundMode: 'Background', backgroundColor: 'Background color', textColor: 'Text color' },
  },
]);

export class ControlPanelError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

export interface ControlPanelAddOn {
  readonly moduleId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly health: string;
  readonly configurationSchema: unknown;
  readonly settings: Readonly<Record<string, unknown>>;
  /** The extension's own settings layout (ui/settings.json); the Control Panel reuses its row-list columns. */
  readonly settingsUi?: unknown;
}

export interface ControlPanelDependencies {
  readonly listAddOns: () => Promise<readonly ControlPanelAddOn[]>;
  readonly runningModule: (moduleId: string) => RunningModuleSnapshot | undefined;
  readonly controlPanel: (moduleId: string, request: ControlPanelRequestV1, controlEvent?: NormalizedEvent) => Promise<ControlPanelResultV1>;
  readonly saveSettings: (moduleId: string, settings: Readonly<Record<string, unknown>>) => Promise<Readonly<Record<string, unknown>>>;
  readonly updateSettings: (moduleId: string, settings: Readonly<Record<string, unknown>>) => void;
}

type Values = Readonly<Record<string, string | number | boolean>>;

export class ControlPanelService {
  public constructor(private readonly dependencies: ControlPanelDependencies, private readonly specs: readonly ControlPanelSpec[] = CONTROL_PANEL_SPECS) {}

  /** Every tab, in order. A tab is selectable only while its extension is installed, enabled and running. */
  public async tabs(): Promise<Readonly<Record<string, unknown>>> {
    const installed = new Map((await this.dependencies.listAddOns()).map((addOn) => [addOn.moduleId, addOn]));
    return {
      tabs: this.specs.map((spec) => {
        const addOn = installed.get(spec.moduleId);
        const running = this.dependencies.runningModule(spec.moduleId);
        const available = addOn !== undefined && addOn.enabled && addOn.health !== 'rejected' && running?.status === 'healthy';
        const reason = addOn === undefined ? 'Not installed.' : !addOn.enabled ? 'Turned off. Turn it on in the Setup Wizard.' : running?.status !== 'healthy' ? 'Not running. Restart StreamBridge after turning it on.' : '';
        const properties = schemaProperties(addOn?.configurationSchema);
        const fields = available ? spec.fields.filter((name) => properties[name] !== undefined).map((name) => ({ name, schema: properties[name], value: running.settings[name] ?? addOn.settings[name] ?? null, ...(spec.titles?.[name] === undefined ? {} : { title: spec.titles[name] }), ...fieldLayout(addOn.settingsUi, name, spec.ui?.[name]) })) : [];
        return { moduleId: spec.moduleId, title: spec.title, summary: spec.summary, group: controlPanelGroup(spec.moduleId), available, reason, fields, actions: available ? (spec.actions ?? []) : [] };
      }),
    };
  }

  public async status(moduleId: unknown): Promise<ControlPanelResultV1> {
    const spec = await this.availableSpec(moduleId);
    return this.dependencies.controlPanel(spec.moduleId, { operation: 'status' });
  }

  public async action(input: unknown): Promise<ControlPanelResultV1> {
    const body = record(input);
    const spec = await this.availableSpec(body['moduleId']);
    const action = typeof body['action'] === 'string' ? body['action'] : '';
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/u.test(action)) throw new ControlPanelError(400, 'Unknown control.');
    const values = cleanValues(body['values']);
    const declared = spec.actions?.find((candidate) => candidate.action === action);
    if (declared !== undefined) checkInputs(declared, values);
    let controlEvent: NormalizedEvent | undefined;
    if (spec.controlEvent !== undefined && spec.payload !== undefined) {
      if (declared === undefined) throw new ControlPanelError(400, 'Unknown control.');
      const payload = spec.payload(action, values);
      if (payload === undefined) throw new ControlPanelError(400, 'Unknown control.');
      const eventId = `control-panel-${randomUUID()}`;
      controlEvent = buildNormalizedEvent({ eventType: spec.controlEvent, platform: 'system', adapter: CONTROL_PANEL_SOURCE_ADAPTER, sourceEventName: `Control Panel - ${declared.label}`, sourceEventId: eventId, channel: { name: 'system' }, payload: { ...payload } });
    }
    try {
      return await this.dependencies.controlPanel(spec.moduleId, { operation: 'action', action, ...(Object.keys(values).length > 0 ? { values } : {}) }, controlEvent);
    } catch (error) { throw new ControlPanelError(409, error instanceof Error ? error.message : 'That control did not work.'); }
  }

  /** Saves the tab's settings and gives them to the running extension straight away. */
  public async saveSettings(input: unknown): Promise<Readonly<Record<string, unknown>>> {
    const body = record(input);
    const spec = await this.availableSpec(body['moduleId']);
    const changes = record(body['settings']);
    const unknown = Object.keys(changes).filter((name) => !spec.fields.includes(name));
    if (unknown.length > 0) throw new ControlPanelError(400, 'Those settings cannot be changed from the Control Panel.');
    const addOn = (await this.dependencies.listAddOns()).find((candidate) => candidate.moduleId === spec.moduleId);
    if (addOn === undefined) throw new ControlPanelError(404, 'That extension is not installed.');
    let saved: Readonly<Record<string, unknown>>;
    try { saved = record((await this.dependencies.saveSettings(spec.moduleId, { ...addOn.settings, ...changes }))['settings']); }
    catch (error) { throw new ControlPanelError(400, error instanceof Error ? error.message : 'Those settings are not valid.'); }
    const running = this.dependencies.runningModule(spec.moduleId);
    if (running?.status !== 'healthy') throw new ControlPanelError(409, 'Saved. The extension is not running, so the change applies after a restart.');
    const live = { ...running.settings };
    for (const name of Object.keys(changes)) live[name] = saved[name];
    this.dependencies.updateSettings(spec.moduleId, live);
    // Lets the extension redraw its overlay with the new settings; one that does not care simply ignores it.
    await this.dependencies.controlPanel(spec.moduleId, { operation: 'settings-changed' }).catch(() => undefined);
    return { saved: true, settings: Object.fromEntries(Object.keys(changes).map((name) => [name, saved[name] ?? null])) };
  }

  private async availableSpec(moduleId: unknown): Promise<ControlPanelSpec> {
    const spec = this.specs.find((candidate) => candidate.moduleId === moduleId);
    if (spec === undefined) throw new ControlPanelError(404, 'That extension has no Control Panel tab.');
    const addOn = (await this.dependencies.listAddOns()).find((candidate) => candidate.moduleId === spec.moduleId);
    if (addOn?.enabled !== true || this.dependencies.runningModule(spec.moduleId)?.status !== 'healthy') throw new ControlPanelError(409, `${spec.title} is turned off. Turn it on in the Setup Wizard.`);
    return spec;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function schemaProperties(schema: unknown): Record<string, unknown> {
  return record(record(schema)['properties']);
}

function cleanValues(value: unknown): Values {
  const result: Record<string, string | number | boolean> = {};
  for (const [name, item] of Object.entries(record(value)).slice(0, 12)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/u.test(name)) continue;
    if (typeof item === 'string') result[name] = item.slice(0, 2_000);
    else if ((typeof item === 'number' && Number.isFinite(item)) || typeof item === 'boolean') result[name] = item;
  }
  return result;
}

function checkInputs(action: ControlPanelActionSpec, values: Values): void {
  for (const input of action.inputs ?? []) {
    const value = values[input.name];
    if (input.type === 'number') {
      if (typeof value !== 'number' || (input.minimum !== undefined && value < input.minimum) || (input.maximum !== undefined && value > input.maximum)) {
        throw new ControlPanelError(400, `${input.label} must be a number from ${String(input.minimum ?? '')} to ${String(input.maximum ?? '')}.`);
      }
    } else if (typeof value !== 'string' || value.trim() === '' || value.length > (input.maxLength ?? 300)) throw new ControlPanelError(400, `Fill in ${input.label}.`);
  }
}

/**
 * The row-list columns an extension declares for a setting (ui/settings.json), so the Control Panel shows one box per
 * column instead of one long "a | b | c" line. Only plain, bounded column facts are passed on.
 */
function fieldLayout(settingsUi: unknown, name: string, fallback?: Readonly<Record<string, unknown>>): { readonly layout?: { readonly itemLabel: string; readonly columns: readonly Readonly<Record<string, unknown>>[]; readonly legacyColumnOrder?: readonly number[] }; readonly labels?: Readonly<Record<string, string>> } {
  const fields = isRecord(settingsUi) && isRecord(settingsUi['fields']) ? settingsUi['fields'] : undefined;
  const own = fields !== undefined && isRecord(fields[name]) ? fields[name] : undefined;
  // Friendly names for a setting's choices ("Subs & members" rather than "subs"), when the extension gives them.
  const labels = isRecord(own?.['labels']) ? Object.fromEntries(Object.entries(own['labels']).filter((entry): entry is [string, string] => typeof entry[1] === 'string').slice(0, 60).map(([key, value]) => [key.slice(0, 80), value.slice(0, 80)])) : undefined;
  const withLabels = labels !== undefined && Object.keys(labels).length > 0 ? { labels } : {};
  const field = own?.['control'] === 'row-list' ? own : fallback;
  if (field?.['control'] !== 'row-list' || !Array.isArray(field['columns']) || field['columns'].length === 0) return withLabels;
  const text = (value: unknown, maximum: number): string => (typeof value === 'string' ? value.slice(0, maximum) : '');
  const number = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  const columns = field['columns'].slice(0, 8).filter(isRecord).map((column) => {
    const options = column['type'] === 'select' && Array.isArray(column['options'])
      ? column['options'].slice(0, 20).filter(isRecord).map((option) => ({ value: text(option['value'], 120), label: text(option['label'] ?? option['value'], 120) }))
      : [];
    const min = number(column['min']); const max = number(column['max']);
    return {
      label: text(column['label'], 60), hint: text(column['hint'], 80), placeholder: text(column['placeholder'], 80),
      type: options.length > 0 ? 'select' : column['type'] === 'number' ? 'number' : 'text',
      maxLength: Number.isInteger(column['maxLength']) ? column['maxLength'] : 120,
      ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }),
      ...(options.length > 0 ? { options } : {}), required: column['required'] === true,
    };
  });
  const legacy = Array.isArray(field['legacyColumnOrder']) && field['legacyColumnOrder'].every((position) => Number.isInteger(position) && (position as number) >= 0 && (position as number) < columns.length)
    ? { legacyColumnOrder: field['legacyColumnOrder'].slice(0, 8) as number[] } : {};
  return columns.length === 0 ? withLabels : { ...withLabels, layout: { itemLabel: text(field['itemLabel'], 40) || 'item', columns, ...legacy } };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The built-in extension group a tab belongs to, so the Control Panel can list a long set of extensions under short headings. */
function controlPanelGroup(moduleId: string): string {
  const family = MAIN_FEATURE_FAMILIES.find((entry) => entry.modules.includes(moduleId)) ?? MAIN_FEATURE_FAMILIES.find((entry) => entry.relatedModules.includes(moduleId));
  return family?.name ?? 'More extensions';
}
