import { expect } from '@playwright/test';
import {
  CHROMATIC_E2E_FIXTURE,
  CHROMATIC_SPECS,
  createChromaticUsbDeviceInfo,
} from '../../support/chromatic-device-specs.js';
import { AppShellPage } from '../pages/app-shell.page.js';
import { StreamPage } from '../pages/stream.page.js';
import {
  cleanupMockDevice,
  injectMockChromaticDevice,
} from '../helpers/mock-chromatic.helper.js';
import {
  clearMockDeviceStatus,
  injectDeviceConnectedEvent,
  injectDeviceDisconnectedEvent,
  setMockDeviceStatus,
} from '../helpers/device-ipc.helper.js';

export class ChromaticDeviceFixture {
  constructor(electronApp, page) {
    this.electronApp = electronApp;
    this.page = page;
    this.appShell = new AppShellPage(page);
    this.streamPage = new StreamPage(page);
    this.specs = CHROMATIC_SPECS;
    this.fixture = CHROMATIC_E2E_FIXTURE;
    this.mockDevice = null;
  }

  async injectMediaMock(options = {}) {
    this.mockDevice = await injectMockChromaticDevice(this.page, options);
    return this.mockDevice;
  }

  async connectMediaOnly(options = {}) {
    const mockDevice = this.mockDevice ?? (await this.injectMediaMock(options));
    await mockDevice.connect();
    return mockDevice;
  }

  async disconnectMediaOnly() {
    await this.mockDevice?.disconnect();
  }

  async setMediaConnected(connected) {
    await this.page.evaluate(
      ({ connected: nextConnected, usbDeviceInfo }) => {
        const state = window.__mockChromaticState;
        if (!state) {
          throw new Error('Mock Chromatic device has not been injected');
        }

        state.isConnected = nextConnected;
        state.deviceInfo = nextConnected ? { ...usbDeviceInfo } : null;

        const event = new Event('devicechange');
        state.deviceChangeListeners.forEach((listener) => listener(event));
        navigator.mediaDevices.dispatchEvent(event);
      },
      { connected, usbDeviceInfo: this.fixture.usbDeviceInfo }
    );
  }

  async connect(options = {}) {
    const { autoConnect = true, testPattern = 'animated' } = options;

    await this.injectMediaMock({ autoConnect, testPattern });
    await setMockDeviceStatus(this.electronApp, {
      connected: true,
      device: this.fixture.usbDeviceInfo,
    });
    await injectDeviceConnectedEvent(this.electronApp);

    await this.expectConnected();
  }

  async disconnect() {
    await this.mockDevice?.disconnect();
    await setMockDeviceStatus(this.electronApp, { connected: false, device: null });
    await injectDeviceDisconnectedEvent(this.electronApp);
    await this.expectDisconnected();
  }

  async cleanup() {
    await Promise.allSettled([
      cleanupMockDevice(this.page),
      clearMockDeviceStatus(this.electronApp),
    ]);
  }

  async expectConnected() {
    await expect(async () => {
      const classes = await this.appShell.statusIndicator.getAttribute('class');
      expect(classes).toContain('connected');
    }).toPass({ timeout: 5000 });

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
    await expect(async () => {
      const classes = await this.appShell.statusIndicator.getAttribute('class');
      const classList = classes?.split(/\s+/) ?? [];
      expect(classList).toContain('disconnected');
      expect(classList).not.toContain('connected');
    }).toPass({ timeout: 5000 });
  }

  async getMockStatus() {
    if (!this.mockDevice) {
      return { injected: false, isConnected: false };
    }

    return this.mockDevice.getStatus();
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

  async hasMockState() {
    return this.page.evaluate(() => Boolean(window.__mockChromaticState));
  }

  async getMediaStreamInfo(constraints = { video: true, audio: true }) {
    return this.page.evaluate(async (mediaConstraints) => {
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      const videoTrack = stream.getVideoTracks()[0] ?? null;
      const audioTrack = stream.getAudioTracks()[0] ?? null;

      return {
        hasVideo: Boolean(videoTrack),
        hasAudio: Boolean(audioTrack),
        videoSettings: videoTrack?.getSettings() ?? null,
        audioSettings: audioTrack?.getSettings() ?? null,
      };
    }, constraints);
  }

  get usbDeviceInfo() {
    return createChromaticUsbDeviceInfo();
  }
}
