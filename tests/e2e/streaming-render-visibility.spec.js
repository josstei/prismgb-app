/**
 * Streaming Render Visibility Regression
 *
 * Guards the window hidden -> visible round-trip that occurs during native fullscreen
 * space transitions on macOS (the webContents fires `visibilitychange`).
 *
 * Regression history: the rewritten `StreamingRenderService._handleVisible()` guarded on the
 * cached `this._videoElement`, but `_handleHidden() -> _stopRenderLoop()` nulls that field. So
 * after the first hide the render loop could never restart: entering/exiting fullscreen (which
 * also resizes and clears the canvas) left a permanently black frame. The paused log fired on
 * every hide while "rendering resumed (window visible)" never appeared once. The fix re-acquires
 * the live video element from the view service, mirroring every other render call site.
 *
 * This drives the REAL path the app reacts to: a `document` `visibilitychange` event with
 * `document.hidden` overridden. The discriminating assertion is the resume log, which is absent
 * whenever the loop fails to restart.
 */

import { test, expect } from './fixtures/electron.fixture.js';

async function setDocumentHidden(page, hidden) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.setTimeout(45000);

test.describe('Streaming render visibility regression', () => {
  test('resumes canvas rendering after a window hidden -> visible round-trip', async ({
    appShell,
    chromaticDevice,
    streamPage,
    page,
  }) => {
    const renderLogs = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (/StreamingRenderService/.test(text)) {
        renderLogs.push(text);
      }
    });

    await appShell.waitForReady();
    await chromaticDevice.connect();
    await streamPage.start();

    await expect
      .poll(() => renderLogs.some((text) => /Session ready/.test(text)), {
        timeout: 15000,
        message: 'render session should become ready before the visibility round-trip',
      })
      .toBe(true);

    await setDocumentHidden(page, true);
    await expect
      .poll(() => renderLogs.some((text) => /rendering paused \(window hidden\)/.test(text)), {
        timeout: 10000,
        message: 'render loop should pause when the window is hidden',
      })
      .toBe(true);

    await setDocumentHidden(page, false);
    await expect
      .poll(() => renderLogs.some((text) => /rendering resumed \(window visible\)/.test(text)), {
        timeout: 10000,
        message: 'render loop must resume when the window becomes visible again',
      })
      .toBe(true);
  });
});
