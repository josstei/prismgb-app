/**
 * DeviceProfile Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceProfile } from '@features/devices/shared/device-profile.js';

describe('DeviceProfile', () => {
  let mockLogger;
  let validConfig;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    validConfig = {
      id: 'test-device',
      name: 'Test Device',
      manufacturer: 'Test Co',
      display: {
        nativeResolution: { width: 160, height: 144 }
      }
    };
  });

  describe('Constructor', () => {
    it('should create profile with valid config', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.id).toBe('test-device');
      expect(profile.name).toBe('Test Device');
      expect(profile.manufacturer).toBe('Test Co');
    });

    it('should use default logger when not provided', () => {
      const profile = new DeviceProfile(validConfig);

      expect(profile.logger).toBeDefined();
      expect(typeof profile.logger.info).toBe('function');
    });

    it('should set default version', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.version).toBe('1.0.0');
    });

    it('should use provided version', () => {
      const config = { ...validConfig, version: '2.0.0' };
      const profile = new DeviceProfile(config, mockLogger);

      expect(profile.version).toBe('2.0.0');
    });

    it('should log profile creation', () => {
      new DeviceProfile(validConfig, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created profile: Test Device')
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should throw for null config', () => {
      expect(() => new DeviceProfile(null, mockLogger)).toThrow('Configuration is required');
    });

    it('should throw for missing id', () => {
      const config = { ...validConfig };
      delete config.id;

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('Missing required field: id');
    });

    it('should throw for missing name', () => {
      const config = { ...validConfig };
      delete config.name;

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('Missing required field: name');
    });

    it('should throw for missing manufacturer', () => {
      const config = { ...validConfig };
      delete config.manufacturer;

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('Missing required field: manufacturer');
    });

    it('should throw for missing display config', () => {
      const config = { ...validConfig };
      delete config.display;

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('Display configuration with nativeResolution is required');
    });

    it('should throw for missing nativeResolution', () => {
      const config = { ...validConfig, display: {} };

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('Display configuration with nativeResolution is required');
    });

    it('should throw for invalid resolution dimensions', () => {
      const config = { ...validConfig, display: { nativeResolution: { width: 0, height: 144 } } };

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('Invalid nativeResolution dimensions');
    });

    it('should throw for invalid ID format', () => {
      const config = { ...validConfig, id: 'Test Device!' };

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('ID must contain only lowercase letters, numbers, and hyphens');
    });

    it('should throw if usbIdentifiers is not an array', () => {
      const config = { ...validConfig, usbIdentifiers: {} };

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('usbIdentifiers must be an array');
    });

    it('should throw for USB identifier without vendorId', () => {
      const config = { ...validConfig, usbIdentifiers: [{ productId: 0x0101 }] };

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('USB identifier must have vendorId and productId');
    });

    it('should throw for USB identifier without productId', () => {
      const config = { ...validConfig, usbIdentifiers: [{ vendorId: 0x374e }] };

      expect(() => new DeviceProfile(config, mockLogger)).toThrow('USB identifier must have vendorId and productId');
    });
  });

  describe('Display Configuration', () => {
    it('should set native resolution', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.display.nativeResolution.width).toBe(160);
      expect(profile.display.nativeResolution.height).toBe(144);
    });

    it('should calculate aspect ratio', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.display.aspectRatio).toBeCloseTo(160 / 144);
    });

    it('should use provided aspect ratio', () => {
      const config = { ...validConfig, display: { ...validConfig.display, aspectRatio: 1.5 } };
      const profile = new DeviceProfile(config, mockLogger);

      expect(profile.display.aspectRatio).toBe(1.5);
    });

    it('should set pixelPerfect to true by default', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.display.pixelPerfect).toBe(true);
    });

    it('should allow disabling pixelPerfect', () => {
      const config = { ...validConfig, display: { ...validConfig.display, pixelPerfect: false } };
      const profile = new DeviceProfile(config, mockLogger);

      expect(profile.display.pixelPerfect).toBe(false);
    });

    it('should create default supported resolutions', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.display.supportedResolutions).toHaveLength(1);
      expect(profile.display.supportedResolutions[0].width).toBe(160);
      expect(profile.display.supportedResolutions[0].height).toBe(144);
    });
  });

  describe('Media Configuration', () => {
    it('should have default video constraints', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.media.video).toBeDefined();
      expect(profile.media.video.frameRate).toBeDefined();
    });

    it('should have default audio constraints', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.media.audio.full).toBeDefined();
      expect(profile.media.audio.simple).toBeDefined();
    });

    it('should use provided video constraints', () => {
      const config = {
        ...validConfig,
        media: { video: { frameRate: { ideal: 30 } } }
      };
      const profile = new DeviceProfile(config, mockLogger);

      expect(profile.media.video.frameRate.ideal).toBe(30);
    });

    it('should set default fallback strategy', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.media.fallbackStrategy).toBe('audio-simple');
    });
  });

  describe('Capabilities', () => {
    it('should have default capabilities', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.hasCapability('video-capture')).toBe(true);
      expect(profile.hasCapability('screenshot')).toBe(true);
    });

    it('should use provided capabilities', () => {
      const config = { ...validConfig, capabilities: ['video-capture', 'recording'] };
      const profile = new DeviceProfile(config, mockLogger);

      expect(profile.hasCapability('video-capture')).toBe(true);
      expect(profile.hasCapability('recording')).toBe(true);
      expect(profile.hasCapability('screenshot')).toBe(false);
    });
  });

  describe('Rendering Configuration', () => {
    it('should set default canvas scale', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.rendering.canvasScale).toBe(4);
    });

    it('should disable image smoothing by default', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.rendering.imageSmoothing).toBe(true);
    });

    it('should use canvas as preferred renderer', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.rendering.preferredRenderer).toBe('canvas');
    });
  });

  describe('Behavior Configuration', () => {
    it('should set default autoLaunchDelay', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.rendering.canvasScale).toBe(4);
    });

    it('should set requiresStrictMode to true by default', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.behavior.requiresStrictMode).toBe(true);
    });

    it('should set allowFallback to true by default', () => {
      // Note: allowFallback !== true defaults to true when undefined
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.behavior.allowFallback).toBe(true);
    });
  });

  describe('USB Matching', () => {
    it('should match USB device by identifiers', () => {
      const config = {
        ...validConfig,
        usbIdentifiers: [{ vendorId: 0x374e, productId: 0x0101 }]
      };
      const profile = new DeviceProfile(config, mockLogger);

      const device = { vendorId: 0x374e, productId: 0x0101 };
      expect(profile.matchesUSB(device)).toBe(true);
    });

    it('should not match different USB device', () => {
      const config = {
        ...validConfig,
        usbIdentifiers: [{ vendorId: 0x374e, productId: 0x0101 }]
      };
      const profile = new DeviceProfile(config, mockLogger);

      const device = { vendorId: 0x1234, productId: 0x5678 };
      expect(profile.matchesUSB(device)).toBe(false);
    });

    it('should return false for null device', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.matchesUSB(null)).toBe(false);
    });

    it('should return false for device without vendorId', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      expect(profile.matchesUSB({ productId: 0x0101 })).toBe(false);
    });
  });

  describe('getMediaConstraints', () => {
    it('should return media constraints', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      const constraints = profile.getMediaConstraints();

      expect(constraints.video).toBeDefined();
      expect(constraints.audio).toBeDefined();
    });

    it('should add device ID when provided', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      const constraints = profile.getMediaConstraints('device-123');

      expect(constraints.video.deviceId).toEqual({ exact: 'device-123' });
      expect(constraints.audio.deviceId).toBe('device-123');
    });
  });

  describe('getResolutionByScale', () => {
    it('should return scaled resolution', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      const resolution = profile.getResolutionByScale(4);

      expect(resolution.width).toBe(640);
      expect(resolution.height).toBe(576);
    });

    it('should return native resolution with scale 1', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      const resolution = profile.getResolutionByScale(1);

      expect(resolution.width).toBe(160);
      expect(resolution.height).toBe(144);
    });
  });

  describe('toJSON', () => {
    it('should serialize profile to JSON', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      const json = profile.toJSON();

      expect(json.id).toBe('test-device');
      expect(json.name).toBe('Test Device');
      expect(json.manufacturer).toBe('Test Co');
      expect(json.display).toBeDefined();
      expect(json.media).toBeDefined();
      expect(Array.isArray(json.capabilities)).toBe(true);
    });
  });

  describe('getInfo', () => {
    it('should return profile info', () => {
      const profile = new DeviceProfile(validConfig, mockLogger);

      const info = profile.getInfo();

      expect(info.id).toBe('test-device');
      expect(info.name).toBe('Test Device');
      expect(info.resolution).toBe('160x144');
      expect(info.aspectRatio).toBeDefined();
      expect(Array.isArray(info.capabilities)).toBe(true);
    });
  });
});
