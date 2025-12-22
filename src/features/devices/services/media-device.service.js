/**
 * Media Device Service
 *
 * Owns media device enumeration, caching, and permission probing.
 */

import { DeviceDetectionHelper } from '../shared/device-detection.js';
import { TIMING } from '@shared/config/constants.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

class MediaDeviceService {
  constructor({
    eventBus,
    loggerFactory,
    mediaDevicesService,
    deviceConnectionService,
    deviceStorageService
  }) {
    this.eventBus = eventBus;
    this.mediaDevicesService = mediaDevicesService;
    this.deviceConnectionService = deviceConnectionService;
    this.deviceStorageService = deviceStorageService;
    this.logger = loggerFactory?.create('MediaDeviceService') || console;

    this.videoDevices = [];
    this.hasMediaPermission = false;
    this._enumerateInFlight = null;
    this._lastEnumerateAt = 0;
    this._enumerateCooldownMs = TIMING.DEVICE_ENUMERATE_COOLDOWN_MS;
    this._lastEnumerateResult = null;
    this._deviceChangeHandler = null;
  }

  invalidateEnumerationCache() {
    this._lastEnumerateResult = null;
    this._lastEnumerateAt = 0;
    this.logger.debug('Enumeration cache invalidated');
  }

  async enumerateDevices() {
    if (this._enumerateInFlight) {
      this.logger.debug('Device enumeration already in flight, reusing promise');
      return this._enumerateInFlight;
    }

    const now = Date.now();
    if (this._lastEnumerateResult && (now - this._lastEnumerateAt) < this._enumerateCooldownMs) {
      this.logger.debug('Returning cached enumeration result (cooldown window)');
      return this._lastEnumerateResult;
    }

    this._enumerateInFlight = (async () => {
      try {
        const { status } = await this.deviceConnectionService.refreshStatus();
        const connected = status.connected;

        this.logger.info(`Main process device status: ${connected ? 'CONNECTED' : 'NOT CONNECTED'}`);

        let videoDevices = [];
        try {
          const devices = await this.mediaDevicesService.enumerateDevices();
          const allVideos = devices.filter(device => device.kind === 'videoinput');

          this.logger.info(`Found ${allVideos.length} total webcam(s)`);

          videoDevices = allVideos.filter(device =>
            this._isMatchingDevice(device.label)
          );

          this.logger.info(`Filtered to ${videoDevices.length} supported device(s)`);

          if (videoDevices.length > 0) {
            this.hasMediaPermission = true;
            const deviceType = DeviceDetectionHelper.detectDeviceType(videoDevices[0]);
            this.deviceStorageService.storeDeviceId(videoDevices[0].deviceId, deviceType);
          } else if (allVideos.length > 0 && allVideos.every(d => !d.label)) {
            this.logger.debug('Devices found but no labels - permission pending');
          }
        } catch (error) {
          this.logger.warn('Could not enumerate webcams:', error?.message || error);
          this.eventBus.publish(EventChannels.DEVICE.ENUMERATION_FAILED, {
            error: error?.message || 'Enumeration failed',
            reason: 'webcam_access'
          });
        }

        this.videoDevices = videoDevices;

        const result = {
          devices: videoDevices,
          connected
        };

        if (videoDevices.length > 0 || !connected) {
          this._lastEnumerateResult = result;
          this._lastEnumerateAt = Date.now();
        }
        return result;
      } finally {
        this._enumerateInFlight = null;
      }
    })();

    return this._enumerateInFlight;
  }

  getSelectedDeviceId() {
    const matchedDevice = this.videoDevices.find(device =>
      this._isMatchingDevice(device.label)
    );
    return matchedDevice ? matchedDevice.deviceId : null;
  }

  async discoverSupportedDevice() {
    const { status } = await this.deviceConnectionService.refreshStatus();
    if (!status.connected) {
      return null;
    }

    const storedIds = this.deviceStorageService.getRegisteredStoredDeviceIds();
    if (storedIds.length > 0 && this.hasMediaPermission && this.videoDevices.length > 0) {
      const device = this.videoDevices.find(d => storedIds.includes(d.deviceId));
      if (device) return device;
    }

    const allDevices = await this.mediaDevicesService.enumerateDevices();
    const videoDevices = allDevices.filter(d => d.kind === 'videoinput');

    for (const device of videoDevices) {
      if (device.label && this._isMatchingDevice(device.label)) {
        return this._cacheAndReturnDevice(device);
      }
    }

    for (const deviceId of storedIds) {
      const matchedDevice = await this._tryGetPermissionForDevice(deviceId);
      if (matchedDevice) return matchedDevice;
    }

    this.logger.warn('No supported device found');
    return null;
  }

  async _tryGetPermissionForDevice(deviceId) {
    let tempStream = null;
    try {
      tempStream = await this.mediaDevicesService.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      tempStream.getTracks().forEach(track => track.stop());
      tempStream = null;

      const devicesWithLabels = await this.mediaDevicesService.enumerateDevices();
      const matchedDevice = devicesWithLabels
        .filter(d => d.kind === 'videoinput')
        .find(d => this._isMatchingDevice(d.label));

      if (matchedDevice) {
        return this._cacheAndReturnDevice(matchedDevice);
      }
    } catch {
      // Device not accessible, try next
    } finally {
      tempStream?.getTracks().forEach(track => track.stop());
    }
    return null;
  }

  _cacheAndReturnDevice(device) {
    if (!this.cacheSupportedDevice(device)) {
      return null;
    }
    return device;
  }

  cacheSupportedDevice(device) {
    const deviceType = DeviceDetectionHelper.detectDeviceType(device);
    if (!deviceType || !device?.deviceId) {
      this.logger.warn('Could not cache device - unsupported or missing deviceId');
      return false;
    }

    this.deviceStorageService.storeDeviceId(device.deviceId, deviceType);
    this.hasMediaPermission = true;
    this.videoDevices = [device];
    return true;
  }

  setupDeviceChangeListener(onChange) {
    if (this._deviceChangeHandler) {
      return;
    }

    this._deviceChangeHandler = async () => {
      this.logger.info('Device change detected');
      await onChange();
    };
    this.mediaDevicesService.addEventListener('devicechange', this._deviceChangeHandler);
    this.logger.info('Device change listener set up');
  }

  dispose() {
    if (this._deviceChangeHandler) {
      this.mediaDevicesService.removeEventListener('devicechange', this._deviceChangeHandler);
      this._deviceChangeHandler = null;
    }
  }

  _isMatchingDevice(label) {
    return DeviceDetectionHelper.matchesByLabel(label);
  }
}

export { MediaDeviceService };
