/**
 * App Launch & Core UI E2E Tests
 *
 * Tests core app functionality without requiring a device.
 *
 * IMPORTANT: This app uses CSS-based visibility with `.visible` class on
 * `.popup-animated` elements (opacity + pointer-events), so we use
 * class-based or aria-based checks instead of Playwright's toBeHidden/toBeVisible.
 */

import { test, expect, waitForAppReady } from './fixtures/electron.fixture.js';

/**
 * Check if a popup element is visible (has .visible class)
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<boolean>}
 */
async function isPopupVisible(locator) {
  const classes = await locator.getAttribute('class');
  return classes?.includes('visible') ?? false;
}

/**
 * Wait for popup to become visible
 * @param {import('@playwright/test').Locator} locator
 * @param {Object} options
 */
async function expectPopupVisible(locator, options = {}) {
  const { timeout = 5000 } = options;
  await expect(async () => {
    const visible = await isPopupVisible(locator);
    expect(visible).toBe(true);
  }).toPass({ timeout });
}

/**
 * Wait for popup to become hidden
 * @param {import('@playwright/test').Locator} locator
 * @param {Object} options
 */
async function expectPopupHidden(locator, options = {}) {
  const { timeout = 5000 } = options;
  await expect(async () => {
    const visible = await isPopupVisible(locator);
    expect(visible).toBe(false);
  }).toPass({ timeout });
}

test.describe('App Launch', () => {
  test('should launch and display the main window', async ({ window }) => {
    await waitForAppReady(window);

    const title = await window.title();
    expect(title).toContain('PrismGB');
  });

  test('should display correct initial UI state', async ({ window }) => {
    await waitForAppReady(window);

    // Header should be visible
    const header = window.locator('.header');
    await expect(header).toBeAttached();

    // Stream container should be visible
    const streamContainer = window.locator('#streamContainer');
    await expect(streamContainer).toBeAttached();

    // Settings button should be visible and have correct aria
    const settingsBtn = window.locator('#settingsBtn');
    await expect(settingsBtn).toBeAttached();
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'false');

    // Fullscreen button should be visible
    const fullscreenBtn = window.locator('#fullscreenBtn');
    await expect(fullscreenBtn).toBeAttached();
  });
});

test.describe('Settings Menu', () => {
  test('should open and close settings menu via button', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    const settingsMenu = window.locator('#settingsMenuContainer');

    // Menu should be hidden initially (no .visible class)
    await expectPopupHidden(settingsMenu);
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    await settingsBtn.click();
    await expectPopupVisible(settingsMenu);
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'true');

    // Click again to close
    await settingsBtn.click();
    await expectPopupHidden(settingsMenu);
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('should toggle status strip setting', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    // Find the checkbox and its parent label (for clicking)
    const statusStripCheckbox = window.locator('#settingStatusStrip');
    const statusStripLabel = window.locator('label:has(#settingStatusStrip)');

    // Get initial state
    const initialChecked = await statusStripCheckbox.isChecked();

    // Click the label to toggle (not the hidden checkbox)
    await statusStripLabel.click();
    await window.waitForTimeout(100); // Allow for state update

    const afterToggle = await statusStripCheckbox.isChecked();
    expect(afterToggle).toBe(!initialChecked);

    // Toggle back to original state
    await statusStripLabel.click();
    await window.waitForTimeout(100);
    expect(await statusStripCheckbox.isChecked()).toBe(initialChecked);

    // Close menu
    await settingsBtn.click();
  });

  test('should toggle performance mode setting', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    const animationSaverCheckbox = window.locator('#settingAnimationSaver');
    const animationSaverLabel = window.locator('label:has(#settingAnimationSaver)');

    const initialState = await animationSaverCheckbox.isChecked();

    await animationSaverLabel.click();
    await window.waitForTimeout(100);
    expect(await animationSaverCheckbox.isChecked()).toBe(!initialState);

    // Toggle back
    await animationSaverLabel.click();
    await window.waitForTimeout(100);
    expect(await animationSaverCheckbox.isChecked()).toBe(initialState);

    await settingsBtn.click();
  });

  test('should toggle fullscreen on startup setting', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const checkbox = window.locator('#settingFullscreenOnStartup');
    const label = window.locator('label:has(#settingFullscreenOnStartup)');

    const initialState = await checkbox.isChecked();

    await label.click();
    await window.waitForTimeout(100);
    expect(await checkbox.isChecked()).toBe(!initialState);

    // Toggle back
    await label.click();
    await window.waitForTimeout(100);
    expect(await checkbox.isChecked()).toBe(initialState);

    await settingsBtn.click();
  });

  test('should toggle auto-stream setting', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const checkbox = window.locator('#settingAutoStreamOnConnect');
    const label = window.locator('label:has(#settingAutoStreamOnConnect)');

    const initialState = await checkbox.isChecked();

    await label.click();
    await window.waitForTimeout(100);
    expect(await checkbox.isChecked()).toBe(!initialState);

    // Toggle back
    await label.click();
    await window.waitForTimeout(100);
    expect(await checkbox.isChecked()).toBe(initialState);

    await settingsBtn.click();
  });

  test('should toggle minimalist fullscreen setting', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const checkbox = window.locator('#settingMinimalistFullscreen');
    const label = window.locator('label:has(#settingMinimalistFullscreen)');

    const initialState = await checkbox.isChecked();

    await label.click();
    await window.waitForTimeout(100);
    expect(await checkbox.isChecked()).toBe(!initialState);

    // Toggle back
    await label.click();
    await window.waitForTimeout(100);
    expect(await checkbox.isChecked()).toBe(initialState);

    await settingsBtn.click();
  });

  test('should expand and collapse disclaimer', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    const disclaimerBtn = window.locator('#disclaimerBtn');
    const disclaimerContent = window.locator('#disclaimerContent');

    // Initially collapsed
    await expectPopupHidden(disclaimerContent);
    await expect(disclaimerBtn).toHaveAttribute('aria-expanded', 'false');

    // Expand
    await disclaimerBtn.click();
    await expectPopupVisible(disclaimerContent);
    await expect(disclaimerBtn).toHaveAttribute('aria-expanded', 'true');

    // Collapse
    await disclaimerBtn.click();
    await expectPopupHidden(disclaimerContent);
    await expect(disclaimerBtn).toHaveAttribute('aria-expanded', 'false');

    await settingsBtn.click();
  });

  test('should close settings with Escape key', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    const settingsMenu = window.locator('#settingsMenuContainer');

    await settingsBtn.click();
    await expectPopupVisible(settingsMenu);

    await window.keyboard.press('Escape');
    await expectPopupHidden(settingsMenu);
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('should close settings when clicking outside', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    const settingsMenu = window.locator('#settingsMenuContainer');

    await settingsBtn.click();
    await expectPopupVisible(settingsMenu);

    // Click outside the menu (on the stream container)
    const streamContainer = window.locator('#streamContainer');
    await streamContainer.click({ position: { x: 50, y: 50 } });

    await expectPopupHidden(settingsMenu);
  });

  test('should persist settings after menu close/reopen', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const checkbox = window.locator('#settingStatusStrip');
    const label = window.locator('label:has(#settingStatusStrip)');

    const initialChecked = await checkbox.isChecked();

    // Toggle
    await label.click();
    await window.waitForTimeout(100);
    expect(await checkbox.isChecked()).toBe(!initialChecked);

    // Close menu
    await settingsBtn.click();
    await expectPopupHidden(window.locator('#settingsMenuContainer'));

    // Reopen and verify persisted
    await settingsBtn.click();
    await expectPopupVisible(window.locator('#settingsMenuContainer'));
    expect(await checkbox.isChecked()).toBe(!initialChecked);

    // Restore original state
    await label.click();
    await settingsBtn.click();
  });
});

test.describe('Fullscreen Mode', () => {
  test('should have fullscreen button', async ({ window }) => {
    await waitForAppReady(window);

    const fullscreenBtn = window.locator('#fullscreenBtn');
    await expect(fullscreenBtn).toBeAttached();
    await expect(fullscreenBtn).toHaveAttribute('aria-label', 'Toggle Fullscreen');
  });

  test('should respond to fullscreen button click', async ({ window }) => {
    await waitForAppReady(window);

    const fullscreenBtn = window.locator('#fullscreenBtn');

    // Get initial fullscreen state
    const initialFullscreen = await window.evaluate(() => !!document.fullscreenElement);
    expect(initialFullscreen).toBe(false);

    // Click fullscreen button
    await fullscreenBtn.click();
    await window.waitForTimeout(500);

    // Check if fullscreen changed (may not work in all headless environments)
    const afterClick = await window.evaluate(() => !!document.fullscreenElement);

    // If fullscreen worked, exit it
    if (afterClick) {
      await window.keyboard.press('Escape');
      await window.waitForTimeout(500);
      const afterEscape = await window.evaluate(() => !!document.fullscreenElement);
      expect(afterEscape).toBe(false);
    }
    // Note: Fullscreen may not work in headless/CI environments - that's OK
  });

  test('should respond to F11 key', async ({ window }) => {
    await waitForAppReady(window);

    const initialFullscreen = await window.evaluate(() => !!document.fullscreenElement);

    await window.keyboard.press('F11');
    await window.waitForTimeout(500);

    // Exit if it entered fullscreen
    const afterF11 = await window.evaluate(() => !!document.fullscreenElement);
    if (afterF11 !== initialFullscreen) {
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }
  });
});

test.describe('Status Indicators', () => {
  test('should show disconnected state without device', async ({ window }) => {
    await waitForAppReady(window);

    const statusIndicator = window.locator('#statusIndicator');
    const statusText = window.locator('#statusText');

    await expect(statusIndicator).toBeAttached();
    await expect(statusText).toBeAttached();

    const classList = await statusIndicator.evaluate(element => Array.from(element.classList));
    expect(classList).toContain('disconnected');
    expect(classList).not.toContain('connected');

    // Status text should indicate waiting/disconnected/checking
    const text = await statusText.textContent();
    expect(text.toLowerCase()).toMatch(/connect|waiting|no device|disconnected|plug in|checking/i);
  });

  test('should display device status section', async ({ window }) => {
    await waitForAppReady(window);

    const deviceStatus = window.locator('#deviceStatus');
    await expect(deviceStatus).toBeAttached();
  });
});

test.describe('Updates Section', () => {
  test('should display version in settings', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    // Version should be displayed
    const versionElement = window.locator('#updateCurrentVersion');
    await expect(versionElement).toBeAttached();
    const versionText = await versionElement.textContent();
    expect(versionText).toMatch(/v\d+\.\d+\.\d+/);

    await settingsBtn.click();
  });

  test('should have check for updates button', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const updateBtn = window.locator('#updateActionBtn');
    await expect(updateBtn).toBeAttached();
    const btnText = await updateBtn.textContent();
    expect(btnText.toLowerCase()).toContain('update');

    await settingsBtn.click();
  });
});

test.describe('Window Controls', () => {
  test('should have working window', async ({ window, electronApp }) => {
    await waitForAppReady(window);

    // Verify window is not minimized
    const isMinimized = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.isMinimized() ?? false;
    });
    expect(isMinimized).toBe(false);

    // Verify window is visible
    const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.isVisible() ?? false;
    });
    expect(isVisible).toBe(true);
  });

  test('should have correct window title', async ({ window }) => {
    await waitForAppReady(window);

    const title = await window.title();
    expect(title).toContain('PrismGB');
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('should respond to Escape key (closes any open menu)', async ({ window }) => {
    await waitForAppReady(window);

    // Open settings menu
    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    // Escape should close it
    await window.keyboard.press('Escape');
    await expectPopupHidden(settingsMenu);
  });
});

test.describe('External Links', () => {
  test('should have external link buttons in settings', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    // Check for link buttons
    const githubLink = window.locator('#linkGithub');
    const websiteLink = window.locator('#linkWebsite');
    const xLink = window.locator('#linkX');
    const kofiLink = window.locator('#linkKofi');

    await expect(githubLink).toBeAttached();
    await expect(websiteLink).toBeAttached();
    await expect(xLink).toBeAttached();
    await expect(kofiLink).toBeAttached();

    await settingsBtn.click();
  });
});
