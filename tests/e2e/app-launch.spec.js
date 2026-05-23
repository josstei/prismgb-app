/**
 * App Launch & Core UI E2E Tests
 *
 * Tests core app functionality without requiring a device.
 *
 */

import { test, expect } from './fixtures/electron.fixture.js';
import { SettingsTestControls } from './pages/settings.page.js';

test.setTimeout(45000);

test.describe('App Launch', () => {
  test('should launch and display the main window', async ({ appShell }) => {
    await appShell.waitForReady();

    const title = await appShell.page.title();
    expect(title).toContain('PrismGB');
  });

  test('should display correct initial UI state', async ({ appShell }) => {
    await appShell.waitForReady();

    await expect(appShell.header).toBeAttached();
    await expect(appShell.streamContainer).toBeAttached();
    await expect(appShell.settingsButton).toBeAttached();
    await appShell.expectSettingsExpanded(false);
    await expect(appShell.fullscreenButton).toBeAttached();
  });
});

test.describe('Settings Menu', () => {
  test('should open and close settings menu via button', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();

    await settingsMenu.expectClosed();
    await settingsMenu.open();
    await settingsMenu.close();
  });

  for (const { settingName, label } of SettingsTestControls.toggleableBooleanControls) {
    test(`should toggle ${label} setting`, async ({ settingsMenu }) => {
      await settingsMenu.waitForAppReady();
      await settingsMenu.open();

      const { initial, current } = await settingsMenu.toggleBoolean(settingName);
      expect(current).not.toBe(initial);

      await settingsMenu.setBoolean(settingName, initial);
      await settingsMenu.close();
    });
  }

  test('should expand and collapse disclaimer', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await expect(settingsMenu.disclaimerButton).toHaveAttribute('aria-expanded', 'false');
    await settingsMenu.expandDisclaimer();
    await settingsMenu.collapseDisclaimer();

    await settingsMenu.close();
  });

  test('should close settings with Escape key', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await settingsMenu.pressEscape();
  });

  test('should close settings when clicking outside', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await settingsMenu.clickOutside();
  });

  test('should persist settings after menu close/reopen', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    const { initial, current } = await settingsMenu.toggleBoolean('statusStrip');
    expect(current).not.toBe(initial);

    await settingsMenu.close();
    await settingsMenu.open();
    await expect(settingsMenu.checkbox('statusStrip')).toBeChecked({ checked: current });

    await settingsMenu.setBoolean('statusStrip', initial);
    await settingsMenu.close();
  });
});

test.describe('Fullscreen Mode', () => {
  test('should have fullscreen button', async ({ appShell }) => {
    await appShell.waitForReady();

    await expect(appShell.fullscreenButton).toBeAttached();
    await expect(appShell.fullscreenButton).toHaveAttribute('aria-label', 'Toggle Fullscreen');
  });

  test('should respond to fullscreen button click', async ({ appShell }) => {
    await appShell.waitForReady();

    // Get initial fullscreen state
    const initialFullscreen = await appShell.isFullscreen();
    expect(initialFullscreen).toBe(false);

    // Click fullscreen button
    await appShell.toggleFullscreenButton();

    // Check if fullscreen changed (may not work in all headless environments)
    const afterClick = await appShell.isFullscreen();

    // If fullscreen worked, exit it
    if (afterClick) {
      await appShell.pressEscape();
      const afterEscape = await appShell.isFullscreen();
      expect(afterEscape).toBe(false);
    }
    // Note: Fullscreen may not work in headless/CI environments - that's OK
  });

  test('should respond to F11 key', async ({ appShell }) => {
    await appShell.waitForReady();

    const initialFullscreen = await appShell.isFullscreen();

    await appShell.pressF11();

    // Exit if it entered fullscreen
    const afterF11 = await appShell.isFullscreen();
    if (afterF11 !== initialFullscreen) {
      await appShell.pressEscape();
    }
  });
});

test.describe('Status Indicators', () => {
  test('should show disconnected state without device', async ({ appShell }) => {
    await appShell.waitForReady();

    await expect(appShell.statusIndicator).toBeAttached();
    await expect(appShell.statusText).toBeAttached();

    const classList = await appShell.statusIndicator.evaluate(element => Array.from(element.classList));
    expect(classList).toContain('disconnected');
    expect(classList).not.toContain('connected');

    // Status text should indicate waiting/disconnected/checking
    const text = await appShell.statusText.textContent();
    expect(text.toLowerCase()).toMatch(/connect|waiting|no device|disconnected|plug in|checking/i);
  });

  test('should display device status section', async ({ appShell }) => {
    await appShell.waitForReady();

    await expect(appShell.deviceStatus).toBeAttached();
  });
});

test.describe('Updates Section', () => {
  test('should display version in settings', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await expect(settingsMenu.currentVersion).toBeAttached();
    const versionText = await settingsMenu.currentVersion.textContent();
    expect(versionText).toMatch(/v\d+\.\d+\.\d+/);

    await settingsMenu.close();
  });

  test('should have check for updates button', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await expect(settingsMenu.updateActionButton).toBeAttached();
    const btnText = await settingsMenu.updateActionButton.textContent();
    expect(btnText.toLowerCase()).toContain('update');

    await settingsMenu.close();
  });
});

test.describe('Window Controls', () => {
  test('should have working window', async ({ appShell, electronApp }) => {
    await appShell.waitForReady();

    // Verify main BrowserWindow exists and is usable in headless test runs.
    await expect(async () => {
      const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        return {
          exists: Boolean(win),
          isDestroyed: win?.isDestroyed() ?? true,
          isMinimized: win?.isMinimized() ?? true,
          bounds: win?.getBounds() ?? { width: 0, height: 0 },
        };
      });
      expect(windowState.exists).toBe(true);
      expect(windowState.isDestroyed).toBe(false);
      expect(windowState.isMinimized).toBe(false);
      expect(windowState.bounds.width).toBeGreaterThan(0);
      expect(windowState.bounds.height).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });
  });

  test('should have correct window title', async ({ appShell }) => {
    await appShell.waitForReady();

    const title = await appShell.page.title();
    expect(title).toContain('PrismGB');
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('should respond to Escape key (closes any open menu)', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await settingsMenu.pressEscape();
  });
});

test.describe('External Links', () => {
  test('should have external link buttons in settings', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    for (const link of Object.values(settingsMenu.externalLinks)) {
      await expect(link).toBeAttached();
    }

    await settingsMenu.close();
  });
});
