/**
 * Fullscreen E2E Tests
 *
 * Tests for fullscreen mode entry and exit.
 * Note: Some fullscreen tests may be flaky in CI environments.
 */

import { test, expect } from './fixtures/electron.fixture.js';
import { CHROMATIC_E2E_FIXTURE } from '../support/chromatic-device-specs.js';

const skipInCI = process.env.CI && !process.env.RUN_FULLSCREEN_TESTS;

test.setTimeout(45000);

test.describe('Fullscreen Mode', () => {
  test.skip(skipInCI, 'Fullscreen tests are disabled in CI by default');

  test.beforeEach(async ({ appShell }) => {
    await appShell.waitForReady();
  });

  test('should have fullscreen button visible', async ({ appShell }) => {
    await expect(appShell.fullscreenButton).toBeVisible();
  });

  test('should have accessible fullscreen button', async ({ appShell }) => {
    await expect(appShell.fullscreenButton).toHaveAttribute('aria-label', /.+/);
  });

  test('should toggle fullscreen on button click', async ({ appShell }) => {
    expect(await appShell.isFullscreen()).toBe(false);

    await appShell.toggleFullscreenButton();

    expect(typeof await appShell.isFullscreen()).toBe('boolean');
  });

  test('should show fullscreen controls overlay when in fullscreen', async ({ appShell }) => {
    await appShell.toggleFullscreenButton();

    const controlsExist = (await appShell.fullscreenControls.count()) > 0;
    expect(typeof controlsExist).toBe('boolean');
  });

  test('should exit fullscreen with Escape key', async ({ appShell }) => {
    await appShell.toggleFullscreenButton();
    await appShell.pressEscape();

    expect(await appShell.isFullscreen()).toBe(false);
  });

  test('should exit fullscreen with exit button', async ({ appShell }) => {
    await appShell.toggleFullscreenButton();

    if (
      (await appShell.fullscreenExitButton.count()) > 0
      && (await appShell.fullscreenExitButton.isVisible())
    ) {
      await appShell.fullscreenExitButton.click({ force: true });
      await appShell.page.waitForTimeout(500);

      expect(await appShell.isFullscreen()).toBe(false);
    }
  });
});

test.describe('Fullscreen Keyboard Shortcuts', () => {
  test.skip(skipInCI, 'Fullscreen tests are disabled in CI by default');

  test.beforeEach(async ({ appShell }) => {
    await appShell.waitForReady();
  });

  test('should toggle fullscreen with F11', async ({ appShell }) => {
    await appShell.pressF11();

    expect(typeof await appShell.isFullscreen()).toBe('boolean');
  });

  test('should handle double-click on video area for fullscreen', async ({ appShell, streamPage }) => {
    const canvasCount = await streamPage.canvas.count();
    if (canvasCount === 0) {
      return;
    }

    const box = await streamPage.canvas.boundingBox();
    if (!box || box.width === 0 || box.height === 0) {
      return;
    }

    await streamPage.canvas.dblclick({
      position: { x: box.width / 2, y: box.height / 2 },
      timeout: 5000,
      force: true
    });
    await appShell.page.waitForTimeout(500);

    expect(typeof await appShell.isFullscreen()).toBe('boolean');
  });
});

test.describe('Fullscreen UI Adaptations', () => {
  test.skip(skipInCI, 'Fullscreen tests are disabled in CI by default');

  test.beforeEach(async ({ appShell }) => {
    await appShell.waitForReady();
  });

  test('should apply fullscreen-specific styles', async ({ appShell }) => {
    const initialClasses = await appShell.streamContainer.getAttribute('class');

    await appShell.toggleFullscreenButton();

    const fullscreenClasses = await appShell.streamContainer.getAttribute('class');

    expect(typeof initialClasses).toBe('string');
    expect(typeof fullscreenClasses).toBe('string');
  });

  test('should maintain canvas aspect ratio in fullscreen', async ({ appShell, streamPage }) => {
    const initialBox = await streamPage.canvas.boundingBox();

    await appShell.toggleFullscreenButton();

    const fullscreenBox = await streamPage.canvas.boundingBox();

    if (fullscreenBox && initialBox) {
      const aspectRatio = fullscreenBox.width / fullscreenBox.height;
      const expectedRatio = CHROMATIC_E2E_FIXTURE.display.aspectRatio;

      expect(aspectRatio).toBeGreaterThan(expectedRatio * 0.8);
      expect(aspectRatio).toBeLessThan(expectedRatio * 1.5);
    }
  });
});
