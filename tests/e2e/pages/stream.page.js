import { expect } from '@playwright/test';

export const StreamSelectors = Object.freeze({
  overlay: '#streamOverlay',
  canvas: '#streamCanvas',
  screenshotButton: '#screenshotBtn',
  recordButton: '#recordBtn',
  shaderButton: '#shaderBtn',
  shaderDropdown: '#shaderDropdown',
  shaderOptions: '#shaderOptions',
  shaderUnavailableMessage: '#shaderUnavailableMessage',
  statusMessage: '#statusMessage',
  currentFps: '#currentFPS',
  currentResolution: '#currentResolution',
});

export class StreamPage {
  constructor(page) {
    this.page = page;
    this.overlay = page.locator(StreamSelectors.overlay);
    this.canvas = page.locator(StreamSelectors.canvas);
    this.screenshotButton = page.locator(StreamSelectors.screenshotButton);
    this.recordButton = page.locator(StreamSelectors.recordButton);
    this.shaderButton = page.locator(StreamSelectors.shaderButton);
    this.shaderDropdown = page.locator(StreamSelectors.shaderDropdown);
    this.shaderOptions = page.locator(StreamSelectors.shaderOptions);
    this.shaderUnavailableMessage = page.locator(StreamSelectors.shaderUnavailableMessage);
    this.statusMessage = page.locator(StreamSelectors.statusMessage);
    this.currentFps = page.locator(StreamSelectors.currentFps);
    this.currentResolution = page.locator(StreamSelectors.currentResolution);
  }

  async start() {
    await expect(this.overlay).toBeVisible();
    await expect(this.overlay).not.toHaveClass(/hidden/);
    await this.overlay.click({ force: true });

    await this.expectStreaming();
    await this.expectCaptureControlsEnabled();
  }

  async stop() {
    await this.canvas.click({ force: true });
    await this.expectStopped();
  }

  async expectStreaming(options = {}) {
    const { timeout = 10000 } = options;
    await expect(async () => {
      const bodyClasses = await this.page.evaluate(() => document.body.className);
      expect(bodyClasses).toContain('streaming-mode');
    }).toPass({ timeout });
  }

  async expectStopped(options = {}) {
    const { timeout = 5000 } = options;
    await expect(async () => {
      const bodyClasses = await this.page.evaluate(() => document.body.className);
      expect(bodyClasses).not.toContain('streaming-mode');
    }).toPass({ timeout });
  }

  async expectCaptureControlsEnabled() {
    await expect(this.screenshotButton).toBeEnabled();
    await expect(this.recordButton).toBeEnabled();
  }

  async expectCaptureControlsDisabled() {
    await expect(this.screenshotButton).toBeDisabled();
    await expect(this.recordButton).toBeDisabled();
  }

  async expectOverlayReady() {
    await expect(this.overlay).toBeVisible();
    await expect(this.overlay).not.toHaveClass(/hidden/);
  }

  async expectOverlayHidden() {
    await expect(this.overlay).toHaveClass(/hidden/);
  }

  async getCanvasRenderInfo() {
    return this.canvas.evaluate((canvas) => {
      const context = canvas.getContext('2d');
      if (!context) {
        return { exists: true, hasContext: false };
      }

      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let nonZeroPixels = 0;

        for (let index = 0; index < data.length; index += 4) {
          if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) {
            nonZeroPixels++;
          }
        }

        return {
          exists: true,
          hasContext: true,
          width: canvas.width,
          height: canvas.height,
          hasContent: nonZeroPixels > 0,
          nonZeroPixels,
        };
      } catch (error) {
        return {
          exists: true,
          hasContext: true,
          error: error.message,
        };
      }
    });
  }

  async suppressDownloads() {
    await this.page.evaluate(() => {
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

  async getDownloads() {
    return this.page.evaluate(() => window.__smokeDownloads ?? []);
  }

  async selectAlternateShaderPreset() {
    await this.#clickControl(this.shaderButton);
    await expect(this.shaderDropdown).toHaveClass(/visible/);

    const alternateOption = this.page.locator('#shaderOptions .shader-option:not(.active)').first();
    await expect(alternateOption).toBeAttached();
    const presetId = await alternateOption.getAttribute('data-preset-id');
    await this.#clickControl(alternateOption);

    await expect(this.page.locator(`#shaderOptions .shader-option[data-preset-id="${presetId}"]`))
      .toHaveClass(/active/);
    await this.#clickControl(this.shaderButton);
  }

  async expectPerformanceShaderFallbackVisible() {
    await this.#clickControl(this.shaderButton);
    await expect(this.shaderUnavailableMessage).not.toHaveClass(/hidden/);
    await this.#clickControl(this.shaderButton);
  }

  async expectShaderOptionsVisible() {
    await this.#clickControl(this.shaderButton);
    await expect(this.shaderOptions).not.toHaveClass(/hidden/);
    await this.#clickControl(this.shaderButton);
  }

  async captureScreenshot() {
    await this.#clickControl(this.screenshotButton);
    await expect(this.statusMessage).toContainText('Screenshot saved', { timeout: 5000 });
  }

  async startRecording() {
    await expect(this.recordButton).toBeEnabled();
    await this.#clickControl(this.recordButton);
    await expect(this.recordButton).toHaveClass(/recording/);
  }

  async stopRecording() {
    await this.#clickControl(this.recordButton);
    await expect(this.recordButton).not.toHaveClass(/recording/, { timeout: 5000 });
    await expect(this.statusMessage).toContainText('Recording saved', { timeout: 7000 });
  }

  async #clickControl(locator) {
    await locator.evaluate((element) => {
      element.click();
    });
  }
}
