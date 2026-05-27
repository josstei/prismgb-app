/**
 * Settings E2E Tests
 *
 * Tests for settings menu interactions and preferences.
 */

import { test, expect } from './fixtures/electron.fixture.js';
import { SettingsSelectors, SettingsTestControls } from './pages/settings.page.js';

test.setTimeout(45000);

test.describe('Settings Menu', () => {
  test('should toggle settings menu on button click', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();

    await settingsMenu.expectClosed();
    await settingsMenu.open();
    await settingsMenu.close();
  });

  test('should display all setting options', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    for (const settingName of Object.keys(SettingsSelectors.controls)) {
      await settingsMenu.expectControlAttached(settingName);
    }

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

  test('should close menu when clicking outside', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await settingsMenu.clickOutside();
  });

  test('should show disclaimer section', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await expect(settingsMenu.disclaimerButton).toBeAttached();
    await settingsMenu.expandDisclaimer();
    await settingsMenu.collapseDisclaimer();

    await settingsMenu.close();
  });
});

test.describe('Settings Persistence', () => {
  test('should reflect saved settings on menu open', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    const { initial, current } = await settingsMenu.toggleBoolean('animationSaver');
    expect(current).not.toBe(initial);

    await settingsMenu.close();
    await settingsMenu.open();

    await expect(settingsMenu.checkbox('animationSaver')).toBeChecked({ checked: current });

    await settingsMenu.setBoolean('animationSaver', initial);
    await settingsMenu.close();
  });
});

test.describe('Settings Keyboard Navigation', () => {
  test('should open settings menu with Enter key', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();

    await settingsMenu.button.focus();
    await settingsMenu.page.keyboard.press('Enter');

    await settingsMenu.expectOpen();
    await settingsMenu.pressEscape();
  });

  test('should close settings menu with Escape key', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await settingsMenu.pressEscape();
  });

  test('should navigate settings with Tab key', async ({ settingsMenu }) => {
    await settingsMenu.waitForAppReady();
    await settingsMenu.open();

    await settingsMenu.page.keyboard.press('Tab');

    const focusedElement = await settingsMenu.page.evaluate(() => document.activeElement?.id);
    expect(focusedElement).toBeTruthy();

    await settingsMenu.pressEscape();
  });
});
