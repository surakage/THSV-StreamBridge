import { expect, test } from './fixtures.js';

// Runs inside the page: every visible control needs an accessible name, images need alt text,
// ids stay unique, and leaf text meets WCAG AA contrast against its nearest opaque background.
const audit = (): string[] => {
  const findings: string[] = [];
  const visible = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  const describe = (element: Element): string => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} "${(element.getAttribute('name') ?? element.textContent).trim().slice(0, 40)}"`;
  const hasName = (element: Element): boolean => {
    if (element.getAttribute('aria-label')?.trim() || element.getAttribute('title')?.trim()) return true;
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy?.split(' ').some((id) => document.getElementById(id)?.textContent.trim())) return true;
    const labels = (element as HTMLInputElement).labels;
    if (labels && Array.from(labels).some((label) => label.textContent.trim())) return true;
    if (['BUTTON', 'A', 'SUMMARY'].includes(element.tagName) && element.textContent.trim()) return true;
    return element instanceof HTMLInputElement && ['button', 'submit'].includes(element.type) && Boolean(element.value);
  };
  for (const element of document.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href],[role=button],[role=switch],[role=tab]')) {
    if (visible(element) && !hasName(element)) findings.push(`unnamed control ${describe(element)}`);
  }
  for (const image of document.querySelectorAll('img')) if (visible(image) && !image.hasAttribute('alt')) findings.push(`image without alt ${describe(image)}`);
  const ids = new Map<string, number>();
  for (const element of document.querySelectorAll('[id]')) ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
  for (const [id, count] of ids) if (count > 1) findings.push(`duplicate id #${id} (${String(count)})`);
  const luminance = (color: string): number | undefined => {
    const parts = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
    if (parts?.length !== 3) return undefined;
    const scale = color.startsWith('color(') ? 1 : 255;
    const [red = 0, green = 0, blue = 0] = parts.map((value) => {
      const channel = value / scale;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  // Gradients and images can't be measured here, so text over them is skipped.
  const background = (start: Element): string | undefined => {
    for (let element: Element | null = start; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.backgroundImage !== 'none') return undefined;
      const parts = style.backgroundColor.match(/[\d.]+/gu);
      if (parts && (parts.length < 4 || Number(parts[3]) > 0.5)) return style.backgroundColor;
    }
    return 'rgb(255,255,255)';
  };
  for (const element of document.querySelectorAll('body *')) {
    if (element.children.length || !element.textContent.trim() || !visible(element) || element.closest('[aria-hidden="true"]')) continue;
    const style = getComputedStyle(element);
    const behind = background(element);
    const text = luminance(style.color);
    const back = behind === undefined ? undefined : luminance(behind);
    if (text === undefined || back === undefined) continue;
    const ratio = (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.6 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) findings.push(`contrast ${ratio.toFixed(2)} (${style.color} on ${behind ?? ''}) ${describe(element)}`);
  }
  return findings;
};

for (const theme of ['light', 'dark']) {
  test(`every Wizard page has named controls and readable contrast in the ${theme} theme`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript((value) => localStorage.setItem('thsv.streambridge.wizard.theme.v1', value), theme);
    await page.goto('/wizard/');
    // Text fades in on load; measuring mid-fade reads a half-transparent colour, so wait for it to end.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).map((animation) => animation.finished.catch(() => undefined))));
    const findings = (await page.evaluate(audit)).map((item) => `locked: ${item}`);
    await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('#mode')).toContainText('Authenticated');
    const views = await page.locator('.workspace > nav .nav[data-view]:visible').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-view') ?? ''));
    for (const view of views) {
      await page.locator(`.workspace > nav [data-view="${view}"]`).click();
      await page.waitForTimeout(500);
      findings.push(...(await page.evaluate(audit)).map((item) => `${view}: ${item}`));
    }
    expect(findings).toEqual([]);
  });
}

for (const theme of ['light', 'dark']) {
  test(`the update pop-up has named controls and readable contrast in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('thsv.streambridge.wizard.theme.v1', value), theme);
    await page.route('**/wizard/api/updates/check', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      currentVersion: '1.0.0', available: true, updateAvailable: true, latestVersion: '99.0.0', releaseNotes: 'Faster alerts and a calmer setup.',
      archive: { name: 'THSV-StreamBridge-99.0.0.zip', url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v99.0.0/THSV-StreamBridge-99.0.0.zip', size: 1 },
      checksum: { name: 'THSV-StreamBridge-99.0.0.zip.sha256', url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v99.0.0/THSV-StreamBridge-99.0.0.zip.sha256', size: 1 },
    }) }));
    await page.goto('/wizard/');
    await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('dialog', { name: 'Update available' })).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(audit)).toEqual([]);
  });
}
