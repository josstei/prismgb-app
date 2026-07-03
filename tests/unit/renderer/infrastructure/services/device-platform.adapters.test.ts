import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => {
  const { createTrpcClientMock } = await import('../../../../support/mocks/trpc-client.mock');
  return { trpcClient: createTrpcClientMock() };
});

import { TrpcDeviceStatusPort } from '@renderer/infrastructure/services/devices/device-platform.adapters';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { emitTrpcData } from '../../../../support/mocks/trpc-client.mock';
import { createLoggerFactory } from '../../../../factories/index.js';
import { createChromaticDeviceStatusPayload, createChromaticDeviceInfoPayload } from '../../../../devices/media.testkit';

describe('TrpcDeviceStatusPort', () => {
  let port: TrpcDeviceStatusPort;
  let logger: ReturnType<ReturnType<typeof createLoggerFactory>['create']>;

  beforeEach(() => {
    vi.clearAllMocks();
    const loggerFactory = createLoggerFactory();
    logger = loggerFactory.create('TrpcDeviceStatusPort');
    port = new TrpcDeviceStatusPort(trpcClient, logger);
  });

  describe('getStatus', () => {
    it('maps a payload-only success response to a DeviceStatus', async () => {
      const payload = createChromaticDeviceStatusPayload(true);
      vi.mocked(trpcClient.device.getStatus.query).mockResolvedValue(payload);

      const status = await port.getStatus();

      expect(status).toMatchObject({
        state: payload.state,
        connected: payload.connected,
        device: payload.device
      });
      expect(typeof status.updatedAt).toBe('number');
    });

    it('maps a thrown TRPCError to an error DeviceStatus and logs the failure', async () => {
      const error = new Error('usb exploded');
      vi.mocked(trpcClient.device.getStatus.query).mockRejectedValue(error);

      const status = await port.getStatus();

      expect(status).toMatchObject({
        state: 'error',
        connected: false,
        device: null,
        error: 'usb exploded'
      });
      expect(logger.error).toHaveBeenCalledWith('device.getStatus failed', error);
    });

    it('falls back to a noop logger without throwing when constructed without one', async () => {
      const bareport = new TrpcDeviceStatusPort(trpcClient);
      vi.mocked(trpcClient.device.getStatus.query).mockRejectedValue(new Error('boom'));

      await expect(bareport.getStatus()).resolves.toMatchObject({ state: 'error' });
    });
  });

  describe('refreshStatus', () => {
    it('maps a payload-only success response to a DeviceStatus', async () => {
      const payload = createChromaticDeviceStatusPayload(false);
      vi.mocked(trpcClient.device.refreshStatus.mutate).mockResolvedValue(payload);

      const status = await port.refreshStatus();

      expect(status).toMatchObject({
        state: payload.state,
        connected: payload.connected,
        device: payload.device
      });
    });

    it('maps a thrown TRPCError to an error DeviceStatus and logs the failure', async () => {
      const error = new Error('refresh exploded');
      vi.mocked(trpcClient.device.refreshStatus.mutate).mockRejectedValue(error);

      const status = await port.refreshStatus();

      expect(status).toMatchObject({
        state: 'error',
        connected: false,
        device: null,
        error: 'refresh exploded'
      });
      expect(logger.error).toHaveBeenCalledWith('device.refreshStatus failed', error);
    });
  });

  describe('subscribe', () => {
    it('relays connected and disconnected device pushes as DeviceStatus updates', () => {
      const onStatus = vi.fn();
      const unsubscribe = port.subscribe(onStatus);

      const device = createChromaticDeviceInfoPayload();
      emitTrpcData(trpcClient.device.onConnected, device);
      emitTrpcData(trpcClient.device.onDisconnected, null);

      expect(onStatus).toHaveBeenNthCalledWith(1, expect.objectContaining({ state: 'connected', connected: true, device }));
      expect(onStatus).toHaveBeenNthCalledWith(2, expect.objectContaining({ state: 'disconnected', connected: false, device: null }));

      unsubscribe();
    });
  });
});
