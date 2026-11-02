import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const TOKEN = 'playwright-control-token-with-32-characters';
const tabs = [
  { moduleId: 'thsv.streamer-punishments', name: 'Streamer Punishments', enabled: true },
  { moduleId: 'thsv.prize-wheel', name: 'Prize Wheel', enabled: false, reason: 'Turn on Prize Wheel in Extensions to use it here.' },
  { moduleId: 'thsv.viewer-lobby', name: 'Viewer Lobby', enabled: true },
];

function punishmentsView(done: boolean, message?: string) {
  return {
    title: 'Streamer Punishments',
    status: done ? 'Nothing in progress · 0 waiting' : 'Now: 10 Pushups · 1 waiting',
    ...(message ? { message } : {}),
    sections: [
      { title: 'Now', items: done ? [] : [{ id: 'e1', label: '10 Pushups', detail: 'from Viewer One', actions: [{ operation: 'done', label: 'Done', tone: 'primary', args: { at: 'active', id: 'e1' } }, { operation: 'skip', label: 'Skip', args: { at: 'active', id: 'e1' }, confirm: 'Skip 10 Pushups?' }] }] },
      { title: 'This month', fields: [{ label: 'Pushups', value: done ? '10' : '0' }] },
      { title: 'Exercises', items: [{ id: 'pushups', label: 'Pushups', detail: '10 reps · 250 points' }], form: { operation: 'add-exercise', submitLabel: 'Add exercise', inputs: [{ name: 'name', label: 'Exercise', type: 'text' }, { name: 'reps', label: 'Reps', type: 'number', value: 10 }] } },
    ],
  };
}

async function mockDeck(page: Page, runs: Array<Record<string, unknown>>) {
  let done = false;
  await page.route('**/wizard/api/control-deck/tabs', (route) => route.fulfill({ json: { tabs } }));
  await page.route('**/wizard/api/control-deck/run', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    runs.push(body);
    if (body['moduleId'] === 'thsv.viewer-lobby') return route.fulfill({ json: { moduleId: 'thsv.viewer-lobby', view: { title: 'Viewer Lobby', status: 'Closed · 0 waiting', sections: [{ title: 'Lobby', actions: [{ operation: 'open', label: 'Open lobby', tone: 'primary' }] }] } } });
    if (body['operation'] === 'done') { done = true; return route.fulfill({ json: { moduleId: body['moduleId'], view: punishmentsView(true, 'Marked 10 Pushups done.') } }); }
    if (body['operation'] === 'add-exercise') return route.fulfill({ status: 409, json: { error: 'Pushups is already set up.' } });
    return route.fulfill({ json: { moduleId: body['moduleId'], view: punishmentsView(done) } });
  });
}

async function unlock(page: Page, path = '/wizard/control-deck') {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto(path);
  await page.getByLabel('Wizard password').fill(TOKEN);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

test('Control Deck greys out tabs that are off and does not let them be chosen', async ({ page }) => {
  const runs: Array<Record<string, unknown>> = [];
  await mockDeck(page, runs);
  await unlock(page);
  const wheel = page.getByRole('tab', { name: 'Prize Wheel' });
  await expect(wheel).toHaveAttribute('aria-disabled', 'true');
  await expect(wheel).toHaveAttribute('title', 'Turn on Prize Wheel in Extensions to use it here.');
  await expect(page.getByRole('tab', { name: 'Streamer Punishments' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Streamer Punishments' })).toBeVisible();
  await wheel.click({ force: true });
  await expect(page.getByRole('tab', { name: 'Streamer Punishments' })).toHaveAttribute('aria-selected', 'true');
  expect(runs.some((run) => run['moduleId'] === 'thsv.prize-wheel')).toBe(false);
  await page.getByRole('tab', { name: 'Viewer Lobby' }).click();
  await expect(page.getByRole('button', { name: 'Open lobby' })).toBeVisible();
  expect(page.url()).toContain('tab=thsv.viewer-lobby');
  // No horizontal page scroll at pop-out size; only the tab strip scrolls.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Control Deck runs an action, re-renders from the returned view, and shows refusals', async ({ page }) => {
  const runs: Array<Record<string, unknown>> = [];
  await mockDeck(page, runs);
  await unlock(page, '/wizard/control-deck?tab=thsv.streamer-punishments');
  await expect(page.getByText('from Viewer One')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Marked 10 Pushups done.')).toBeVisible();
  await expect(page.getByText('Nothing in progress · 0 waiting')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);
  expect(runs).toContainEqual({ moduleId: 'thsv.streamer-punishments', operation: 'done', args: { at: 'active', id: 'e1' } });
  await page.getByLabel('Exercise').fill('Pushups');
  await page.getByLabel('Reps').fill('12');
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await expect(page.getByText('Pushups is already set up.')).toBeVisible();
  expect(runs).toContainEqual({ moduleId: 'thsv.streamer-punishments', operation: 'add-exercise', args: { name: 'Pushups', reps: 12 } });
});

test('Control Deck asks before an action with a confirm prompt and keeps polling the open tab', async ({ page }) => {
  const runs: Array<Record<string, unknown>> = [];
  await mockDeck(page, runs);
  await unlock(page);
  await expect(page.getByText('from Viewer One')).toBeVisible();
  page.once('dialog', (dialog) => { expect(dialog.message()).toBe('Skip 10 Pushups?'); void dialog.dismiss(); });
  await page.getByRole('button', { name: 'Skip' }).click();
  expect(runs.some((run) => run['operation'] === 'skip')).toBe(false);
  await expect.poll(() => runs.filter((run) => run['operation'] === 'view').length, { timeout: 6_000 }).toBeGreaterThan(1);
});

test('Control Deck on a Bridge with no extensions turned on greys every tab and says what to do', async ({ page }) => {
  await unlock(page);
  await expect(page.getByRole('tab')).toHaveCount(18);
  await expect(page.locator('[role="tab"][aria-disabled="true"]')).toHaveCount(18);
  await expect(page.getByText('No extension with Control Deck controls is turned on.')).toBeVisible();
});
