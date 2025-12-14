/**
 * ChromaticAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromaticAdapter } from '@features/devices/adapters/chromatic/chromatic.adapter.js';

describe('ChromaticAdapter', () => {
  let adapter;
  let mockIpcClient;
  let mockConstraintBuilder;
  let mockStreamLifecycle;
  let mockLogger;

  beforeEach(() => {
    mockIpcClient = {
      getDeviceProfile: vi.fn()
    };

    mockConstraintBuilder = {
      buildWithStrategy: vi.fn()
    };

    mockStreamLifecycle = {
      acquireStream: vi.fn(),
      releaseStream: vi.fn(),
      getStreamInfo: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    adapter = new ChromaticAdapter({
      ipcClient: mockIpcClient,
      constraintBuilder: mockConstraintBuilder,
      streamLifecycle: mockStreamLifecycle,
      logger: mockLogger
    });
  });

  describe('Constructor', () => {
    it('should throw when ipcClient is not provided', () => {
      expect(() => new ChromaticAdapter({})).toThrow('ChromaticAdapter: ipcClient is required');
    });

    it('should store ipcClient', () => {
      expect(adapter.ipcClient).toBe(mockIpcClient);
    });

    it('should initialize deviceProfile as null', () => {
      expect(adapter.deviceProfile).toBeNull();
    });

    it('should initialize canvasScale from config', () => {
      expect(adapter.canvasScale).toBeDefined();
      expect(typeof adapter.canvasScale).toBe('number');
    });

    it('should create acquisition coordinator', () => {
      expect(adapter.acquisitionCoordinator).toBeDefined();
    });

    it('should use default config when not injected', () => {
      expect(adapter.config).toBeDefined();
      expect(adapter.config.name).toBe('Mod Retro Chromatic');
      expect(adapter.config.display).toBeDefined();
    });

    it('should use default mediaConfig when not injected', () => {
      expect(adapter.mediaConfig).toBeDefined();
      expect(adapter.mediaConfig.video).toBeDefined();
      expect(adapter.mediaConfig.audioFull).toBeDefined();
    });

    it('should use default helpers when not injected', () => {
      expect(adapter.helpers).toBeDefined();
      expect(typeof adapter.helpers.getResolutionByScale).toBe('function');
    });

    it('should accept custom config via dependency injection', () => {
      const customConfig = {
        name: 'Custom Device',
        display: { nativeWidth: 320, nativeHeight: 240 },
        rendering: { canvasScale: 2 }
      };

      const customAdapter = new ChromaticAdapter({
        ipcClient: mockIpcClient,
        constraintBuilder: mockConstraintBuilder,
        streamLifecycle: mockStreamLifecycle,
        logger: mockLogger,
        config: customConfig
      });

      expect(customAdapter.config).toBe(customConfig);
      expect(customAdapter.config.name).toBe('Custom Device');
      expect(customAdapter.canvasScale).toBe(2);
    });

    it('should accept custom mediaConfig via dependency injection', () => {
      const customMediaConfig = {
        video: { width: { ideal: 320 } },
        audioFull: { channelCount: { ideal: 1 } }
      };

      const customAdapter = new ChromaticAdapter({
        ipcClient: mockIpcClient,
        constraintBuilder: mockConstraintBuilder,
        streamLifecycle: mockStreamLifecycle,
        logger: mockLogger,
        mediaConfig: customMediaConfig
      });

      expect(customAdapter.mediaConfig).toBe(customMediaConfig);
      expect(customAdapter.mediaConfig.video.width.ideal).toBe(320);
    });

    it('should accept custom helpers via dependency injection', () => {
      const customHelpers = {
        getResolutionByScale: vi.fn().mockReturnValue({ width: 100, height: 100 })
      };

      const customAdapter = new ChromaticAdapter({
        ipcClient: mockIpcClient,
        constraintBuilder: mockConstraintBuilder,
        streamLifecycle: mockStreamLifecycle,
        logger: mockLogger,
        helpers: customHelpers
      });

      expect(customAdapter.helpers).toBe(customHelpers);
    });
  });

  describe('initialize', () => {
    const mockDeviceInfo = { deviceId: 'dev-1', label: 'Chromatic' };

    it('should load device profile from static config', async () => {
      await adapter.initialize(mockDeviceInfo);

      expect(adapter.deviceProfile).toBeDefined();
      expect(adapter.deviceProfile.name).toBe('Chromatic');
    });

    it('should set profile for constraint building', async () => {
      await adapter.initialize(mockDeviceInfo);

      expect(adapter.profile).toBeDefined();
      expect(adapter.profile.audio).toBeDefined();
      expect(adapter.profile.video).toBeDefined();
    });
  });

  describe('getStream', () => {
    const mockDevice = { deviceId: 'dev-1', label: 'Chromatic' };
    const mockStream = { id: 'stream-1' };

    beforeEach(() => {
      // Mock the acquisitionCoordinator with new acquire API
      adapter.acquisitionCoordinator = {
        acquire: vi.fn().mockResolvedValue({
          stream: mockStream,
          strategy: 'full'
        })
      };

      mockStreamLifecycle.getStreamInfo.mockReturnValue({ id: 'stream-1' });
    });

    it('should initialize if device not yet initialized', async () => {
      adapter.deviceInfo = null;

      await adapter.getStream(mockDevice);

      expect(adapter.deviceInfo).toBe(mockDevice);
    });

    it('should acquire stream with fallback', async () => {
      adapter.deviceInfo = mockDevice;
      adapter.profile = { audio: {}, video: {} };

      const stream = await adapter.getStream(mockDevice);

      expect(stream).toBe(mockStream);
      expect(adapter.acquisitionCoordinator.acquire).toHaveBeenCalled();
    });

    it('should store current stream', async () => {
      adapter.deviceInfo = mockDevice;
      adapter.profile = { audio: {}, video: {} };

      await adapter.getStream(mockDevice);

      expect(adapter.currentStream).toBe(mockStream);
    });

    it('should throw when device not initialized and no device passed', async () => {
      adapter.deviceInfo = null;

      await expect(adapter.getStream(null)).rejects.toThrow('Device not initialized');
    });
  });

  describe('getCapabilities', () => {
    it('should return capabilities with canvas scale', async () => {
      adapter.canvasScale = 4;

      const capabilities = await adapter.getCapabilities();

      expect(capabilities.canvasScale).toBe(4);
      expect(capabilities.nativeResolution).toBeDefined();
      expect(capabilities.audioSupport).toBe(true);
    });

    it('should include native resolution', async () => {
      const capabilities = await adapter.getCapabilities();

      expect(capabilities.nativeResolution.width).toBeDefined();
      expect(capabilities.nativeResolution.height).toBeDefined();
    });

    it('should include canvas resolution', async () => {
      const capabilities = await adapter.getCapabilities();

      expect(capabilities.canvasResolution).toBeDefined();
    });

    it('should use injected config for capabilities', async () => {
      const customConfig = {
        display: {
          nativeWidth: 320,
          nativeHeight: 240,
          pixelPerfect: false,
          resolutions: [{ width: 320, height: 240 }]
        },
        rendering: { canvasScale: 2 }
      };

      const customHelpers = {
        getResolutionByScale: vi.fn().mockReturnValue({ width: 640, height: 480 })
      };

      const customAdapter = new ChromaticAdapter({
        ipcClient: mockIpcClient,
        constraintBuilder: mockConstraintBuilder,
        streamLifecycle: mockStreamLifecycle,
        logger: mockLogger,
        config: customConfig,
        helpers: customHelpers
      });

      const capabilities = await customAdapter.getCapabilities();

      expect(capabilities.nativeResolution.width).toBe(320);
      expect(capabilities.nativeResolution.height).toBe(240);
      expect(capabilities.pixelPerfect).toBe(false);
      expect(capabilities.canvasResolution).toEqual({ width: 640, height: 480 });
      expect(customHelpers.getResolutionByScale).toHaveBeenCalledWith(2);
    });
  });

  describe('ensureDeviceProfile', () => {
    it('should not reload if profile already loaded', async () => {
      adapter.deviceProfile = { name: 'Existing' };

      await adapter.ensureDeviceProfile();

      // Should keep existing profile
      expect(adapter.deviceProfile.name).toBe('Existing');
    });

    it('should load profile from static config', async () => {
      await adapter.ensureDeviceProfile();

      expect(adapter.deviceProfile).toBeDefined();
      expect(adapter.deviceProfile.name).toBe('Chromatic');
      expect(adapter.deviceProfile.rendering).toBeDefined();
    });

    it('should use injected config when loading profile', async () => {
      const customConfig = {
        rendering: { canvasScale: 3, imageSmoothing: true },
        display: { nativeWidth: 320, nativeHeight: 240 },
        media: { video: { width: 320 } }
      };

      const customAdapter = new ChromaticAdapter({
        ipcClient: mockIpcClient,
        constraintBuilder: mockConstraintBuilder,
        streamLifecycle: mockStreamLifecycle,
        logger: mockLogger,
        config: customConfig
      });

      await customAdapter.ensureDeviceProfile();

      expect(customAdapter.deviceProfile.rendering).toBe(customConfig.rendering);
      expect(customAdapter.deviceProfile.display).toBe(customConfig.display);
      expect(customAdapter.deviceProfile.rendering.canvasScale).toBe(3);
    });
  });

  describe('getCanvasScale', () => {
    it('should return current canvas scale', () => {
      adapter.canvasScale = 3;
      expect(adapter.getCanvasScale()).toBe(3);
    });
  });

  describe('setCanvasScale', () => {
    it('should set valid canvas scale', () => {
      adapter.setCanvasScale(5);
      expect(adapter.canvasScale).toBe(5);
    });

    it('should throw for scale less than 1', () => {
      expect(() => adapter.setCanvasScale(0)).toThrow('Scale must be a number between 1 and 8');
    });

    it('should throw for scale greater than 8', () => {
      expect(() => adapter.setCanvasScale(9)).toThrow('Scale must be a number between 1 and 8');
    });

    it('should throw for non-number scale', () => {
      expect(() => adapter.setCanvasScale('4')).toThrow('Scale must be a number between 1 and 8');
    });
  });

  describe('getConfig', () => {
    it('should return chromatic config', () => {
      const config = adapter.getConfig();

      expect(config).toBeDefined();
      expect(config.display).toBeDefined();
    });

    it('should return injected config when provided', () => {
      const customConfig = {
        name: 'Custom Device',
        display: { nativeWidth: 320, nativeHeight: 240 },
        rendering: { canvasScale: 3 }
      };

      const customAdapter = new ChromaticAdapter({
        ipcClient: mockIpcClient,
        constraintBuilder: mockConstraintBuilder,
        streamLifecycle: mockStreamLifecycle,
        logger: mockLogger,
        config: customConfig
      });

      const config = customAdapter.getConfig();

      expect(config).toBe(customConfig);
      expect(config.name).toBe('Custom Device');
      expect(config.display.nativeWidth).toBe(320);
    });
  });

  // Note: isChromatic detection logic has been consolidated into DeviceDetectionHelper
  // See tests/unit/devices/DeviceDetectionHelper.test.js for device detection tests
});
