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
    expect(bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('optional-chain', 'display', 'a?a?a?aaaa'), match: { kind: 'regex', value: 'a?a?a?aaaa', caseSensitive: false } }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, filters: { enabled: true, rules: [{ ...rule('safe', 'display', '^hello\\s+world$'), match: { kind: 'regex', value: '^hello\\s+world$', caseSensitive: false } }] } }).success).toBe(true);
  });

  it('can block a specific platform user id', async () => {
    const event = await fixture();
    const blocked = new EventFilterEngine({
      enabled: true,
      rules: [{ ...rule('user-id', 'display', 'viewer-uuid-123', 'user.id'), target: 'user.id' as const }],
    });
    const allowed = new EventFilterEngine({
      enabled: true,
      rules: [{ ...rule('user-id', 'display', 'other-id', 'user.id'), target: 'user.id' as const }],
    });
    const blockedUserEvent: typeof event = {
      ...event,
      user: {
        ...event.user,
        name: event.user?.name ?? 'viewer',
        actorType: event.user?.actorType ?? 'human',
        roles: event.user?.roles ?? [],
        id: 'viewer-uuid-123',
      },
    };
    expect(blocked.evaluate(blockedUserEvent).displayBlocked).toBe(true);
    const allowedUserEvent: typeof event = {
      ...event,
      user: {
        ...event.user,
        name: event.user?.name ?? 'viewer',
        actorType: event.user?.actorType ?? 'human',
        roles: event.user?.roles ?? [],
        id: 'viewer-uuid-124',
      },
    };
    expect(allowed.evaluate(allowedUserEvent).displayBlocked).toBe(false);
  });
});

function rule(id: string, scope: 'display' | 'command' | 'module', value: string, target: 'message' | 'user.name' | 'user.displayName' | 'user.id' = 'message') {
  return {
    id,
    name: id,
    enabled: true,
    scope,
    moduleIds: [] as string[],
    platforms: [] as string[],
    actorTypes: [] as Array<'human' | 'bot' | 'system'>,
    target,
    match: { kind: 'contains' as const, value, caseSensitive: false },
  };
}
