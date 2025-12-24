/**
 * BaseDeviceAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseDeviceAdapter } from '@renderer/features/devices/adapters/base.adapter.js';
import { AcquisitionContext } from '@shared/streaming/acquisition/acquisition.context.js';

describe('BaseDeviceAdapter', () => {
  let adapter;
  let mockEventBus;
  let mockLogger;
  let mockConstraintBuilder;
  let mockStreamLifecycle;

  beforeEach(() => {
    mockEventBus = {
      publish: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockConstraintBuilder = {
      build: vi.fn(() => ({ video: { width: 160 } }))
    };

    mockStreamLifecycle = {
      acquireStream: vi.fn(() => Promise.resolve({ id: 'mock-stream' })),
      releaseStream: vi.fn(() => Promise.resolve())
    };

    adapter = new BaseDeviceAdapter({
      eventBus: mockEventBus,
      logger: mockLogger,
      constraintBuilder: mockConstraintBuilder,
      streamLifecycle: mockStreamLifecycle
    });
  });

  describe('Constructor', () => {
    it('should create adapter with dependencies', () => {
      expect(adapter.eventBus).toBe(mockEventBus);
      expect(adapter.logger).toBe(mockLogger);
      expect(adapter.constraintBuilder).toBe(mockConstraintBuilder);
      expect(adapter.streamLifecycle).toBe(mockStreamLifecycle);
    });

    it('should initialize with null state', () => {
      expect(adapter.deviceInfo).toBeNull();
      expect(adapter.profile).toBeNull();
      expect(adapter.currentStream).toBeNull();
    });

    it('should work with empty dependencies', () => {
      const emptyAdapter = new BaseDeviceAdapter();
      expect(emptyAdapter.eventBus).toBeUndefined();
      expect(emptyAdapter.logger).toBeUndefined();
    });
  });

  describe('initialize', () => {
    it('should set device info', async () => {
      const deviceInfo = { deviceId: '123', label: 'Test Device' };
      await adapter.initialize(deviceInfo);

      expect(adapter.deviceInfo).toBe(deviceInfo);
    });

    it('should log initialization', async () => {
      const deviceInfo = { deviceId: '123' };
      await adapter.initialize(deviceInfo);

      expect(mockLogger.info).toHaveBeenCalledWith('Adapter initialized for device:', deviceInfo);
    });
  });

  describe('getStream', () => {
    beforeEach(() => {
      adapter.deviceInfo = { deviceId: 'test-device-123', label: 'Test Device' };
      adapter.profile = { video: { width: 160, height: 144 } };
    });

    it('should get stream using lifecycle', async () => {
      const stream = await adapter.getStream();

      expect(mockConstraintBuilder.build).toHaveBeenCalledWith(
        expect.any(AcquisitionContext),
        'full',
        {}
      );
      // Verify context was created with correct device ID
      const context = mockConstraintBuilder.build.mock.calls[0][0];
      expect(context.deviceId).toBe('test-device-123');
      expect(mockStreamLifecycle.acquireStream).toHaveBeenCalled();
      expect(stream).toEqual({ id: 'mock-stream' });
    });

    it('should store current stream', async () => {
      await adapter.getStream();
      expect(adapter.currentStream).toEqual({ id: 'mock-stream' });
    });

    it('should pass options to constraint builder', async () => {
      const options = { includeAudio: true };
      await adapter.getStream(options);

      expect(mockConstraintBuilder.build).toHaveBeenCalledWith(
        expect.any(AcquisitionContext),
        'full',
        options
      );
      // Verify context was created with correct device ID
      const context = mockConstraintBuilder.build.mock.calls[0][0];
      expect(context.deviceId).toBe('test-device-123');
    });

    it('should throw if profile not set', async () => {
      adapter.profile = null;
      await expect(adapter.getStream()).rejects.toThrow('Adapter not properly initialized - missing profile');
    });

    it('should throw if deviceInfo not set', async () => {
      adapter.deviceInfo = null;
      await expect(adapter.getStream()).rejects.toThrow('Adapter not properly initialized - missing deviceInfo');
    });
  });

  describe('releaseStream', () => {
    it('should release stream via lifecycle', async () => {
      const stream = { id: 'test-stream' };
      await adapter.releaseStream(stream);

      expect(mockStreamLifecycle.releaseStream).toHaveBeenCalledWith(stream);
    });

    it('should clear currentStream if matches', async () => {
      adapter.currentStream = { id: 'current' };
      await adapter.releaseStream(adapter.currentStream);

      expect(adapter.currentStream).toBeNull();
    });

    it('should not clear currentStream if different', async () => {
      adapter.currentStream = { id: 'current' };
      await adapter.releaseStream({ id: 'other' });

      expect(adapter.currentStream).toEqual({ id: 'current' });
    });

    it('should handle null stream', async () => {
      await adapter.releaseStream(null);
      expect(mockStreamLifecycle.releaseStream).not.toHaveBeenCalled();
    });
  });

  describe('getCapabilities', () => {
    it('should return capabilities based on profile', () => {
      adapter.profile = { video: {}, audio: {} };
      const capabilities = adapter.getCapabilities();

      expect(capabilities.hasVideo).toBe(true);
      expect(capabilities.hasAudio).toBe(true);
      expect(capabilities.supportsFallback).toBe(false);
    });

    it('should return false for missing profile properties', () => {
      adapter.profile = { video: {} };
      const capabilities = adapter.getCapabilities();

      expect(capabilities.hasAudio).toBe(false);
    });

    it('should handle null profile', () => {
      adapter.profile = null;
      const capabilities = adapter.getCapabilities();

      expect(capabilities.hasVideo).toBe(false);
      expect(capabilities.hasAudio).toBe(false);
    });
  });

  describe('getProfile', () => {
    it('should return profile', () => {
      adapter.profile = { video: { width: 160 } };
      expect(adapter.getProfile()).toEqual({ video: { width: 160 } });
    });

    it('should return null if no profile', () => {
      expect(adapter.getProfile()).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should release current stream', async () => {
      adapter.currentStream = { id: 'test' };
      await adapter.cleanup();

      expect(mockStreamLifecycle.releaseStream).toHaveBeenCalledWith({ id: 'test' });
    });

    it('should clear state', async () => {
      adapter.deviceInfo = { id: '123' };
      adapter.profile = { video: {} };
      adapter.currentStream = { id: 'test' };

      await adapter.cleanup();

      expect(adapter.deviceInfo).toBeNull();
      expect(adapter.profile).toBeNull();
    });

    it('should handle no current stream', async () => {
      adapter.currentStream = null;
      await adapter.cleanup();

      expect(mockStreamLifecycle.releaseStream).not.toHaveBeenCalled();
    });
  });

  describe('_log', () => {
    it('should log with correct level', () => {
      adapter._log('info', 'Test message', 'arg1');
      expect(mockLogger.info).toHaveBeenCalledWith('Test message', 'arg1');
    });

    it('should handle missing logger', () => {
      const noLoggerAdapter = new BaseDeviceAdapter({});
      expect(() => noLoggerAdapter._log('info', 'Test')).not.toThrow();
    });

    it('should handle invalid log level', () => {
      expect(() => adapter._log('invalid', 'Test')).not.toThrow();
    });
  });
});
