/**
 * Adapter Factory
 *
 * Unified factory for device adapter registration and creation.
 * Handles device detection, adapter instantiation, and dependency injection.
 *
 * Located in streaming domain as it is the primary consumer of adapters.
 */

import { ConstraintBuilder } from '../acquisition/constraint.builder.js';
import { BaseStreamLifecycle } from '../acquisition/stream.lifecycle.js';
import { DeviceDetectionHelper } from '@shared/features/devices/device-detection.js';
import { forEachDeviceWithModule } from '@shared/features/devices/device-iterator.js';
import { DeviceRegistry } from '@shared/features/devices/device-registry.js';

export class AdapterFactory {
  constructor(eventBus, loggerFactory, mediaDevicesService = null) {
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;
    this.mediaDevicesService = mediaDevicesService;
    this.logger = loggerFactory.create('AdapterFactory');

    // Common dependencies for all adapters
    this.commonDependencies = {
      eventBus: this.eventBus,
      constraintBuilder: new ConstraintBuilder(this.logger),
      streamLifecycle: new BaseStreamLifecycle(this.logger, this.mediaDevicesService)
    };

    // Adapter and metadata registries (previously in AdapterFactory)
    this.adapterRegistry = new Map();
    this.metadataRegistry = new Map();

    // Track initialization
    this.initialized = false;
  }

  /**
   * Initialize adapter registry
   * Registers adapters from DEVICE_REGISTRY
   */
  async initialize() {
    if (this.initialized) {
      this.logger.warn('AdapterFactory already initialized');
      return;
    }

    try {
      const loadedCount = await this._registerBuiltInAdapters();
      this.initialized = true;

      this.logger.info(`Loaded ${loadedCount} adapter(s) from registry`);
    } catch (error) {
      this.logger.error('Failed to initialize adapter registry', error);
      throw error;
    }
  }

  /**
   * Register built-in adapters from DEVICE_REGISTRY
   * Uses shared iterator for consistent filtering
   * @private
   * @returns {Promise<number>} Number of adapters registered
   */
  async _registerBuiltInAdapters() {
    let registeredCount = 0;

    // Collect all devices with adapter modules
    const devices = [];
    forEachDeviceWithModule('adapterModule', (device) => {
      devices.push(device);
    }, { logger: this.logger });

    // Load adapters from registry
    for (const device of devices) {
      try {
        const AdapterClass = DeviceRegistry.getAdapterClass(device.id);
        if (!AdapterClass) {
          this.logger.error(`No adapter class found for device: ${device.id}`);
          continue;
        }

        // Register adapter with metadata
        this._register(device.id, AdapterClass, {
          requiresIPC: true,
          requiresProfile: true,
          capabilities: { hasAudio: true, hasVideo: true }
        });

        registeredCount++;
        this.logger.info(`Registered adapter for ${device.name} (${device.id})`);
      } catch (error) {
        this.logger.error(`Failed to load adapter for ${device.id}:`, error);
      }
    }

    return registeredCount;
  }

  /**
   * Register an adapter class with metadata
   * @param {string} deviceType - Device type identifier
   * @param {class} AdapterClass - Adapter class constructor
   * @param {Object} metadata - Adapter metadata
   * @private
   */
  _register(deviceType, AdapterClass, metadata = {}) {
    this.adapterRegistry.set(deviceType, AdapterClass);
    this.metadataRegistry.set(deviceType, {
      deviceType,
      requiresIPC: metadata.requiresIPC || false,
      requiresProfile: metadata.requiresProfile || false,
      dependencies: metadata.dependencies || [],
      capabilities: metadata.capabilities || {},
      ...metadata
    });
  }

  /**
   * Get adapter for device type
   */
  getAdapter(deviceType, dependencies = {}) {
    if (!this.initialized) {
      throw new Error('AdapterFactory not initialized. Call initialize() first.');
    }

    this.logger.debug(`Creating adapter for device type: ${deviceType}`);

    const AdapterClass = this.adapterRegistry.get(deviceType);
    if (!AdapterClass) {
      throw new Error(`No adapter registered for device type: ${deviceType}`);
    }

    const metadata = this.metadataRegistry.get(deviceType);
    const resolvedDeps = this._resolveDependencies(metadata, {
      logger: this.loggerFactory.create(deviceType),
      ...dependencies
    });

    return new AdapterClass(resolvedDeps);
  }

  /**
   * Resolve dependencies for adapter
   * @private
   */
  _resolveDependencies(metadata, additionalDeps) {
    const resolved = { ...this.commonDependencies, ...additionalDeps };

    // Validate IPC client if required
    if (metadata.requiresIPC && !resolved.ipcClient) {
      throw new Error(
        `Adapter "${metadata.deviceType}" requires IPC client but none was provided. ` +
        'Pass ipcClient in dependencies.'
      );
    }

    return resolved;
  }

  /**
   * Detect device type from device info
   * Uses unified detection to identify supported devices
   */
  detectDeviceType(device) {
    if (!this.initialized) {
      throw new Error('AdapterFactory not initialized. Call initialize() first.');
    }

    if (!device || !device.label) {
      this.logger.warn('Invalid device info');
      return null;
    }

    // Use generic detection from DeviceDetectionHelper
    const deviceType = DeviceDetectionHelper.detectDeviceType(device);
    if (deviceType) {
      this.logger.debug(`Detected supported device: ${device.label}`);
      return deviceType;
    }

    // No matching device found
    this.logger.warn(`Unsupported device: ${device.label}`);
    return null;
  }

  /**
   * Get adapter for specific device
   * Returns adapter for supported devices only
   */
  getAdapterForDevice(device, dependencies = {}) {
    const deviceType = this.detectDeviceType(device);
    if (!deviceType) {
      throw new Error(`Unsupported device: ${device?.label || 'unknown'}`);
    }
    return this.getAdapter(deviceType, dependencies);
  }

  /**
   * Register a custom adapter type
   */
  registerAdapter(deviceType, AdapterClass, metadata = {}) {
    this._register(deviceType, AdapterClass, metadata);
    this.logger.info(`Registered adapter for device type: ${deviceType}`);
  }

  /**
   * Check if adapter exists for device type
   */
  hasAdapter(deviceType) {
    return this.adapterRegistry.has(deviceType);
  }

  /**
   * Get all registered device types
   */
  getRegisteredTypes() {
    return Array.from(this.adapterRegistry.keys());
  }

  /**
   * Get adapter metadata
   */
  getMetadata(deviceType) {
    return this.metadataRegistry.get(deviceType);
  }

  /**
   * Unregister an adapter
   */
  unregister(deviceType) {
    this.adapterRegistry.delete(deviceType);
    this.metadataRegistry.delete(deviceType);
  }

  /**
   * Clear all registrations
   */
  clear() {
    this.adapterRegistry.clear();
    this.metadataRegistry.clear();
    this.initialized = false;
  }
}
