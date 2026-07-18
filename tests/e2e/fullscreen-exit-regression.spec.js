/**
 * Fullscreen Exit Regression
 *
 * Guards the enter -> exit round-trip of native window fullscreen driven from the UI.
 *
 * Regression history: `trpcClient.window.setFullScreen.mutate(false)` reached the main process as
 * `undefined` (electron-trpc dropped falsy inputs via `input ? deserialize(input) : undefined`), so
 * the `z.boolean()` schema rejected it with "Required". Entering worked (`mutate(true)`), but the
 * second toggle "did nothing" and logged `[SettingsFullscreenService] Error exiting fullscreen`.
 *
 * The assertions read the REAL native window state via the Electron main process. The renderer's
 * `document.fullscreenElement` is always null for `BrowserWindow.setFullScreen()` (it is not the
 * HTML Fullscreen API), which is why the existing weaker specs could never catch this.
 */

import { test, expect } from './fixtures/electron.fixture.js';

const skipInCI = process.env.CI && !process.env.RUN_FULLSCREEN_TESTS;

/**
 * @param {import('@playwright/test').ElectronApplication} electronApp
 * @returns {Promise<boolean|null>} native fullscreen state of the main window
 */
function nativeIsFullscreen(electronApp) {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win ? win.isFullScreen() : null;
  });
}

test.describe('Fullscreen exit regression', () => {
  test.skip(skipInCI, 'Fullscreen tests are disabled in CI by default');

  test.setTimeout(60000);

  test('enters and then exits fullscreen from the UI without error', async ({ electronApp, appShell, page }) => {
    const fullscreenErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /fullscreen/i.test(msg.text())) {
        fullscreenErrors.push(msg.text());
      }
    });

    await appShell.waitForReady();
    expect(await nativeIsFullscreen(electronApp), 'should start windowed').toBe(false);

    await appShell.fullscreenButton.click({ force: true });
    await expect
      .poll(() => nativeIsFullscreen(electronApp), { timeout: 15000, message: 'window should enter fullscreen' })
      .toBe(true);

    // The main side reports fullscreen (above) before the renderer does: the fullscreen-mode UI is
    // applied on the onEnterFullscreen IPC push, which fires only after the macOS space transition
    // completes. Gate on the renderer state (body.fullscreen-active) so the exit-control assertions
    // do not race that sync under load. In fullscreen the header (#fullscreenBtn) is display:none;
    // #fsExitBtn is the exit affordance.
    await expect(page.locator('body')).toHaveClass(/fullscreen-active/, { timeout: 15000 });
    await page.mouse.move(400, 20);
    await page.mouse.move(420, 30);
    await expect(appShell.fullscreenExitButton).toBeVisible();
    await appShell.fullscreenExitButton.click({ force: true });

    await expect
      .poll(() => nativeIsFullscreen(electronApp), { timeout: 15000, message: 'window should exit fullscreen' })
      .toBe(false);

    expect(fullscreenErrors, `no fullscreen error should be logged, saw:\n${fullscreenErrors.join('\n')}`).toEqual([]);
  });
});
