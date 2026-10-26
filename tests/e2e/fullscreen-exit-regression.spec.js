/**
 * Native fullscreen enter/exit, including the electron-trpc falsy-input regression.
 * HTML document.fullscreenElement does not reflect BrowserWindow fullscreen.
 */
import { test, expect } from './fixtures/electron.fixture.js';

const skipInCI = process.env.CI && !process.env.RUN_FULLSCREEN_TESTS;

function nativeIsFullscreen(electronApp) {
  return electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? null);
}

test('native fullscreen preserves stream layout and exits through the real UI without errors', async ({
  electronApp, appShell, chromaticDevice, streamPage, page,
}) => {
  test.skip(skipInCI, 'Native fullscreen requires a window manager');
  test.setTimeout(60000);
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /fullscreen/i.test(message.text())) errors.push(message.text());
  });
  await appShell.waitForReady();
  await chromaticDevice.connect();
  await streamPage.start();
  await streamPage.expectRenderedFrame();
  await expect(appShell.fullscreenButton).toBeVisible();
  await expect(appShell.fullscreenButton).toHaveAttribute('aria-label', 'Toggle Fullscreen');
  expect(await nativeIsFullscreen(electronApp)).toBe(false);
  await appShell.fullscreenButton.click();
  await expect.poll(() => nativeIsFullscreen(electronApp), { timeout: 15000 }).toBe(true);
  await expect(page.locator('body')).toHaveClass(/fullscreen-active/, { timeout: 15000 });
  await expect(appShell.header).toBeHidden();
  await expect(appShell.fullscreenControls).toBeAttached();
  const ratio = await streamPage.canvas.evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(ratio).toBeCloseTo(chromaticDevice.fixture.display.aspectRatio, 1);
  // Activity reveals these controls on the next animation frame. Visibility
  // alone does not reject opacity:0/pointer-events:none during auto-hide.
  const exitBounds = await appShell.fullscreenExitButton.boundingBox();
  expect(exitBounds).not.toBeNull();
  await page.mouse.move(exitBounds.x + exitBounds.width / 2, exitBounds.y + exitBounds.height / 2, { steps: 3 });
  await expect(appShell.fullscreenControls).not.toHaveClass(/fullscreen-hidden/);
  await expect(appShell.fullscreenExitButton).toBeInViewport();
  await expect.poll(() => appShell.fullscreenExitButton.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return hit === button || button.contains(hit);
  }), { message: 'the real exit button should receive the pointer' }).toBe(true);
  await appShell.fullscreenExitButton.click();
  await expect.poll(() => nativeIsFullscreen(electronApp), { timeout: 15000 }).toBe(false);
  await expect(page.locator('body')).not.toHaveClass(/fullscreen-active/);
  await expect(appShell.header).toBeVisible();
  await expect(appShell.statusIndicator).toHaveClass(/(?:^|\s)connected(?:\s|$)/);
  await streamPage.expectStreaming();
  await streamPage.expectRenderedFrame();
  expect(errors).toEqual([]);
});
