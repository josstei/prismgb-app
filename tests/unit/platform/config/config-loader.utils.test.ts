/**
 * ConfigLoader Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { appConfig, uiConfig } from '@platform/config';

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

    it('should be frozen', () => {
      expect(Object.isFrozen(appConfig)).toBe(true);
    });
  });

  describe('uiConfig', () => {
    it('should export WINDOW_CONFIG with required properties', () => {
      const windowConfig: typeof uiConfig.WINDOW_CONFIG = uiConfig.WINDOW_CONFIG;

      expect(windowConfig).toBeDefined();
      expect(windowConfig.width).toBe(1280);
      expect(windowConfig.height).toBe(720);
      expect(windowConfig.minWidth).toBe(800);
      expect(windowConfig.minHeight).toBe(600);
      expect(windowConfig.title).toBe('PrismGB Launcher');
      expect(windowConfig.backgroundColor).toBeDefined();
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(uiConfig)).toBe(true);
    });
  });

  describe('Config Integrity', () => {
    it('should not allow modification of appConfig', () => {
      const frozenConfig: typeof appConfig = appConfig;

      expect(Object.isFrozen(appConfig)).toBe(true);
      expect(() => {
        frozenConfig.DEVICE_LAUNCH_DELAY = 9999;
      }).toThrow();
    });

    it('should not allow modification of uiConfig', () => {
      expect(Object.isFrozen(uiConfig)).toBe(true);
    });
  });
});
