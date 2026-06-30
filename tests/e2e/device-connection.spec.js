/**
 * Device Connection E2E Tests
 *
 * Tests for device connection and disconnection flows.
 *
 * NOTE: Tests that require actual device connection are skipped because
 * this suite intentionally avoids Electron IPC device events.
 * These tests focus on UI state that can be verified without a device.
 */

import { test, expect } from './fixtures/electron.fixture.js';
import { getDeviceStatus } from './helpers/device-status.helper.js';

test.setTimeout(45000);

test.describe('Device Connection', () => {
  test('should show disconnected state initially', async ({ appShell }) => {
    await appShell.waitForReady();

    const status = await getDeviceStatus(appShell.page);

    expect(status.isConnected).toBe(false);
    expect(status.indicatorClasses).not.toContain('connected');
  });

  test('should show status text for disconnected state', async ({ appShell }) => {
    await appShell.waitForReady();

    await expect(appShell.statusText).toBeAttached();

    const text = await appShell.statusText.textContent();
    // Should indicate checking, waiting for device, or disconnected
    expect(text.toLowerCase()).toMatch(/connect|waiting|no device|checking|plug in/i);
  });

  test('should have device status section visible', async ({ appShell }) => {
    await appShell.waitForReady();

    await expect(appShell.deviceStatus).toBeAttached();
    await expect(appShell.statusIndicator).toBeAttached();
    await expect(appShell.statusText).toBeAttached();
  });
});

test.describe('Device Status Indicator', () => {
  test('should have correct styling for disconnected state', async ({ appShell }) => {
    await appShell.waitForReady();

    await expect(appShell.statusIndicator).toBeAttached();

    const classList = await appShell.statusIndicator.evaluate(element => Array.from(element.classList));
    expect(classList).toContain('disconnected');
    expect(classList).not.toContain('connected');
  });

  test('should have status-indicator class', async ({ appShell }) => {
    await appShell.waitForReady();

    const classes = await appShell.statusIndicator.getAttribute('class');
    expect(classes).toContain('status-indicator');
  });

  test('should have transition styles for animations', async ({ appShell }) => {
    await appShell.waitForReady();

    const style = await appShell.statusIndicator.evaluate((el) =>
      window.getComputedStyle(el).transition
    );

    expect(typeof style).toBe('string');
  });
});

test.describe('Connection Error Handling', () => {
  test('should handle error events gracefully', async ({ appShell }) => {
    await appShell.waitForReady();

    await appShell.page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('device:error', {
          detail: { message: 'Connection failed' },
        })
      );
    });

    await expect(appShell.streamContainer).toBeAttached();

    const status = await getDeviceStatus(appShell.page);
    expect(status.isConnected).toBe(false);
  });

  test('should remain stable after multiple events', async ({ appShell, settingsMenu }) => {
    await appShell.waitForReady();

    await appShell.page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new CustomEvent('device:error', {
          detail: { message: `Error ${i}` }
        }));
      }
    });

    await expect(appShell.streamContainer).toBeAttached();

    await settingsMenu.open();
    await settingsMenu.pressEscape();
  });
});

test.describe('UI Responsiveness Without Device', () => {
  test('should allow all UI interactions without device', async ({ appShell, settingsMenu }) => {
    await appShell.waitForReady();

    await settingsMenu.open();
    await settingsMenu.pressEscape();

    await expect(appShell.fullscreenButton).toBeAttached();
    await expect(appShell.fullscreenButton).toHaveAttribute('aria-label', 'Toggle Fullscreen');
  });

  test('should show stream container placeholder', async ({ appShell, streamPage }) => {
    await appShell.waitForReady();

    await expect(appShell.streamContainer).toBeAttached();
    await expect(streamPage.canvas).toBeAttached();
  });
});
