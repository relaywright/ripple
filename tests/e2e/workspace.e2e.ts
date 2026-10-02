import { test, expect } from '@playwright/test';
import type { Page, Download } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SCENARIO } from '../../src/simulation';

async function assertAccessible(page: Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    scan.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  ).toEqual([]);
}

async function ready(page: Page) {
  await expect(page.getByRole('button', { name: 'Export results', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
}

async function openControls(page: Page) {
  const toggle = page.getByRole('button', { name: 'Scenario & controls' });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false')
    await toggle.click();
}

async function importScenario(page: Page, scenario: unknown) {
  await page.getByLabel('Import scenario file', { exact: true }).setInputFiles({
    name: 'test-scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scenario)),
  });
}

async function downloadText(download: Download) {
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, 'utf8');
}

async function downloadOption(page: Page, name: RegExp) {
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name }).click();
  return downloadText(await download);
}

test('loads the worker experiment without external requests or page errors', async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1')
      external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const worker = page.waitForEvent('worker');
  await page.goto('/');
  await worker;
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Break the chain.Find a better plan.',
  );
  await expect(page.getByRole('region', { name: 'Simulation results' })).toBeVisible();
  await expect(page.locator('.policy-card')).toHaveCount(4);
  await expect(page.getByRole('img', { name: /Inventory simulation/ })).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('changes disruptions and recomputes bounded conditions', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await openControls(page);
  for (const [title, seed] of [
    ['One supplier stops', 29104],
    ['Demand takes off', 85427],
    ['A quiet quarter', 18361],
    ['The port goes quiet', 71429],
  ] as const) {
    await page.getByRole('button', { name: new RegExp(title) }).click();
    await ready(page);
    await expect(page.locator('.run-status')).toContainText(`seed ${seed}`);
    await expect(page.locator('.experiment-heading strong')).toHaveText(title);
    if (title === 'A quiet quarter')
      await expect(page.getByLabel('Disruption duration', { exact: true })).toBeDisabled();
    else await expect(page.getByLabel('Disruption duration', { exact: true })).toBeEnabled();
  }
  const before = await page.getByRole('region', { name: 'Simulation results' }).textContent();
  const duration = page.getByLabel('Disruption duration', { exact: true });
  await duration.focus();
  await duration.press('Home');
  await ready(page);
  await expect(duration).toHaveValue('1');
  await expect(page.getByRole('region', { name: 'Simulation results' })).not.toHaveText(before!);
  const severity = page.getByRole('slider', { name: 'Severity', exact: true });
  await severity.focus();
  await severity.press('Home');
  await ready(page);
  await expect(severity).toHaveValue('0');
  await expect(page.locator('.metrics')).toContainText('Not applicable');
});

test('compares policy outcomes and returns from the comparison to a selected strategy', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const baseline = await page.locator('.metrics').textContent();
  await page.getByRole('button', { name: /Build a buffer/ }).click();
  await expect(page.getByRole('button', { name: /Build a buffer/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.metrics')).not.toHaveText(baseline!);
  await page.getByRole('button', { name: 'Compare strategies', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
  await expect(page.locator('.cost-bar')).toHaveCount(4);
  await page.getByRole('button', { name: 'Diversify supply', exact: true }).click();
  await expect(page.locator('.policy-card.selected')).toContainText('Diversify supply');
  await expect(page.getByLabel('Simulation day', { exact: true })).toBeVisible();
});

test('supports keyboard replay and map inspection', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const day = page.getByLabel('Simulation day', { exact: true });
  await day.focus();
  await day.press('Home');
  await expect(day).toHaveValue('0');
  await expect(page.locator('.day-inspector')).toContainText('Replay · day 1');
  await day.press('ArrowRight');
  await expect(day).toHaveValue('1');
  const shenzhen = page.getByRole('button', { name: /^Inspect Shenzhen,/ });
  await shenzhen.focus();
  await shenzhen.press('Enter');
  await expect(page.locator('.ripple-map__inspector h3')).toHaveText('Shenzhen');
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect(day).not.toHaveValue('1');
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  await expect(page.locator('.ripple-map')).toHaveAttribute('data-playing', 'false');
  expect(
    await page
      .locator('.ripple-map__canvas')
      .evaluate((element) => (element as SVGSVGElement).animationsPaused()),
  ).toBe(true);
  await page.getByRole('button', { name: 'Reset replay', exact: true }).click();
  await expect(day).toHaveValue('0');
});

test('round-trips scenario JSON and rejects bad imports without replacing the experiment', async ({
  page,
}) => {
  const scenario = {
    ...DEFAULT_SCENARIO,
    name: 'Montréal • stress test',
    seed: 13579,
    trials: 8,
    horizon: 30,
    startDay: 4,
    duration: 12,
  };
  await page.goto('/');
  await ready(page);
  await importScenario(page, scenario);
  await ready(page);
  await expect(page.locator('.experiment-heading strong')).toHaveText(scenario.name);
  await expect(page.locator('.run-status')).toContainText('seed 13579');
  await page.getByRole('button', { name: 'Export results', exact: true }).click();
  expect(JSON.parse(await downloadOption(page, /Reproducible scenario/))).toEqual(scenario);
  await page.keyboard.press('Escape');
  await importScenario(page, { ...scenario, trials: 1000000 });
  await expect(page.locator('.notice')).toContainText('trials must be');
  await expect(page.locator('.run-status')).toContainText('seed 13579');
  await page.getByLabel('Import scenario file', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not JSON'),
  });
  await expect(page.locator('.notice')).toContainText('not a valid JSON scenario');
  await page.getByLabel('Import scenario file', { exact: true }).setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.from('x'.repeat(17000)),
  });
  await expect(page.locator('.notice')).toContainText('too large');
  await expect(page.locator('.experiment-heading strong')).toHaveText(scenario.name);
  await ready(page);
});

test('reproduces a shared link and handles a malformed link', async ({ page }) => {
  const scenario = {
    ...DEFAULT_SCENARIO,
    name: 'Shared demand experiment',
    disruption: 'demand',
    severity: 0.35,
    seed: 42,
    trials: 8,
  };
  await page.goto('/');
  await ready(page);
  await importScenario(page, scenario);
  await ready(page);
  const before = await page.locator('.metrics').textContent();
  await page.getByRole('button', { name: 'Share scenario', exact: true }).click();
  const link = await page.getByLabel('Scenario link', { exact: true }).inputValue();
  expect(link).toContain('#scenario=');
  await page.goto(link);
  await page.reload();
  await ready(page);
  await expect(page.locator('.experiment-heading strong')).toHaveText(scenario.name);
  await expect(page.locator('.metrics')).toHaveText(before!);
  await page.goto('/#scenario=not-valid!');
  await page.reload();
  await ready(page);
  await expect(page.locator('.notice')).toContainText('could not be loaded');
  await expect(page.locator('.experiment-heading strong')).toHaveText(DEFAULT_SCENARIO.name);
});

test('exports numerical CSV and an escaped, standalone HTML report', async ({ page }) => {
  const scenario = {
    ...DEFAULT_SCENARIO,
    name: '<img src=x onerror=alert(1)>',
    seed: 2026,
    trials: 8,
  };
  await page.goto('/');
  await ready(page);
  await importScenario(page, scenario);
  await ready(page);
  await page.getByRole('button', { name: 'Export results', exact: true }).click();
  const csv = await downloadOption(page, /Results spreadsheet/);
  const lines = csv.trim().split(/\r?\n/);
  expect(lines).toHaveLength(5);
  const keys = lines[0].split(',');
  for (const line of lines.slice(1)) {
    const row = Object.fromEntries(line.split(',').map((value, index) => [keys[index], value]));
    expect(Number(row.seed)).toBe(2026);
    expect(Number(row.trials)).toBe(8);
    expect(Number(row.service_level)).toBeGreaterThanOrEqual(0);
    expect(Number(row.service_level)).toBeLessThanOrEqual(1);
    expect(Number(row.total_cost_usd)).toBeCloseTo(
      Number(row.procurement_cost_usd) +
        Number(row.transport_cost_usd) +
        Number(row.holding_cost_usd) +
        Number(row.lost_margin_usd),
      5,
    );
  }
  const html = await downloadOption(page, /Decision brief/);
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<script');
  expect(html).toContain('Content-Security-Policy');
  expect(html).toContain('2026');
  expect(html).toContain('Reproduce this experiment');
});

test('keeps dialogs keyboard accessible and passes automated accessibility checks', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  await assertAccessible(page);
  const trigger = page.getByRole('button', { name: 'About the model', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await assertAccessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  for (const name of ['Share scenario', 'Export results', 'Take the 60-second tour']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(dialog).toBeVisible();
    await assertAccessible(page);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Compare strategies', exact: true }).click();
  await assertAccessible(page);
  await page.getByRole('button', { name: 'Back to the network', exact: true }).click();
  await expect(page.locator('.ripple-map__shipment')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect(page.locator('.ripple-map')).toHaveAttribute('data-playing', 'false');
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
