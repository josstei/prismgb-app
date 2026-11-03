/**
 * UpdateService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateService } from '@platform/updates';
import { UpdateState } from '@platform/config';
import type { LoggerLike } from '@platform/core';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import { createLoggerFactory } from '../../../factories/logger.factory.js';
import { createUpdateConfigMock } from '../../../factories/update.factory.js';

vi.mock('electron', () => ({
  app: {
    isQuitting: false
  }
}));

vi.mock('electron-updater', () => {
  const autoUpdater = {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  };
  return {
    autoUpdater,
    default: { autoUpdater }
  };
});

import { autoUpdater } from 'electron-updater';

type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;
type MockPushPublisher = { emit: MockFn };
type MockLoggerFactory = ReturnType<typeof createLoggerFactory> & {
  _getLogger(name: string): LoggerLike;
};
type UpdateConfigMock = ReturnType<typeof createUpdateConfigMock>;
type UpdateServiceConfig = {
  isDevelopment?: boolean;
  version?: string;
};
type TestableUpdateService = Omit<UpdateService, 'config'> & {
  _initialized: boolean;
  _autoCheckRunning: boolean;
  config: UpdateServiceConfig;
};
type UpdateEventHandlers = Record<string, (...args: unknown[]) => void>;
type AutoUpdaterCheckResult = Awaited<ReturnType<typeof autoUpdater.checkForUpdates>>;

function createUpdateInfo(version: string): UpdateInfo {
  return { version } as UpdateInfo;
}

function createDownloadProgress(percent: number): ProgressInfo {
  return { percent } as ProgressInfo;
}

function createAutoUpdaterCheckResult(version: string): NonNullable<AutoUpdaterCheckResult> {
  return { updateInfo: createUpdateInfo(version) } as NonNullable<AutoUpdaterCheckResult>;
}

describe('UpdateService', () => {
  let service: TestableUpdateService;
  let mockPushPublisher: MockPushPublisher;
  let mockLogger: LoggerLike;
  let mockLoggerFactory: MockLoggerFactory;
  let mockConfig: UpdateConfigMock;

  beforeEach(() => {

    mockLoggerFactory = createLoggerFactory();

    mockPushPublisher = { emit: vi.fn() };


    mockConfig = createUpdateConfigMock();

    service = new UpdateService({
      pushPublisher: mockPushPublisher,
      prepareInstall: vi.fn(),
      loggerFactory: mockLoggerFactory,
      config: mockConfig
    }) as unknown as TestableUpdateService;
    mockLogger = mockLoggerFactory._getLogger('UpdateService');
  });

  afterEach(async () => {
    if (service._initialized) {
      await service.dispose();
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

    it('should suppress platform-not-found errors in autoUpdater logger', () => {
      service.initialize();

      autoUpdater.logger!.error('Cannot find latest-linux-arm64.yml in the latest release artifacts');

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log other errors in autoUpdater logger', () => {
      service.initialize();

      autoUpdater.logger!.error('Network connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Network connection failed');
    });
  });

  describe('event handlers', () => {
    let eventHandlers: UpdateEventHandlers;

    beforeEach(() => {
      eventHandlers = {};
      vi.mocked(autoUpdater.on).mockImplementation((event, handler) => {
        eventHandlers[String(event)] = handler as (...args: unknown[]) => void;
        return autoUpdater;
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
      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:available', updateInfo);
    });

    it('should handle update-not-available event', () => {
      const updateInfo = { version: '1.0.0' };
      eventHandlers['update-not-available'](updateInfo);

      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service.updateInfo).toBe(updateInfo);
      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:not-available', updateInfo);
    });

    it('should handle download-progress event', () => {
      const progress = { percent: 50, transferred: 5000, total: 10000 };
      eventHandlers['download-progress'](progress);

      expect(service.downloadProgress).toBe(progress);
      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:progress', progress);
    });

    it('should handle update-downloaded event', () => {
      const updateInfo = { version: '2.0.0' };
      eventHandlers['update-downloaded'](updateInfo);

      expect(service.state).toBe(UpdateState.DOWNLOADED);
      expect(service.updateInfo).toBe(updateInfo);
      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:downloaded', updateInfo);
    });

    it('should handle error event', () => {
      const error = new Error('Network error');
      eventHandlers['error'](error);

      expect(service.state).toBe(UpdateState.ERROR);
      expect(service.error).toBe(error);
      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:error', { message: 'Network error' });
    });

    it('should handle platform manifest not found as not-available', () => {
      const error = new Error('Cannot find latest-linux-arm64.yml in the latest release artifacts');
      eventHandlers['error'](error);

      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(service.error).toBeNull();
      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:not-available', {
        version: '1.0.0',
        reason: 'platform-not-supported'
      });
      expect(mockLogger.info).toHaveBeenCalledWith('No updates available for this platform');
    });

    it('should handle any platform yml manifest not found', () => {
      const error = new Error('Cannot find latest-mac.yml in the release');
      eventHandlers['error'](error);

      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
    });

    it('should handle missing latest.yml manifest as not-available', () => {
      const error = new Error('Cannot find latest.yml in the release');
      eventHandlers['error'](error);

      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
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
      service.updateInfo = createUpdateInfo('2.0.0');

      const result = await service.checkForUpdates();

      expect(result.skipped).toBe(true);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should skip check if already downloaded', async () => {
      service.state = UpdateState.DOWNLOADED;
      service.updateInfo = createUpdateInfo('2.0.0');

      const result = await service.checkForUpdates();

      expect(result.skipped).toBe(true);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should call autoUpdater.checkForUpdates', async () => {
      vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue(createAutoUpdaterCheckResult('2.0.0'));

      const result = await service.checkForUpdates();

      expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
      expect(result.updateAvailable).toBe(true);
      expect(result.updateInfo).toEqual({ version: '2.0.0' });
    });

    it('should return updateAvailable false if same version', async () => {
      vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue(createAutoUpdaterCheckResult('1.0.0'));

      const result = await service.checkForUpdates();

      expect(result.updateAvailable).toBe(false);
    });

    it('settles a disabled updater without claiming an update is available', async () => {
      vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue(null);
      await expect(service.checkForUpdates()).resolves.toEqual({ updateAvailable: false, reason: 'update-check-disabled' });
      expect(service.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:not-available', {
        version: mockConfig.version, reason: 'update-check-disabled'
      });
    });

    it('should throw on error', async () => {
      const error = new Error('Network error');
      vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(error);

      await expect(service.checkForUpdates()).rejects.toThrow('Network error');
    });

    it('should handle platform manifest not found as not-available without throwing', async () => {
      const error = new Error('Cannot find latest-linux-arm64.yml in the latest release artifacts');
      vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(error);

      const result = await service.checkForUpdates();

      expect(result).toEqual({ updateAvailable: false, reason: 'platform-not-supported' });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle any platform yml manifest not found without throwing', async () => {
      const error = new Error('Cannot find latest-mac.yml in the release');
      vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(error);

      const result = await service.checkForUpdates();

      expect(result).toEqual({ updateAvailable: false, reason: 'platform-not-supported' });
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
      service.updateInfo = createUpdateInfo('2.0.0');

      await service.downloadUpdate();

      expect(mockPushPublisher.emit).toHaveBeenCalledWith('update:downloaded', { version: '2.0.0' });
      expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    });

    it('should call autoUpdater.downloadUpdate', async () => {
      service.state = UpdateState.AVAILABLE;
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue([]);

      await service.downloadUpdate();

      expect(service.state).toBe(UpdateState.DOWNLOADING);
      expect(autoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    it('should set ERROR state on failure', async () => {
      service.state = UpdateState.AVAILABLE;
      const error = new Error('Download failed');
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValue(error);

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
      vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue(createAutoUpdaterCheckResult('1.0.0'));

      service.startAutoCheck(60000);

      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10000);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('should set up periodic checks', async () => {
      vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue(createAutoUpdaterCheckResult('1.0.0'));

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

  describe('auto-check disposal', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      service.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop periodic checks', async () => {
      vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue(createAutoUpdaterCheckResult('1.0.0'));

      service.startAutoCheck(60000);
      await vi.advanceTimersByTimeAsync(10000);

      await service.dispose();
      await vi.advanceTimersByTimeAsync(120000);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      service.state = UpdateState.AVAILABLE;
      service.updateInfo = createUpdateInfo('2.0.0');
      service.downloadProgress = createDownloadProgress(50);
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

    it('should stop auto-check', async () => {
      service.startAutoCheck(60000);
      await service.dispose();

      expect(service._autoCheckRunning).toBe(false);
    });

    it('should remove only listeners owned by the update service', async () => {
      await service.dispose();

      expect(autoUpdater.removeAllListeners).not.toHaveBeenCalled();
      expect(autoUpdater.removeListener).toHaveBeenCalledTimes(6);
      expect(autoUpdater.removeListener).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
      expect(autoUpdater.removeListener).toHaveBeenCalledWith('update-available', expect.any(Function));
      expect(autoUpdater.removeListener).toHaveBeenCalledWith('update-not-available', expect.any(Function));
      expect(autoUpdater.removeListener).toHaveBeenCalledWith('download-progress', expect.any(Function));
      expect(autoUpdater.removeListener).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
      expect(autoUpdater.removeListener).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should set initialized to false', async () => {
      await service.dispose();

      expect(service._initialized).toBe(false);
    });
  });

  describe('push delivery failure', () => {
    it('should log warning on error', async () => {
      mockPushPublisher.emit.mockImplementation(() => {
        throw new Error('Send failed');
      });

      service.initialize();
      service.state = UpdateState.DOWNLOADED;
      service.updateInfo = createUpdateInfo('2.0.0');

      await expect(service.downloadUpdate()).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to notify renderer',
        expect.objectContaining({ channel: 'update:downloaded' })
      );
    });
  });
});
