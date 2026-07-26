import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { applyElapsed, configuredDurationSeconds, formatRemaining, sanitizeState } from '../../addons/starting-soon-countdown/dist/index.js';

describe('Stream Launch Countdown add-on', () => {
  it('builds a bounded duration and formats short or long countdowns', () => {
    expect(configuredDurationSeconds({ durationHours: 1, durationMinutes: 2, durationSeconds: 3 })).toBe(3_723);
    expect(configuredDurationSeconds({ durationHours: 0, durationMinutes: 0, durationSeconds: 0 })).toBe(1);
    expect(formatRemaining(90)).toBe('01:30');
    expect(formatRemaining(3_723)).toBe('01:02:03');
  });

  it('completes once, stops at zero, and increments the tone sequence', () => {
    const state = sanitizeState({ initialized: true, remainingSeconds: 3, maximumSeconds: 10, running: true, visible: true, updatedAt: 1_000, completionSequence: 4 }, 10);
    const result = applyElapsed(state, 5_000);
    expect(result.completedNow).toBe(true);
    expect(result.state).toMatchObject({ remainingSeconds: 0, running: false, visible: true, completed: true, completionSequence: 5, lastReason: 'completed' });
    expect(applyElapsed(result.state, 10_000).completedNow).toBe(false);
  });
});
