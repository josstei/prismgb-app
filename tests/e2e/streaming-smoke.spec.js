/**
 * Streaming smoke E2E coverage using the supported mock Chromatic device.
 *
 * This complements the manual smoke checklist with deterministic app-level
 * coverage for environments where real hardware is not attached.
 */

import {
  test,
  expect,
  waitForAppReady,
  injectDeviceConnectedEvent,
  injectDeviceDisconnectedEvent,
  setMockDeviceStatus,
  clearMockDeviceStatus,
} from './fixtures/electron.fixture.js';
import {
  cleanupMockDevice,
  CHROMATIC_SPECS,
  injectMockChromaticDevice,
} from './helpers/mock-chromatic.helper.js';

async function connectMockChromatic(electronApp, window) {
  await injectMockChromaticDevice(window, { autoConnect: true, testPattern: 'animated' });
  await setMockDeviceStatus(electronApp, {
    connected: true,
    device: {
      vendorId: CHROMATIC_SPECS.vendorId,
      productId: CHROMATIC_SPECS.productId,
      deviceName: CHROMATIC_SPECS.label,
      configName: CHROMATIC_SPECS.configName,
    },
  });
  await injectDeviceConnectedEvent(electronApp);

  await expect(async () => {
    const classes = await window.locator('#statusIndicator').getAttribute('class');
    expect(classes).toContain('connected');
  }).toPass({ timeout: 5000 });

  await expect(async () => {
    const devices = await window.evaluate(async () => {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      return mediaDevices.map((device) => ({
        kind: device.kind,
        label: device.label,
      }));
    });

    expect(devices).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'videoinput', label: CHROMATIC_SPECS.label }),
      expect.objectContaining({ kind: 'audioinput', label: `${CHROMATIC_SPECS.label} Audio` }),
    ]));
  }).toPass({ timeout: 5000 });

  await expect(window.locator('#streamOverlay')).not.toHaveClass(/hidden/);
}

async function startStreaming(window) {
  const overlay = window.locator('#streamOverlay');

  await expect(overlay).toBeVisible();
  await expect(overlay).not.toHaveClass(/hidden/);
  await overlay.click({ force: true });

  await expect(async () => {
    const bodyClasses = await window.evaluate(() => document.body.className);
    expect(bodyClasses).toContain('streaming-mode');
  }).toPass({ timeout: 10000 });

  await expect(window.locator('#screenshotBtn')).toBeEnabled();
  await expect(window.locator('#recordBtn')).toBeEnabled();
}

async function stopStreaming(window) {
  await window.locator('#streamCanvas').click({ force: true });
  await expect(async () => {
    const bodyClasses = await window.evaluate(() => document.body.className);
    expect(bodyClasses).not.toContain('streaming-mode');
  }).toPass({ timeout: 5000 });
}

async function suppressDownloads(window) {
  await window.evaluate(() => {
    window.__smokeDownloads = [];

    if (window.__smokeDownloadPatchInstalled) {
      return;
    }

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patchedAnchorClick() {
      if (this.download) {
        window.__smokeDownloads.push({
          filename: this.download,
          hrefPrefix: this.href.slice(0, 16),
        });
        return;
      }

      return originalClick.call(this);
    };

    window.__smokeDownloadPatchInstalled = true;
  });
}

async function getSmokeDownloads(window) {
  return window.evaluate(() => window.__smokeDownloads ?? []);
}

async function selectAlternateShaderPreset(window) {
  await window.locator('#shaderBtn').click();
  await expect(window.locator('#shaderDropdown')).toHaveClass(/visible/);

  const alternateOption = window.locator('#shaderOptions .shader-option:not(.active)').first();
  await expect(alternateOption).toBeAttached();
  const presetId = await alternateOption.getAttribute('data-preset-id');
  await alternateOption.click();

  await expect(window.locator(`#shaderOptions .shader-option[data-preset-id="${presetId}"]`)).toHaveClass(/active/);
  await window.locator('#shaderBtn').click();
}

async function setPerformanceMode(window, enabled) {
  const settingsBtn = window.locator('#settingsBtn');
  const checkbox = window.locator('#settingAnimationSaver');
  const label = window.locator('label:has(#settingAnimationSaver)');

  await settingsBtn.click();
  await expect(settingsBtn).toHaveAttribute('aria-expanded', 'true');

  if ((await checkbox.isChecked()) !== enabled) {
    await label.click();
  }

  await expect(checkbox).toBeChecked({ checked: enabled });
  await settingsBtn.click();
  await expect(settingsBtn).toHaveAttribute('aria-expanded', 'false');
}

test.describe('Streaming Smoke with Mock Chromatic', () => {
  test.afterEach(async ({ electronApp, window }) => {
    await cleanupMockDevice(window);
    await clearMockDeviceStatus(electronApp);
  });

  test('exercises stream, shader, fallback, screenshot, recording, and stop paths', async ({ electronApp, window }) => {
    await waitForAppReady(window);
    await suppressDownloads(window);
    await connectMockChromatic(electronApp, window);

    await startStreaming(window);

    await expect(window.locator('#screenshotBtn')).toBeEnabled();
    await expect(window.locator('#recordBtn')).toBeEnabled();

    await selectAlternateShaderPreset(window);

    await setPerformanceMode(window, true);
    await window.locator('#shaderBtn').click();
    await expect(window.locator('#shaderUnavailableMessage')).not.toHaveClass(/hidden/);
    await window.locator('#shaderBtn').click();

    await setPerformanceMode(window, false);
    await window.locator('#shaderBtn').click();
    await expect(window.locator('#shaderOptions')).not.toHaveClass(/hidden/);
    await window.locator('#shaderBtn').click();

    await window.locator('#screenshotBtn').click();
    await expect(window.locator('#statusMessage')).toContainText('Screenshot saved', { timeout: 5000 });

    await window.locator('#recordBtn').click();
    await expect(window.locator('#recordBtn')).toHaveClass(/recording/);

    await window.waitForTimeout(1200);
    await window.locator('#recordBtn').click();
    await expect(window.locator('#recordBtn')).not.toHaveClass(/recording/, { timeout: 5000 });
    await expect(window.locator('#statusMessage')).toContainText('Recording saved', { timeout: 7000 });

    const downloads = await getSmokeDownloads(window);
    expect(downloads.some((download) => download.filename.endsWith('.png'))).toBe(true);
    expect(downloads.some((download) => download.filename.endsWith('.webm'))).toBe(true);

    await stopStreaming(window);
  });

  test('stops an active stream when the mock device disconnects', async ({ electronApp, window }) => {
    await waitForAppReady(window);
    await connectMockChromatic(electronApp, window);
    await startStreaming(window);

    await setMockDeviceStatus(electronApp, { connected: false, device: null });
    await injectDeviceDisconnectedEvent(electronApp);

    await expect(async () => {
      const bodyClasses = await window.evaluate(() => document.body.className);
      expect(bodyClasses).not.toContain('streaming-mode');
    }).toPass({ timeout: 5000 });
  });
});

test.describe('Streaming Smoke Cleanup', () => {
  test('closes cleanly while recording is active', async ({ electronApp, window }) => {
    await waitForAppReady(window);
    await suppressDownloads(window);
    await connectMockChromatic(electronApp, window);
    await startStreaming(window);

    await window.locator('#recordBtn').click();
    await expect(window.locator('#recordBtn')).toHaveClass(/recording/);

    await Promise.race([
      electronApp.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Electron close timed out')), 7000)),
    ]);
  });
});
