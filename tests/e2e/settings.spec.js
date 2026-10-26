import { test, expect } from './fixtures/electron.fixture.js';
import { SettingsSelectors, SettingsTestControls } from './pages/settings.page.js';

test('renders canonical settings and persists every boolean across menu reopening', async ({ settingsMenu }) => {
  await settingsMenu.waitForAppReady();
  await settingsMenu.expectClosed();
  await settingsMenu.open();
  for (const name of Object.keys(SettingsSelectors.controls)) await settingsMenu.expectControlAttached(name);
  const changes = [];
  for (const { settingName } of SettingsTestControls.toggleableBooleanControls) {
    const { initial, current } = await settingsMenu.toggleBoolean(settingName);
    expect(current).not.toBe(initial);
    changes.push({ settingName, initial, current });
  }
  await settingsMenu.close();
  await settingsMenu.open();
  for (const { settingName, current } of changes) {
    await expect(settingsMenu.checkbox(settingName)).toBeChecked({ checked: current });
  }
  for (const { settingName, initial } of changes) await settingsMenu.setBoolean(settingName, initial);
  await settingsMenu.close();
});

test('supports disclosure, outside dismissal, update metadata and external links', async ({ settingsMenu }) => {
  await settingsMenu.waitForAppReady();
  await settingsMenu.open();
  await expect(settingsMenu.disclaimerButton).toHaveAttribute('aria-expanded', 'false');
  await settingsMenu.expandDisclaimer();
  await settingsMenu.collapseDisclaimer();
  await expect(settingsMenu.currentVersion).toHaveText(/v\d+\.\d+\.\d+/);
  await expect(settingsMenu.updateActionButton).toContainText(/update/i);
  for (const link of Object.values(settingsMenu.externalLinks)) await expect(link).toBeAttached();
  await settingsMenu.clickOutside();
  await settingsMenu.open();
  await settingsMenu.close();
});

test('opens with Enter, moves keyboard focus into settings and dismisses with Escape', async ({ settingsMenu }) => {
  await settingsMenu.waitForAppReady();
  await settingsMenu.button.focus();
  await settingsMenu.page.keyboard.press('Enter');
  await settingsMenu.expectOpen();
  await settingsMenu.page.keyboard.press('Tab');
  const focused = await settingsMenu.page.evaluate(() => ({
    id: document.activeElement?.id,
    inMenu: Boolean(document.activeElement?.closest('#settingsMenuContainer')),
  }));
  expect(focused.id).toBeTruthy();
  expect(focused.inMenu).toBe(true);
  await settingsMenu.pressEscape();
});
