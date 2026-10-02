/** Capture the actual product, including real policy changes. Run after npm run build.
 * Start `npm run preview -- --port 4318`, then:
 * node --experimental-strip-types scripts/capture-demo.ts [base URL]
 */
import { chromium } from '@playwright/test';
import { mkdir, rename } from 'node:fs/promises';

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4318/';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  recordVideo: { dir: 'artifacts/local-recordings', size: { width: 1440, height: 1050 } },
});
const page = await context.newPage();
await page.goto(baseURL);
await page.getByRole('button', { name: 'Export results', exact: true }).waitFor();
await page.waitForFunction(
  () => !document.querySelector<HTMLButtonElement>('button.primary-button')?.disabled,
);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'artifacts/ripple-desktop.png', fullPage: true });
await page.waitForTimeout(1500);
await page.locator('.network-panel').scrollIntoViewIfNeeded();
await page.getByRole('button', { name: 'Play replay', exact: true }).click();
await page.waitForTimeout(3200);
await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
await page.getByRole('button', { name: /Change the route/ }).click();
await page.locator('.analysis-grid').scrollIntoViewIfNeeded();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'artifacts/ripple-analysis.png', fullPage: false });
await page.getByRole('button', { name: 'Compare strategies', exact: true }).click();
await page.locator('.comparison-panel').scrollIntoViewIfNeeded();
await page.waitForTimeout(3500);
await page.screenshot({ path: 'artifacts/ripple-comparison.png', fullPage: true });
await page.getByRole('button', { name: 'Back to the network', exact: true }).click();
await page.getByRole('button', { name: /Demand takes off/ }).click();
await page.waitForFunction(
  () => !document.querySelector<HTMLButtonElement>('button.primary-button')?.disabled,
);
await page.getByRole('button', { name: /Build a buffer/ }).click();
await page.locator('.analysis-grid').scrollIntoViewIfNeeded();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Export results', exact: true }).click();
await page.waitForTimeout(2000);
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Reset experiment', exact: true }).click();
await page.waitForFunction(
  () => !document.querySelector<HTMLButtonElement>('button.primary-button')?.disabled,
);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(2000);
const video = page.video()!;
await context.close();
await rename(await video.path(), 'artifacts/ripple-walkthrough.webm');

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
await mobile.goto(baseURL);
await mobile.waitForFunction(
  () => !document.querySelector<HTMLButtonElement>('button.primary-button')?.disabled,
);
await mobile.evaluate(() => document.fonts.ready);
await mobile.screenshot({ path: 'artifacts/ripple-mobile.png', fullPage: true });
await browser.close();
console.log('Screenshots and real-interaction walkthrough saved in artifacts/.');
