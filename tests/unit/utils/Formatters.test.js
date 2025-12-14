/**
 * Formatters Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { formatDeviceInfo } from '../../../src/shared/utils/formatters.js';

describe('Formatters', () => {
  describe('formatDeviceInfo', () => {
    it('should format device with vendorId and productId (numeric)', () => {
      const device = {
        vendorId: 0x1234,
        productId: 0x5678,
        deviceName: 'Test Device'
      };

      const result = formatDeviceInfo(device);

      expect(result.vid).toBe('0x1234');
      expect(result.pid).toBe('0x5678');
      expect(result.name).toBe('Test Device');
    });

    it('should format device with vid and pid (hex strings)', () => {
      const device = {
        vid: '1234',
        pid: '5678',
        deviceName: 'Test Device'
      };

      const result = formatDeviceInfo(device);

      expect(result.vid).toBe('0x1234');
      expect(result.pid).toBe('0x5678');
    });

    it('should pad hex values with leading zeros', () => {
      const device = {
        vendorId: 0x12,
        productId: 0x3,
        deviceName: 'Test'
      };

      const result = formatDeviceInfo(device);

      expect(result.vid).toBe('0x0012');
      expect(result.pid).toBe('0x0003');
    });

    it('should use deviceName as primary name source', () => {
      const device = {
        deviceName: 'Device Name',
        configName: 'Config Name',
        name: 'Name'
      };

      const result = formatDeviceInfo(device);
      expect(result.name).toBe('Device Name');
    });

    it('should fallback to configName', () => {
      const device = {
        configName: 'Config Name',
        name: 'Name'
      };

      const result = formatDeviceInfo(device);
      expect(result.name).toBe('Config Name');
    });

    it('should fallback to name', () => {
      const device = { name: 'Name' };
      const result = formatDeviceInfo(device);
      expect(result.name).toBe('Name');
    });

    it('should use Unknown for missing name', () => {
      const device = {};
      const result = formatDeviceInfo(device);
      expect(result.name).toBe('Unknown');
    });

    it('should format deviceClass as hex', () => {
      const device = {
        deviceClass: 0x0E,
        deviceName: 'Test'
      };

      const result = formatDeviceInfo(device);
      expect(result.class).toBe('0xe');
    });

    it('should handle class property instead of deviceClass', () => {
      const device = {
        class: 0x0E,
        deviceName: 'Test'
      };

      const result = formatDeviceInfo(device);
      expect(result.class).toBe('0xe');
    });

    it('should return null class for missing deviceClass', () => {
      const device = { deviceName: 'Test' };
      const result = formatDeviceInfo(device);
      expect(result.class).toBeNull();
    });

    it('should return null ids for missing vendor/product info', () => {
      const device = { deviceName: 'Test' };
      const result = formatDeviceInfo(device);
      expect(result.vid).toBeUndefined();
      expect(result.pid).toBeUndefined();
    });

    it('should handle partial vendor info (only vendorId)', () => {
      const device = { vendorId: 0x1234, deviceName: 'Test' };
      const result = formatDeviceInfo(device);
      // Should not include ids if only one is present
      expect(result.vid).toBeUndefined();
    });
  });

});
