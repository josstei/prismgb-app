/**
 * UpdateManager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import UpdateManager, { UpdateState } from '@features/updates/main/update.manager.js';

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

describe('UpdateManager', () => {
  let manager;
  let mockWindowManager;
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

    mockWindowManager = {
      send: vi.fn()
    };

    mockConfig = {
      isDevelopment: false,
      version: '1.0.0'
    };

    manager = new UpdateManager({
      windowManager: mockWindowManager,
      loggerFactory: mockLoggerFactory,
      config: mockConfig
    });
  });

  afterEach(() => {
    if (manager._initialized) {
      manager.dispose();
    }
  });

  describe('constructor', () => {
    it('should create manager with initial state', () => {
      expect(manager.state).toBe(UpdateState.IDLE);
      expect(manager.updateInfo).toBeNull();
      expect(manager.downloadProgress).toBeNull();
      expect(manager.error).toBeNull();
      expect(manager._initialized).toBe(false);
    });

    it('should create logger with correct name', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UpdateManager');
    });
  });

  describe('initialize', () => {
    it('should set up autoUpdater configuration', () => {
      manager.initialize();

      expect(autoUpdater.autoDownload).toBe(false);
      expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
      expect(manager._initialized).toBe(true);
    });

    it('should set allowPrerelease for beta versions', () => {
      manager.config = { version: '1.0.0-beta.1' };
      manager.initialize();

      expect(autoUpdater.allowPrerelease).toBe(true);
    });

    it('should not set allowPrerelease for stable versions', () => {
      manager.config = { version: '1.0.0' };
      manager.initialize();

      expect(autoUpdater.allowPrerelease).toBe(false);
    });

    it('should set up event listeners', () => {
      manager.initialize();

      expect(autoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should warn if already initialized', () => {
      manager.initialize();
      manager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('UpdateManager already initialized');
    });
  });

  describe('event handlers', () => {
    let eventHandlers;

    beforeEach(() => {
      eventHandlers = {};
      autoUpdater.on.mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
      });
      manager.initialize();
    });

    it('should handle checking-for-update event', () => {
      eventHandlers['checking-for-update']();

      expect(manager.state).toBe(UpdateState.CHECKING);
    });

    it('should handle update-available event', () => {
      const updateInfo = { version: '2.0.0' };
      eventHandlers['update-available'](updateInfo);

      expect(manager.state).toBe(UpdateState.AVAILABLE);
      expect(manager.updateInfo).toBe(updateInfo);
      expect(mockWindowManager.send).toHaveBeenCalledWith('update:available', updateInfo);
    });

    it('should handle update-not-available event', () => {
      const updateInfo = { version: '1.0.0' };
      eventHandlers['update-not-available'](updateInfo);

      expect(manager.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(manager.updateInfo).toBe(updateInfo);
      expect(mockWindowManager.send).toHaveBeenCalledWith('update:not-available', updateInfo);
    });

    it('should handle download-progress event', () => {
      const progress = { percent: 50, transferred: 5000, total: 10000 };
      eventHandlers['download-progress'](progress);

      expect(manager.downloadProgress).toBe(progress);
      expect(mockWindowManager.send).toHaveBeenCalledWith('update:progress', progress);
    });

    it('should handle update-downloaded event', () => {
      const updateInfo = { version: '2.0.0' };
      eventHandlers['update-downloaded'](updateInfo);

      expect(manager.state).toBe(UpdateState.DOWNLOADED);
      expect(manager.updateInfo).toBe(updateInfo);
      expect(mockWindowManager.send).toHaveBeenCalledWith('update:downloaded', updateInfo);
    });

    it('should handle error event', () => {
      const error = new Error('Network error');
      eventHandlers['error'](error);

      expect(manager.state).toBe(UpdateState.ERROR);
      expect(manager.error).toBe(error);
      expect(mockWindowManager.send).toHaveBeenCalledWith('update:error', { message: 'Network error' });
    });
  });

  describe('checkForUpdates', () => {
    beforeEach(() => {
      manager.initialize();
    });

    it('should throw if not initialized', async () => {
      manager._initialized = false;

      await expect(manager.checkForUpdates()).rejects.toThrow('UpdateManager not initialized');
    });

    it('should skip check in development mode', async () => {
      manager.config = { isDevelopment: true, version: '1.0.0' };

      const result = await manager.checkForUpdates();

      expect(result).toEqual({ updateAvailable: false, reason: 'development' });
      expect(manager.state).toBe(UpdateState.NOT_AVAILABLE);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should skip check if already downloading', async () => {
      manager.state = UpdateState.DOWNLOADING;
      manager.updateInfo = { version: '2.0.0' };

      const result = await manager.checkForUpdates();

      expect(result.skipped).toBe(true);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should skip check if already downloaded', async () => {
      manager.state = UpdateState.DOWNLOADED;
      manager.updateInfo = { version: '2.0.0' };

      const result = await manager.checkForUpdates();

      expect(result.skipped).toBe(true);
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('should force check even if downloaded', async () => {
      manager.state = UpdateState.DOWNLOADED;
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } });

      await manager.checkForUpdates({ force: true });

      expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it('should call autoUpdater.checkForUpdates', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } });

      const result = await manager.checkForUpdates();

      expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
      expect(result.updateAvailable).toBe(true);
      expect(result.updateInfo).toEqual({ version: '2.0.0' });
    });

    it('should return updateAvailable false if same version', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      const result = await manager.checkForUpdates();

      expect(result.updateAvailable).toBe(false);
    });

    it('should throw on error', async () => {
      const error = new Error('Network error');
      autoUpdater.checkForUpdates.mockRejectedValue(error);

      await expect(manager.checkForUpdates()).rejects.toThrow('Network error');
    });
  });

  describe('downloadUpdate', () => {
    beforeEach(() => {
      manager.initialize();
    });

    it('should throw if not initialized', async () => {
      manager._initialized = false;

      await expect(manager.downloadUpdate()).rejects.toThrow('UpdateManager not initialized');
    });

    it('should throw if no update available', async () => {
      manager.state = UpdateState.IDLE;

      await expect(manager.downloadUpdate()).rejects.toThrow('No update available to download');
    });

    it('should notify renderer if already downloaded', async () => {
      manager.state = UpdateState.DOWNLOADED;
      manager.updateInfo = { version: '2.0.0' };

      await manager.downloadUpdate();

      expect(mockWindowManager.send).toHaveBeenCalledWith('update:downloaded', { version: '2.0.0' });
      expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    });

    it('should call autoUpdater.downloadUpdate', async () => {
      manager.state = UpdateState.AVAILABLE;
      autoUpdater.downloadUpdate.mockResolvedValue();

      await manager.downloadUpdate();

      expect(manager.state).toBe(UpdateState.DOWNLOADING);
      expect(autoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    it('should set ERROR state on failure', async () => {
      manager.state = UpdateState.AVAILABLE;
      const error = new Error('Download failed');
      autoUpdater.downloadUpdate.mockRejectedValue(error);

      await expect(manager.downloadUpdate()).rejects.toThrow('Download failed');
      expect(manager.state).toBe(UpdateState.ERROR);
      expect(manager.error).toBe(error);
    });
  });

  describe('installUpdate', () => {
    beforeEach(() => {
      manager.initialize();
    });

    it('should throw if not initialized', () => {
      manager._initialized = false;

      expect(() => manager.installUpdate()).toThrow('UpdateManager not initialized');
    });

    it('should throw if no update downloaded', () => {
      manager.state = UpdateState.AVAILABLE;

      expect(() => manager.installUpdate()).toThrow('No update downloaded to install');
    });

    it('should call autoUpdater.quitAndInstall', () => {
      manager.state = UpdateState.DOWNLOADED;

      manager.installUpdate();

      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });
  });

  describe('startAutoCheck', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should perform initial check after delay', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      manager.startAutoCheck(60000);

      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10000);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('should set up periodic checks', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      manager.startAutoCheck(60000);

      await vi.advanceTimersByTimeAsync(10000);
      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60000);
      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('should warn if already running', () => {
      manager.startAutoCheck(60000);
      manager.startAutoCheck(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith('Auto-check already running');
    });
  });

  describe('stopAutoCheck', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop periodic checks', async () => {
      autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } });

      manager.startAutoCheck(60000);
      await vi.advanceTimersByTimeAsync(10000);

      manager.stopAutoCheck();
      await vi.advanceTimersByTimeAsync(120000);

      expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      manager.state = UpdateState.AVAILABLE;
      manager.updateInfo = { version: '2.0.0' };
      manager.downloadProgress = { percent: 50 };
      manager.error = new Error('Test error');

      const status = manager.getStatus();

      expect(status).toEqual({
        state: UpdateState.AVAILABLE,
        updateInfo: { version: '2.0.0' },
        downloadProgress: { percent: 50 },
        error: 'Test error'
      });
    });

    it('should return null error if no error', () => {
      const status = manager.getStatus();

      expect(status.error).toBeNull();
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should stop auto-check', () => {
      manager.startAutoCheck(60000);
      manager.dispose();

      expect(manager._autoCheckIntervalId).toBeNull();
    });

    it('should remove all listeners', () => {
      manager.dispose();

      expect(autoUpdater.removeAllListeners).toHaveBeenCalled();
    });

    it('should set initialized to false', () => {
      manager.dispose();

      expect(manager._initialized).toBe(false);
    });
  });

  describe('_setState', () => {
    it('should emit state-changed event', () => {
      const handler = vi.fn();
      manager.on('state-changed', handler);

      manager._setState(UpdateState.CHECKING);

      expect(handler).toHaveBeenCalledWith({
        oldState: UpdateState.IDLE,
        newState: UpdateState.CHECKING
      });
    });
  });

  describe('_notifyRenderer', () => {
    it('should call windowManager.send', () => {
      manager._notifyRenderer('test-channel', { data: 'test' });

      expect(mockWindowManager.send).toHaveBeenCalledWith('test-channel', { data: 'test' });
    });

    it('should handle missing windowManager gracefully', () => {
      manager.windowManager = null;

      expect(() => manager._notifyRenderer('test-channel', {})).not.toThrow();
    });

    it('should log warning on error', () => {
      mockWindowManager.send.mockImplementation(() => {
        throw new Error('Send failed');
      });

      manager._notifyRenderer('test-channel', {});

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to notify renderer',
        expect.objectContaining({ channel: 'test-channel' })
      );
    });
  });
});
