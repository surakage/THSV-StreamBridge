import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import scoreboard from '../../addons/scoreboard/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import goalBars from '../../addons/goal-bars/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villageDraw from '../../addons/village-draw/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villagePolls from '../../addons/village-polls/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import customCounter from '../../addons/custom-counter/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import subathonTimer from '../../addons/subathon-timer/dist/index.js';

// One small stand-in for StreamBridge's add-on context, shared by every Control Panel tab test.
function context(settings: Record<string, unknown>) {
  let saved: unknown;
  return {
    settings: { enabled: true, ...settings },
    state: { read: vi.fn(async () => saved), write: vi.fn(async (value: unknown) => { saved = JSON.parse(JSON.stringify(value)); }) },
    overlay: { publish: vi.fn(async () => undefined), onLifecycle: vi.fn(() => () => undefined) },
    chat: { send: vi.fn(async () => []) },
    schedule: { after: vi.fn(() => 'task'), cancel: vi.fn(() => true) },
    viewerFoundation: { getProjection: vi.fn(async () => undefined), mutate: vi.fn(async () => ({})), onDeleted: vi.fn(() => () => undefined) },
    saved: () => saved as Record<string, unknown>,
  };
}
const action = (name: string, values?: Record<string, unknown>) => ({ operation: 'action', action: name, ...(values ? { values } : {}) });

describe('Control Panel tabs', () => {
  it('Scoreboard: shows each row with its record, corrects a row and resets the stream', async () => {
    const runtime = context({ rows: ['follows', 'tips'] });
    await scoreboard.start(runtime);
    const status = await scoreboard.controlPanel({ operation: 'status' }, runtime);
    expect(status.lists[0].items.map((item: { title: string }) => item.title)).toEqual(['Follows: 0', 'Tips & Super Chats: 0']);
    const added = await scoreboard.controlPanel(action('add', { stat: 'follows', amount: 1 }), runtime);
    expect(added.message).toBe('Follows is now 1.');
    expect(added.lists[0].items[0].title).toBe('Follows: 1');
    await scoreboard.controlPanel(action('add', { stat: 'follows', amount: -5 }), runtime);
    expect((await scoreboard.controlPanel({ operation: 'status' }, runtime)).lists[0].items[0].title).toBe('Follows: 0');
    await expect(scoreboard.controlPanel(action('add', { stat: 'nope', amount: 1 }), runtime)).rejects.toThrow('Pick a row');
    expect((await scoreboard.controlPanel(action('reset'), runtime)).message).toBe('Scoreboard reset for this stream.');
    runtime.overlay.publish.mockClear();
    expect(await scoreboard.controlPanel({ operation: 'settings-changed' }, runtime)).toEqual({});
    expect(runtime.overlay.publish).toHaveBeenCalled();
    await scoreboard.stop();
  });

  it('Goal Bars: adds or removes progress by hand and resets a goal', async () => {
    const runtime = context({ goal1Enabled: true, goal1Label: 'Subs', goal1Sources: ['twitch-subs'], goal1Target: 10, goal2Enabled: false });
    await goalBars.start(runtime);
    const added = await goalBars.controlPanel(action('add', { goal: 1, amount: 3 }), runtime);
    expect(added.message).toBe('Goal 1 is now 3 / 10.');
    expect(added.lists[0].items[0].title).toBe('Goal 1 · Subs: 3 / 10');
    await expect(goalBars.controlPanel(action('add', { goal: 2, amount: 1 }), runtime)).rejects.toThrow('That goal is off');
    const reset = await goalBars.controlPanel(action('reset', { goal: 1 }), runtime);
    expect(reset.lists[0].items[0].title).toBe('Goal 1 · Subs: 0 / 10');
    await goalBars.stop();
  });

  it('Village Draw: walks a giveaway through its stages with the right buttons', async () => {
    const runtime = context({ giveawayName: 'Village giveaway', prizeItem: 'Sloth plush', entryMode: 'free-single' });
    await villageDraw.start(runtime);
    const empty = await villageDraw.controlPanel({ operation: 'status' }, runtime);
    expect(empty.actions.map((entry: { action: string }) => entry.action)).toEqual(['open']);
    const open = await villageDraw.controlPanel(action('open'), runtime);
    expect(open.summary[0]).toEqual({ label: 'Stage', value: 'Open for entries' });
    expect(open.actions.map((entry: { action: string }) => entry.action)).toEqual(['close', 'pause', 'cancel']);
    const closed = await villageDraw.controlPanel(action('close'), runtime);
    expect(closed.actions.map((entry: { action: string }) => entry.action)).toEqual(['draw', 'cancel']);
    await expect(villageDraw.controlPanel(action('draw'), runtime)).rejects.toThrow('No eligible giveaway entries');
    const canceled = await villageDraw.controlPanel(action('cancel'), runtime);
    expect(['Canceled', 'Canceling and refunding']).toContain(canceled.summary[0].value);
    await expect(villageDraw.controlPanel(action('wipe-everything'), runtime)).rejects.toThrow('Unknown');
    await villageDraw.stop(runtime);
  });

  it('Custom Counter and Subathon Timer: show live readouts next to their buttons', async () => {
    const counter = context({ defaultCounterId: 'deaths', defaultCounterName: 'Deaths', initialValue: 4 });
    await customCounter.start(counter);
    expect(await customCounter.controlPanel({ operation: 'status' }, counter)).toMatchObject({ summary: [{ label: 'Deaths', value: '4' }] });
    const timer = context({ startingMinutes: 60, maximumMinutes: 600 });
    await subathonTimer.start(timer);
    expect((await subathonTimer.controlPanel({ operation: 'status' }, timer)).summary.slice(0, 2)).toEqual([{ label: 'Time left', value: '01:00:00' }, { label: 'Status', value: 'Paused' }]);
    await subathonTimer.stop(timer);
  });

  it('Village Polls: starts a typed poll, refuses a bad one, and closes it with results', async () => {
    const runtime = context({});
    await villagePolls.start(runtime);
    await expect(villagePolls.controlPanel(action('open', { question: 'Next game?', choices: 'Only one' }), runtime)).rejects.toThrow('at least two choices');
    await expect(villagePolls.controlPanel(action('open', { question: 'Next game?', choices: 'Minecraft | Stardew | minecraft' }), runtime)).rejects.toThrow('must be different');
    const open = await villagePolls.controlPanel(action('open', { question: 'Next game?', choices: 'Minecraft | Stardew' }), runtime);
    expect(open.message).toBe('Poll is open.');
    expect(open.summary.slice(0, 2)).toEqual([{ label: 'Poll', value: 'Next game? (open)' }, { label: 'Votes', value: '0' }]);
    expect(open.lists[0].items.map((item: { title: string }) => item.title)).toEqual(['1) Minecraft', '2) Stardew']);
    expect(runtime.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Next game? 1) Minecraft 2) Stardew') }));
    const closed = await villagePolls.controlPanel(action('close'), runtime);
    expect(closed.summary[0].value).toBe('Next game? (closed)');
    const cleared = await villagePolls.controlPanel(action('reset'), runtime);
    expect(cleared.summary[0].value).toBe('No poll yet');
    await villagePolls.stop(runtime);
  });
});
