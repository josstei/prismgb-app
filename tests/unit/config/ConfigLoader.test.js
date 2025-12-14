/**
 * ConfigLoader Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { appConfig, uiConfig } from '../../../src/shared/config/config-loader.js';

describe('ConfigLoader', () => {
  describe('appConfig', () => {
    it('should export DEVICE_LAUNCH_DELAY as a number', () => {
      expect(typeof appConfig.DEVICE_LAUNCH_DELAY).toBe('number');
      expect(appConfig.DEVICE_LAUNCH_DELAY).toBeGreaterThanOrEqual(0);
    });

    it('should export USB_SCAN_DELAY as a number', () => {
      expect(typeof appConfig.USB_SCAN_DELAY).toBe('number');
      expect(appConfig.USB_SCAN_DELAY).toBeGreaterThanOrEqual(0);
    });

    it('should export USB_INIT_DELAY as a number', () => {
      expect(typeof appConfig.USB_INIT_DELAY).toBe('number');
      expect(appConfig.USB_INIT_DELAY).toBeGreaterThanOrEqual(0);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(appConfig)).toBe(true);
    });
  });

  describe('uiConfig', () => {
    it('should export WINDOW_CONFIG with required properties', () => {
      expect(uiConfig.WINDOW_CONFIG).toBeDefined();
      expect(uiConfig.WINDOW_CONFIG.width).toBe(1280);
      expect(uiConfig.WINDOW_CONFIG.height).toBe(720);
      expect(uiConfig.WINDOW_CONFIG.minWidth).toBe(800);
      expect(uiConfig.WINDOW_CONFIG.minHeight).toBe(600);
      expect(uiConfig.WINDOW_CONFIG.title).toBe('PrismGB Launcher');
      expect(uiConfig.WINDOW_CONFIG.backgroundColor).toBeDefined();
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(uiConfig)).toBe(true);
    });
  });

  describe('Config Integrity', () => {
    it('should not allow modification of appConfig', () => {
      expect(Object.isFrozen(appConfig)).toBe(true);
      expect(() => {
        appConfig.DEVICE_LAUNCH_DELAY = 9999;
      }).toThrow();
    });

    it('should not allow modification of uiConfig', () => {
      expect(Object.isFrozen(uiConfig)).toBe(true);
    });
  });
});
