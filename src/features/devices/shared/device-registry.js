/**
 * Device Registry - Browser-safe export
 *
 * This file contains only the device registry without any Node.js dependencies
 * Safe to import from both main and renderer processes
 *
 * Each device entry contains all the detection patterns needed to identify
 * the device without importing device-specific config files.
 */

import { ChromaticProfile } from '../adapters/chromatic/chromatic.profile.js';
import { ChromaticAdapter } from '../adapters/chromatic/chromatic.adapter.js';

/**
 * Device Registry - Central registry for all supported devices
 *
 * Each entry includes:
 * - id: Unique identifier
 * - name: Display name
 * - manufacturer: Device manufacturer
 * - enabled: Whether the device is enabled
 * - usb: USB vendor/product IDs for detection
 * - labelPatterns: Patterns to match in device labels
 * - profileModule/adapterModule: Module paths for lazy loading
 */

// Built-in devices that ship with PrismGB
const BUILT_IN_DEVICES = [
  {
    id: 'chromatic-mod-retro',
    name: 'Mod Retro Chromatic',
    manufacturer: 'ModRetro',
    enabled: true,
    usb: {
      vendorId: 0x374e,  // 14158 decimal
      productId: 0x0101  // 257 decimal
    },
    labelPatterns: [
      'chromatic',
      'modretro',
      'mod retro',
      '374e:0101'
    ],
    profileModule: '@features/devices/adapters/chromatic/chromatic.profile.js',
    adapterModule: '@features/devices/adapters/chromatic/chromatic.adapter.js',
    ProfileClass: ChromaticProfile,
    AdapterClass: ChromaticAdapter
  }
];

// Mutable internal registry initialized with built-in devices
const _registeredDevices = [...BUILT_IN_DEVICES];

/**
 * DeviceRegistry - Extensible API for device registration
 *
 * Provides methods to register, unregister, and query devices.
 * New devices can be added at runtime via the register() method.
 */
export const DeviceRegistry = {
  /**
   * Get all registered devices
   * @returns {Array} Copy of all device entries
   */
  getAll() {
    return [..._registeredDevices];
  },

  /**
   * Get device by ID
   * @param {string} id - Device ID
   * @returns {Object|undefined} Device entry or undefined
   */
  get(id) {
    return _registeredDevices.find(d => d.id === id);
  },

  /**
   * Register a new device
   * @param {Object} deviceEntry - Device configuration
   * @throws {Error} If device lacks id or already exists
   */
  register(deviceEntry) {
    if (!deviceEntry.id) {
      throw new Error('Device entry must have an id');
    }
    if (this.get(deviceEntry.id)) {
      throw new Error(`Device ${deviceEntry.id} already registered`);
    }
    _registeredDevices.push(Object.freeze(deviceEntry));
  },

  /**
   * Unregister a device
   * @param {string} id - Device ID to remove
   * @returns {boolean} True if device was removed, false if not found
   */
  unregister(id) {
    const index = _registeredDevices.findIndex(d => d.id === id);
    if (index > -1) {
      _registeredDevices.splice(index, 1);
      return true;
    }
    return false;
  },

  /**
   * Get ProfileClass for a device
   * @param {string} deviceId - Device ID
   * @returns {Function|null} ProfileClass constructor or null
   */
  getProfileClass(deviceId) {
    const device = this.get(deviceId);
    return device?.ProfileClass || null;
  },

  /**
   * Get AdapterClass for a device
   * @param {string} deviceId - Device ID
   * @returns {Function|null} AdapterClass constructor or null
   */
  getAdapterClass(deviceId) {
    const device = this.get(deviceId);
    return device?.AdapterClass || null;
  }
};

/**
 * DEVICE_REGISTRY - Array alias for DeviceRegistry
 * Returns reference to internal array.
 */
export const DEVICE_REGISTRY = _registeredDevices;
