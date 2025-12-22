/**
 * AdapterFactory Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AdapterFactory } from '@renderer/features/streaming/factories/adapter.factory.js';

// Mock ConstraintBuilder and BaseStreamLifecycle
vi.mock('@renderer/features/streaming/acquisition/constraint.builder.js', () => {
  return {
    ConstraintBuilder: class MockConstraintBuilder {
      constructor() {}
    }
  };
});

vi.mock('@renderer/features/streaming/acquisition/stream.lifecycle.js', () => {
  return {
    BaseStreamLifecycle: class MockBaseStreamLifecycle {
      constructor() {}
    }
  };
});

// Mock ChromaticAdapter - this will be used by dynamic imports automatically
vi.mock('@renderer/features/devices/adapters/chromatic/chromatic.adapter.js', () => {
  class MockChromaticAdapter {
    constructor(deps) {
      this.deps = deps;
    }
  }
  return {
    default: MockChromaticAdapter,
    ChromaticAdapter: MockChromaticAdapter
  };
});

describe('AdapterFactory', () => {
  let factory;
  let mockEventBus;
  let mockLoggerFactory;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    factory = new AdapterFactory(mockEventBus, mockLoggerFactory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store event bus', () => {
      expect(factory.eventBus).toBe(mockEventBus);
    });

    it('should store logger factory', () => {
      expect(factory.loggerFactory).toBe(mockLoggerFactory);
    });

    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('AdapterFactory');
      expect(factory.logger).toBe(mockLogger);
    });

    it('should initialize adapter and metadata registries', () => {
      expect(factory.adapterRegistry).toBeInstanceOf(Map);
      expect(factory.metadataRegistry).toBeInstanceOf(Map);
    });

    it('should initialize as not initialized', () => {
      expect(factory.initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should register chromatic adapter', async () => {
      await factory.initialize();

      // Debug: check if any errors were logged
      if (mockLogger.error.mock.calls.length > 0) {
        console.log('Errors during initialization:', mockLogger.error.mock.calls);
      }

      expect(factory.hasAdapter('chromatic-mod-retro')).toBe(true);
    });

    it('should set initialized to true', async () => {
      await factory.initialize();

      expect(factory.initialized).toBe(true);
    });

    it('should log initialization info', async () => {
      await factory.initialize();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should warn if already initialized', async () => {
      await factory.initialize();
      await factory.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('AdapterFactory already initialized');
    });
  });

  describe('getAdapter', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should throw if not initialized', () => {
      const uninitializedFactory = new AdapterFactory(mockEventBus, mockLoggerFactory);

      expect(() => uninitializedFactory.getAdapter('chromatic-mod-retro')).toThrow(
        'AdapterFactory not initialized'
      );
    });

    it('should create adapter for device type', () => {
      const adapter = factory.getAdapter('chromatic-mod-retro', { ipcClient: {} });

      expect(adapter).toBeDefined();
      expect(adapter.deps).toBeDefined();
    });

    it('should pass additional dependencies', () => {
      const deps = { ipcClient: { foo: 'bar' } };

      const adapter = factory.getAdapter('chromatic-mod-retro', deps);

      expect(adapter.deps.ipcClient).toEqual({ foo: 'bar' });
    });

    it('should log debug message', () => {
      factory.getAdapter('chromatic-mod-retro', { ipcClient: {} });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Creating adapter for device type')
      );
    });

    it('should throw for unregistered device type', () => {
      expect(() => factory.getAdapter('unknown-device', { ipcClient: {} })).toThrow(
        'No adapter registered for device type: unknown-device'
      );
    });

    it('should throw if IPC client required but not provided', () => {
      expect(() => factory.getAdapter('chromatic-mod-retro', {})).toThrow(
        /requires IPC client/
      );
    });
  });

  describe('detectDeviceType', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should throw if not initialized', () => {
      const uninitializedFactory = new AdapterFactory(mockEventBus, mockLoggerFactory);

      expect(() => uninitializedFactory.detectDeviceType({ label: 'test' })).toThrow(
        'AdapterFactory not initialized'
      );
    });

    it('should return null for null device', () => {
      const result = factory.detectDeviceType(null);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid device info');
    });

    it('should return null for device without label', () => {
      const result = factory.detectDeviceType({ deviceId: '123' });

      expect(result).toBeNull();
    });

    it('should detect Chromatic device by label', () => {
      const device = { label: 'ModRetro Chromatic' };

      const result = factory.detectDeviceType(device);

      expect(result).toBe('chromatic-mod-retro');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Detected supported device')
      );
    });

    it('should return null for unsupported device', () => {
      const device = { label: 'Generic Webcam' };

      const result = factory.detectDeviceType(device);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported device')
      );
    });
  });

  describe('getAdapterForDevice', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should get adapter for detected device type', () => {
      const device = { label: 'ModRetro Chromatic' };

      const adapter = factory.getAdapterForDevice(device, { ipcClient: {} });

      expect(adapter).toBeDefined();
    });

    it('should throw for unsupported device', () => {
      const device = { label: 'Generic Webcam' };

      expect(() => factory.getAdapterForDevice(device)).toThrow('Unsupported device: Generic Webcam');
    });

    it('should throw for device without label', () => {
      const device = { deviceId: '123' };

      expect(() => factory.getAdapterForDevice(device)).toThrow('Unsupported device: unknown');
    });
  });

  describe('registerAdapter', () => {
    it('should register custom adapter', () => {
      const CustomAdapter = class {};

      factory.registerAdapter('custom-device', CustomAdapter, { custom: true });

      expect(factory.hasAdapter('custom-device')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered adapter for device type: custom-device')
      );
    });
  });

  describe('hasAdapter', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should return true for registered adapter', () => {
      expect(factory.hasAdapter('chromatic-mod-retro')).toBe(true);
    });

    it('should return false for non-existent adapter', () => {
      expect(factory.hasAdapter('unknown-device')).toBe(false);
    });
  });

  describe('getRegisteredTypes', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should return registered types', () => {
      const result = factory.getRegisteredTypes();

      expect(result).toContain('chromatic-mod-retro');
    });
  });

  describe('getMetadata', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should return metadata for registered adapter', () => {
      const metadata = factory.getMetadata('chromatic-mod-retro');

      expect(metadata).toBeDefined();
      expect(metadata.requiresIPC).toBe(true);
      expect(metadata.requiresProfile).toBe(true);
    });

    it('should return undefined for non-existent adapter', () => {
      const metadata = factory.getMetadata('unknown-device');

      expect(metadata).toBeUndefined();
    });
  });

  describe('unregister', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should unregister adapter', () => {
      factory.unregister('chromatic-mod-retro');

      expect(factory.hasAdapter('chromatic-mod-retro')).toBe(false);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should clear all registrations', () => {
      factory.clear();

      expect(factory.hasAdapter('chromatic-mod-retro')).toBe(false);
      expect(factory.initialized).toBe(false);
    });
  });
});
