import { expect } from '@playwright/test';
import { AppShellPage } from '../pages/app-shell.page.js';
import { StreamPage } from '../pages/stream.page.js';
import {
  CHROMATIC_MEDIA_FIXTURE,
  cleanupChromaticMediaEnvironment,
  createChromaticDeviceStatusPayload,
  installChromaticMediaEnvironment,
} from '../helpers/chromatic-media-environment.helper.js';
import {
  clearTestDeviceStatus,
  injectDeviceConnectedEvent,
  injectDeviceDisconnectedEvent,
  setTestDeviceStatus,
} from '../helpers/device-ipc.helper.js';

export class ChromaticDeviceFixture {
  constructor(electronApp, page) {
    this.electronApp = electronApp;
    this.page = page;
    this.appShell = new AppShellPage(page);
    this.streamPage = new StreamPage(page, electronApp);
    this.fixture = CHROMATIC_MEDIA_FIXTURE;
    this.mediaEnvironment = null;
  }

  async installMediaEnvironment(options = {}) {
    this.mediaEnvironment = await installChromaticMediaEnvironment(this.page, options);
    return this.mediaEnvironment;
  }

  async connectMediaOnly(options = {}) {
    const mediaEnvironment = this.mediaEnvironment ?? (await this.installMediaEnvironment(options));
    await mediaEnvironment.connect();
    return mediaEnvironment;
  }

  async disconnectMediaOnly() {
    await this.mediaEnvironment?.disconnect();
  }

  async connect(options = {}) {
    const { autoConnect = true, testPattern = 'animated' } = options;

    await this.installMediaEnvironment({ autoConnect, testPattern });
    await setTestDeviceStatus(this.electronApp, createChromaticDeviceStatusPayload(true));
    await injectDeviceConnectedEvent(this.electronApp);

    await this.expectConnected();
  }

  async disconnect() {
    await this.mediaEnvironment?.disconnect();
    await setTestDeviceStatus(this.electronApp, createChromaticDeviceStatusPayload(false));
    await injectDeviceDisconnectedEvent(this.electronApp);
    await this.expectDisconnected();
  }

  async cleanup() {
    await Promise.allSettled([
      cleanupChromaticMediaEnvironment(this.page),
      clearTestDeviceStatus(this.electronApp),
    ]);
  }

  async expectConnected() {
    await expect(this.appShell.statusIndicator).toHaveClass(/(?:^|\s)connected(?:\s|$)/);

    await expect(async () => {
      const devices = await this.page.evaluate(async () => {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();
        return mediaDevices.map((device) => ({
          kind: device.kind,
          label: device.label,
        }));
      });

      expect(devices).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: this.fixture.videoDevice.kind,
          label: this.fixture.videoDevice.label,
        }),
        expect.objectContaining({
          kind: this.fixture.audioDevice.kind,
          label: this.fixture.audioDevice.label,
        }),
      ]));
    }).toPass({ timeout: 5000 });

    await expect(this.streamPage.overlay).not.toHaveClass(/hidden/);
  }

  async expectDisconnected() {
    await expect(this.appShell.statusIndicator).toHaveClass(/disconnected/);
    await expect(this.appShell.statusIndicator).not.toHaveClass(/(?:^|\s)connected(?:\s|$)/);
  }

  async getMediaEnvironmentStatus() {
    if (!this.mediaEnvironment) {
      return { injected: false, isConnected: false };
    }

    return this.mediaEnvironment.getStatus();
  }

  async setTestPattern(pattern) {
    if (!this.mediaEnvironment) {
      throw new Error('Chromatic media environment has not been installed');
    }

    await this.mediaEnvironment.setTestPattern(pattern);
  }

  async enumerateMediaDevices() {
    return this.page.evaluate(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map((device) => ({
        deviceId: device.deviceId,
        groupId: device.groupId,
        kind: device.kind,
        label: device.label,
      }));
    });
  }

  async hasMediaEnvironmentState() {
    return this.page.evaluate(() => Boolean(window.__chromaticMediaEnvironment));
  }

}
