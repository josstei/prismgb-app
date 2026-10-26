import { test, expect } from './fixtures/electron.fixture.js';

test('launches a usable window with the disconnected application shell', async ({
  appShell, electronApp, streamPage,
}) => {
  await appShell.waitForReady();
  await expect(appShell.page).toHaveTitle(/PrismGB/);
  for (const element of [
    appShell.header, appShell.streamContainer, appShell.settingsButton,
    appShell.fullscreenButton, appShell.deviceStatus, appShell.statusIndicator,
    appShell.statusText, streamPage.canvas,
  ]) await expect(element).toBeAttached();
  await appShell.expectSettingsExpanded(false);
  await expect(appShell.fullscreenButton).toHaveAttribute('aria-label', 'Toggle Fullscreen');
  await expect(appShell.statusIndicator).toHaveClass(/status-indicator/);
  await expect(appShell.statusIndicator).toHaveClass(/disconnected/);
  await expect(appShell.statusIndicator).not.toHaveClass(/(?:^|\s)connected(?:\s|$)/);
  await expect(appShell.statusText).toHaveText(/connect|waiting|no device|plug in|checking/i);
  await streamPage.expectOverlayReady();
  await streamPage.expectCaptureControlsDisabled();
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const bounds = window?.getBounds();
    return Boolean(window && !window.isDestroyed() && !window.isMinimized()
      && bounds.width > 0 && bounds.height > 0);
  })).toBe(true);
});
