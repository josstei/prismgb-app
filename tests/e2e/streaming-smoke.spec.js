/**
 * Streaming smoke E2E coverage using the supported Chromatic media environment.
 *
 * This complements the manual smoke checklist with deterministic app-level
 * coverage for environments where real hardware is not attached.
 */

import { test, expect } from './fixtures/electron.fixture.js';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
    await streamPage.stopRecording();

    await expect.poll(async () => (await streamPage.getDownloads()).length).toBe(2);
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
  test('saves the final WebM recording before closing', async ({
    appShell,
    chromaticDevice,
    electronApp,
    streamPage,
  }) => {
    const downloads = await mkdtemp(path.join(os.tmpdir(), 'prismgb-recording-shutdown-'));
    try {
      await electronApp.evaluate(({ app }, directory) => app.setPath('downloads', directory), downloads);
      await appShell.waitForReady();
      await chromaticDevice.connect();
      await streamPage.start();
      await streamPage.startRecording();

      let closeTimeout;
      try {
        await Promise.race([
          electronApp.close(),
          new Promise((_, reject) => {
            closeTimeout = setTimeout(() => reject(new Error('Electron close timed out')), 7000);
          }),
        ]);
      } finally {
        clearTimeout(closeTimeout);
      }

      const recordings = (await readdir(downloads)).filter((name) => name.endsWith('.webm'));
      expect(recordings).toHaveLength(1);
      expect(await readFile(path.join(downloads, recordings[0]), 'utf8'))
        .toContain('chromatic-recording-');
    } finally {
      await rm(downloads, { recursive: true, force: true });
    }
  });
});
