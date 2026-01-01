/**
 * Device Iterator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { forEachDeviceWithModule } from '@shared/features/devices/device-iterator.utils.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';

describe('Device Iterator', () => {
  let mockDevices;
  let mockLogger;
  let getAllSpy;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockDevices = [
      {
        id: 'device1',
        enabled: true,
        profileModule: './profiles/device1.js',
        adapterModule: './adapters/device1.js'
      },
      {
        id: 'device2',
        enabled: true,
        profileModule: './profiles/device2.js',
        adapterModule: null
      },
      {
        id: 'device3',
        enabled: false,
        profileModule: './profiles/device3.js',
        adapterModule: './adapters/device3.js'
      },
      {
        id: 'device4',
        enabled: true,
        profileModule: null,
        adapterModule: './adapters/device4.js'
      }
    ];

    getAllSpy = vi.spyOn(DeviceRegistry, 'getAll').mockReturnValue(mockDevices);
  });

  describe('forEachDeviceWithModule', () => {
    it('should iterate over devices with specified module type', () => {
      const callback = vi.fn();

      forEachDeviceWithModule('profileModule', callback);

      // Only device1 and device2 have profileModule and are enabled
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(mockDevices[0]);
      expect(callback).toHaveBeenCalledWith(mockDevices[1]);
    });

    it('should skip disabled devices', () => {
      const callback = vi.fn();

      forEachDeviceWithModule('profileModule', callback, { logger: mockLogger });

      expect(mockLogger.debug).toHaveBeenCalledWith('Skipping disabled device: device3');
      expect(callback).not.toHaveBeenCalledWith(mockDevices[2]);
    });

    it('should skip devices without the specified module', () => {
      const callback = vi.fn();

      forEachDeviceWithModule('profileModule', callback, { logger: mockLogger });

      expect(mockLogger.debug).toHaveBeenCalledWith('Device device4 has no profileModule');
      expect(callback).not.toHaveBeenCalledWith(mockDevices[3]);
    });

    it('should work with adapterModule type', () => {
      const callback = vi.fn();

      forEachDeviceWithModule('adapterModule', callback);

      // device1 and device4 have adapterModule and are enabled
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(mockDevices[0]);
      expect(callback).toHaveBeenCalledWith(mockDevices[3]);
    });

    it('should work without logger option', () => {
      const callback = vi.fn();

      // Should not throw
      expect(() => forEachDeviceWithModule('profileModule', callback)).not.toThrow();
    });

    it('should log debug message when device is disabled', () => {
      const callback = vi.fn();

      forEachDeviceWithModule('profileModule', callback, { logger: mockLogger });

      expect(mockLogger.debug).toHaveBeenCalledWith('Skipping disabled device: device3');
    });

    it('should log debug message when device has no module', () => {
      const callback = vi.fn();

      forEachDeviceWithModule('adapterModule', callback, { logger: mockLogger });

      expect(mockLogger.debug).toHaveBeenCalledWith('Device device2 has no adapterModule');
    });

    it('should call callback with the device object', () => {
      const callback = vi.fn();

      forEachDeviceWithModule('profileModule', callback);

      expect(callback.mock.calls[0][0]).toEqual({
        id: 'device1',
        enabled: true,
        profileModule: './profiles/device1.js',
        adapterModule: './adapters/device1.js'
      });
    });

    it('should handle empty device registry', () => {
      getAllSpy.mockReturnValue([]);
      const callback = vi.fn();

      forEachDeviceWithModule('profileModule', callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle all disabled devices', () => {
      getAllSpy.mockReturnValue([
        { id: 'disabled1', enabled: false, profileModule: './profile.js' },
        { id: 'disabled2', enabled: false, profileModule: './profile.js' }
      ]);
      const callback = vi.fn();

      forEachDeviceWithModule('profileModule', callback);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
