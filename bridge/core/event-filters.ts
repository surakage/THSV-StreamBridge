import type { FilterRule, FiltersConfig } from '../../schemas/config.js';
import type { NormalizedEvent } from '../../schemas/event.js';

export interface FilterDecision {
  readonly displayBlocked: boolean;
  readonly commandBlocked: boolean;
  readonly blockedModuleIds: ReadonlySet<string>;
  readonly matchedRuleIds: readonly string[];
}

const EMPTY_DECISION: FilterDecision = {
  displayBlocked: false,
  commandBlocked: false,
  blockedModuleIds: new Set<string>(),
  matchedRuleIds: [],
};

export class EventFilterEngine {
  public constructor(private readonly config: FiltersConfig) {}

  public evaluate(event: NormalizedEvent): FilterDecision {
    if (!this.config.enabled || !isChatEvent(event)) return EMPTY_DECISION;
    let displayBlocked = false;
    let commandBlocked = false;
    const blockedModuleIds = new Set<string>();
    const matchedRuleIds: string[] = [];
    for (const rule of this.config.rules) {
      if (!rule.enabled || !applies(rule, event) || !matches(rule, event)) continue;
      matchedRuleIds.push(rule.id);
      if (rule.scope === 'display') displayBlocked = true;
      else if (rule.scope === 'command') commandBlocked = true;
      else for (const moduleId of rule.moduleIds) blockedModuleIds.add(moduleId);
    }
    return { displayBlocked, commandBlocked, blockedModuleIds, matchedRuleIds };
  }
}

function isChatEvent(event: NormalizedEvent): boolean {
  return ['chat.message', 'chat.private-message', 'chat.system-message'].includes(event.eventType);
}

function applies(rule: FilterRule, event: NormalizedEvent): boolean {
  if (rule.platforms.length > 0 && !rule.platforms.includes(event.platform)) return false;
  if (rule.actorTypes.length > 0 && (event.user === undefined || !rule.actorTypes.includes(event.user.actorType))) return false;
  return true;
}

function matches(rule: FilterRule, event: NormalizedEvent): boolean {
  const raw = targetValue(rule, event);
  if (raw === undefined) return false;
  const userTarget = rule.target === 'user.id';
  const value = userTarget || rule.match.caseSensitive ? raw : raw.toLocaleLowerCase('en-US');
  const expected = rule.match.caseSensitive ? rule.match.value : rule.match.value.toLocaleLowerCase('en-US');
  if (rule.match.kind === 'contains') return value.includes(expected);
  if (rule.match.kind === 'exact') return value === expected;
  // Regex patterns are schema-validated to a deliberately restricted subset and
  // inputs are already bounded by the normalized event schema.
  return new RegExp(rule.match.value, rule.match.caseSensitive ? 'u' : 'iu').test(raw);
}

function targetValue(rule: FilterRule, event: NormalizedEvent): string | undefined {
  if (rule.target === 'message') return typeof event.payload['message'] === 'string' ? event.payload['message'] : undefined;
  if (rule.target === 'user.name') return event.user?.name;
  if (rule.target === 'user.id') return event.user?.id;
  return event.user?.displayName;
}
