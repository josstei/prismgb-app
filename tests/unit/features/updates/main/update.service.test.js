/**
 * UpdateService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateService, UpdateState } from '@main/features/updates/update.service.js';

vi.mock('electron', () => ({
  app: {
    isQuitting: false
  }
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  }
}));

vi.mock('@infrastructure/ipc/channels.js', () => ({
  default: {
    UPDATE: {
      AVAILABLE: 'update:available',
      NOT_AVAILABLE: 'update:not-available',
      PROGRESS: 'update:progress',
      DOWNLOADED: 'update:downloaded',
      ERROR: 'update:error'
    }
  }
}));

import { autoUpdater } from 'electron-updater';

describe('UpdateService', () => {
  let service;
  let mockWindowService;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockWindowService = {
      send: vi.fn()
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockConfig = {
      isDevelopment: false,
      version: '1.0.0'
    };

    service = new UpdateService({
      windowService: mockWindowService,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      config: mockConfig
    });
  });

  afterEach(() => {
    if (service._initialized) {
      service.dispose();
    }
  });

  describe('constructor', () => {
    it('should create service with initial state', () => {
      expect(service.state).toBe(UpdateState.IDLE);
      expect(service.updateInfo).toBeNull();
      expect(service.downloadProgress).toBeNull();
      expect(service.error).toBeNull();
      expect(service._initialized).toBe(false);
    });

    it('should create logger with correct name', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UpdateService');
    });
  });

  describe('initialize', () => {
    it('should set up autoUpdater configuration', () => {
      service.initialize();

      expect(autoUpdater.autoDownload).toBe(false);
      expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
      expect(service._initialized).toBe(true);
    });

    it('should set allowPrerelease for beta versions', () => {
      service.config = { version: '1.0.0-beta.1' };
      service.initialize();

      expect(autoUpdater.allowPrerelease).toBe(true);
    });

    it('should not set allowPrerelease for stable versions', () => {
      service.config = { version: '1.0.0' };
      service.initialize();

      expect(autoUpdater.allowPrerelease).toBe(false);
    });

    it('should set up event listeners', () => {
      service.initialize();

      expect(autoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should warn if already initialized', () => {
      service.initialize();
      service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('UpdateService already initialized');
    });
  });

  describe('event handlers', () => {
    let eventHandlers;

    beforeEach(() => {
      eventHandlers = {};
      autoUpdater.on.mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
      });
      service.initialize();
    });

    it('should handle checking-for-update event', () => {
      eventHandlers['checking-for-update']();

      expect(service.state).toBe(UpdateState.CHECKING);
    });

    it('should handle update-available event', () => {
      const updateInfo = { version: '2.0.0' };
      eventHandlers['update-available'](updateInfo);

      expect(service.state).toBe(UpdateState.AVAILABLE);
      expect(service.updateInfo).toBe(updateInfo);
      expect(mockWindowService.send).toHaveBeenCalledWith('update:available', updateInfo);
    });

    it('should handle update-not-available event', () => {
      const updateInfo = { version: '1.0.0' };
      eventHandlers['update-not-available'](updateInfo);

      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service.updateInfo).toBe(updateInfo);
      expect(mockWindowService.send).toHaveBeenCalledWith('update:not-available', updateInfo);
    });

    it('should handle download-progress event', () => {
      const progress = { percent: 50, transferred: 5000, total: 10000 };
      eventHandlers['download-progress'](progress);

      expect(service.downloadProgress).toBe(progress);
      expect(mockWindowService.send).toHaveBeenCalledWith('update:progress', progress);
    });

    it('should handle update-downloaded event', () => {
      const updateInfo = { version: '2.0.0' };
      eventHandlers['update-downloaded'](updateInfo);

      expect(service.state).toBe(UpdateState.DOWNLOADED);
      expect(service.updateInfo).toBe(updateInfo);
      expect(mockWindowService.send).toHaveBeenCalledWith('update:downloaded', updateInfo);
    });

    it('should handle error event', () => {
      const error = new Error('Network error');
      eventHandlers['error'](error);

      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.error).toBe(error);
      expect(mockWindowService.send).toHaveBeenCalledWith('update:error', { message: 'Network error' });
    });
  });

  describe('checkForUpdates', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should throw if not initialized', async () => {
      service._initialized = false;

      await expect(service.checkForUpdates()).rejects.toThrow('UpdateService not initialized');
    });

    it('should skip check in development mode', async () => {
      service.config = { isDevelopment: true, version: '1.0.0' };

      const result = await service.checkForUpdates();

      expect(result).toEqual({ updateAvailable: false, reason: 'development' });
      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should skip check if already downloading', async () => {
      service.state = UpdateState.DOWNLOADING;
      service.updateInfo = { version: '2.0.0' };

      const result = await service.checkForUpdates();

      expect(result.skipped).toBe(true);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should skip check if already downloaded', async () => {
      service.state = UpdateState.DOWNLOADED;
      service.updateInfo = { version: '2.0.0' };

      const result = await service.checkForUpdates();

      expect(result.skipped).toBe(true);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should force check even if downloaded', async () => {
      service.state = UpdateState.DOWNLOADED;
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } });

      await service.checkForUpdates({ force: true });

      expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it('should call autoUpdater.checkForUpdates', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } });

      const result = await service.checkForUpdates();

      expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
      expect(result.updateAvailable).toBe(true);
      expect(result.updateInfo).toEqual({ version: '2.0.0' });
    });

    it('should return updateAvailable false if same version', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      const result = await service.checkForUpdates();

      expect(result.updateAvailable).toBe(false);
    });

    it('should throw on error', async () => {
      const error = new Error('Network error');
      autoUpdater.checkForUpdates.mockRejectedValue(error);

      await expect(service.checkForUpdates()).rejects.toThrow('Network error');
    });
  });

  describe('downloadUpdate', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should throw if not initialized', async () => {
      service._initialized = false;

      await expect(service.downloadUpdate()).rejects.toThrow('UpdateService not initialized');
    });

    it('should throw if no update available', async () => {
      service.state = UpdateState.IDLE;

      await expect(service.downloadUpdate()).rejects.toThrow('No update available to download');
    });

    it('should notify renderer if already downloaded', async () => {
      service.state = UpdateState.DOWNLOADED;
      service.updateInfo = { version: '2.0.0' };

      await service.downloadUpdate();

      expect(mockWindowService.send).toHaveBeenCalledWith('update:downloaded', { version: '2.0.0' });
      expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    });

    it('should call autoUpdater.downloadUpdate', async () => {
      service.state = UpdateState.AVAILABLE;
      autoUpdater.downloadUpdate.mockResolvedValue();

      await service.downloadUpdate();

      expect(service.state).toBe(UpdateState.DOWNLOADING);
      expect(autoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    it('should set ERROR state on failure', async () => {
      service.state = UpdateState.AVAILABLE;
      const error = new Error('Download failed');
      autoUpdater.downloadUpdate.mockRejectedValue(error);

      await expect(service.downloadUpdate()).rejects.toThrow('Download failed');
      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.error).toBe(error);
    });
  });

  describe('installUpdate', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should throw if not initialized', () => {
      service._initialized = false;

      expect(() => service.installUpdate()).toThrow('UpdateService not initialized');
    });

    it('should throw if no update downloaded', () => {
      service.state = UpdateState.AVAILABLE;

      expect(() => service.installUpdate()).toThrow('No update downloaded to install');
    });

    it('should call autoUpdater.quitAndInstall', () => {
      service.state = UpdateState.DOWNLOADED;

      service.installUpdate();

      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });
  });

  describe('startAutoCheck', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      service.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should perform initial check after delay', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      service.startAutoCheck(60000);

      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10000);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('should set up periodic checks', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      service.startAutoCheck(60000);

      await vi.advanceTimersByTimeAsync(10000);
      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60000);
      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('should warn if already running', () => {
      service.startAutoCheck(60000);
      service.startAutoCheck(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith('Auto-check already running');
    });
  });

  describe('stopAutoCheck', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      service.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop periodic checks', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      service.startAutoCheck(60000);
      await vi.advanceTimersByTimeAsync(10000);

      service.stopAutoCheck();
      await vi.advanceTimersByTimeAsync(120000);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      service.state = UpdateState.AVAILABLE;
      service.updateInfo = { version: '2.0.0' };
      service.downloadProgress = { percent: 50 };
      service.error = new Error('Test error');

      const status = service.getStatus();

      expect(status).toEqual({
        state: UpdateState.AVAILABLE,
        updateInfo: { version: '2.0.0' },
        downloadProgress: { percent: 50 },
        error: 'Test error'
      });
    });

    it('should return null error if no error', () => {
      const status = service.getStatus();

      expect(status.error).toBeNull();
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      service.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop auto-check', () => {
      service.startAutoCheck(60000);
      service.dispose();

      expect(service._autoCheckIntervalId).toBeNull();
    });

    it('should remove all listeners', () => {
      service.dispose();

      expect(autoUpdater.removeAllListeners).toHaveBeenCalled();
    });

    it('should set initialized to false', () => {
      service.dispose();

      expect(service._initialized).toBe(false);
    });
  });

  describe('_setState', () => {
    it('should publish state-changed event via EventBus', () => {
      service._setState(UpdateState.CHECKING);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'update:state-changed',
        {
          oldState: UpdateState.IDLE,
          newState: UpdateState.CHECKING
        }
      );
    });
  });

  describe('_notifyRenderer', () => {
    it('should call windowService.send', () => {
      service._notifyRenderer('test-channel', { data: 'test' });

      expect(mockWindowService.send).toHaveBeenCalledWith('test-channel', { data: 'test' });
    });

    it('should handle missing windowService gracefully', () => {
      service.windowService = null;

      expect(() => service._notifyRenderer('test-channel', {})).not.toThrow();
    });

    it('should log warning on error', () => {
      mockWindowService.send.mockImplementation(() => {
        throw new Error('Send failed');
      });

      service._notifyRenderer('test-channel', {});

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to notify renderer',
        expect.objectContaining({ channel: 'test-channel' })
      );
    });
  });
});
