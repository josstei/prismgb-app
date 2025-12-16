/**
 * UpdateOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateOrchestrator, UpdateState } from '@features/updates/orchestrators/update.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('UpdateOrchestrator', () => {
  let orchestrator;
  let mockUpdateService;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

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

    mockUpdateService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      getStatus: vi.fn(() => ({
        state: UpdateState.IDLE,
        updateInfo: null
      })),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      state: UpdateState.IDLE,
      updateInfo: null
    };

    orchestrator = new UpdateOrchestrator({
      updateService: mockUpdateService,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.updateService).toBe(mockUpdateService);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new UpdateOrchestrator({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('onInitialize', () => {
    it('should subscribe to update events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.AVAILABLE,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.NOT_AVAILABLE,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.PROGRESS,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.DOWNLOADED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.ERROR,
        expect.any(Function)
      );
    });

    it('should initialize update service', async () => {
      await orchestrator.onInitialize();

      expect(mockUpdateService.initialize).toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    let eventHandlers;

    beforeEach(async () => {
      eventHandlers = {};
      mockEventBus.subscribe.mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
        return vi.fn();
      });

      await orchestrator.onInitialize();
    });

    describe('_handleUpdateAvailable', () => {
      it('should publish status message', () => {
        eventHandlers[EventChannels.UPDATE.AVAILABLE]({ version: '2.0.0' });

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          expect.objectContaining({
            message: 'Update v2.0.0 available',
            type: 'info'
          })
        );
      });

      it('should show badge', () => {
        eventHandlers[EventChannels.UPDATE.AVAILABLE]({ version: '2.0.0' });

        expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.BADGE_SHOW);
      });

      it('should handle undefined version', () => {
        eventHandlers[EventChannels.UPDATE.AVAILABLE]({});

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          expect.objectContaining({
            message: 'Update vundefined available'
          })
        );
      });
    });

    describe('_handleNoUpdate', () => {
      it('should publish success status message', () => {
        eventHandlers[EventChannels.UPDATE.NOT_AVAILABLE]();

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          expect.objectContaining({
            message: "You're up to date",
            type: 'success'
          })
        );
      });

      it('should hide badge', () => {
        eventHandlers[EventChannels.UPDATE.NOT_AVAILABLE]();

        expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.BADGE_HIDE);
      });
    });

    describe('_handleProgress', () => {
      it('should log progress', () => {
        eventHandlers[EventChannels.UPDATE.PROGRESS]({ percent: 50.5 });

        expect(mockLogger.debug).toHaveBeenCalledWith('Download progress', { percent: '50.5' });
      });

      it('should handle undefined percent', () => {
        eventHandlers[EventChannels.UPDATE.PROGRESS]({});

        expect(mockLogger.debug).toHaveBeenCalled();
      });
    });

    describe('_handleDownloaded', () => {
      it('should publish status message', () => {
        eventHandlers[EventChannels.UPDATE.DOWNLOADED]({ version: '2.0.0' });

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          expect.objectContaining({
            message: 'Update v2.0.0 ready to install',
            type: 'success'
          })
        );
      });

      it('should show badge', () => {
        eventHandlers[EventChannels.UPDATE.DOWNLOADED]({ version: '2.0.0' });

        expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.BADGE_SHOW);
      });
    });

    describe('_handleError', () => {
      it('should publish error status message', () => {
        eventHandlers[EventChannels.UPDATE.ERROR]({ message: 'Network error' });

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          expect.objectContaining({
            message: 'Update failed: Network error',
            type: 'error'
          })
        );
      });

      it('should handle undefined error message', () => {
        eventHandlers[EventChannels.UPDATE.ERROR]({});

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          expect.objectContaining({
            message: 'Update failed: Unknown error'
          })
        );
      });

      it('should hide badge', () => {
        eventHandlers[EventChannels.UPDATE.ERROR]({ message: 'Error' });

        expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UPDATE.BADGE_HIDE);
      });
    });
  });

  describe('getStatus', () => {
    it('should delegate to updateService', () => {
      const status = { state: UpdateState.AVAILABLE, updateInfo: { version: '2.0.0' } };
      mockUpdateService.getStatus.mockReturnValue(status);

      const result = orchestrator.getStatus();

      expect(result).toBe(status);
    });
  });

  describe('state getter', () => {
    it('should return updateService state', () => {
      mockUpdateService.state = UpdateState.DOWNLOADING;

      expect(orchestrator.state).toBe(UpdateState.DOWNLOADING);
    });
  });

  describe('updateInfo getter', () => {
    it('should return updateService updateInfo', () => {
      mockUpdateService.updateInfo = { version: '2.0.0' };

      expect(orchestrator.updateInfo).toEqual({ version: '2.0.0' });
    });
  });

  describe('checkForUpdates', () => {
    it('should delegate to updateService', async () => {
      const result = { success: true };
      mockUpdateService.checkForUpdates.mockResolvedValue(result);

      const response = await orchestrator.checkForUpdates();

      expect(mockUpdateService.checkForUpdates).toHaveBeenCalled();
      expect(response).toBe(result);
    });

    it('should log info message', async () => {
      mockUpdateService.checkForUpdates.mockResolvedValue({});

      await orchestrator.checkForUpdates();

      expect(mockLogger.info).toHaveBeenCalledWith('Checking for updates...');
    });
  });

  describe('downloadUpdate', () => {
    it('should delegate to updateService', async () => {
      const result = { success: true };
      mockUpdateService.downloadUpdate.mockResolvedValue(result);

      const response = await orchestrator.downloadUpdate();

      expect(mockUpdateService.downloadUpdate).toHaveBeenCalled();
      expect(response).toBe(result);
    });

    it('should log info message', async () => {
      mockUpdateService.downloadUpdate.mockResolvedValue({});

      await orchestrator.downloadUpdate();

      expect(mockLogger.info).toHaveBeenCalledWith('Downloading update...');
    });
  });

  describe('installUpdate', () => {
    it('should delegate to updateService', async () => {
      const result = { success: true };
      mockUpdateService.installUpdate.mockResolvedValue(result);

      const response = await orchestrator.installUpdate();

      expect(mockUpdateService.installUpdate).toHaveBeenCalled();
      expect(response).toBe(result);
    });

    it('should log info message', async () => {
      mockUpdateService.installUpdate.mockResolvedValue({});

      await orchestrator.installUpdate();

      expect(mockLogger.info).toHaveBeenCalledWith('Installing update...');
    });
  });

  describe('onCleanup', () => {
    it('should dispose updateService', async () => {
      await orchestrator.onCleanup();

      expect(mockUpdateService.dispose).toHaveBeenCalled();
    });
  });
});
