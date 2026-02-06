/**
 * Device Media Service
 *
 * Owns media device enumeration, caching, and permission probing.
 */

import { BaseService } from '@shared/base/service.base.js';
import { DeviceDetectionHelper } from '@shared/features/devices/device-detection.utils.js';
import { TIMING } from '@shared/config/timing.config';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class DeviceMediaService extends BaseService {
  [key: string]: any;

  constructor(dependencies) {
    super(dependencies, [
      'eventBus',
      'loggerFactory',
      'browserMediaService',
      'deviceConnectionService',
      'deviceStorageService',
      'deviceChangeDebounceAdapter'
    ], 'DeviceMediaService');

    this.videoDevices = [];
    this.hasMediaPermission = false;
    this._enumerateInFlight = null;
    this._lastEnumerateAt = 0;
    this._enumerateCooldownMs = TIMING.DEVICE_ENUMERATE_COOLDOWN_MS;
    this._lastEnumerateResult = null;
    this._unsubscribeDeviceChange = null;
    this._knownSupportedDeviceIds = new Set();
    this._permissionProbeInFlight = null;
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
        const { status } = await this.deviceConnectionService.updateConnectionStatus();
        const connected = status.connected;

        this.logger.info(`Main process device status: ${connected ? 'CONNECTED' : 'NOT CONNECTED'}`);

        let videoDevices = [];
        try {
          const devices = await this.browserMediaService.enumerateDevices();
          const allVideos = devices.filter(device => device.kind === 'videoinput');

          this.logger.info(`Found ${allVideos.length} total webcam(s)`);

          videoDevices = allVideos.filter(device =>
            this._isMatchingDevice(device.label)
          );

          this.logger.info(`Filtered to ${videoDevices.length} supported device(s)`);

          if (videoDevices.length > 0) {
            this.hasMediaPermission = true;
            const deviceId = DeviceDetectionHelper.detectDeviceId(videoDevices[0]);
            this.deviceStorageService.storeDeviceId(videoDevices[0].deviceId, deviceId);
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

        if (videoDevices.length === 0) {
          this._knownSupportedDeviceIds.clear();
        } else {
          this._checkForNewSupportedDevice();
        }

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
    const { status } = await this.deviceConnectionService.updateConnectionStatus();
    if (!status.connected) {
      return null;
    }

    const storedIds = this.deviceStorageService.getRegisteredStoredDeviceIds();
    if (storedIds.length > 0 && this.hasMediaPermission && this.videoDevices.length > 0) {
      const device = this.videoDevices.find(d => storedIds.includes(d.deviceId));
      if (device) return device;
    }

    const allDevices = await this.browserMediaService.enumerateDevices();
    const videoDevices = allDevices.filter(d => d.kind === 'videoinput');

    for (const device of videoDevices) {
      if (device.label && this._isMatchingDevice(device.label)) {
        return this._cacheAndReturnDevice(device);
      }
    }

    const labelsHidden = videoDevices.length > 0 && videoDevices.every(d => !d.label);
    if (labelsHidden) {
      await this._warmUpPermissions();
      const devicesWithLabels = await this.browserMediaService.enumerateDevices();
      const labeledVideos = devicesWithLabels.filter(d => d.kind === 'videoinput');
      for (const device of labeledVideos) {
        if (device.label && this._isMatchingDevice(device.label)) {
          return this._cacheAndReturnDevice(device);
        }
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
      tempStream = await this.browserMediaService.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      tempStream.getTracks().forEach(track => track.stop());
      tempStream = null;

      const devicesWithLabels = await this.browserMediaService.enumerateDevices();
      const matchedDevice = devicesWithLabels
        .filter(d => d.kind === 'videoinput')
        .find(d => this._isMatchingDevice(d.label));

      if (matchedDevice) {
        return this._cacheAndReturnDevice(matchedDevice);
      }
    } catch (error) {
      this.logger.debug('Device not accessible, trying next:', error.message);
    } finally {
      tempStream?.getTracks().forEach(track => track.stop());
    }
    return null;
  }

  _cacheAndReturnDevice(device) {
    if (!this.registerSupportedDevice(device)) {
      return null;
    }
    return device;
  }

  async _warmUpPermissions() {
    if (this._permissionProbeInFlight) {
      return this._permissionProbeInFlight;
    }

    this._permissionProbeInFlight = (async () => {
      let tempStream = null;
      try {
        tempStream = await this.browserMediaService.getUserMedia({ video: true });
        this.hasMediaPermission = true;
      } catch (error) {
        this.logger.debug('Permission warm-up failed:', error?.message || error);
      } finally {
        tempStream?.getTracks().forEach(track => track.stop());
        this._permissionProbeInFlight = null;
      }
    })();

    return this._permissionProbeInFlight;
  }

  registerSupportedDevice(device) {
    const deviceId = DeviceDetectionHelper.detectDeviceId(device);
    if (!deviceId || !device?.deviceId) {
      this.logger.warn('Could not cache device - unsupported or missing deviceId');
      return false;
    }

    this.deviceStorageService.storeDeviceId(device.deviceId, deviceId);
    this.hasMediaPermission = true;
    this.videoDevices = [device];
    return true;
  }

  setupDeviceChangeListener(onChange) {
    if (this._unsubscribeDeviceChange) {
      return;
    }

    // Subscribe via debounce adapter - handles rapid event bursts
    this._unsubscribeDeviceChange = this.deviceChangeDebounceAdapter.subscribe(async () => {
      this.logger.info('Device change detected');
      this.invalidateEnumerationCache();
      await onChange();
      await this.enumerateDevices();
    });

    this.logger.info('Device change listener set up');
  }

  _checkForNewSupportedDevice() {
    for (const device of this.videoDevices) {
      if (!this._knownSupportedDeviceIds.has(device.deviceId)) {
        this._knownSupportedDeviceIds.add(device.deviceId);
        this.logger.info(`New supported device available: ${device.label}`);
        this.eventBus.publish(EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE, {
          deviceId: device.deviceId,
          label: device.label
        });
      }
    }
  }

  dispose() {
    if (this._unsubscribeDeviceChange) {
      this._unsubscribeDeviceChange();
      this._unsubscribeDeviceChange = null;
    }
  }

  _isMatchingDevice(label) {
    return DeviceDetectionHelper.matchesByLabel(label);
  }
}

export { DeviceMediaService };
