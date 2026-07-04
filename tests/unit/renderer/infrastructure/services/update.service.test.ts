import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => ({
  trpcClient: (await import('../../../../support/mocks/trpc-client.mock')).createTrpcClientMock()
}));
import { UpdateService } from '@renderer/infrastructure/services/updates/update.service';
import { UpdateState } from '@platform/config';
import { EventChannels } from '@platform/events';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { emitTrpcData, getTrpcUnsubscribe } from '../../../../support/mocks/trpc-client.mock';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('UpdateService', () => {
  let service, mockEventBus, mockLogger, mockLoggerFactory;

  beforeEach(() => {
    vi.mocked(trpcClient.update.getStatus.query).mockResolvedValue({ state: UpdateState.IDLE });

    const h = createInjectableHarness(UpdateService);
    service = h.subject;
    mockLogger = h.logger;
    ({ eventBus: mockEventBus, loggerFactory: mockLoggerFactory } = h.deps);
  });

  describe('constructor', () => {
    it('should create service with initial state', () => {
      expect(service.state).toBe(UpdateState.IDLE);
      expect(service.updateInfo).toBeNull();
      expect(service.getStatus().downloadProgress).toBeNull();
      expect(service.getStatus().error).toBeNull();
      expect(service._initialized).toBe(false);
    });

  });

  describe('initialize', () => {
    it('should set up tRPC subscriptions', async () => {
      vi.mocked(trpcClient.update.getStatus.query).mockResolvedValue({
        state: UpdateState.IDLE,
        updateInfo: null
      });

      await service.initialize();

      expect(trpcClient.update.onAvailable.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(trpcClient.update.onNotAvailable.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(trpcClient.update.onProgress.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(trpcClient.update.onDownloaded.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(trpcClient.update.onError.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(service.disposables.size).toBe(1);
      expect(service._initialized).toBe(true);
    });

    it('should load initial status', async () => {
      vi.mocked(trpcClient.update.getStatus.query).mockResolvedValue({
        state: UpdateState.AVAILABLE,
        updateInfo: { version: '2.0.0' },
        downloadProgress: { percent: 50 },
        error: null
      });

      await service.initialize();

      expect(service.state).toBe(UpdateState.AVAILABLE);
      expect(service.updateInfo).toEqual({ version: '2.0.0' });
      expect(service.getStatus().downloadProgress).toEqual({ percent: 50 });
    });

    it('should handle getStatus error gracefully', async () => {
      const testError = new Error('IPC error');
      vi.mocked(trpcClient.update.getStatus.query).mockRejectedValue(testError);

      await service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to load initial update status', testError);
      expect(service._initialized).toBe(true);
    });
  });

  describe('event handlers', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should handle available event', () => {
      const info = { version: '2.0.0' };
      emitTrpcData(trpcClient.update.onAvailable, info);

      expect(service.state).toBe(UpdateState.AVAILABLE);
      expect(service.updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.AVAILABLE, info);
    });

    it('should handle not-available event', () => {
      const info = { version: '1.0.0' };
      emitTrpcData(trpcClient.update.onNotAvailable, info);

      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service.updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.NOT_AVAILABLE, info);
    });

    it('should handle progress event', () => {
      const progress = { percent: 75 };
      emitTrpcData(trpcClient.update.onProgress, progress);

      expect(service.getStatus().downloadProgress).toBe(progress);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.PROGRESS, progress);
    });

    it('should handle downloaded event', () => {
      const info = { version: '2.0.0' };
      emitTrpcData(trpcClient.update.onDownloaded, info);

      expect(service.state).toBe(UpdateState.DOWNLOADED);
      expect(service.updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.DOWNLOADED, info);
    });

    it('should handle error event', () => {
      const error = { message: 'Network error' };
      emitTrpcData(trpcClient.update.onError, error);

      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.getStatus().error).toBe(error);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.ERROR, error);
    });
  });

  describe('checkForUpdates', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should set state to CHECKING', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({});

      const promise = service.checkForUpdates();

      expect(service.state).toBe(UpdateState.CHECKING);

      await promise;
    });

    it('should call trpcClient.update.checkForUpdates', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({});

      const result = await service.checkForUpdates();

      expect(trpcClient.update.checkForUpdates.mutate).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle a thrown TRPCError and transition to ERROR', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockRejectedValue(new Error('Network error'));

      const result = await service.checkForUpdates();

      expect(result).toBeUndefined();
      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.getStatus().error).toEqual({ message: 'Network error' });
    });

    it('should reconcile an available result into the AVAILABLE state', async () => {
      const updateInfo = { version: '2.0.0' };
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({
        updateAvailable: true,
        updateInfo
      });

      await service.checkForUpdates();

      expect(service.state).toBe(UpdateState.AVAILABLE);
      expect(service.updateInfo).toEqual(updateInfo);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.AVAILABLE, updateInfo);
    });

    it('should reconcile a no-update result into the NOT_AVAILABLE state', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({
        updateAvailable: false,
        reason: 'latest'
      });

      await service.checkForUpdates();

      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service.updateInfo).toEqual({ reason: 'latest' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.NOT_AVAILABLE, { reason: 'latest' });
    });

    it('should transition to ERROR and preserve the rejected message when the server reports a business failure', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockRejectedValue(new Error('Server rejected'));

      const result = await service.checkForUpdates();

      expect(result).toBeUndefined();
      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.getStatus().error).toEqual({ message: 'Server rejected' });
    });

    it('should apply a generic fallback message when a rejection carries no message', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockRejectedValue({});

      await service.checkForUpdates();

      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.getStatus().error).toEqual({ message: 'Unknown error' });
    });
  });

  describe('downloadUpdate', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should no-op and log a warning if not in AVAILABLE state', async () => {
      service._state = UpdateState.IDLE;

      const result = await service.downloadUpdate();

      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith('No update available to download');
      expect(trpcClient.update.downloadUpdate.mutate).not.toHaveBeenCalled();
    });

    it('should set state to DOWNLOADING and invoke the mutation', async () => {
      service._state = UpdateState.AVAILABLE;
      vi.mocked(trpcClient.update.downloadUpdate.mutate).mockResolvedValue(undefined);

      await service.downloadUpdate();

      expect(trpcClient.update.downloadUpdate.mutate).toHaveBeenCalled();
    });

    it('should handle download error', async () => {
      service._state = UpdateState.AVAILABLE;
      vi.mocked(trpcClient.update.downloadUpdate.mutate).mockRejectedValue(new Error('Download failed'));

      const result = await service.downloadUpdate();

      expect(result).toBeUndefined();
      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.getStatus().error).toEqual({ message: 'Download failed' });
    });
  });

  describe('installUpdate', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should no-op and log a warning if not in DOWNLOADED state', async () => {
      service._state = UpdateState.AVAILABLE;

      const result = await service.installUpdate();

      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith('No update downloaded to install');
      expect(trpcClient.update.installUpdate.mutate).not.toHaveBeenCalled();
    });

    it('should call trpcClient.update.installUpdate', async () => {
      service._state = UpdateState.DOWNLOADED;
      vi.mocked(trpcClient.update.installUpdate.mutate).mockResolvedValue(undefined);

      const result = await service.installUpdate();

      expect(trpcClient.update.installUpdate.mutate).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle install error', async () => {
      service._state = UpdateState.DOWNLOADED;
      vi.mocked(trpcClient.update.installUpdate.mutate).mockRejectedValue(new Error('Install failed'));

      const result = await service.installUpdate();

      expect(result).toBeUndefined();
      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.getStatus().error).toEqual({ message: 'Install failed' });
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      service._state = UpdateState.DOWNLOADING;
      service._updateInfo = { version: '2.0.0' };
      service._downloadProgress = { percent: 50 };
      service._error = { message: 'Test' };

      const status = service.getStatus();

      expect(status).toEqual({
        state: UpdateState.DOWNLOADING,
        updateInfo: { version: '2.0.0' },
        downloadProgress: { percent: 50 },
        error: { message: 'Test' }
      });
    });
  });

  describe('state getter', () => {
    it('should return current state', () => {
      service._state = UpdateState.AVAILABLE;
      expect(service.state).toBe(UpdateState.AVAILABLE);
    });
  });

  describe('updateInfo getter', () => {
    it('should return update info', () => {
      service._updateInfo = { version: '2.0.0' };
      expect(service.updateInfo).toEqual({ version: '2.0.0' });
    });
  });

  describe('dispose', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should unsubscribe the tRPC subscriptions', async () => {
      const unsubAvailable = getTrpcUnsubscribe(trpcClient.update.onAvailable);
      const unsubError = getTrpcUnsubscribe(trpcClient.update.onError);

      expect(unsubAvailable).not.toHaveBeenCalled();
      expect(unsubError).not.toHaveBeenCalled();

      await service.dispose();

      expect(unsubAvailable).toHaveBeenCalled();
      expect(unsubError).toHaveBeenCalled();
    });

    it('should reset state', async () => {
      service._state = UpdateState.AVAILABLE;
      service._updateInfo = { version: '2.0.0' };
      service._initialized = true;

      await service.dispose();

      expect(service.state).toBe(UpdateState.IDLE);
      expect(service.updateInfo).toBeNull();
      expect(service._initialized).toBe(false);
    });
  });

  describe('_setState', () => {
    it('should update state and emit state-changed', () => {
      service._setState(UpdateState.CHECKING);

      expect(service.state).toBe(UpdateState.CHECKING);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UPDATE.STATE_CHANGED,
        expect.objectContaining({ state: UpdateState.CHECKING })
      );
    });
  });
});
