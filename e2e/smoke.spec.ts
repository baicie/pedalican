import { expect, test } from '@playwright/test';

test('defaults to Chinese, starts a ride, and pauses/resumes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  await expect(page.locator('#menu-screen')).toHaveClass(/is-visible/);
  await expect(page.locator('#btn-start [data-i18n="menu.start"]')).toHaveText('开始骑行');
  expect(
    await page.evaluate(
      () => typeof (window as unknown as { __pelicanRider?: unknown }).__pelicanRider,
    ),
  ).toBe('undefined');

  await page.locator('#btn-start').click();
  await expect(page.locator('#hud')).toHaveClass(/is-visible/);
  await expect(page.locator('#hud-hearts .heart')).toHaveCount(5);
  await expect(page.locator('#countdown')).not.toHaveClass(/is-visible/, {
    timeout: 45_000,
  });

  await page.keyboard.down('w');
  await expect
    .poll(async () => Number(await page.locator('#hud-speed').textContent()), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await page.keyboard.up('w');

  await page.keyboard.press('p');
  await expect(page.locator('#pause-screen')).toHaveClass(/is-visible/);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-screen')).not.toHaveClass(/is-visible/);
});
