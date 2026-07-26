import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

type Award = {
  readonly seconds: number;
  readonly reason: string;
  readonly counterKey?: string;
  readonly counterValue?: number;
  readonly thresholdKey?: string;
  readonly thresholdBuckets?: number;
};

type AddonModule = {
  readonly awardForEvent: (event: Record<string, unknown>, settings: Record<string, unknown>, state: Record<string, unknown>) => Award;
  readonly sanitizeState: (value: unknown) => Record<string, unknown>;
};

let addon: AddonModule;

const settings = {
  enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok', 'streamlabs', 'kofi'],
  allowSimulatedEvents: false,
  followSeconds: 30,
  subscriptionSeconds: 300,
  membershipSeconds: 300,
  giftSubscriptionSecondsEach: 180,
  giftSecondsEach: 15,
  cheerBitsThreshold: 100,
  cheerThresholdAwardSeconds: 30,
  financialCurrency: 'USD',
  requireVerifiedFinancialEvents: true,
  donationSecondsPerWholeUnit: 60,
  purchaseSecondsPerWholeUnit: 30,
  raidBaseSeconds: 300,
  raidPerViewerSeconds: 5,
  minimumRaidViewers: 1,
  likeThreshold: 100,
  likeThresholdAwardSeconds: 45,
  hypeTrainLevelSeconds: 60,
  watchStreakSeconds: 90,
  modiversarySecondsPerMonth: 10,
};

function event(eventType: string, platform: string, payload: Record<string, unknown>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventType,
    platform,
    payload,
    metadata: { simulated: false, unverifiedFields: [] },
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { thresholds: [], counters: [], ...overrides };
}

beforeAll(async () => {
  addon = await import(pathToFileURL(resolve('packages/addons/subathon-timer/dist/index.js')).href) as AddonModule;
});

describe('Subathon Timer 1.2 event awards', () => {
  it('ships its executable runtime with matching package integrity metadata', async () => {
    const packageRoot = resolve('packages/addons/subathon-timer');
    const packageDocument = JSON.parse(await readFile(resolve(packageRoot, 'module-package.json'), 'utf8')) as {
      readonly manifest: { readonly version: string };
      readonly entrypoint: string;
      readonly files: readonly { readonly path: string; readonly size: number; readonly sha256: string }[];
    };
    expect(packageDocument.manifest.version).toBe('1.2.0');
    expect(packageDocument.entrypoint).toBe('dist/index.js');
    for (const entry of packageDocument.files) {
      const filePath = resolve(packageRoot, entry.path);
      const bytes = await readFile(filePath);
      expect((await stat(filePath)).size, entry.path).toBe(entry.size);
      expect(createHash('sha256').update(bytes).digest('hex'), entry.path).toBe(entry.sha256);
    }
  });

  it('uses the existing gift-unit rule for YouTube Jewels', () => {
    expect(addon.awardForEvent(event('engagement.gift', 'youtube', { itemName: 'Jewel', quantity: 42 }), settings, state()))
      .toMatchObject({ seconds: 630, reason: 'gift' });
  });

  it('accumulates Bits and awards only newly completed thresholds', () => {
    const first = addon.awardForEvent(event('engagement.cheer', 'twitch', { quantity: 60 }), settings, state());
    expect(first).toMatchObject({ seconds: 0, counterValue: 60 });
    const second = addon.awardForEvent(event('engagement.cheer', 'twitch', { quantity: 50 }), settings, state({ counters: [{ key: first.counterKey, value: first.counterValue }] }));
    expect(second).toMatchObject({ seconds: 30, reason: 'cheer-threshold', counterValue: 110 });
  });

  it('requires verified same-currency financial events', () => {
    const unverified = event('engagement.donation', 'streamlabs', { amount: '5.00', currency: 'USD' }, { metadata: { simulated: false, unverifiedFields: ['source.eventId'] } });
    expect(addon.awardForEvent(unverified, settings, state()).seconds).toBe(0);
    expect(addon.awardForEvent(event('engagement.donation', 'kofi', { amount: '5.00', currency: 'USD' }), settings, state()))
      .toMatchObject({ seconds: 300, reason: 'donation' });
    expect(addon.awardForEvent(event('engagement.purchase', 'kofi', { amount: '5.99', currency: 'EUR' }), settings, state()).seconds).toBe(0);
    expect(addon.awardForEvent(event('engagement.purchase', 'kofi', { amount: '5.99', currency: 'USD' }), settings, state()))
      .toMatchObject({ seconds: 150, reason: 'purchase' });
  });

  it('counts each Hype Train level once and handles milestone-specific settings', () => {
    const hype = event('engagement.milestone', 'twitch', { metric: 'hype-train', value: 2, hypeTrainId: 'train-1' });
    const first = addon.awardForEvent(hype, settings, state());
    expect(first).toMatchObject({ seconds: 120, reason: 'hype-train-level', thresholdBuckets: 2 });
    expect(addon.awardForEvent(hype, settings, state({ thresholds: [{ key: first.thresholdKey, buckets: first.thresholdBuckets }] })).seconds).toBe(0);
    expect(addon.awardForEvent(event('engagement.milestone', 'twitch', { metric: 'watch-streak', value: 42 }), settings, state()).seconds).toBe(90);
    expect(addon.awardForEvent(event('engagement.milestone', 'twitch', { metric: 'modiversary', value: 12 }), settings, state()).seconds).toBe(120);
  });

  it('suppresses simulated events unless explicitly enabled', () => {
    const simulated = event('channel.subscription', 'twitch', {}, { metadata: { simulated: true, unverifiedFields: [] } });
    expect(addon.awardForEvent(simulated, settings, state()).seconds).toBe(0);
    expect(addon.awardForEvent(simulated, { ...settings, allowSimulatedEvents: true }, state()).seconds).toBe(300);
  });

  it('bounds persisted counters and strips unrelated data', () => {
    const counters = Array.from({ length: 60 }, (_, index) => ({ key: `counter-${String(index)}`, value: index }));
    const sanitized = addon.sanitizeState({ counters, thresholds: [], viewerName: 'should-not-persist' });
    expect(sanitized['counters']).toHaveLength(40);
    expect(sanitized).not.toHaveProperty('viewerName');
  });
});
