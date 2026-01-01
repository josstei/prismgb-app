/**
 * DeviceDetectionHelper Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceDetectionHelper } from '@shared/features/devices/device-detection.utils.js';

describe('DeviceDetectionHelper', () => {
  describe('matchesByLabel', () => {
    it('should return null for null label', () => {
      expect(DeviceDetectionHelper.matchesByLabel(null)).toBeNull();
    });

    it('should return null for undefined label', () => {
      expect(DeviceDetectionHelper.matchesByLabel(undefined)).toBeNull();
    });

    it('should return null for empty label', () => {
      expect(DeviceDetectionHelper.matchesByLabel('')).toBeNull();
    });

    it('should return device ID for Chromatic label', () => {
      expect(DeviceDetectionHelper.matchesByLabel('Chromatic Device')).toBe('chromatic-mod-retro');
    });

    it('should return device ID for ModRetro label', () => {
      expect(DeviceDetectionHelper.matchesByLabel('ModRetro Chromatic')).toBe('chromatic-mod-retro');
    });

    it('should return null for non-Chromatic label', () => {
      expect(DeviceDetectionHelper.matchesByLabel('Generic Webcam')).toBeNull();
    });
  });

  describe('matchesByUSB', () => {
    it('should return null for null device', () => {
      expect(DeviceDetectionHelper.matchesByUSB(null)).toBeNull();
    });

    it('should return null for undefined device', () => {
      expect(DeviceDetectionHelper.matchesByUSB(undefined)).toBeNull();
    });

    it('should return null for empty object', () => {
      expect(DeviceDetectionHelper.matchesByUSB({})).toBeNull();
    });

    it('should return device ID for Chromatic USB identifiers', () => {
      const device = {
        vendorId: 0x374e,
        productId: 0x0101
      };
      expect(DeviceDetectionHelper.matchesByUSB(device)).toBe('chromatic-mod-retro');
    });

    it('should return null for wrong USB identifiers', () => {
      const device = {
        vendorId: 0x1234,
        productId: 0x5678
      };
      expect(DeviceDetectionHelper.matchesByUSB(device)).toBeNull();
    });
  });
});
