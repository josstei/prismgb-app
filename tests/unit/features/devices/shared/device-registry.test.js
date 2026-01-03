/**
 * DeviceRegistry Unit Tests
 * Tests for the extensible device registry API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeviceRegistry, DEVICE_REGISTRY } from '@shared/features/devices/device.registry.js';
import { DeviceChromaticProfile } from '@shared/features/devices/profiles/chromatic/device-chromatic.profile.js';
import { DeviceChromaticAdapter } from '@renderer/features/devices/adapters/chromatic/device-chromatic.adapter.js';

describe('DeviceRegistry', () => {
  let initialDeviceCount;

  beforeEach(() => {
    // Store initial count to restore after tests
    initialDeviceCount = DeviceRegistry.getAll().length;
  });

  afterEach(() => {
    // Clean up any registered test devices
    const currentDevices = DeviceRegistry.getAll();
    for (const device of currentDevices) {
      if (device.id.startsWith('test-')) {
        DeviceRegistry.unregister(device.id);
      }
    }
  });

  describe('getAll()', () => {
    it('should return array of all registered devices', () => {
      const devices = DeviceRegistry.getAll();
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBeGreaterThan(0);
    });

    it('should return a copy, not the internal array', () => {
      const devices1 = DeviceRegistry.getAll();
      const devices2 = DeviceRegistry.getAll();
      expect(devices1).not.toBe(devices2);
      expect(devices1).toEqual(devices2);
    });

    it('should include built-in Chromatic device', () => {
      const devices = DeviceRegistry.getAll();
      const chromatic = devices.find(d => d.id === 'chromatic-mod-retro');
      expect(chromatic).toBeDefined();
      expect(chromatic.name).toBe('Mod Retro Chromatic');
      expect(chromatic.manufacturer).toBe('ModRetro');
      expect(chromatic.enabled).toBe(true);
    });
  });

  describe('get(id)', () => {
    it('should return device by id', () => {
      const device = DeviceRegistry.get('chromatic-mod-retro');
      expect(device).toBeDefined();
      expect(device.id).toBe('chromatic-mod-retro');
    });

    it('should return undefined for non-existent device', () => {
      const device = DeviceRegistry.get('non-existent-device');
      expect(device).toBeUndefined();
    });
  });

  describe('register(deviceEntry)', () => {
    it('should register a new device', () => {
      const testDevice = {
        id: 'test-device-1',
        name: 'Test Device',
        manufacturer: 'Test Corp',
        enabled: true,
        usb: { vendorId: 0x1234, productId: 0x5678 },
        labelPatterns: ['test'],
        profileModule: '@/test/profile.js',
        adapterModule: '@/test/adapter.js'
      };

      DeviceRegistry.register(testDevice);

      const registered = DeviceRegistry.get('test-device-1');
      expect(registered).toBeDefined();
      expect(registered.name).toBe('Test Device');
    });

    it('should freeze registered device entry', () => {
      const testDevice = {
        id: 'test-device-2',
        name: 'Test Device 2',
        manufacturer: 'Test Corp',
        enabled: true
      };

      DeviceRegistry.register(testDevice);
      const registered = DeviceRegistry.get('test-device-2');

      expect(() => {
        registered.name = 'Changed Name';
      }).toThrow();
    });

    it('should throw error if device lacks id', () => {
      const invalidDevice = {
        name: 'No ID Device'
      };

      expect(() => {
        DeviceRegistry.register(invalidDevice);
      }).toThrow('Device entry must have an id');
    });

    it('should throw error if device already exists', () => {
      const testDevice = {
        id: 'test-device-3',
        name: 'Test Device 3',
        enabled: true
      };

      DeviceRegistry.register(testDevice);

      expect(() => {
        DeviceRegistry.register(testDevice);
      }).toThrow('Device test-device-3 already registered');
    });

    it('should not allow registering built-in device again', () => {
      const chromaticDevice = {
        id: 'chromatic-mod-retro',
        name: 'Duplicate Chromatic',
        enabled: true
      };

      expect(() => {
        DeviceRegistry.register(chromaticDevice);
      }).toThrow('Device chromatic-mod-retro already registered');
    });
  });

  describe('unregister(id)', () => {
    it('should unregister a device', () => {
      const testDevice = {
        id: 'test-device-4',
        name: 'Test Device 4',
        enabled: true
      };

      DeviceRegistry.register(testDevice);
      expect(DeviceRegistry.get('test-device-4')).toBeDefined();

      const result = DeviceRegistry.unregister('test-device-4');
      expect(result).toBe(true);
      expect(DeviceRegistry.get('test-device-4')).toBeUndefined();
    });

    it('should return false for non-existent device', () => {
      const result = DeviceRegistry.unregister('non-existent-device');
      expect(result).toBe(false);
    });

    it('should allow unregistering built-in devices', () => {
      // This is intentional to allow customization
      const result = DeviceRegistry.unregister('chromatic-mod-retro');
      expect(result).toBe(true);
      expect(DeviceRegistry.get('chromatic-mod-retro')).toBeUndefined();

      // Re-register for other tests
      const chromatic = {
        id: 'chromatic-mod-retro',
        name: 'Mod Retro Chromatic',
        manufacturer: 'ModRetro',
        enabled: true,
        usb: { vendorId: 0x374e, productId: 0x0101 },
        labelPatterns: ['chromatic', 'modretro', 'mod retro', '374e:0101'],
        profileModule: '@shared/features/devices/profiles/chromatic/device-chromatic.profile.js',
        adapterModule: '@renderer/features/devices/adapters/chromatic/device-chromatic.adapter.js',
        ProfileClass: DeviceChromaticProfile,
        AdapterClass: DeviceChromaticAdapter
      };
      DeviceRegistry.register(chromatic);
    });
  });

  describe('DEVICE_REGISTRY alias', () => {
    it('should export DEVICE_REGISTRY array', () => {
      expect(DEVICE_REGISTRY).toBeDefined();
      expect(Array.isArray(DEVICE_REGISTRY)).toBe(true);
    });

    it('should reflect changes made via DeviceRegistry API', () => {
      const initialLength = DEVICE_REGISTRY.length;

      const testDevice = {
        id: 'test-device-5',
        name: 'Test Device 5',
        enabled: true
      };

      DeviceRegistry.register(testDevice);
      expect(DEVICE_REGISTRY.length).toBe(initialLength + 1);

      const found = DEVICE_REGISTRY.find(d => d.id === 'test-device-5');
      expect(found).toBeDefined();
      expect(found.name).toBe('Test Device 5');

      DeviceRegistry.unregister('test-device-5');
      expect(DEVICE_REGISTRY.length).toBe(initialLength);
    });

    it('should work with for...of loops', () => {
      let foundChromatic = false;
      for (const device of DEVICE_REGISTRY) {
        if (device.id === 'chromatic-mod-retro') {
          foundChromatic = true;
          break;
        }
      }
      expect(foundChromatic).toBe(true);
    });

    it('should work with .filter()', () => {
      const enabledDevices = DEVICE_REGISTRY.filter(d => d.enabled);
      expect(enabledDevices.length).toBeGreaterThan(0);
    });
  });

  describe('getProfileClass(deviceId)', () => {
    it('should return ProfileClass for chromatic device', () => {
      const ProfileClass = DeviceRegistry.getProfileClass('chromatic-mod-retro');
      expect(ProfileClass).toBeDefined();
      expect(ProfileClass).not.toBeNull();
      // Verify it's a constructor by checking it can be instantiated
      expect(() => new ProfileClass()).not.toThrow();
    });

    it('should return null for non-existent device', () => {
      const ProfileClass = DeviceRegistry.getProfileClass('non-existent');
      expect(ProfileClass).toBeNull();
    });

    it('should return null for device without ProfileClass', () => {
      const testDevice = {
        id: 'test-no-profile',
        name: 'No Profile Device',
        enabled: true
      };
      DeviceRegistry.register(testDevice);

      const ProfileClass = DeviceRegistry.getProfileClass('test-no-profile');
      expect(ProfileClass).toBeNull();
    });
  });

  describe('getAdapterClass(deviceId)', () => {
    it('should return AdapterClass for chromatic device', () => {
      const AdapterClass = DeviceRegistry.getAdapterClass('chromatic-mod-retro');
      expect(AdapterClass).toBeDefined();
      expect(AdapterClass).not.toBeNull();
      // Verify it's a constructor (we can't instantiate without dependencies)
      expect(AdapterClass.prototype).toBeDefined();
    });

    it('should return null for non-existent device', () => {
      const AdapterClass = DeviceRegistry.getAdapterClass('non-existent');
      expect(AdapterClass).toBeNull();
    });

    it('should return null for device without AdapterClass', () => {
      const testDevice = {
        id: 'test-no-adapter',
        name: 'No Adapter Device',
        enabled: true
      };
      DeviceRegistry.register(testDevice);

      const AdapterClass = DeviceRegistry.getAdapterClass('test-no-adapter');
      expect(AdapterClass).toBeNull();
    });
  });

  describe('DeviceChromaticProfile', () => {
    it('should have matchesLabel method', () => {
      const profile = new DeviceChromaticProfile();
      expect(profile.matchesLabel).toBeDefined();
      expect(typeof profile.matchesLabel).toBe('function');
    });

    it('should match chromatic labels', () => {
      const profile = new DeviceChromaticProfile();
      expect(profile.matchesLabel('chromatic')).toBe(true);
      expect(profile.matchesLabel('Chromatic Device')).toBe(true);
    });

    it('should not match non-chromatic labels', () => {
      const profile = new DeviceChromaticProfile();
      expect(profile.matchesLabel('Some Other Device')).toBe(false);
      expect(profile.matchesLabel(null)).toBe(false);
    });
  });

  describe('integration with device system', () => {
    it('should support full device lifecycle', () => {
      // Register device
      const testDevice = {
        id: 'test-device-lifecycle',
        name: 'Lifecycle Test Device',
        manufacturer: 'Test Corp',
        enabled: true,
        usb: { vendorId: 0xAAAA, productId: 0xBBBB },
        labelPatterns: ['lifecycle-test'],
        profileModule: '@/test/profile.js',
        adapterModule: '@/test/adapter.js'
      };

      DeviceRegistry.register(testDevice);

      // Verify registration
      const registered = DeviceRegistry.get('test-device-lifecycle');
      expect(registered).toBeDefined();

      // Verify in getAll()
      const allDevices = DeviceRegistry.getAll();
      expect(allDevices.find(d => d.id === 'test-device-lifecycle')).toBeDefined();

      // Unregister
      DeviceRegistry.unregister('test-device-lifecycle');

      // Verify removal
      expect(DeviceRegistry.get('test-device-lifecycle')).toBeUndefined();
      expect(DeviceRegistry.getAll().find(d => d.id === 'test-device-lifecycle')).toBeUndefined();
    });

    it('should support multiple custom devices', () => {
      const device1 = {
        id: 'test-multi-1',
        name: 'Multi Device 1',
        enabled: true
      };

      const device2 = {
        id: 'test-multi-2',
        name: 'Multi Device 2',
        enabled: false
      };

      DeviceRegistry.register(device1);
      DeviceRegistry.register(device2);

      const allDevices = DeviceRegistry.getAll();
      expect(allDevices.find(d => d.id === 'test-multi-1')).toBeDefined();
      expect(allDevices.find(d => d.id === 'test-multi-2')).toBeDefined();

      DeviceRegistry.unregister('test-multi-1');
      DeviceRegistry.unregister('test-multi-2');
    });
  });
});
