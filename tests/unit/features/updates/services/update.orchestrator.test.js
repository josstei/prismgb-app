/**
 * UpdateOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateOrchestrator } from '@renderer/features/updates/services/update.orchestrator.js';
import { UpdateState } from '@renderer/features/updates/services/update.service.js';

describe('UpdateOrchestrator', () => {
  let orchestrator;
  let mockUpdateService;
  let mockUpdateUiService;
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

    mockUpdateUiService = {
      initialize: vi.fn(),
      dispose: vi.fn()
    };

    orchestrator = new UpdateOrchestrator({
      updateService: mockUpdateService,
      updateUiService: mockUpdateUiService,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.updateService).toBe(mockUpdateService);
      expect(orchestrator.updateUiService).toBe(mockUpdateUiService);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new UpdateOrchestrator({
        updateUiService: mockUpdateUiService,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('onInitialize', () => {
    it('should initialize update service', async () => {
      await orchestrator.onInitialize();

      expect(mockUpdateService.initialize).toHaveBeenCalled();
      expect(mockUpdateUiService.initialize).toHaveBeenCalled();
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
      expect(mockUpdateUiService.dispose).toHaveBeenCalled();
    });
  });
});
