import type { NormalizedEvent } from '../../schemas/event.js';

export type FacebookMetric = 'followers' | 'page-likes';
export type FacebookHighWater = Partial<Record<FacebookMetric, number>>;

export function advanceFacebookMilestone(highWater: number | undefined, count: number, step: number, baseline: boolean): { highWater: number; milestone?: number } {
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(step) || step < 1 || step > 10000) throw new Error('Invalid Facebook milestone count or interval.');
  const next = Math.max(highWater ?? 0, count);
  if (baseline || highWater === undefined || Math.floor(count / step) <= Math.floor(highWater / step)) return { highWater: next };
  // Collapse a burst into one accurate aggregate milestone; do not invent individual followers.
  return { highWater: next, milestone: Math.floor(count / step) * step };
}

export function facebookMilestoneEvent(pageId: string, pageName: string, metric: FacebookMetric, value: number): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId: `facebook-milestone-${pageId}-${metric}-${String(value)}`,
    eventType: 'engagement.milestone', platform: 'facebook',
    source: { adapter: 'facebook-page', eventId: `${pageId}-${metric}-${String(value)}`, eventName: 'Facebook.PageMilestone' },
    receivedAt: new Date().toISOString(), channel: { id: pageId, name: pageName },
    payload: { metric, value, message: `${pageName} reached ${String(value)} Facebook ${metric === 'followers' ? 'followers' : 'Page likes'}!`, aggregate: true },
    metadata: { simulated: false, unverifiedFields: [] },
  };
}
