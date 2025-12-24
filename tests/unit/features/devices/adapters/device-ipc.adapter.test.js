/**
 * DeviceIPCAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceIPCAdapter } from '@renderer/features/devices/adapters/device-ipc.adapter.js';

describe('DeviceIPCAdapter', () => {
  let adapter;
  let mockDeviceAPI;

  beforeEach(() => {
    // Create mock deviceAPI
    mockDeviceAPI = {
      onDeviceConnected: vi.fn(),
      onDeviceDisconnected: vi.fn()
    };

    // Mock window.deviceAPI
    global.window = { deviceAPI: mockDeviceAPI };

    adapter = new DeviceIPCAdapter();
  });

  afterEach(() => {
    adapter.dispose();
    delete global.window;
  });

  describe('subscribe', () => {
    it('should subscribe to both connected and disconnected events', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();

      adapter.subscribe(onConnected, onDisconnected);

      expect(mockDeviceAPI.onDeviceConnected).toHaveBeenCalledWith(onConnected);
      expect(mockDeviceAPI.onDeviceDisconnected).toHaveBeenCalledWith(onDisconnected);
    });

    it('should return cleanup function', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();

      const cleanup = adapter.subscribe(onConnected, onDisconnected);

      expect(typeof cleanup).toBe('function');
    });

    it('should call cleanup functions when unsubscribe is called', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      const cleanup = adapter.subscribe(onConnected, onDisconnected);
      cleanup();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should handle missing window.deviceAPI gracefully', () => {
      delete global.window.deviceAPI;

      const onConnected = vi.fn();
      const onDisconnected = vi.fn();

      const cleanup = adapter.subscribe(onConnected, onDisconnected);

      expect(typeof cleanup).toBe('function');
      // Should return no-op function that doesn't throw
      expect(() => cleanup()).not.toThrow();
    });

    it('should handle undefined window gracefully', () => {
      delete global.window;

      const onConnected = vi.fn();
      const onDisconnected = vi.fn();

      const cleanup = adapter.subscribe(onConnected, onDisconnected);

      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();

      // Restore window for cleanup
      global.window = { deviceAPI: mockDeviceAPI };
    });

    it('should handle invalid callbacks gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const cleanup = adapter.subscribe(null, undefined);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'DeviceIPCAdapter.subscribe: Invalid callbacks provided'
      );
      expect(typeof cleanup).toBe('function');

      consoleWarnSpy.mockRestore();
    });

    it('should not call deviceAPI methods with invalid callbacks', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      adapter.subscribe(null, undefined);

      expect(mockDeviceAPI.onDeviceConnected).not.toHaveBeenCalled();
      expect(mockDeviceAPI.onDeviceDisconnected).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  describe('dispose', () => {
    it('should call unsubscribe functions', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      adapter.subscribe(onConnected, onDisconnected);
      adapter.dispose();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls safely', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      adapter.subscribe(onConnected, onDisconnected);
      adapter.dispose();
      adapter.dispose();

      // Should not throw and should only call once
      expect(unsubConnected).toHaveBeenCalledTimes(1);
      expect(unsubDisconnected).toHaveBeenCalledTimes(1);
    });

    it('should handle dispose without subscribe', () => {
      expect(() => adapter.dispose()).not.toThrow();
    });

    it('should set unsubscribe functions to null after dispose', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();
      const unsubConnected = vi.fn();
      const unsubDisconnected = vi.fn();

      mockDeviceAPI.onDeviceConnected.mockReturnValue(unsubConnected);
      mockDeviceAPI.onDeviceDisconnected.mockReturnValue(unsubDisconnected);

      adapter.subscribe(onConnected, onDisconnected);
      adapter.dispose();

      expect(adapter._unsubscribeConnected).toBeNull();
      expect(adapter._unsubscribeDisconnected).toBeNull();
    });
  });

  describe('integration', () => {
    it('should properly wire up connected event callback', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();

      // Mock deviceAPI to actually call the callback
      mockDeviceAPI.onDeviceConnected.mockImplementation((callback) => {
        // Simulate IPC event
        callback({ deviceId: 'test-device' });
        return vi.fn();
      });

      adapter.subscribe(onConnected, onDisconnected);

      expect(onConnected).toHaveBeenCalledWith({ deviceId: 'test-device' });
    });

    it('should properly wire up disconnected event callback', () => {
      const onConnected = vi.fn();
      const onDisconnected = vi.fn();

      // Mock deviceAPI to actually call the callback
      mockDeviceAPI.onDeviceDisconnected.mockImplementation((callback) => {
        // Simulate IPC event
        callback({ deviceId: 'test-device' });
        return vi.fn();
      });

      adapter.subscribe(onConnected, onDisconnected);

      expect(onDisconnected).toHaveBeenCalledWith({ deviceId: 'test-device' });
    });
  });
});
