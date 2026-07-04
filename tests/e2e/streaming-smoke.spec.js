/**
 * Streaming smoke E2E coverage using the supported Chromatic media environment.
 *
 * This complements the manual smoke checklist with deterministic app-level
 * coverage for environments where real hardware is not attached.
 */

import { test, expect } from './fixtures/electron.fixture.js';

test.setTimeout(45000);

test.describe('Streaming Smoke with Chromatic Media Environment', () => {
  test('exercises stream, shader, fallback, screenshot, recording, and stop paths', async ({
    appShell,
    chromaticDevice,
    settingsMenu,
    streamPage,
  }) => {
    await appShell.waitForReady();
    await streamPage.suppressDownloads();
    await chromaticDevice.connect();

    await streamPage.start();
    await streamPage.expectCaptureControlsEnabled();
    await streamPage.selectAlternateShaderPreset();

    await settingsMenu.setBooleanInMenu('animationSaver', true);
    await streamPage.expectPerformanceShaderFallbackVisible();

    await settingsMenu.setBooleanInMenu('animationSaver', false);
    await streamPage.expectShaderOptionsVisible();

    await streamPage.captureScreenshot();
    await streamPage.startRecording();
    await streamPage.page.waitForTimeout(1200);
    await streamPage.stopRecording();

    const downloads = await streamPage.getDownloads();
    expect(downloads.some((download) => download.filename.endsWith('.png'))).toBe(true);
    expect(downloads.some((download) => download.filename.endsWith('.webm'))).toBe(true);

    await streamPage.stop();
  });

  test('stops an active stream when the Chromatic media environment disconnects', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    await appShell.waitForReady();
    await chromaticDevice.connect();
    await streamPage.start();

    await chromaticDevice.disconnect();
    await streamPage.expectStopped();
  });
});

test.describe('Streaming Smoke Cleanup', () => {
  test('closes cleanly while recording is active', async ({
    appShell,
    chromaticDevice,
    electronApp,
    streamPage,
  }) => {
    await appShell.waitForReady();
    await streamPage.suppressDownloads();
    await chromaticDevice.connect();
    await streamPage.start();

    await streamPage.startRecording();

    await Promise.race([
      electronApp.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Electron close timed out')), 7000)),
    ]);
  });
});
