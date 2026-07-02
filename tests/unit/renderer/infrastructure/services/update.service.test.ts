import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => {
  const { createTrpcClientMock } = await import('../../../../support/mocks/trpc-client.mock');
  return { trpcClient: createTrpcClientMock() };
});
import { UpdateService } from '@renderer/infrastructure/services/updates/update.service';
import { UpdateState } from '@platform/config';
import { EventChannels } from '@platform/events';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { emitTrpcData, getTrpcUnsubscribe } from '../../../../support/mocks/trpc-client.mock';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';

describe('UpdateService', () => {
  let service, mockEventBus, mockLogger, mockLoggerFactory;

  beforeEach(() => {
    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    vi.mocked(trpcClient.update.getStatus.query).mockResolvedValue({ success: true, state: UpdateState.IDLE });

    service = new UpdateService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('UpdateService');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with initial state', () => {
      expect(service._state).toBe(UpdateState.IDLE);
      expect(service._updateInfo).toBeNull();
      expect(service._downloadProgress).toBeNull();
      expect(service._error).toBeNull();
      expect(service._initialized).toBe(false);
    });

    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UpdateService');
    });
  });

  describe('initialize', () => {
    it('should set up tRPC subscriptions', async () => {
      vi.mocked(trpcClient.update.getStatus.query).mockResolvedValue({
        success: true,
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
        success: true,
        state: UpdateState.AVAILABLE,
        updateInfo: { version: '2.0.0' },
        downloadProgress: { percent: 50 },
        error: null
      });

      await service.initialize();

      expect(service._state).toBe(UpdateState.AVAILABLE);
      expect(service._updateInfo).toEqual({ version: '2.0.0' });
      expect(service._downloadProgress).toEqual({ percent: 50 });
    });

    it('should warn if already initialized', async () => {
      await service.initialize();
      await service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('UpdateService already initialized');
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

      expect(service._state).toBe(UpdateState.AVAILABLE);
      expect(service._updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.AVAILABLE, info);
    });

    it('should handle not-available event', () => {
      const info = { version: '1.0.0' };
      emitTrpcData(trpcClient.update.onNotAvailable, info);

      expect(service._state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service._updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.NOT_AVAILABLE, info);
    });

    it('should handle progress event', () => {
      const progress = { percent: 75 };
      emitTrpcData(trpcClient.update.onProgress, progress);

      expect(service._downloadProgress).toBe(progress);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.PROGRESS, progress);
    });

    it('should handle downloaded event', () => {
      const info = { version: '2.0.0' };
      emitTrpcData(trpcClient.update.onDownloaded, info);

      expect(service._state).toBe(UpdateState.DOWNLOADED);
      expect(service._updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.DOWNLOADED, info);
    });

    it('should handle error event', () => {
      const error = { message: 'Network error' };
      emitTrpcData(trpcClient.update.onError, error);

      expect(service._state).toBe(UpdateState.ERROR);
      expect(service._error).toBe(error);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.ERROR, error);
    });
  });

  describe('checkForUpdates', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should set state to CHECKING', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({ success: true });

      const promise = service.checkForUpdates();

      expect(service._state).toBe(UpdateState.CHECKING);

      await promise;
    });

    it('should call trpcClient.update.checkForUpdates', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({ success: true });

      const result = await service.checkForUpdates();

      expect(trpcClient.update.checkForUpdates.mutate).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle error and return failure result', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockRejectedValue(new Error('Network error'));

      const result = await service.checkForUpdates();

      expect(result).toEqual({ success: false, error: 'Network error' });
      expect(service._state).toBe(UpdateState.ERROR);
    });

    it('should reconcile an available result into the AVAILABLE state', async () => {
      const updateInfo = { version: '2.0.0' };
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({
        success: true,
        updateAvailable: true,
        updateInfo
      });

      await service.checkForUpdates();

      expect(service._state).toBe(UpdateState.AVAILABLE);
      expect(service._updateInfo).toEqual(updateInfo);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.AVAILABLE, updateInfo);
    });

    it('should reconcile a no-update result into the NOT_AVAILABLE state', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({
        success: true,
        updateAvailable: false,
        reason: 'latest'
      });

      await service.checkForUpdates();

      expect(service._state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service._updateInfo).toEqual({ reason: 'latest' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.NOT_AVAILABLE, { reason: 'latest' });
    });

    it('should handle a failed result and transition to ERROR', async () => {
      const failure = { success: false, error: 'Server rejected' };
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue(failure);

      const result = await service.checkForUpdates();

      expect(result).toEqual(failure);
      expect(service._state).toBe(UpdateState.ERROR);
      expect(service._error).toEqual({ message: 'Server rejected' });
    });

    it('should apply the fallback message when a failed result omits an error', async () => {
      vi.mocked(trpcClient.update.checkForUpdates.mutate).mockResolvedValue({ success: false });

      await service.checkForUpdates();

      expect(service._state).toBe(UpdateState.ERROR);
      expect(service._error).toEqual({ message: 'Check for updates failed' });
    });
  });

  describe('downloadUpdate', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return error if not in AVAILABLE state', async () => {
      service._state = UpdateState.IDLE;

      const result = await service.downloadUpdate();

      expect(result).toEqual({ success: false, error: 'No update available' });
    });

    it('should set state to DOWNLOADING and invoke the mutation', async () => {
      service._state = UpdateState.AVAILABLE;
      vi.mocked(trpcClient.update.downloadUpdate.mutate).mockResolvedValue({ success: true });

      await service.downloadUpdate();

      expect(trpcClient.update.downloadUpdate.mutate).toHaveBeenCalled();
    });

    it('should handle download error', async () => {
      service._state = UpdateState.AVAILABLE;
      vi.mocked(trpcClient.update.downloadUpdate.mutate).mockRejectedValue(new Error('Download failed'));

      const result = await service.downloadUpdate();

      expect(result).toEqual({ success: false, error: 'Download failed' });
      expect(service._state).toBe(UpdateState.ERROR);
    });
  });

  describe('installUpdate', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return error if not in DOWNLOADED state', async () => {
      service._state = UpdateState.AVAILABLE;

      const result = await service.installUpdate();

      expect(result).toEqual({ success: false, error: 'No update downloaded' });
    });

    it('should call trpcClient.update.installUpdate', async () => {
      service._state = UpdateState.DOWNLOADED;
      vi.mocked(trpcClient.update.installUpdate.mutate).mockResolvedValue({ success: true });

      const result = await service.installUpdate();

      expect(trpcClient.update.installUpdate.mutate).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle install error', async () => {
      service._state = UpdateState.DOWNLOADED;
      vi.mocked(trpcClient.update.installUpdate.mutate).mockRejectedValue(new Error('Install failed'));

      const result = await service.installUpdate();

      expect(result).toEqual({ success: false, error: 'Install failed' });
      expect(service._state).toBe(UpdateState.ERROR);
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

      expect(service._state).toBe(UpdateState.IDLE);
      expect(service._updateInfo).toBeNull();
      expect(service._initialized).toBe(false);
    });
  });

  describe('_setState', () => {
    it('should update state and emit state-changed', () => {
      service._setState(UpdateState.CHECKING);

      expect(service._state).toBe(UpdateState.CHECKING);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UPDATE.STATE_CHANGED,
        expect.objectContaining({ state: UpdateState.CHECKING })
      );
    });
  });
});
