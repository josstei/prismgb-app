/**
 * StreamingAdapterFactory Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingAdapterFactory } from '@renderer/infrastructure/factories/streaming-adapter.factory.ts';

vi.mock('@prismgb/stream-source', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ConstraintBuilder: class MockConstraintBuilder {
      constructor() {}
    },
    BaseStreamLifecycle: class MockBaseStreamLifecycle {
      constructor() {}
    }
  };
});

// Mock adapter class - injected via adapterClasses parameter (same pattern as container.js)
class MockDeviceChromaticAdapter {
  constructor(deps) {
    this.deps = deps;
  }
}

describe('StreamingAdapterFactory', () => {
  let factory;
  let mockEventBus;
  let mockLoggerFactory;
  let mockLogger;
  let adapterClasses;

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

    // Adapter classes injected via DI (same pattern as container.js)
    adapterClasses = new Map([
      ['chromatic-mod-retro', MockDeviceChromaticAdapter]
    ]);

    factory = new StreamingAdapterFactory(mockEventBus, mockLoggerFactory, null, adapterClasses);
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
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('StreamingAdapterFactory');
      expect(factory.logger).toBe(mockLogger);
    });

    it('should initialize as not initialized', () => {
      expect(factory.initialized).toBe(false);
    });
  });

  describe('initialize', () => {
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

      expect(mockLogger.warn).toHaveBeenCalledWith('StreamingAdapterFactory already initialized');
    });
  });

  describe('getAdapter', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should throw if not initialized', () => {
      const uninitializedFactory = new StreamingAdapterFactory(mockEventBus, mockLoggerFactory, null, adapterClasses);

      expect(() => uninitializedFactory.getAdapter('chromatic-mod-retro')).toThrow(
        'StreamingAdapterFactory not initialized'
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

  describe('detectDeviceId', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should throw if not initialized', () => {
      const uninitializedFactory = new StreamingAdapterFactory(mockEventBus, mockLoggerFactory, null, adapterClasses);

      expect(() => uninitializedFactory.detectDeviceId({ label: 'test' })).toThrow(
        'StreamingAdapterFactory not initialized'
      );
    });

    it('should return null for null device', () => {
      const result = factory.detectDeviceId(null);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid device info');
    });

    it('should return null for device without label', () => {
      const result = factory.detectDeviceId({ deviceId: '123' });

      expect(result).toBeNull();
    });

    it('should detect Chromatic device by label', () => {
      const device = { label: 'ModRetro Chromatic' };

      const result = factory.detectDeviceId(device);

      expect(result).toBe('chromatic-mod-retro');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Detected supported device')
      );
    });

    it('should return null for unsupported device', () => {
      const device = { label: 'Generic Webcam' };

      const result = factory.detectDeviceId(device);

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
});
