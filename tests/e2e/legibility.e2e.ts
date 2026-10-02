import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function assertLegible(page: Page, view: string) {
  await page.evaluate(() => document.fonts.ready);
  const offenders = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('body *')).flatMap((element) => {
      const text = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        return [];
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
      // Screen-reader-only text and the unfocused skip link are clipped out of sight.
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(100%)')
          return [];
      }
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      const ctm = element instanceof SVGGraphicsElement ? element.getScreenCTM() : null;
      const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      const renderedSize = fontSize * scale;
      // Allow trigonometric rounding (11.997px in Firefox), never a visible shortfall.
      return renderedSize < 11.99
        ? [
            `<${element.tagName.toLowerCase()}> ${JSON.stringify(text)}: ${renderedSize.toFixed(3)}px`,
          ]
        : [];
    });
  });
  expect.soft(offenders, `${view}: text below 12px\n${offenders.join('\n')}`).toEqual([]);
  expect
    .soft(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${view}: no horizontal page overflow`,
    )
    .toBe(true);
  const covered = await page.evaluate(() => {
    const card = document.querySelector('.ripple-map__inspector')?.getBoundingClientRect();
    if (!card) return [];
    const labels = document.querySelectorAll('.ripple-map svg text, .ripple-map__select-hint');
    return Array.from(labels).flatMap((label) => {
      const box = label.getBoundingClientRect();
      const overlaps =
        box.width > 0 &&
        box.right > card.left &&
        box.left < card.right &&
        box.bottom > card.top &&
        box.top < card.bottom;
      return overlaps ? [JSON.stringify(label.textContent?.trim())] : [];
    });
  });
  expect.soft(covered, `${view}: map labels hidden by the map inspector card`).toEqual([]);
}

test('workspace text stays at least 12px on screen with results showing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Export results', exact: true })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Simulation results' })).toBeVisible();
  const controls = page.getByRole('button', { name: 'Scenario & controls' });
  if ((await controls.isVisible()) && (await controls.getAttribute('aria-expanded')) === 'false')
    await controls.click();
  await page.locator('.advanced summary').click();
  await assertLegible(page, 'Workspace results and controls');
  await page.getByRole('button', { name: 'Compare strategies', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await assertLegible(page, 'Strategy comparison');
  for (const name of [
    'About the model',
    'Share scenario',
    'Export results',
    'Take the 60-second tour',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertLegible(page, name);
    await page.keyboard.press('Escape');
  }
});

test('resilience atlas text stays at least 12px on screen with results showing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Export results', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Resilience atlas', exact: true }).click();
  await page.getByRole('button', { name: 'Run resilience scan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download atlas CSV', exact: true })).toBeEnabled({
    timeout: 25_000,
  });
  await page.locator('button[data-duration="21"][data-severity="0.8"]').click();
  await expect(page.getByRole('region', { name: 'Selected atlas case' })).toBeVisible();
  await assertLegible(page, 'Atlas results and selected case');
  await page.getByRole('button', { name: 'How to read this', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await assertLegible(page, 'Atlas explanation');
});
