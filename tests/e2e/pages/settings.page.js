import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppShellPage, AppSelectors, expectPopupHidden, expectPopupVisible } from './app-shell.page.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsDefinitionsPath = path.resolve(
  __dirname,
  '../../../src/shared/features/settings/settings.definitions.json'
);

function readSettingsDefinitions() {
  return JSON.parse(fs.readFileSync(settingsDefinitionsPath, 'utf8')).definitions;
}

function getControlName(definition) {
  return definition.ui.controlName ?? definition.name;
}

function createSettingsControlMetadata() {
  const definitions = readSettingsDefinitions().filter((definition) => definition.ui?.controlId);
  const controls = Object.fromEntries(
    definitions.map((definition) => [
      getControlName(definition),
      `#${definition.ui.controlId}`,
    ])
  );
  const toggleableBooleanControls = definitions
    .filter((definition) =>
      definition.type === 'boolean'
      && definition.ui.controlType === 'checkbox'
      && definition.ui.e2eToggle !== false
      && definition.protected !== true
    )
    .map((definition) => ({
      settingName: getControlName(definition),
      definitionName: definition.name,
      label: definition.ui.label,
    }));

  return Object.freeze({
    controls: Object.freeze(controls),
    toggleableBooleanControls: Object.freeze(toggleableBooleanControls),
  });
}

export const SettingsTestControls = createSettingsControlMetadata();

export const SettingsSelectors = Object.freeze({
  menu: AppSelectors.settingsMenu,
  disclaimerButton: '#disclaimerBtn',
  disclaimerContent: '#disclaimerContent',
  currentVersion: '#updateCurrentVersion',
  updateActionButton: '#updateActionBtn',
  externalLinks: Object.freeze({
    github: '#linkGithub',
    website: '#linkWebsite',
    x: '#linkX',
    kofi: '#linkKofi',
  }),
  controls: SettingsTestControls.controls,
});

export class SettingsMenuPage {
  constructor(page) {
    this.page = page;
    this.appShell = new AppShellPage(page);
    this.button = this.appShell.settingsButton;
    this.menu = page.locator(SettingsSelectors.menu);
    this.disclaimerButton = page.locator(SettingsSelectors.disclaimerButton);
    this.disclaimerContent = page.locator(SettingsSelectors.disclaimerContent);
    this.currentVersion = page.locator(SettingsSelectors.currentVersion);
    this.updateActionButton = page.locator(SettingsSelectors.updateActionButton);
    this.externalLinks = Object.fromEntries(
      Object.entries(SettingsSelectors.externalLinks).map(([name, selector]) => [
        name,
        page.locator(selector),
      ])
    );
  }

  async waitForAppReady(options = {}) {
    await this.appShell.waitForReady(options);
  }

  async expectOpen(options = {}) {
    await expectPopupVisible(this.menu, options);
    await this.appShell.expectSettingsExpanded(true);
  }

  async expectClosed(options = {}) {
    await expectPopupHidden(this.menu, options);
    await this.appShell.expectSettingsExpanded(false);
  }

  async open() {
    await this.button.click({ force: true });
    await this.expectOpen();
  }

  async close() {
    await this.button.click({ force: true });
    await this.expectClosed();
  }

  checkbox(settingName) {
    return this.page.locator(this.#settingSelector(settingName));
  }

  label(settingName) {
    return this.page.locator(`label:has(${this.#settingSelector(settingName)})`);
  }

  async expectControlAttached(settingName) {
    await expect(this.checkbox(settingName)).toBeAttached();
  }

  async toggleBoolean(settingName) {
    const checkbox = this.checkbox(settingName);
    const initial = await checkbox.isChecked();

    await this.label(settingName).click({ force: true });
    await this.page.waitForTimeout(100);

    return {
      initial,
      current: await checkbox.isChecked(),
    };
  }

  async setBoolean(settingName, enabled) {
    const checkbox = this.checkbox(settingName);
    if ((await checkbox.isChecked()) !== enabled) {
      await this.label(settingName).click({ force: true });
      await this.page.waitForTimeout(100);
    }
    await expect(checkbox).toBeChecked({ checked: enabled });
  }

  async setBooleanInMenu(settingName, enabled) {
    await this.open();
    await this.setBoolean(settingName, enabled);
    await this.close();
  }

  async clickOutside() {
    await this.appShell.streamContainer.click({ force: true, position: { x: 50, y: 50 } });
    await this.expectClosed();
  }

  async pressEscape() {
    await this.page.keyboard.press('Escape');
    await this.expectClosed();
  }

  async expandDisclaimer() {
    await this.disclaimerButton.click({ force: true });
    await expectPopupVisible(this.disclaimerContent);
    await expect(this.disclaimerButton).toHaveAttribute('aria-expanded', 'true');
  }

  async collapseDisclaimer() {
    await this.disclaimerButton.click({ force: true });
    await expectPopupHidden(this.disclaimerContent);
    await expect(this.disclaimerButton).toHaveAttribute('aria-expanded', 'false');
  }

  #settingSelector(settingName) {
    const selector = SettingsSelectors.controls[settingName];
    if (!selector) {
      throw new Error(`Unknown settings control: ${settingName}`);
    }
    return selector;
  }
}
