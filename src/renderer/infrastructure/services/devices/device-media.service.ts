/**
 * Device Media Service
 *
 * Owns media device enumeration, caching, and permission probing.
 */

import { BaseService } from '@shared/base/service.base.js';
import type { LoggerLike } from '@shared/base/service.base.js';
import { DeviceDetectionHelper } from '@shared/features/devices/device-detection.utils.js';
import { TIMING } from '@shared/config/timing.config';
import { EventChannels } from '@shared/events/event-channels.js';
import type { TypedEventBusLike } from '@shared/events/event-payloads.js';
import { getErrorMessage } from '@shared/lib/errors/error-guards.js';

type LoggerFactoryLike = {
  create(name: string): LoggerLike;
};

type DeviceConnectionStatus = {
  connected: boolean;
  [key: string]: unknown;
};

type DeviceConnectionUpdate = {
  status: DeviceConnectionStatus;
  changed?: boolean;
};

type DeviceEnumerationResult = {
  devices: MediaDeviceInfo[];
  connected: boolean;
};

type BrowserMediaServiceLike = {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
};

type DeviceConnectionServiceLike = {
  updateConnectionStatus(): Promise<DeviceConnectionUpdate>;
};

type DeviceStorageServiceLike = {
  storeDeviceId(deviceId: string, deviceType: string): void;
  getRegisteredStoredDeviceIds(): string[];
};

type DeviceChangeDebounceAdapterLike = {
  subscribe(callback: () => Promise<void> | void): () => void;
};

type DeviceMediaServiceDependencies = {
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
  browserMediaService: BrowserMediaServiceLike;
  deviceConnectionService: DeviceConnectionServiceLike;
  deviceStorageService: DeviceStorageServiceLike;
  deviceChangeDebounceAdapter: DeviceChangeDebounceAdapterLike;
};

function stopStreamTracks(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

class DeviceMediaService extends BaseService {
  declare protected readonly eventBus: TypedEventBusLike;
  declare protected readonly logger: LoggerLike;
  declare protected readonly browserMediaService: BrowserMediaServiceLike;
  declare protected readonly deviceConnectionService: DeviceConnectionServiceLike;
  declare protected readonly deviceStorageService: DeviceStorageServiceLike;
  declare protected readonly deviceChangeDebounceAdapter: DeviceChangeDebounceAdapterLike;

  videoDevices: MediaDeviceInfo[];
  hasMediaPermission: boolean;
  _enumerateInFlight: Promise<DeviceEnumerationResult> | null;
  _lastEnumerateAt: number;
  _enumerateCooldownMs: number;
  _lastEnumerateResult: DeviceEnumerationResult | null;
  _unsubscribeDeviceChange: (() => void) | null;
  _knownSupportedDeviceIds: Set<string>;
  _permissionProbeInFlight: Promise<void> | null;

  constructor(dependencies: DeviceMediaServiceDependencies) {
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

  invalidateEnumerationCache(): void {
    this._lastEnumerateResult = null;
    this._lastEnumerateAt = 0;
    this.logger.debug('Enumeration cache invalidated');
  }

  async enumerateDevices(): Promise<DeviceEnumerationResult> {
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

        let videoDevices: MediaDeviceInfo[] = [];
        try {
          const devices = await this.browserMediaService.enumerateDevices();
          const allVideos = devices.filter((device) => device.kind === 'videoinput');

          this.logger.info(`Found ${allVideos.length} total webcam(s)`);

          videoDevices = allVideos.filter((device) =>
            this._isMatchingDevice(device.label)
          );

          this.logger.info(`Filtered to ${videoDevices.length} supported device(s)`);

          const firstSupportedDevice = videoDevices[0];
          if (firstSupportedDevice) {
            this.hasMediaPermission = true;
            const deviceType: string | null = DeviceDetectionHelper.detectDeviceId(firstSupportedDevice);
            if (deviceType) {
              this.deviceStorageService.storeDeviceId(firstSupportedDevice.deviceId, deviceType);
            }
          } else if (allVideos.length > 0 && allVideos.every((device) => !device.label)) {
            this.logger.debug('Devices found but no labels - permission pending');
          }
        } catch (error) {
          const message = getErrorMessage(error, 'Enumeration failed');
          this.logger.warn('Could not enumerate webcams:', message);
          this.eventBus.publish(EventChannels.DEVICE.ENUMERATION_FAILED, {
            error: message,
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

  getSelectedDeviceId(): string | null {
    const matchedDevice = this.videoDevices.find((device) =>
      this._isMatchingDevice(device.label)
    );
    return matchedDevice ? matchedDevice.deviceId : null;
  }

  async discoverSupportedDevice(): Promise<MediaDeviceInfo | null> {
    const { status } = await this.deviceConnectionService.updateConnectionStatus();
    if (!status.connected) {
      return null;
    }

    const storedIds = this.deviceStorageService.getRegisteredStoredDeviceIds();
    if (storedIds.length > 0 && this.hasMediaPermission && this.videoDevices.length > 0) {
      const device = this.videoDevices.find((videoDevice) => storedIds.includes(videoDevice.deviceId));
      if (device) return device;
    }

    const allDevices = await this.browserMediaService.enumerateDevices();
    const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');

    for (const device of videoDevices) {
      if (device.label && this._isMatchingDevice(device.label)) {
        return this._cacheAndReturnDevice(device);
      }
    }

    const labelsHidden = videoDevices.length > 0 && videoDevices.every((device) => !device.label);
    if (labelsHidden) {
      await this._warmUpPermissions();
      const devicesWithLabels = await this.browserMediaService.enumerateDevices();
      const labeledVideos = devicesWithLabels.filter((device) => device.kind === 'videoinput');
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

  async _tryGetPermissionForDevice(deviceId: string): Promise<MediaDeviceInfo | null> {
    let tempStream: MediaStream | null = null;
    try {
      tempStream = await this.browserMediaService.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      stopStreamTracks(tempStream);
      tempStream = null;

      const devicesWithLabels = await this.browserMediaService.enumerateDevices();
      const matchedDevice = devicesWithLabels
        .filter((device) => device.kind === 'videoinput')
        .find((device) => this._isMatchingDevice(device.label));

      if (matchedDevice) {
        return this._cacheAndReturnDevice(matchedDevice);
      }
    } catch (error) {
      this.logger.debug('Device not accessible, trying next:', getErrorMessage(error, 'Device not accessible'));
    } finally {
      stopStreamTracks(tempStream);
    }
    return null;
  }

  _cacheAndReturnDevice(device: MediaDeviceInfo): MediaDeviceInfo | null {
    if (!this.registerSupportedDevice(device)) {
      return null;
    }
    return device;
  }

  async _warmUpPermissions(): Promise<void> {
    if (this._permissionProbeInFlight) {
      return this._permissionProbeInFlight;
    }

    this._permissionProbeInFlight = (async () => {
      let tempStream: MediaStream | null = null;
      try {
        tempStream = await this.browserMediaService.getUserMedia({ video: true });
        this.hasMediaPermission = true;
      } catch (error) {
        this.logger.debug('Permission warm-up failed:', getErrorMessage(error, 'Permission denied'));
      } finally {
        stopStreamTracks(tempStream);
        this._permissionProbeInFlight = null;
      }
    })();

    return this._permissionProbeInFlight;
  }

  registerSupportedDevice(device: MediaDeviceInfo): boolean {
    const deviceType: string | null = DeviceDetectionHelper.detectDeviceId(device);
    if (!deviceType || !device.deviceId) {
      this.logger.warn('Could not cache device - unsupported or missing deviceId');
      return false;
    }

    this.deviceStorageService.storeDeviceId(device.deviceId, deviceType);
    this.hasMediaPermission = true;
    this.videoDevices = [device];
    return true;
  }

  setupDeviceChangeListener(onChange: () => Promise<void> | void): void {
    if (this._unsubscribeDeviceChange) {
      return;
    }

    // Subscribe via debounce adapter - handles rapid event bursts
    this._unsubscribeDeviceChange = this.deviceChangeDebounceAdapter.subscribe(async () => {
      try {
        this.logger.info('Device change detected');
        this.invalidateEnumerationCache();
        await onChange();
        await this.enumerateDevices();
      } catch (error) {
        this.logger.error('Device change handling failed:', getErrorMessage(error, 'Device change handling failed'));
      }
    });

    this.logger.info('Device change listener set up');
  }

  _checkForNewSupportedDevice(): void {
    for (const device of this.videoDevices) {
      if (!this._knownSupportedDeviceIds.has(device.deviceId)) {
        this._knownSupportedDeviceIds.add(device.deviceId);
        this.logger.info(`New supported device available: ${device.label}`);
        this.eventBus.publish(EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE, {
          device,
          videoDevices: this.videoDevices
        });
      }
    }
  }

  dispose(): void {
    if (this._unsubscribeDeviceChange) {
      this._unsubscribeDeviceChange();
      this._unsubscribeDeviceChange = null;
    }
  }

  _isMatchingDevice(label: string): string | null {
    return DeviceDetectionHelper.matchesByLabel(label);
  }
}

export { DeviceMediaService };
