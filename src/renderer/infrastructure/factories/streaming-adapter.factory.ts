/**
 * Adapter Factory
 *
 * Unified factory for device adapter registration and creation.
 * Handles device detection, adapter instantiation, and dependency injection.
 *
 * Located in streaming domain as it is the primary consumer of adapters.
 *
 * Adapter classes are registered via DI bootstrap (container.js) to avoid
 * hardcoded imports and improve testability.
 */

import { ConstraintBuilder, BaseStreamLifecycle } from '@prismgb/stream-source';
import { DeviceDetectionHelper, forEachDeviceWithModule, DeviceRegistry } from '@prismgb/devices';

import type { LoggerLike, LoggerFactoryLike, EventBusLike } from '@prismgb/core';

type DependencyBag = Record<string, unknown>;

type AdapterConstructor = new (deps: DependencyBag) => unknown;

interface BrowserMediaServiceLike {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

interface MediaDeviceLike {
  label?: string;
  deviceId?: string;
}

export class StreamingAdapterFactory {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  browserMediaService: BrowserMediaServiceLike | null;
  logger: LoggerLike;
  _adapterClasses: Map<string, AdapterConstructor>;
  commonDependencies: DependencyBag;
  initialized: boolean;

  /**
   * @param {Object} eventBus - Event bus for cross-service communication
   * @param {Object} loggerFactory - Factory for creating loggers
   * @param {Object} browserMediaService - Browser media service
   * @param {Map<string, class>} adapterClasses - Map of device type IDs to adapter classes (injected via DI)
   */
  constructor(
    eventBus: EventBusLike,
    loggerFactory: LoggerFactoryLike,
    browserMediaService: BrowserMediaServiceLike | null = null,
    adapterClasses: Map<string, AdapterConstructor> = new Map()
  ) {
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;
    this.browserMediaService = browserMediaService;
    this.logger = loggerFactory.create('StreamingAdapterFactory');

    // Adapter classes registered via DI bootstrap
    this._adapterClasses = adapterClasses;

    // Common dependencies for all adapters
    this.commonDependencies = {
      eventBus: this.eventBus,
      constraintBuilder: new ConstraintBuilder(this.logger),
      streamLifecycle: new BaseStreamLifecycle(this.logger, this.browserMediaService),
      browserMediaService: this.browserMediaService
    };

    // Track initialization
    this.initialized = false;
  }

  /**
   * Initialize adapter registry
   * Registers adapters from DEVICE_REGISTRY using classes injected via DI
   */
  initialize() {
    if (this.initialized) {
      this.logger.warn('StreamingAdapterFactory already initialized');
      return;
    }

    // Register adapter classes with DeviceRegistry (injected via DI bootstrap)
    for (const [deviceId, AdapterClass] of this._adapterClasses) {
      DeviceRegistry.registerAdapterClass(deviceId, AdapterClass);
    }

    const loadedCount = this._registerBuiltInAdapters();
    this.initialized = true;

    this.logger.info(`Loaded ${loadedCount} adapter(s) from registry`);
  }

  /**
   * Register built-in adapters from DEVICE_REGISTRY
   * Uses shared iterator for consistent filtering
   * @private
   * @returns {number} Number of adapters registered
   */
  _registerBuiltInAdapters() {
    let registeredCount = 0;

    // Collect all devices with adapter modules
    const devices = [];
    forEachDeviceWithModule('adapterModule', (device) => {
      devices.push(device);
    }, { logger: this.logger });

    // Verify adapters are registered in DeviceRegistry
    for (const device of devices) {
      try {
        const AdapterClass = DeviceRegistry.getAdapterClass(device.id) as AdapterConstructor | null;
        if (!AdapterClass) {
          this.logger.error(`No adapter class found for device: ${device.id}`);
          continue;
        }

        registeredCount++;
        this.logger.info(`Registered adapter for ${device.name} (${device.id})`);
      } catch (error) {
        this.logger.error(`Failed to load adapter for ${device.id}:`, error);
      }
    }

    return registeredCount;
  }

  /**
   * Get adapter for device type
   */
  getAdapter(deviceType: string, dependencies: DependencyBag = {}) {
    if (!this.initialized) {
      throw new Error('StreamingAdapterFactory not initialized. Call initialize() first.');
    }

    this.logger.debug(`Creating adapter for device type: ${deviceType}`);

    const AdapterClass = DeviceRegistry.getAdapterClass(deviceType) as AdapterConstructor | null;
    if (!AdapterClass) {
      throw new Error(`No adapter registered for device type: ${deviceType}`);
    }

    const resolvedDeps = this._resolveDependencies({
      logger: this.loggerFactory.create(deviceType),
      ...dependencies
    });

    return new AdapterClass(resolvedDeps);
  }

  /**
   * Resolve dependencies for adapter
   * @private
   */
  _resolveDependencies(additionalDeps: DependencyBag) {
    const resolved = { ...this.commonDependencies, ...additionalDeps };

    // Validate IPC client for device adapters (all device adapters require IPC)
    if (!resolved.ipcClient) {
      throw new Error(
        'Device adapter requires IPC client but none was provided. ' +
        'Pass ipcClient in dependencies.'
      );
    }

    return resolved;
  }

  /**
   * Detect device ID from device info
   * Uses unified detection to identify supported devices
   */
  detectDeviceId(device: MediaDeviceLike) {
    if (!this.initialized) {
      throw new Error('StreamingAdapterFactory not initialized. Call initialize() first.');
    }

    if (!device || !device.label) {
      this.logger.warn('Invalid device info');
      return null;
    }

    // Use generic detection from DeviceDetectionHelper
    const deviceId = DeviceDetectionHelper.detectDeviceId(device);
    if (deviceId) {
      this.logger.debug(`Detected supported device: ${device.label}`);
      return deviceId;
    }

    // No matching device found
    this.logger.warn(`Unsupported device: ${device.label}`);
    return null;
  }

  /**
   * Get adapter for specific device
   * Returns adapter for supported devices only
   */
  getAdapterForDevice(device: MediaDeviceLike, dependencies: DependencyBag = {}) {
    const deviceId = this.detectDeviceId(device);
    if (!deviceId) {
      throw new Error(`Unsupported device: ${device?.label || 'unknown'}`);
    }
    return this.getAdapter(deviceId, dependencies);
  }
}
