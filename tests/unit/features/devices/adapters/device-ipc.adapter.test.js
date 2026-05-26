import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceIpcAdapter } from '@renderer/infrastructure/adapters/devices/device-ipc.adapter.ts';
import {
  clearPreloadApi,
  createPreloadApiMock,
  setPreloadApi
} from '../../../../support/mocks/preload-api-globals.js';
import { createLogger } from '../../../../factories/index.js';
import { installMissingWindowMock } from '../../../../support/mocks/browser-api.installers.js';

describe('DeviceIpcAdapter', () => {
  let adapter;
  let mockDeviceAPI;
  let mockLogger;

  beforeEach(() => {
    mockDeviceAPI = createPreloadApiMock('deviceAPI');
    mockLogger = createLogger({ name: 'DeviceIpcAdapter' });

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

      const cleanup = adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      const [unsubConnected] = mockDeviceAPI.onDeviceConnected.getUnsubscribers();
      const [unsubDisconnected] = mockDeviceAPI.onDeviceDisconnected.getUnsubscribers();
      cleanup();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should keep each subscription active until its own cleanup or bulk dispose', () => {
      const firstCleanup = adapter.subscribe(vi.fn(), vi.fn());
      const secondCleanup = adapter.subscribe(vi.fn(), vi.fn());
      adapter.subscribe(vi.fn(), vi.fn());
      const connected = mockDeviceAPI.onDeviceConnected.getUnsubscribers();
      const disconnected = mockDeviceAPI.onDeviceDisconnected.getUnsubscribers();

      secondCleanup();

      expect(connected[1]).toHaveBeenCalledTimes(1);
      expect(disconnected[1]).toHaveBeenCalledTimes(1);
      expect(connected[0]).not.toHaveBeenCalled();
      expect(disconnected[0]).not.toHaveBeenCalled();
      expect(connected[2]).not.toHaveBeenCalled();
      expect(disconnected[2]).not.toHaveBeenCalled();

      firstCleanup();
      adapter.dispose();

      for (const index of [0, 2]) {
        expect(connected[index]).toHaveBeenCalledTimes(1);
        expect(disconnected[index]).toHaveBeenCalledTimes(1);
      }
    });

    it.each([
      ['missing window.deviceAPI', () => clearPreloadApi('deviceAPI')],
      ['undefined window', () => installMissingWindowMock()]
    ])('should handle %s gracefully', (_label, removeApi) => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      const missingApiMock = removeApi();

      try {
        const cleanup = adapter.subscribe(onDeviceConnected, onDeviceDisconnected);

        expect(typeof cleanup).toBe('function');
        expect(() => cleanup()).not.toThrow();
      } finally {
        missingApiMock?.cleanup?.();
        setPreloadApi('deviceAPI', mockDeviceAPI);
      }
    });

    it('should handle invalid callbacks gracefully', () => {
      const cleanup = adapter.subscribe(null, undefined);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'DeviceIpcAdapter.subscribe: Invalid callbacks provided'
      );
      expect(typeof cleanup).toBe('function');
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

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      const [unsubConnected] = mockDeviceAPI.onDeviceConnected.getUnsubscribers();
      const [unsubDisconnected] = mockDeviceAPI.onDeviceDisconnected.getUnsubscribers();
      adapter.dispose();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls safely', () => {
      const onDeviceConnected = vi.fn();
      const onDeviceDisconnected = vi.fn();

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      const [unsubConnected] = mockDeviceAPI.onDeviceConnected.getUnsubscribers();
      const [unsubDisconnected] = mockDeviceAPI.onDeviceDisconnected.getUnsubscribers();
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

      adapter.subscribe(onDeviceConnected, onDeviceDisconnected);
      adapter.dispose();

      expect(adapter._eventBridge).toBeNull();
    });
  });

  describe('integration', () => {
    it.each([
      ['connected', 'onDeviceConnected', 0],
      ['disconnected', 'onDeviceDisconnected', 1]
    ])('should properly wire up %s event callback', (_label, method, callbackIndex) => {
      const callbacks = [vi.fn(), vi.fn()];

      adapter.subscribe(callbacks[0], callbacks[1]);
      mockDeviceAPI[method].emit({ deviceId: 'test-device' });

      expect(callbacks[callbackIndex]).toHaveBeenCalledWith({ deviceId: 'test-device' });
    });
  });
});
