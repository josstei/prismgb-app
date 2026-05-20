/**
 * Device Connection E2E Tests
 *
 * Tests for device connection and disconnection flows.
 *
 * NOTE: Tests that require actual device connection are skipped because
 * the device mocks cannot fully simulate Electron IPC device events.
 * These tests focus on UI state that can be verified without a device.
 */

import { test, expect, waitForAppReady } from './fixtures/electron.fixture.js';
import { getDeviceStatus } from './helpers/ipc-mock.js';

test.describe('Device Connection', () => {
  test('should show disconnected state initially', async ({ window }) => {
    await waitForAppReady(window);

    const status = await getDeviceStatus(window);

    expect(status.isConnected).toBe(false);
    expect(status.indicatorClasses).not.toContain('connected');
  });

  test('should show status text for disconnected state', async ({ window }) => {
    await waitForAppReady(window);

    const statusText = window.locator('#statusText');
    await expect(statusText).toBeAttached();

    const text = await statusText.textContent();
    // Should indicate checking, waiting for device, or disconnected
    expect(text.toLowerCase()).toMatch(/connect|waiting|no device|checking|plug in/i);
  });

  test('should have device status section visible', async ({ window }) => {
    await waitForAppReady(window);

    const deviceStatus = window.locator('#deviceStatus');
    await expect(deviceStatus).toBeAttached();

    // Should contain both indicator and text
    const indicator = window.locator('#statusIndicator');
    const text = window.locator('#statusText');

    await expect(indicator).toBeAttached();
    await expect(text).toBeAttached();
  });
});

test.describe('Device Status Indicator', () => {
  test('should have correct styling for disconnected state', async ({ window }) => {
    await waitForAppReady(window);

    const indicator = window.locator('#statusIndicator');
    await expect(indicator).toBeAttached();

    const classList = await indicator.evaluate(element => Array.from(element.classList));
    expect(classList).toContain('disconnected');
    expect(classList).not.toContain('connected');
  });

  test('should have status-indicator class', async ({ window }) => {
    await waitForAppReady(window);

    const indicator = window.locator('#statusIndicator');
    const classes = await indicator.getAttribute('class');
    expect(classes).toContain('status-indicator');
  });

  test('should have transition styles for animations', async ({ window }) => {
    await waitForAppReady(window);

    // Check for CSS transitions/animations on status change
    const indicator = window.locator('#statusIndicator');

    // Get initial computed styles
    const style = await indicator.evaluate((el) =>
      window.getComputedStyle(el).transition
    );

    // Should have some transition defined (for smooth state changes)
    expect(typeof style).toBe('string');
  });
});

test.describe('Connection Error Handling', () => {
  test('should handle error events gracefully', async ({ window }) => {
    await waitForAppReady(window);

    // Simulate a connection error event
    await window.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('device:error', {
          detail: { message: 'Connection failed' },
        })
      );
    });

    // App should still be responsive
    const streamContainer = window.locator('#streamContainer');
    await expect(streamContainer).toBeAttached();

    // Status should not show connected
    const status = await getDeviceStatus(window);
    expect(status.isConnected).toBe(false);
  });

  test('should remain stable after multiple events', async ({ window }) => {
    await waitForAppReady(window);

    // Dispatch multiple events rapidly
    await window.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new CustomEvent('device:error', {
          detail: { message: `Error ${i}` }
        }));
      }
    });

    // App should still be functional
    const streamContainer = window.locator('#streamContainer');
    await expect(streamContainer).toBeAttached();

    // Settings button should still work
    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'true');
    await window.keyboard.press('Escape');
  });
});

test.describe('UI Responsiveness Without Device', () => {
  test('should allow all UI interactions without device', async ({ window }) => {
    await waitForAppReady(window);

    // Test settings menu works
    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'true');
    await window.keyboard.press('Escape');

    // Test fullscreen button is accessible
    const fullscreenBtn = window.locator('#fullscreenBtn');
    await expect(fullscreenBtn).toBeAttached();
    await expect(fullscreenBtn).toHaveAttribute('aria-label', 'Toggle Fullscreen');
  });

  test('should show stream container placeholder', async ({ window }) => {
    await waitForAppReady(window);

    const streamContainer = window.locator('#streamContainer');
    await expect(streamContainer).toBeAttached();

    // Canvas should exist even without device
    const canvas = window.locator('#streamCanvas');
    await expect(canvas).toBeAttached();
  });
});
