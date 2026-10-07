import { describe, expect, it } from 'vitest';
import { CoalescedTask } from '../../bridge/core/coalesced-task.js';

describe('CoalescedTask', () => {
  it('collapses requests made during a run into one follow-up run that sees the latest state', async () => {
    let value = 0; const written: number[] = []; let active = 0; let maximumActive = 0;
    const task = new CoalescedTask(async () => { active += 1; maximumActive = Math.max(maximumActive, active); const snapshot = value; await new Promise((resolve) => setTimeout(resolve, 5)); written.push(snapshot); active -= 1; });
    const requests: Promise<void>[] = [];
    for (let index = 1; index <= 10; index += 1) { value = index; requests.push(task.request()); }
    await Promise.all(requests);
    expect(maximumActive).toBe(1);
    expect(written.length).toBeLessThanOrEqual(2);
    expect(written.at(-1)).toBe(10);
  });

  it('always waits for a run that started after the request and reports failures to its waiters', async () => {
    let fail = true; let runs = 0;
    const task = new CoalescedTask(async () => { runs += 1; await Promise.resolve(); if (fail) throw new Error('disk full'); });
    await expect(task.request()).rejects.toThrow('disk full');
    fail = false;
    await expect(task.request()).resolves.toBeUndefined();
    expect(runs).toBe(2);
    await task.idle();
  });
});
