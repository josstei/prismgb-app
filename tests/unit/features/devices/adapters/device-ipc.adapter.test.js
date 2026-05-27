import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceIpcAdapter } from '@renderer/infrastructure/adapters/devices/device-ipc.adapter.ts';
import {
  clearPreloadApi,
  createPreloadApiMock,
  setPreloadApi
} from '../../../../support/mocks/preload-api-globals.js';
import { createLogger, createEventBus } from '../../../../factories/index.js';
import { installMissingWindowMock } from '../../../../support/mocks/browser-api.installers.js';
import { RendererPreloadBridgeDescriptors } from '@renderer/infrastructure/services/preload-event-bridge.factory';

describe('DeviceIpcAdapter', () => {
  let adapter;
  let mockDeviceAPI;
  let mockLogger;
  let mockEventBus;

  beforeEach(() => {
    mockDeviceAPI = createPreloadApiMock('deviceAPI');
    mockLogger = createLogger({ name: 'DeviceIpcAdapter' });
    mockEventBus = createEventBus();

    setPreloadApi('deviceAPI', mockDeviceAPI);

    adapter = new DeviceIpcAdapter({
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  afterEach(() => {
    adapter.dispose();
    clearPreloadApi('deviceAPI');
  });

  describe('subscribe', () => {
    it('should subscribe to deviceAPI events and wire them to eventBus', () => {
      const publishSpy = vi.spyOn(mockEventBus, 'publish');
      
      const cleanup = adapter.subscribe();

      expect(mockDeviceAPI.onDeviceConnected).toHaveBeenCalled();
      expect(mockDeviceAPI.onDeviceDisconnected).toHaveBeenCalled();
      expect(typeof cleanup).toBe('function');

      // Simulate device connected event
      const devicePayload = { deviceId: 'test-device', name: 'Test Device' };
      const connectedHandler = mockDeviceAPI.onDeviceConnected.mock.calls[0][0];
      connectedHandler(devicePayload);

      expect(publishSpy).toHaveBeenCalledWith(
        RendererPreloadBridgeDescriptors.deviceAPI.events.onDeviceConnected,
        devicePayload
      );

      // Simulate device disconnected event
      const disconnectedHandler = mockDeviceAPI.onDeviceDisconnected.mock.calls[0][0];
      disconnectedHandler(devicePayload);

      expect(publishSpy).toHaveBeenCalledWith(
        RendererPreloadBridgeDescriptors.deviceAPI.events.onDeviceDisconnected,
        devicePayload
      );
    });

    it('should unsubscribe when the returned cleanup function is called', () => {
      const cleanup = adapter.subscribe();
      
      const [unsubConnected] = mockDeviceAPI.onDeviceConnected.getUnsubscribers();
      const [unsubDisconnected] = mockDeviceAPI.onDeviceDisconnected.getUnsubscribers();
      
      cleanup();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it.each([
      ['missing window.deviceAPI', () => clearPreloadApi('deviceAPI')],
      ['undefined window', () => installMissingWindowMock()]
    ])('should handle %s gracefully', (_label, removeApi) => {
      const missingApiMock = removeApi();

      try {
        const cleanup = adapter.subscribe();

        expect(typeof cleanup).toBe('function');
        expect(() => cleanup()).not.toThrow();
      } finally {
        missingApiMock?.cleanup?.();
        setPreloadApi('deviceAPI', mockDeviceAPI);
      }
    });
  });

  describe('dispose', () => {
    it('should call unsubscribe functions on active subscriptions', () => {
      adapter.subscribe();
      const [unsubConnected] = mockDeviceAPI.onDeviceConnected.getUnsubscribers();
      const [unsubDisconnected] = mockDeviceAPI.onDeviceDisconnected.getUnsubscribers();
      
      adapter.dispose();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls safely', () => {
      adapter.subscribe();
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
  });
});
