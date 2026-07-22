import { describe, expect, it } from 'vitest';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { EventFilterEngine } from '../../bridge/core/event-filters.js';
import { fixture, testConfig } from '../helpers.js';

describe('Stage 4 event blockers', () => {
  it('keeps display, command, and module scopes independent', async () => {
    const event = await fixture();
    const config = await testConfig();
    const rules = [
      rule('hide-fixture', 'display', 'fixture'),
      rule('stop-command', 'command', '!secret'),
      { ...rule('skip-chat-module', 'module', 'simulated'), moduleIds: ['core.chat'] },
    ];
    const engine = new EventFilterEngine({ enabled: true, rules });
    const display = engine.evaluate(event);
    expect(display).toMatchObject({ displayBlocked: true, commandBlocked: false });
    expect(display.matchedRuleIds).toEqual(['hide-fixture', 'skip-chat-module']);
    const moduleDecision = engine.evaluate({ ...event, payload: { message: 'simulated' } });
    expect([...moduleDecision.blockedModuleIds]).toEqual(['core.chat']);
    const commandDecision = engine.evaluate({ ...event, payload: { message: '!secret now' } });
    expect(commandDecision).toMatchObject({ displayBlocked: false, commandBlocked: true });
    expect(config.filters.rules).toEqual([]);
  });

  it('rejects dangerous regex before a rule can be enabled', async () => {
    const config = await testConfig();
    expect(bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('dangerous', 'display', '(a+)+$'), match: { kind: 'regex', value: '(a+)+$', caseSensitive: false } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('ambiguous', 'display', '(a|aa)+$'), match: { kind: 'regex', value: '(a|aa)+$', caseSensitive: false } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('nested-ambiguous', 'display', '^((a|aa))+$'), match: { kind: 'regex', value: '^((a|aa))+$', caseSensitive: false } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('optional-repeat', 'display', '(a?){20}b'), match: { kind: 'regex', value: '(a?){20}b', caseSensitive: false } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('safe', 'display', '^hello\\s+world$'), match: { kind: 'regex', value: '^hello\\s+world$', caseSensitive: false } }] } }).success).toBe(true);
  });

  it('rejects an ungrouped chain of adjacent quantifiers with exponential worst-case cost', async () => {
    const config = await testConfig();
    // No nesting, no alternation, no backreference: none of the shape-based checks above
    // catch this, but a long chain of adjacent optional quantifiers over the same
    // character is a well-known catastrophic-backtracking pattern on a non-matching input.
    const chain = `${'a?'.repeat(25)}${'a'.repeat(25)}`;
    const result = bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('chain', 'display', chain), match: { kind: 'regex', value: chain, caseSensitive: false } }] } });
    expect(result.success).toBe(false);
  });

  it('still accepts short, practically useful regex patterns after the quantifier bound', async () => {
    const config = await testConfig();
    for (const pattern of ['colou?r', 'https?://\\S+', '\\d{3,5}', '(?:free|win)\\s*(?:money|prize)']) {
      const result = bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('practical', 'display', pattern), match: { kind: 'regex', value: pattern, caseSensitive: false } }] } });
      expect(result.success, `expected ${pattern} to be accepted`).toBe(true);
    }
  });

  it('matches on a stable platform user ID so a rename cannot evade a rule', async () => {
    const event = await fixture();
    if (event.user === undefined) throw new Error('Fixture must contain a user');
    const user = event.user;
    const targeted = { ...event, user: { ...user, id: 'stable-id-123', name: 'OldName' } };
    const renamed = { ...event, user: { ...user, id: 'stable-id-123', name: 'NewName' } };
    const engine = new EventFilterEngine({ enabled: true, rules: [{ ...rule('by-id', 'display', 'stable-id-123'), target: 'user.id', match: { kind: 'exact', value: 'stable-id-123', caseSensitive: false } }] });
    expect(engine.evaluate(targeted).displayBlocked).toBe(true);
    expect(engine.evaluate(renamed).displayBlocked).toBe(true);
  });

  it('stops matching once a rule has expired', async () => {
    const event = await fixture();
    const engine = new EventFilterEngine({ enabled: true, rules: [{ ...rule('temporary', 'display', 'fixture'), expiresAt: '2026-01-01T00:00:10.000Z' }] });
    expect(engine.evaluate(event, Date.parse('2026-01-01T00:00:00.000Z')).displayBlocked).toBe(true);
    expect(engine.evaluate(event, Date.parse('2026-01-01T00:00:10.000Z')).displayBlocked).toBe(false);
    expect(engine.evaluate(event, Date.parse('2026-01-01T00:00:20.000Z')).displayBlocked).toBe(false);
  });
});

function rule(id: string, scope: 'display' | 'command' | 'module', value: string) {
  return { id, name: id, enabled: true, scope, moduleIds: [] as string[], platforms: [] as string[], actorTypes: [] as Array<'human' | 'bot' | 'system'>, target: 'message' as const, match: { kind: 'contains' as const, value, caseSensitive: false } };
}
