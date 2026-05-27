import { expect } from '@playwright/test';

export const AppSelectors = Object.freeze({
  header: '.header',
  streamContainer: '#streamContainer',
  settingsButton: '#settingsBtn',
  settingsMenu: '#settingsMenuContainer',
  fullscreenButton: '#fullscreenBtn',
  fullscreenControls: '#fullscreenControls',
  fullscreenExitButton: '#fsExitBtn',
  deviceStatus: '#deviceStatus',
  statusIndicator: '#statusIndicator',
  statusText: '#statusText',
});

export async function isPopupVisible(locator) {
  const classes = await locator.getAttribute('class');
  return classes?.includes('visible') ?? false;
}

export async function expectPopupVisible(locator, options = {}) {
  const { timeout = 5000 } = options;
  await expect(async () => {
    expect(await isPopupVisible(locator)).toBe(true);
  }).toPass({ timeout });
}

export async function expectPopupHidden(locator, options = {}) {
  const { timeout = 5000 } = options;
  await expect(async () => {
    expect(await isPopupVisible(locator)).toBe(false);
  }).toPass({ timeout });
}

export class AppShellPage {
  constructor(page) {
    this.page = page;
    this.header = page.locator(AppSelectors.header);
    this.streamContainer = page.locator(AppSelectors.streamContainer);
    this.settingsButton = page.locator(AppSelectors.settingsButton);
    this.settingsMenu = page.locator(AppSelectors.settingsMenu);
    this.fullscreenButton = page.locator(AppSelectors.fullscreenButton);
    this.fullscreenControls = page.locator(AppSelectors.fullscreenControls);
    this.fullscreenExitButton = page.locator(AppSelectors.fullscreenExitButton);
    this.deviceStatus = page.locator(AppSelectors.deviceStatus);
    this.statusIndicator = page.locator(AppSelectors.statusIndicator);
    this.statusText = page.locator(AppSelectors.statusText);
  }

  async waitForReady(options = {}) {
    const { timeout = 40000 } = options;

    await this.page.waitForSelector(AppSelectors.streamContainer, { timeout, state: 'visible' });
    await this.page.waitForSelector(AppSelectors.statusIndicator, { timeout, state: 'attached' });
    await this.page.waitForSelector(AppSelectors.settingsButton, { timeout, state: 'attached' });
    await this.page.waitForSelector(AppSelectors.header, { timeout, state: 'visible' });
    await this.page.waitForFunction(
      () => document.body.dataset.prismgbAppStarted === 'true',
      undefined,
      { timeout }
    );
    await this.page.waitForFunction(
      () => {
        const btn = document.getElementById('settingsBtn');
        return btn && btn.hasAttribute('aria-expanded');
      },
      undefined,
      { timeout }
    );
  }

  async expectSettingsExpanded(expanded) {
    await expect(this.settingsButton).toHaveAttribute('aria-expanded', String(expanded));
  }

  async isFullscreen() {
    return this.page.evaluate(() => document.fullscreenElement !== null);
  }

  async toggleFullscreenButton() {
    await this.fullscreenButton.click({ force: true });
    await this.page.waitForTimeout(500);
  }

  async pressEscape() {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
  }

  async pressF11() {
    await this.page.keyboard.press('F11');
    await this.page.waitForTimeout(500);
  }
}
