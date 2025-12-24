/**
 * Chromatic Config Helpers Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { chromaticHelpers, chromaticConfig } from '@shared/features/devices/profiles/chromatic/chromatic.config.js';

describe('chromaticHelpers', () => {
  describe('matchesUSB', () => {
    it('should return true for matching USB device', () => {
      const usbDevice = {
        vendorId: chromaticConfig.usb.vendorId,
        productId: chromaticConfig.usb.productId
      };

      expect(chromaticHelpers.matchesUSB(usbDevice)).toBe(true);
    });

    it('should return false for non-matching vendorId', () => {
      const usbDevice = {
        vendorId: 0x9999,
        productId: chromaticConfig.usb.productId
      };

      expect(chromaticHelpers.matchesUSB(usbDevice)).toBe(false);
    });

    it('should return false for non-matching productId', () => {
      const usbDevice = {
        vendorId: chromaticConfig.usb.vendorId,
        productId: 0x9999
      };

      expect(chromaticHelpers.matchesUSB(usbDevice)).toBe(false);
    });

    it('should return false for null device', () => {
      expect(chromaticHelpers.matchesUSB(null)).toBe(false);
    });

    it('should return false for undefined device', () => {
      expect(chromaticHelpers.matchesUSB(undefined)).toBe(false);
    });

    it('should return false for device without vendorId', () => {
      const usbDevice = {
        productId: chromaticConfig.usb.productId
      };

      expect(chromaticHelpers.matchesUSB(usbDevice)).toBe(false);
    });

    it('should return false for device without productId', () => {
      const usbDevice = {
        vendorId: chromaticConfig.usb.vendorId
      };

      expect(chromaticHelpers.matchesUSB(usbDevice)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(chromaticHelpers.matchesUSB({})).toBe(false);
    });
  });

  describe('matchesLabel', () => {
    it('should return true for chromatic label', () => {
      expect(chromaticHelpers.matchesLabel('chromatic')).toBe(true);
    });

    it('should return true for Chromatic with capital C', () => {
      expect(chromaticHelpers.matchesLabel('Chromatic')).toBe(true);
    });

    it('should return true for CHROMATIC all caps', () => {
      expect(chromaticHelpers.matchesLabel('CHROMATIC')).toBe(true);
    });

    it('should return true for label containing chromatic', () => {
      expect(chromaticHelpers.matchesLabel('Mod Retro Chromatic')).toBe(true);
    });

    it('should return true for label with chromatic in middle', () => {
      expect(chromaticHelpers.matchesLabel('USB Chromatic Device')).toBe(true);
    });

    it('should return false for non-matching label', () => {
      expect(chromaticHelpers.matchesLabel('Some Other Device')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(chromaticHelpers.matchesLabel('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(chromaticHelpers.matchesLabel(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(chromaticHelpers.matchesLabel(undefined)).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(chromaticHelpers.matchesLabel('ChRoMaTiC')).toBe(true);
      expect(chromaticHelpers.matchesLabel('CHROMATIC')).toBe(true);
      expect(chromaticHelpers.matchesLabel('chromatic')).toBe(true);
    });
  });

  describe('getResolutionByScale', () => {
    it('should return native resolution for scale 1', () => {
      const result = chromaticHelpers.getResolutionByScale(1);

      expect(result).toEqual({
        width: chromaticConfig.display.nativeWidth,
        height: chromaticConfig.display.nativeHeight,
        scale: 1
      });
    });

    it('should return doubled resolution for scale 2', () => {
      const result = chromaticHelpers.getResolutionByScale(2);

      expect(result).toEqual({
        width: chromaticConfig.display.nativeWidth * 2,
        height: chromaticConfig.display.nativeHeight * 2,
        scale: 2
      });
    });

    it('should return tripled resolution for scale 3', () => {
      const result = chromaticHelpers.getResolutionByScale(3);

      expect(result).toEqual({
        width: chromaticConfig.display.nativeWidth * 3,
        height: chromaticConfig.display.nativeHeight * 3,
        scale: 3
      });
    });

    it('should handle fractional scales', () => {
      const result = chromaticHelpers.getResolutionByScale(1.5);

      expect(result.width).toBe(chromaticConfig.display.nativeWidth * 1.5);
      expect(result.height).toBe(chromaticConfig.display.nativeHeight * 1.5);
      expect(result.scale).toBe(1.5);
    });

    it('should handle scale of 0', () => {
      const result = chromaticHelpers.getResolutionByScale(0);

      expect(result).toEqual({
        width: 0,
        height: 0,
        scale: 0
      });
    });

    it('should handle negative scales', () => {
      const result = chromaticHelpers.getResolutionByScale(-1);

      expect(result.width).toBe(chromaticConfig.display.nativeWidth * -1);
      expect(result.height).toBe(chromaticConfig.display.nativeHeight * -1);
      expect(result.scale).toBe(-1);
    });

    it('should handle large scales', () => {
      const result = chromaticHelpers.getResolutionByScale(10);

      expect(result).toEqual({
        width: chromaticConfig.display.nativeWidth * 10,
        height: chromaticConfig.display.nativeHeight * 10,
        scale: 10
      });
    });
  });

  describe('Frozen Object', () => {
    it('should be a frozen object', () => {
      expect(Object.isFrozen(chromaticHelpers)).toBe(true);
    });

    it('should not allow adding new methods', () => {
      expect(() => {
        chromaticHelpers.newMethod = () => {};
      }).toThrow();
    });

    it('should not allow modifying existing methods', () => {
      expect(() => {
        chromaticHelpers.matchesUSB = () => {};
      }).toThrow();
    });

    it('should not allow deleting methods', () => {
      expect(() => {
        delete chromaticHelpers.matchesUSB;
      }).toThrow();
    });
  });
});
