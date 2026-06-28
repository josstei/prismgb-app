/**
 * DeviceIpcAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => {
  const { createTrpcClientMock } = await import('../../../../support/mocks/trpc-client.mock');
  return { trpcClient: createTrpcClientMock() };
});

import { DeviceIpcAdapter } from '@renderer/infrastructure/adapters/device-ipc.adapter';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { EventChannels } from '@prismgb/events';
import { emitTrpcData, getTrpcUnsubscribe } from '../../../../support/mocks/trpc-client.mock';
import { createLogger, createEventBus } from '../../../../factories/index.js';

describe('DeviceIpcAdapter', () => {
  let adapter;
  let mockLogger;
  let mockEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createLogger({ name: 'DeviceIpcAdapter' });
    mockEventBus = createEventBus();

    adapter = new DeviceIpcAdapter({
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  afterEach(() => {
    adapter.dispose();
  });

  describe('subscribe', () => {
    it('should wire tRPC device subscriptions to the eventBus', () => {
      const cleanup = adapter.subscribe();

      expect(trpcClient.device.onConnected.subscribe).toHaveBeenCalledWith(
        undefined,
        { onData: expect.any(Function) }
      );
      expect(trpcClient.device.onDisconnected.subscribe).toHaveBeenCalledWith(
        undefined,
        { onData: expect.any(Function) }
      );
      expect(typeof cleanup).toBe('function');

      const devicePayload = { deviceId: 'test-device', name: 'Test Device' };

      emitTrpcData(trpcClient.device.onConnected, devicePayload);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.DEVICE.CONNECTED,
        devicePayload
      );

      emitTrpcData(trpcClient.device.onDisconnected, devicePayload);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.DEVICE.DISCONNECTED,
        devicePayload
      );
    });

    it('should unsubscribe when the returned cleanup function is called', () => {
      const cleanup = adapter.subscribe();

      const unsubConnected = getTrpcUnsubscribe(trpcClient.device.onConnected);
      const unsubDisconnected = getTrpcUnsubscribe(trpcClient.device.onDisconnected);

      cleanup();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should call unsubscribe functions on active subscriptions', () => {
      adapter.subscribe();
      const unsubConnected = getTrpcUnsubscribe(trpcClient.device.onConnected);
      const unsubDisconnected = getTrpcUnsubscribe(trpcClient.device.onDisconnected);

      adapter.dispose();

      expect(unsubConnected).toHaveBeenCalled();
      expect(unsubDisconnected).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls safely', () => {
      adapter.subscribe();
      const unsubConnected = getTrpcUnsubscribe(trpcClient.device.onConnected);
      const unsubDisconnected = getTrpcUnsubscribe(trpcClient.device.onDisconnected);

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
