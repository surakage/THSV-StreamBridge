import type { NormalizedEvent } from '../../schemas/event.js';

/**
 * Chat bots that are never real viewers. Matching ignores case, spaces and punctuation,
 * so "Sery_Bot", "sery bot" and "@SeryBot" are the same account.
 */
export const KNOWN_CHAT_BOTS: readonly string[] = Object.freeze([
  'nightbot', 'streamelements', 'fossabot', 'moobot', 'serybot', 'soundalerts', 'wizebot', 'kofistreambot', 'botrix',
  'streamlabs', 'streamerbot', 'tikfinity', 'botisimo', 'coebot', 'deepbot', 'phantombot', 'stayhydratedbot', 'pretzelrocks', 'commanderroot',
]);

export function senderNameKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
}

/** True for a known chat bot, a name on the creator's ignore list, or a name that ends in "bot" after a separator (sery_bot, my-bot). */
export function isAutomatedSenderName(name: string | undefined, ignoredNames: readonly string[] = []): boolean {
  const raw = (name ?? '').trim().toLowerCase();
  const key = senderNameKey(raw);
  if (key === '') return false;
  if (KNOWN_CHAT_BOTS.includes(key)) return true;
  if (ignoredNames.some((ignored) => senderNameKey(ignored) === key)) return true;
  return /(^|[\s_.-])bot$/u.test(raw);
}

/**
 * Marks a human-labelled sender as a bot when its name says it is one, so every feature that already
 * skips bots (Chat First, greetings, points, polls, draws, commands without allowBots) also skips it.
 * The broadcaster is never relabelled, so the creator's own commands keep working.
 */
export function markAutomatedSender(event: NormalizedEvent, ignoredNames: readonly string[] = []): NormalizedEvent {
  const user = event.user;
  if (user === undefined || user.actorType !== 'human') return event;
  if (user.roles.some((role) => role.toLowerCase() === 'broadcaster')) return event;
  if (!isAutomatedSenderName(user.name, ignoredNames) && !isAutomatedSenderName(user.displayName, ignoredNames)) return event;
  return { ...event, user: { ...user, actorType: 'bot' } };
}
