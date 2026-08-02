import { describe, expect, it } from 'vitest';
import { REWARD_BLUEPRINTS, REWARD_PLATFORM_POLICY } from '../../bridge/core/reward-blueprints.js';

describe('central reward blueprints', () => {
  it('keeps every framework reward complete, uniquely identified, and bounded', () => {
    expect(new Set(REWARD_BLUEPRINTS.map((item) => item.internalId)).size).toBe(REWARD_BLUEPRINTS.length);
    for (const reward of REWARD_BLUEPRINTS) {
      expect(reward.moduleId).toMatch(/^thsv\.[a-z0-9-]+$/u);
      expect(reward.internalId).toMatch(/^[a-z][a-z0-9{}-]*$/u);
      expect(reward.title.length).toBeGreaterThan(2);
      expect(reward.description.length).toBeGreaterThan(10);
      expect(reward.cost).toBeGreaterThan(0);
      expect(reward.color).toMatch(/^#[0-9A-F]{6}$/u);
      expect(reward.globalCooldownSeconds).toBeGreaterThanOrEqual(0);
      expect(reward.perUserCooldownSeconds).toBeGreaterThanOrEqual(0);
      expect(['exclusive', 'queueable', 'independent', 'background', 'high-priority']).toContain(reward.coordination);
    }
  });

  it('states native platform limitations without pretending Twitch and Kick are equivalent', () => {
    expect(REWARD_PLATFORM_POLICY.twitch.refund).toBe('supported-when-queued');
    expect(REWARD_PLATFORM_POLICY.kick.redemption).toBe('supported');
    expect(REWARD_PLATFORM_POLICY.kick.refund).toBe('unsupported');
    expect(REWARD_PLATFORM_POLICY.youtube.entry).toBe('viewer-foundation-command');
    expect(REWARD_PLATFORM_POLICY.tiktok.entry).toBe('viewer-foundation-command');
  });
});
