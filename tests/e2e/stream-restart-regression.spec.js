/**
 * Regression: restarting a stream after a stop must produce a working render
 * pipeline. Terminating a WebGPU session leaves the canvas permanently
 * transferred, so the stop path must trigger canvas recreation — otherwise
 * every subsequent start fails with "Cannot transfer control from a canvas
 * for more than one time" and the stream immediately self-stops.
 */

import { test, expect } from './fixtures/electron.fixture.js';

test.setTimeout(45000);

const RENDER_PIPELINE_ERROR_PATTERNS = [
  'Cannot transfer control from a canvas',
  'Failed to initialize worker renderer',
  'Failed to initialize session',
];

function collectRenderPipelineErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (RENDER_PIPELINE_ERROR_PATTERNS.some((pattern) => text.includes(pattern))) {
      errors.push(text);
    }
  });
  return errors;
}

test.describe('Stream Restart with Chromatic Media Environment', () => {
  test('restarts streaming after stop with a working render pipeline', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    const pipelineErrors = collectRenderPipelineErrors(streamPage.page);

    await appShell.waitForReady();
    await streamPage.suppressDownloads();
    await chromaticDevice.connect();

    await streamPage.start();
    await streamPage.stop();

    await streamPage.start();
    await streamPage.page.waitForTimeout(2000);
    await streamPage.expectStreaming({ timeout: 1000 });
    await streamPage.captureScreenshot();

    await streamPage.stop();

    expect(pipelineErrors).toEqual([]);
  });

  test('survives repeated stop/start cycles', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    const pipelineErrors = collectRenderPipelineErrors(streamPage.page);

    await appShell.waitForReady();
    await chromaticDevice.connect();

    for (let cycle = 0; cycle < 3; cycle++) {
      await streamPage.start();
      await streamPage.page.waitForTimeout(1500);
      await streamPage.expectStreaming({ timeout: 1000 });
      await streamPage.stop();
    }

    expect(pipelineErrors).toEqual([]);
  });
});
