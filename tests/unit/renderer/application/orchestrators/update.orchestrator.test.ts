// @ts-nocheck
/**
 * UpdateOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateOrchestrator } from '@renderer/application/orchestrators/update.orchestrator';
import { UpdateState } from '@platform/config';
import {
  createLoggerFactory,
  createUpdateServiceMock,
  createUpdateUiServiceMock
} from '../../../../factories/index.js';

describe('UpdateOrchestrator', () => {
  let orchestrator;
  let mockUpdateService;
  let mockUpdateUiService;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();

    mockUpdateService = createUpdateServiceMock({
      initialize: vi.fn(),
      dispose: vi.fn(),
      getStatus: vi.fn(() => ({
        state: UpdateState.IDLE,
        updateInfo: null
      })),
      state: UpdateState.IDLE,
      updateInfo: null
    });

    mockUpdateUiService = createUpdateUiServiceMock();

    orchestrator = new UpdateOrchestrator(
      mockUpdateService,
      mockUpdateUiService,
      mockLoggerFactory
    );
    mockLogger = mockLoggerFactory._getLogger('UpdateOrchestrator');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.updateService).toBe(mockUpdateService);
      expect(orchestrator.updateUiService).toBe(mockUpdateUiService);
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
});
