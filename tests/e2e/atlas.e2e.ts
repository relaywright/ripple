import { test, expect } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SCENARIO, runExperiment, validateScenario } from '../../src/simulation';
import { createAtlasPlan } from '../../src/simulation/atlas';
import type { Scenario } from '../../src/simulation/types';
import type { AtlasManifest } from '../../src/lib/atlas-export';
import { percent } from '../../src/lib/format';

function manifestFor(scenario: Scenario, target = 0.95): AtlasManifest {
  const plan = createAtlasPlan(scenario);
  return {
    kind: 'ripple-atlas',
    version: 1,
    atlasVersion: plan.atlasVersion,
    modelVersion: plan.modelVersion,
    baseScenario: scenario,
    durations: plan.durations,
    severities: plan.severities,
    trialsPerCell: 30,
    target,
  };
}

async function importFile(page: Page, value: unknown) {
  await page.getByLabel('Import scenario file', { exact: true }).setInputFiles({
    name: 'atlas.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
}

async function downloadText(download: Download) {
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, 'utf8');
}

async function downloadButton(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return downloadText(await pending);
}

function csvRows(csv: string) {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.map((line) =>
    Object.fromEntries(line.split(',').map((value, index) => [keys[index], value])),
  );
}

async function complete(page: Page) {
  await expect(page.getByRole('button', { name: 'Download atlas CSV', exact: true })).toBeEnabled({
    timeout: 25_000,
  });
}

async function runDefault(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Export results', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Resilience atlas', exact: true }).click();
  await page.getByRole('button', { name: 'Run resilience scan', exact: true }).click();
  await complete(page);
}

const cell = (page: Page, duration = 21, severity = 0.8) =>
  page.locator(`button[data-duration="${duration}"][data-severity="${severity}"]`);

async function assertAccessible(page: Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect
    .soft(
      scan.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
    )
    .toEqual([]);
}

test('traces a complete atlas to exact lab metrics and reranks cached results', async ({
  page,
}) => {
  test.setTimeout(45_000);
  const expectedScenario = { ...DEFAULT_SCENARIO, duration: 21, severity: 0.8, trials: 30 };
  const expected = runExperiment(expectedScenario);
  let atlasWorkers = 0;
  const errors: string[] = [];
  const external: string[] = [];
  page.on('worker', (worker) => {
    if (worker.url().includes('atlas.worker')) atlasWorkers++;
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1')
      external.push(request.url());
  });
  await runDefault(page);
  await expect(page.locator('button[data-computed="true"]')).toHaveCount(36);
  await expect(page.getByRole('progressbar', { name: 'Resilience scan progress' })).toHaveAttribute(
    'value',
    '36',
  );
  expect(atlasWorkers).toBe(1);
  await expect(cell(page)).toHaveAttribute('data-winner', 'reroute');
  await cell(page).focus();
  await cell(page).press('Enter');
  const selected = page.getByRole('region', { name: 'Selected atlas case' });
  for (const policy of expected.policies) {
    const row = selected.locator(`[data-policy="${policy.policy}"]`);
    expect(Number(await row.getAttribute('data-service'))).toBe(policy.serviceLevel);
    expect(Number(await row.getAttribute('data-cost'))).toBe(policy.totalCost);
  }
  const target = page.getByLabel('Minimum mean demand fulfilled', { exact: true });
  await target.focus();
  for (let step = 0; step < 4; step++) await target.press('ArrowRight');
  await expect(cell(page)).toHaveAttribute('data-winner', 'buffer');
  expect(atlasWorkers).toBe(1);
  const rows = csvRows(await downloadButton(page, 'Download atlas CSV'));
  expect(rows).toHaveLength(36 * 4);
  for (const row of rows) {
    expect(Number(row.trials)).toBe(30);
    expect(Number(row.seed)).toBe(DEFAULT_SCENARIO.seed);
    expect(Number(row.target_mean_service)).toBe(0.99);
    expect(row.meets_target).toBe(String(Number(row.mean_service_level) >= 0.99));
    expect(Number(row.total_cost_usd)).toBeCloseTo(
      Number(row.procurement_cost_usd) +
        Number(row.transport_cost_usd) +
        Number(row.holding_cost_usd) +
        Number(row.lost_margin_usd),
      5,
    );
  }
  const evidence = rows.find((row) => row.case_id === 'd21-s80' && row.policy === 'reroute')!;
  expect(
    validateScenario({
      version: Number(evidence.scenario_version),
      name: DEFAULT_SCENARIO.name,
      disruption: evidence.disruption,
      startDay: Number(evidence.start_day_zero_based),
      duration: Number(evidence.duration_days),
      severity: Number(evidence.severity),
      horizon: Number(evidence.horizon_days),
      dailyDemand: Number(evidence.daily_demand),
      demandVolatility: Number(evidence.demand_volatility),
      initialStockDays: Number(evidence.initial_stock_days),
      unitRevenue: Number(evidence.unit_revenue_usd),
      unitCost: Number(evidence.unit_cost_usd),
      holdingCost: Number(evidence.holding_cost_per_unit_day_usd),
      seed: Number(evidence.seed),
      trials: Number(evidence.trials),
    }),
  ).toEqual(expectedScenario);
  for (let step = 0; step < 4; step++) await target.press('ArrowLeft');
  await expect(cell(page)).toHaveAttribute('data-winner', 'reroute');
  await selected.getByRole('button', { name: /Open .* in the lab/ }).click();
  await expect(page.locator('.run-status')).toContainText('30 trials');
  await expect(page.getByRole('button', { name: 'Export results', exact: true })).toBeEnabled();
  const reroute = expected.policies.find((policy) => policy.policy === 'reroute')!;
  await expect(page.locator('.policy-card.selected')).toContainText('Change the route');
  await expect(page.locator('.metrics')).toContainText(percent(reroute.serviceLevel));
  await page.getByRole('button', { name: 'Export results', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Reproducible scenario/ })
    .click();
  expect(JSON.parse(await downloadText(await pending))).toEqual(expectedScenario);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to resilience atlas', exact: true }).click();
  await complete(page);
  await expect(cell(page)).toHaveAttribute('data-winner', 'reroute');
  expect(atlasWorkers).toBe(1);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('reproduces capped axes through manifest import, share reload, CSV and escaped HTML', async ({
  page,
}) => {
  test.setTimeout(45_000);
  const scenario = {
    ...DEFAULT_SCENARIO,
    name: '<img src=x onerror=alert(1)> Montréal',
    horizon: 30,
    startDay: 29,
    duration: 1,
    seed: 24680,
  };
  const manifest = manifestFor(scenario, 0.93);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Export results', exact: true })).toBeEnabled();
  await page.getByLabel('Simulation day', { exact: true }).press('End');
  await expect(page.getByLabel('Simulation day', { exact: true })).toHaveValue('89');
  await importFile(page, manifest);
  await complete(page);
  await expect(page.locator('button[data-computed="true"]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Stress lab', exact: true }).click();
  await expect(page.getByLabel('Simulation day', { exact: true })).toHaveValue('28');
  await expect(page.getByLabel('Simulation day', { exact: true })).toHaveAttribute('max', '29');
  await page.getByRole('button', { name: 'Resilience atlas', exact: true }).click();
  await complete(page);
  const exported = JSON.parse(await downloadButton(page, 'Download atlas settings'));
  expect(exported).toEqual(manifest);
  const before = await downloadButton(page, 'Download atlas CSV');
  const rows = csvRows(before);
  expect(rows).toHaveLength(24);
  expect(new Set(rows.map((row) => row.duration_days))).toEqual(new Set(['1']));
  expect(new Set(rows.map((row) => row.severity))).toEqual(
    new Set(['0', '0.2', '0.4', '0.6', '0.8', '1']),
  );
  const html = await downloadButton(page, 'Download atlas brief');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<script');
  expect(html).toContain('Content-Security-Policy');
  expect(html).toContain('not a probability');
  expect(html).toContain('Reproduce the atlas');
  await page.getByRole('button', { name: 'Share atlas', exact: true }).click();
  const link = await page.getByLabel('Atlas link', { exact: true }).inputValue();
  expect(link).toContain('#atlas=');
  await page.goto(link);
  await page.reload();
  await complete(page);
  expect(await downloadButton(page, 'Download atlas CSV')).toBe(before);
  expect(JSON.parse(await downloadButton(page, 'Download atlas settings'))).toEqual(manifest);
  const unsupportedLink = Buffer.from(
    JSON.stringify({ ...manifest, modelVersion: '99.0.0' }),
  ).toString('base64url');
  await page.goto(`/#atlas=${unsupportedLink}`);
  await page.reload();
  await expect(page.locator('.notice')).toContainText('different model or atlas version');
  await expect(page.getByRole('button', { name: 'Export results', exact: true })).toBeEnabled();
  await expect(page.locator('.experiment-heading strong')).toHaveText(DEFAULT_SCENARIO.name);
});

test('loads a no-qualifying case and rejects unsupported manifests without replacing results', async ({
  page,
}) => {
  test.setTimeout(45_000);
  const manifest = manifestFor(DEFAULT_SCENARIO, 1);
  await page.goto('/');
  await importFile(page, manifest);
  await complete(page);
  await expect(cell(page)).toHaveAttribute('data-winner', '');
  await cell(page).click();
  await expect(page.getByRole('region', { name: 'Selected atlas case' })).toContainText(
    'No strategy meets',
  );
  const rows = csvRows(await downloadButton(page, 'Download atlas CSV'));
  const unsupported = rows.filter((row) => row.case_id === 'd21-s80');
  expect(unsupported).toHaveLength(4);
  expect(unsupported.every((row) => row.meets_target === 'false' && row.selected === 'false')).toBe(
    true,
  );
  for (const invalid of [
    { ...manifest, version: 99 },
    { ...manifest, atlasVersion: '99.0.0' },
    { ...manifest, modelVersion: '99.0.0' },
    { ...manifest, trialsPerCell: 500 },
    { ...manifest, target: 1.01 },
  ]) {
    await importFile(page, invalid);
    await expect(page.locator('.notice')).toContainText(/version|trial count|target/);
    await complete(page);
    await expect(cell(page)).toHaveAttribute('data-winner', '');
  }
  expect(JSON.parse(await downloadButton(page, 'Download atlas settings'))).toEqual(manifest);
});

test('cancels work and discards a superseded run when new inputs arrive', async ({ page }) => {
  test.setTimeout(45_000);
  let closed = 0;
  page.on('worker', (worker) => {
    if (worker.url().includes('atlas.worker')) worker.on('close', () => closed++);
  });
  await page.goto('/');
  await importFile(page, manifestFor({ ...DEFAULT_SCENARIO, horizon: 180 }));
  await expect(page.getByRole('button', { name: 'Cancel scan', exact: true })).toBeVisible();
  await expect
    .poll(async () => page.locator('button[data-computed="true"]').count())
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cancel scan', exact: true }).click();
  await expect.poll(() => closed).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Download atlas CSV', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Run again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel scan', exact: true })).toBeVisible();
  const replacement = manifestFor(
    {
      ...DEFAULT_SCENARIO,
      name: 'Replacement atlas',
      horizon: 30,
      startDay: 29,
      duration: 1,
      seed: 76543,
    },
    0.91,
  );
  await importFile(page, replacement);
  await complete(page);
  await expect(page.locator('button[data-computed="true"]')).toHaveCount(6);
  expect(JSON.parse(await downloadButton(page, 'Download atlas settings'))).toEqual(replacement);
  const rows = csvRows(await downloadButton(page, 'Download atlas CSV'));
  expect(rows).toHaveLength(24);
  expect(rows.every((row) => row.seed === '76543' && row.target_mean_service === '0.91')).toBe(
    true,
  );
});

test('recovers from a worker load failure with an explicit retry', async ({ page }) => {
  test.setTimeout(45_000);
  let fail = true;
  await page.route(/atlas\.worker[^/]*\.js$/, async (route) => {
    if (fail) {
      fail = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('/');
  await importFile(
    page,
    manifestFor({ ...DEFAULT_SCENARIO, horizon: 30, startDay: 29, duration: 1 }),
  );
  await expect(page.getByRole('button', { name: 'Run again', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Run again', exact: true }).click();
  await complete(page);
  await expect(page.locator('button[data-computed="true"]')).toHaveCount(6);
});

test('keeps the atlas keyboard accessible at both screen sizes', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resilience atlas', exact: true }).click();
  await assertAccessible(page);
  const help = page.getByRole('button', { name: 'How to read this', exact: true });
  await help.click();
  await expect(page.getByRole('dialog')).toContainText('30 trials per strategy in each case');
  await expect(page.getByRole('dialog')).toContainText(
    'lowest modeled cost among strategies meeting',
  );
  await assertAccessible(page);
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  await page.getByRole('button', { name: 'Run resilience scan', exact: true }).click();
  await complete(page);
  await assertAccessible(page);
  await cell(page).focus();
  await cell(page).press('Space');
  await expect(page.getByRole('region', { name: 'Selected atlas case' })).toBeVisible();
  await assertAccessible(page);
  await cell(page).press('ArrowRight');
  await expect(cell(page, 35, 0.8)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 35, 0.6)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cell(page, 35, 0.6)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+Home');
  await expect(cell(page, 1, 1)).toBeFocused();
  await page.keyboard.press('Control+End');
  await expect(cell(page, 60, 0)).toBeFocused();
  const target = page.getByLabel('Minimum mean demand fulfilled', { exact: true });
  await target.focus();
  await target.press('End');
  await expect(cell(page)).toHaveAttribute('data-winner', '');
  await assertAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await importFile(page, { ...DEFAULT_SCENARIO, disruption: 'none', severity: 0 });
  await page.getByRole('button', { name: 'Resilience atlas', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A quiet quarter has no shock to map.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run resilience scan', exact: true })).toHaveCount(
    0,
  );
  await assertAccessible(page);
  await page.getByRole('button', { name: /Port slowdown.*Explore this disruption/ }).click();
  await expect(
    page.getByRole('button', { name: 'Run resilience scan', exact: true }),
  ).toBeEnabled();
});
