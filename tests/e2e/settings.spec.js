/**
 * Settings E2E Tests
 *
 * Tests for the settings menu interactions and preferences.
 *
 * IMPORTANT: This app uses CSS-based visibility with `.visible` class on
 * `.popup-animated` elements (opacity + pointer-events), so we use
 * class-based or aria-based checks instead of Playwright's toBeHidden/toBeVisible.
 */

import { test, expect, waitForAppReady } from './fixtures/electron.fixture.js';

/**
 * Check if a popup element is visible (has .visible class)
 */
async function isPopupVisible(locator) {
  const classes = await locator.getAttribute('class');
  return classes?.includes('visible') ?? false;
}

/**
 * Wait for popup to become visible
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
 */
async function expectPopupHidden(locator, options = {}) {
  const { timeout = 5000 } = options;
  await expect(async () => {
    const visible = await isPopupVisible(locator);
    expect(visible).toBe(false);
  }).toPass({ timeout });
}

test.describe('Settings Menu', () => {
  test('should toggle settings menu on button click', async ({ window }) => {
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

    // Click to close
    await settingsBtn.click();
    await expectPopupHidden(settingsMenu);
    await expect(settingsBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('should display all setting options', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    // Check for setting toggles that exist
    const statusStrip = window.locator('#settingStatusStrip');
    const animationSaver = window.locator('#settingAnimationSaver');
    const fullscreenOnStartup = window.locator('#settingFullscreenOnStartup');
    const autoStreamOnConnect = window.locator('#settingAutoStreamOnConnect');
    const minimalistFullscreen = window.locator('#settingMinimalistFullscreen');

    await expect(statusStrip).toBeAttached();
    await expect(animationSaver).toBeAttached();
    await expect(fullscreenOnStartup).toBeAttached();
    await expect(autoStreamOnConnect).toBeAttached();
    await expect(minimalistFullscreen).toBeAttached();

    await settingsBtn.click();
  });

  test('should toggle status strip setting', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    const statusStripCheckbox = window.locator('#settingStatusStrip');
    const statusStripLabel = window.locator('label:has(#settingStatusStrip)');

    const initialState = await statusStripCheckbox.isChecked();

    // Click the label to toggle (not the hidden checkbox)
    await statusStripLabel.click();
    await window.waitForTimeout(100);

    const newState = await statusStripCheckbox.isChecked();
    expect(newState).not.toBe(initialState);

    // Toggle back
    await statusStripLabel.click();
    await settingsBtn.click();
  });

  test('should close menu when clicking outside', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    const settingsMenu = window.locator('#settingsMenuContainer');

    // Open menu
    await settingsBtn.click();
    await expectPopupVisible(settingsMenu);

    // Click outside (on stream container)
    const streamContainer = window.locator('#streamContainer');
    await streamContainer.click({ position: { x: 50, y: 50 } });

    // Menu should close
    await expectPopupHidden(settingsMenu);
  });

  test('should show disclaimer section', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    const disclaimerBtn = window.locator('#disclaimerBtn');
    await expect(disclaimerBtn).toBeAttached();

    // Click to expand disclaimer
    await disclaimerBtn.click();

    const disclaimerContent = window.locator('#disclaimerContent');
    await expectPopupVisible(disclaimerContent);
    await expect(disclaimerBtn).toHaveAttribute('aria-expanded', 'true');

    // Collapse
    await disclaimerBtn.click();
    await expectPopupHidden(disclaimerContent);

    await settingsBtn.click();
  });
});

test.describe('Settings Persistence', () => {
  test('should reflect saved settings on menu open', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    const animationSaverCheckbox = window.locator('#settingAnimationSaver');
    const animationSaverLabel = window.locator('label:has(#settingAnimationSaver)');

    const initialState = await animationSaverCheckbox.isChecked();

    // Toggle it
    await animationSaverLabel.click();
    await window.waitForTimeout(100);
    const toggledState = await animationSaverCheckbox.isChecked();
    expect(toggledState).not.toBe(initialState);

    // Close and reopen
    await settingsBtn.click();
    await expectPopupHidden(settingsMenu);

    await settingsBtn.click();
    await expectPopupVisible(settingsMenu);

    // State should persist
    const persistedState = await animationSaverCheckbox.isChecked();
    expect(persistedState).toBe(toggledState);

    // Restore original state
    await animationSaverLabel.click();
    await settingsBtn.click();
  });
});

test.describe('Settings Keyboard Navigation', () => {
  test('should open settings menu with Enter key', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    const settingsMenu = window.locator('#settingsMenuContainer');

    // Focus the button
    await settingsBtn.focus();

    // Press Enter to activate
    await window.keyboard.press('Enter');

    await expectPopupVisible(settingsMenu);

    // Clean up
    await window.keyboard.press('Escape');
  });

  test('should close settings menu with Escape key', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    const settingsMenu = window.locator('#settingsMenuContainer');

    // Open menu
    await settingsBtn.click();
    await expectPopupVisible(settingsMenu);

    // Press Escape to close
    await window.keyboard.press('Escape');

    await expectPopupHidden(settingsMenu);
  });

  test('should navigate settings with Tab key', async ({ window }) => {
    await waitForAppReady(window);

    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    const settingsMenu = window.locator('#settingsMenuContainer');
    await expectPopupVisible(settingsMenu);

    // Tab through settings
    await window.keyboard.press('Tab');

    // Check that a setting element has focus
    const focusedElement = await window.evaluate(() => document.activeElement?.id);
    expect(focusedElement).toBeTruthy();

    await window.keyboard.press('Escape');
  });
});
