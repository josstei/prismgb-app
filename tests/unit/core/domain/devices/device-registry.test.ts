import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceRegistry, deviceRegistry } from '@core/domain/devices/device-registry';

describe('DeviceRegistry', () => {
  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = DeviceRegistry.getInstance();
      const instance2 = DeviceRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('findByUsb', () => {
    it('should find Chromatic by USB identifiers', () => {
      const profile = deviceRegistry.findByUsb(0x374e, 0x0101);

      expect(profile).toBeDefined();
      expect(profile?.name).toBe('Mod Retro Chromatic');
    });

    it('should return undefined for unknown USB identifiers', () => {
      const profile = deviceRegistry.findByUsb(0x1234, 0x5678);

      expect(profile).toBeUndefined();
    });
  });

  describe('findByLabel', () => {
    it('should find Chromatic by label', () => {
      const profile = deviceRegistry.findByLabel('Chromatic Video');

      expect(profile).toBeDefined();
      expect(profile?.name).toBe('Mod Retro Chromatic');
    });

    it('should be case-insensitive', () => {
      const profile = deviceRegistry.findByLabel('CHROMATIC');

      expect(profile).toBeDefined();
    });
  });

  describe('isSupported', () => {
    it('should return true for supported devices', () => {
      expect(deviceRegistry.isSupported(0x374e, 0x0101)).toBe(true);
    });

    it('should return false for unsupported devices', () => {
      expect(deviceRegistry.isSupported(0x1234, 0x5678)).toBe(false);
    });
  });
});
