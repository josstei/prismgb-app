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

    await expect(this.page.locator('body')).toHaveAttribute('data-prismgb-app-started', 'true', { timeout });
  }

  async expectSettingsExpanded(expanded) {
    await expect(this.settingsButton).toHaveAttribute('aria-expanded', String(expanded));
  }

}
