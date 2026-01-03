/**
 * UpdateService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateService, UpdateState } from '@renderer/features/updates/services/update.service.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

describe('UpdateService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockUpdateAPI;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockUpdateAPI = {
      getStatus: vi.fn(),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      onAvailable: vi.fn(() => vi.fn()),
      onNotAvailable: vi.fn(() => vi.fn()),
      onProgress: vi.fn(() => vi.fn()),
      onDownloaded: vi.fn(() => vi.fn()),
      onError: vi.fn(() => vi.fn()),
      removeListeners: vi.fn()
    };

    global.window = { updateAPI: mockUpdateAPI };

    service = new UpdateService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.window;
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
    it('should set up IPC listeners', async () => {
      mockUpdateAPI.getStatus.mockResolvedValue({
        state: UpdateState.IDLE,
        updateInfo: null
      });

      await service.initialize();

      expect(mockUpdateAPI.onAvailable).toHaveBeenCalled();
      expect(mockUpdateAPI.onNotAvailable).toHaveBeenCalled();
      expect(mockUpdateAPI.onProgress).toHaveBeenCalled();
      expect(mockUpdateAPI.onDownloaded).toHaveBeenCalled();
      expect(mockUpdateAPI.onError).toHaveBeenCalled();
      expect(service._initialized).toBe(true);
    });

    it('should load initial status', async () => {
      mockUpdateAPI.getStatus.mockResolvedValue({
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

    it('should warn if updateAPI not available', async () => {
      delete global.window.updateAPI;

      await service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('updateAPI not available - updates disabled');
      expect(service._initialized).toBe(false);
    });

    it('should warn if already initialized', async () => {
      mockUpdateAPI.getStatus.mockResolvedValue({ state: UpdateState.IDLE });
      await service.initialize();
      await service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('UpdateService already initialized');
    });

    it('should handle getStatus error gracefully', async () => {
      const testError = new Error('IPC error');
      mockUpdateAPI.getStatus.mockRejectedValue(testError);

      await service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to load initial update status', testError);
      expect(service._initialized).toBe(true);
    });
  });

  describe('event handlers', () => {
    let eventHandlers;

    beforeEach(async () => {
      eventHandlers = {};
      mockUpdateAPI.onAvailable.mockImplementation((handler) => {
        eventHandlers.available = handler;
        return vi.fn();
      });
      mockUpdateAPI.onNotAvailable.mockImplementation((handler) => {
        eventHandlers.notAvailable = handler;
        return vi.fn();
      });
      mockUpdateAPI.onProgress.mockImplementation((handler) => {
        eventHandlers.progress = handler;
        return vi.fn();
      });
      mockUpdateAPI.onDownloaded.mockImplementation((handler) => {
        eventHandlers.downloaded = handler;
        return vi.fn();
      });
      mockUpdateAPI.onError.mockImplementation((handler) => {
        eventHandlers.error = handler;
        return vi.fn();
      });
      mockUpdateAPI.getStatus.mockResolvedValue({ state: UpdateState.IDLE });

      await service.initialize();
    });

    it('should handle available event', () => {
      const info = { version: '2.0.0' };
      eventHandlers.available(info);

      expect(service._state).toBe(UpdateState.AVAILABLE);
      expect(service._updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.AVAILABLE, info);
    });

    it('should handle not-available event', () => {
      const info = { version: '1.0.0' };
      eventHandlers.notAvailable(info);

      expect(service._state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service._updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.NOT_AVAILABLE, info);
    });

    it('should handle progress event', () => {
      const progress = { percent: 75 };
      eventHandlers.progress(progress);

      expect(service._downloadProgress).toBe(progress);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.PROGRESS, progress);
    });

    it('should handle downloaded event', () => {
      const info = { version: '2.0.0' };
      eventHandlers.downloaded(info);

      expect(service._state).toBe(UpdateState.DOWNLOADED);
      expect(service._updateInfo).toBe(info);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.DOWNLOADED, info);
    });

    it('should handle error event', () => {
      const error = { message: 'Network error' };
      eventHandlers.error(error);

      expect(service._state).toBe(UpdateState.ERROR);
      expect(service._error).toBe(error);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.ERROR, error);
    });
  });

  describe('checkForUpdates', () => {
    beforeEach(async () => {
      mockUpdateAPI.getStatus.mockResolvedValue({ state: UpdateState.IDLE });
      await service.initialize();
    });

    it('should return error if updateAPI not available', async () => {
      delete global.window.updateAPI;

      const result = await service.checkForUpdates();

      expect(result).toEqual({ success: false, error: 'Updates not available' });
    });

    it('should set state to CHECKING', async () => {
      mockUpdateAPI.checkForUpdates.mockResolvedValue({ success: true });

      const promise = service.checkForUpdates();

      // State should be set immediately
      expect(service._state).toBe(UpdateState.CHECKING);

      await promise;
    });

    it('should call updateAPI.checkForUpdates', async () => {
      mockUpdateAPI.checkForUpdates.mockResolvedValue({ success: true, version: '2.0.0' });

      const result = await service.checkForUpdates();

      expect(mockUpdateAPI.checkForUpdates).toHaveBeenCalled();
      expect(result).toEqual({ success: true, version: '2.0.0' });
    });

    it('should handle error and return failure result', async () => {
      mockUpdateAPI.checkForUpdates.mockRejectedValue(new Error('Network error'));

      const result = await service.checkForUpdates();

      expect(result).toEqual({ success: false, error: 'Network error' });
      expect(service._state).toBe(UpdateState.ERROR);
    });
  });

  describe('downloadUpdate', () => {
    beforeEach(async () => {
      mockUpdateAPI.getStatus.mockResolvedValue({ state: UpdateState.IDLE });
      await service.initialize();
    });

    it('should return error if updateAPI not available', async () => {
      delete global.window.updateAPI;

      const result = await service.downloadUpdate();

      expect(result).toEqual({ success: false, error: 'Updates not available' });
    });

    it('should return error if not in AVAILABLE state', async () => {
      service._state = UpdateState.IDLE;

      const result = await service.downloadUpdate();

      expect(result).toEqual({ success: false, error: 'No update available' });
    });

    it('should set state to DOWNLOADING', async () => {
      service._state = UpdateState.AVAILABLE;
      mockUpdateAPI.downloadUpdate.mockResolvedValue({ success: true });

      await service.downloadUpdate();

      expect(mockUpdateAPI.downloadUpdate).toHaveBeenCalled();
    });

    it('should handle download error', async () => {
      service._state = UpdateState.AVAILABLE;
      mockUpdateAPI.downloadUpdate.mockRejectedValue(new Error('Download failed'));

      const result = await service.downloadUpdate();

      expect(result).toEqual({ success: false, error: 'Download failed' });
      expect(service._state).toBe(UpdateState.ERROR);
    });
  });

  describe('installUpdate', () => {
    beforeEach(async () => {
      mockUpdateAPI.getStatus.mockResolvedValue({ state: UpdateState.IDLE });
      await service.initialize();
    });

    it('should return error if updateAPI not available', async () => {
      delete global.window.updateAPI;

      const result = await service.installUpdate();

      expect(result).toEqual({ success: false, error: 'Updates not available' });
    });

    it('should return error if not in DOWNLOADED state', async () => {
      service._state = UpdateState.AVAILABLE;

      const result = await service.installUpdate();

      expect(result).toEqual({ success: false, error: 'No update downloaded' });
    });

    it('should call updateAPI.installUpdate', async () => {
      service._state = UpdateState.DOWNLOADED;
      mockUpdateAPI.installUpdate.mockResolvedValue({ success: true });

      const result = await service.installUpdate();

      expect(mockUpdateAPI.installUpdate).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle install error', async () => {
      service._state = UpdateState.DOWNLOADED;
      mockUpdateAPI.installUpdate.mockRejectedValue(new Error('Install failed'));

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
      mockUpdateAPI.getStatus.mockResolvedValue({ state: UpdateState.IDLE });
      await service.initialize();
    });

    it('should call cleanup functions', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      service._cleanupFns = [cleanup1, cleanup2];

      service.dispose();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });

    it('should call removeListeners', () => {
      service.dispose();

      expect(mockUpdateAPI.removeListeners).toHaveBeenCalled();
    });

    it('should reset state', () => {
      service._state = UpdateState.AVAILABLE;
      service._updateInfo = { version: '2.0.0' };
      service._initialized = true;

      service.dispose();

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
