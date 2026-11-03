/**
 * Native fullscreen transitions can hide and show the document. Rendering must
 * pause while hidden and resume with the live video after each transition.
 * The Electron fixture uses Canvas2D, so compare rendered pixels with the input
 * video instead of relying on diagnostic logs or an already populated canvas.
 */

import { test, expect } from './fixtures/electron.fixture.js';

async function setDocumentHidden(page, hidden) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function readPatternColor(page, selector) {
  return page.locator(selector).evaluate((source) => {
    const isVideo = source instanceof HTMLVideoElement;
    const width = isVideo ? source.videoWidth : source.width;
    const height = isVideo ? source.videoHeight : source.height;
    if (!width || !height) return 'empty';

    const sample = document.createElement('canvas');
    sample.width = sample.height = 1;
    const context = sample.getContext('2d');
    // The first color bar is white; sample its center, away from boundaries.
    context.drawImage(source, Math.floor(width / 16), Math.floor(height / 2), 1, 1, 0, 0, 1, 1);
    const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    if (rgb.every((value) => value > 230)) return 'white';
    if (rgb.every((value) => value > 110 && value < 145)) return 'gray';
    return `other: ${rgb.join(',')}`;
  });
}

async function waitForInputFrames(page) {
  await page.locator('#streamVideo').evaluate((video) => new Promise((resolve) => {
    let frames = 0;
    const nextFrame = () => {
      if (++frames === 3) resolve();
      else video.requestVideoFrameCallback(nextFrame);
    };
    video.requestVideoFrameCallback(nextFrame);
  }));
}

test.setTimeout(45000);

test.describe('Streaming render visibility regression', () => {
  test('resumes canvas rendering after a window hidden -> visible round-trip', async ({
    appShell,
    chromaticDevice,
    streamPage,
    page,
  }) => {
    await appShell.waitForReady();
    await chromaticDevice.connect({ testPattern: 'solid-gray' });
    await streamPage.start();

    await expect.poll(() => readPatternColor(page, '#streamCanvas'), {
      timeout: 15000,
      message: 'the initial input frame should reach the rendering canvas',
    }).toBe('gray');

    let renderedColor = 'gray';
    for (const [pattern, nextColor] of [['color-bars', 'white'], ['solid-gray', 'gray']]) {
      await setDocumentHidden(page, true);
      await chromaticDevice.setTestPattern(pattern);
      await expect.poll(() => readPatternColor(page, '#streamVideo'), {
        message: 'input video should continue receiving the changed pattern while hidden',
      }).toBe(nextColor);
      await waitForInputFrames(page);
      expect(await readPatternColor(page, '#streamCanvas'), 'hidden rendering should stay paused')
        .toBe(renderedColor);

      await setDocumentHidden(page, false);
      await expect.poll(() => readPatternColor(page, '#streamCanvas'), {
        message: 'visible rendering should resume and present the new input frame',
      }).toBe(nextColor);
      renderedColor = nextColor;
    }
  });
});
