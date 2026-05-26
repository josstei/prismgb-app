import { DeviceManifest } from './device.manifest.js';

type DeviceConstructor = new (...args: never[]) => unknown;
type DeviceModuleKey = string;

export interface DeviceRegistryUsb {
  vendorId: number;
  productId: number;
}

export interface DeviceRegistryEntry {
  id: string;
  name?: string;
  manufacturer?: string;
  enabled?: boolean;
  usb?: DeviceRegistryUsb;
  labelPatterns?: readonly string[];
  profileModule?: string | null;
  adapterModule?: string | null;
  ProfileClass?: DeviceConstructor;
  AdapterClass?: DeviceConstructor;
  [key: DeviceModuleKey]: unknown;
}

type MutableDeviceRegistryEntry = Omit<DeviceRegistryEntry, 'usb' | 'labelPatterns'> & {
  usb?: DeviceRegistryUsb;
  labelPatterns?: readonly string[];
};

interface DeviceRegistryApi {
  getAll(): DeviceRegistryEntry[];
  get(id: string): DeviceRegistryEntry | undefined;
  register(deviceEntry: DeviceRegistryEntry): void;
  unregister(id: string): boolean;
  registerProfileClass(deviceId: string, ProfileClass: DeviceConstructor): void;
  registerAdapterClass(deviceId: string, AdapterClass: DeviceConstructor): void;
  getProfileClass(deviceId: string): DeviceConstructor | null;
  getAdapterClass(deviceId: string): DeviceConstructor | null;
}

const BUILT_IN_DEVICES: DeviceRegistryEntry[] = DeviceManifest.devices.map((device) => ({
  id: device.id,
  name: device.name,
  manufacturer: device.manufacturer,
  enabled: device.enabled,
  usb: {
    vendorId: device.usb.vendorId,
    productId: device.usb.productId
  },
  labelPatterns: [...device.labelPatterns],
  profileModule: device.modules.profile,
  adapterModule: device.modules.adapter
}));

function freezeDeviceEntry(deviceEntry: DeviceRegistryEntry): DeviceRegistryEntry {
  return Object.freeze({
    ...deviceEntry,
    usb: deviceEntry.usb
      ? Object.freeze({ ...deviceEntry.usb })
      : deviceEntry.usb,
    labelPatterns: Array.isArray(deviceEntry.labelPatterns)
      ? Object.freeze([...deviceEntry.labelPatterns])
      : deviceEntry.labelPatterns
  });
}

const _registeredDevices: DeviceRegistryEntry[] = BUILT_IN_DEVICES.map(freezeDeviceEntry);

function replaceDeviceEntry(deviceId: string, nextEntry: DeviceRegistryEntry): void {
  const index = _registeredDevices.findIndex((device) => device.id === deviceId);
  if (index < 0) {
    throw new Error(`Device ${deviceId} not found in registry`);
  }

  _registeredDevices[index] = freezeDeviceEntry(nextEntry);
}

/**
 * DeviceRegistry - Extensible API for device registration.
 *
 * Process-specific ProfileClass/AdapterClass values are registered at runtime.
 */
export const DeviceRegistry: DeviceRegistryApi = {
  getAll() {
    return [..._registeredDevices];
  },

  get(id) {
    return _registeredDevices.find((device) => device.id === id);
  },

  register(deviceEntry) {
    if (!deviceEntry.id) {
      throw new Error('Device entry must have an id');
    }

    if (this.get(deviceEntry.id)) {
      throw new Error(`Device ${deviceEntry.id} already registered`);
    }

    _registeredDevices.push(freezeDeviceEntry(deviceEntry));
  },

  unregister(id) {
    const index = _registeredDevices.findIndex((device) => device.id === id);
    if (index > -1) {
      _registeredDevices.splice(index, 1);
      return true;
    }

    return false;
  },

  registerProfileClass(deviceId, ProfileClass) {
    const device = this.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found in registry`);
    }

    replaceDeviceEntry(deviceId, {
      ...device,
      ProfileClass
    });
  },

  registerAdapterClass(deviceId, AdapterClass) {
    const device = this.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found in registry`);
    }

    replaceDeviceEntry(deviceId, {
      ...device,
      AdapterClass
    });
  },

  getProfileClass(deviceId) {
    const device = this.get(deviceId);
    return device?.ProfileClass || null;
  },

  getAdapterClass(deviceId) {
    const device = this.get(deviceId);
    return device?.AdapterClass || null;
  }
};

export type { DeviceConstructor, MutableDeviceRegistryEntry };
