import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceIpcAdapter } from '@renderer/infrastructure/adapters/devices/device-ipc.adapter.ts';
import {
  clearPreloadApi,
  createPreloadApiMock,
  setPreloadApi
} from '../../../../support/mocks/preload-api-globals.js';

describe('DeviceIpcAdapter', () => {
  let adapter;
  let mockDeviceAPI;
  let mockLogger;

  beforeEach(() => {
    mockDeviceAPI = createPreloadApiMock('deviceAPI');

    mockLogger = {
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    };

    setPreloadApi('deviceAPI', mockDeviceAPI);

    adapter = new DeviceIpcAdapter({ logger: mockLogger });
  });

  afterEach(() => {
    adapter.dispose();
    clearPreloadApi('deviceAPI');
  });

  describe('subscribe', () => {
    it('should subscribe to both connected and disconnected events', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);

      expect(mockDeviceAPI.onDeviceConnected).toHaveBeenCalledWith(onDeviceConnected);
      expect(mockDeviceAPI.onDeviceDisconnected).toHaveBeenCalledWith(onDeviceDisconnected);
    });

    it('should return cleanup function', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      const cleanup = adapter.subscribe(onDeviceConnected, onDeviceDisconnected);

      expect(typeof cleanup).toBe('function');
    });

    it('should call cleanup functions when unsubscribe is called', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      const cleanup = adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      cleanup();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should handle missing window.deviceAPI gracefully', () => {
      clearPreloadApi('deviceAPI');

      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      const cleanup = adapter.subscribe(onDeviceConnected, onDeviceDisconnected);

      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();
    });

    it('should handle undefined window gracefully', () => {
      delete global.window;

      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      const cleanup = adapter.subscribe(onDeviceConnected, onDeviceDisconnected);

      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();
      setPreloadApi('deviceAPI', mockDeviceAPI);
    });

    it('should handle invalid callbacks gracefully', () => {
      const cleanup = adapter.subscribe(null, undefined);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'DeviceIpcAdapter.subscribe: Invalid callbacks provided'
      );
      expect(typeof cleanup).toBe('function');
    });

    it('should not call deviceAPI methods with invalid callbacks', () => {
      adapter.subscribe(null, undefined);

      expect(mockDeviceAPI.onDeviceConnected).not.toHaveBeenCalled();
      expect(mockDeviceAPI.onDeviceDisconnected).not.toHaveBeenCalled();
    });

    it('should handle invalid callbacks without logger gracefully', () => {
      const adapterWithoutLogger = new DeviceIpcAdapter();

      const cleanup = adapterWithoutLogger.subscribe(null, undefined);

      expect(typeof cleanup).toBe('function');
      expect(mockDeviceAPI.onDeviceConnected).not.toHaveBeenCalled();
      expect(mockDeviceAPI.onDeviceDisconnected).not.toHaveBeenCalled();

      adapterWithoutLogger.dispose();
    });
  });

  describe('dispose', () => {
    it('should call unsubscribe functions', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      adapter.dispose();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls safely', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      adapter.dispose();
      adapter.dispose();

      expect(unsubConnected).toHaveBeenCalledTimes(1);
      expect(unsubDisconnected).toHaveBeenCalledTimes(1);
    });

    it('should handle dispose without subscribe', () => {
      expect(() => adapter.dispose()).not.toThrow();
    });

    it('should clear preload event bridge after dispose', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      adapter.dispose();

      expect(adapter._eventBridge).toBeNull();
    });
  });

  describe('integration', () => {
    it('should properly wire up connected event callback', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockImplementation((callback) => {
        callback({ deviceId: 'test-device' });
        return vi.fn();
      });

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);

      expect(onDeviceConnected).toHaveBeenCalledWith({ deviceId: 'test-device' });
    });

    it('should properly wire up disconnected event callback', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      mockDeviceAPI.onDeviceDisconnected.mockImplementation((callback) => {
        callback({ deviceId: 'test-device' });
        return vi.fn();
      });

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);

      expect(onDeviceDisconnected).toHaveBeenCalledWith({ deviceId: 'test-device' });
    });
  });
});
