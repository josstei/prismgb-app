/**
 * Device Registry - Process-agnostic device metadata
 *
 * Contains only device detection metadata (USB IDs, label patterns).
 * ProfileClass and AdapterClass are registered at runtime by each process.
 *
 * Main process registers: ProfileClass (via device.service.main.js)
 * Renderer registers: AdapterClass (via streaming-adapter.factory.js)
 */

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
 *
 * ProfileClass/AdapterClass are registered at runtime by each process.
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
    profileModule: 'device-chromatic.profile',
    adapterModule: 'device-chromatic.adapter'
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
   * Register ProfileClass for a device (called by main process)
   * @param {string} deviceId - Device ID
   * @param {Function} ProfileClass - Profile class constructor
   */
  registerProfileClass(deviceId, ProfileClass) {
    const device = this.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found in registry`);
    }
    device.ProfileClass = ProfileClass;
  },

  /**
   * Register AdapterClass for a device (called by renderer process)
   * @param {string} deviceId - Device ID
   * @param {Function} AdapterClass - Adapter class constructor
   */
  registerAdapterClass(deviceId, AdapterClass) {
    const device = this.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found in registry`);
    }
    device.AdapterClass = AdapterClass;
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
