/**
 * IpcHandlerRegistry Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  app: {
    getAppMetrics: vi.fn(() => [])
  },
  shell: {
    openExternal: vi.fn()
  }
}));

import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import { ipcMain } from 'electron';

describe('IpcHandlerRegistry', () => {
  let ipcHandlerRegistry;
  let mockDeviceService;
  let mockUpdateService;
  let mockWindowService;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockDeviceService = {
      getStatus: vi.fn()
    };

    mockUpdateService = {
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      getStatus: vi.fn()
    };

    mockWindowService = {
      toggleFullscreen: vi.fn(),
      setVolume: vi.fn()
    };

    ipcHandlerRegistry = new IpcHandlerRegistry({
      deviceService: mockDeviceService,
      updateService: mockUpdateService,
      windowService: mockWindowService,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('IpcHandlerRegistry');
    });

    it('should store device service', () => {
      expect(ipcHandlerRegistry.deviceService).toBe(mockDeviceService);
    });
  });

  describe('registerHandlers', () => {
    it('should log registration', () => {
      ipcHandlerRegistry.registerHandlers();

      expect(mockLogger.info).toHaveBeenCalledWith('Registering IPC handlers');
    });

    it('should register device handlers', () => {
      ipcHandlerRegistry.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith('device:get-status', expect.any(Function));
    });
  });

  describe('Device Handler: GET_STATUS', () => {
    it('should return device status on success', async () => {
      mockDeviceService.getStatus.mockReturnValue({
        connected: true,
        device: { deviceName: 'Chromatic' }
      });

      ipcHandlerRegistry.registerHandlers();

      const statusHandler = ipcMain.handle.mock.calls.find(
        call => call[0] === 'device:get-status'
      )[1];

      const result = await statusHandler();

      expect(result.connected).toBe(true);
      expect(result.device.deviceName).toBe('Chromatic');
    });

    it('should handle error getting status', async () => {
      mockDeviceService.getStatus.mockImplementation(() => {
        throw new Error('Device error');
      });

      ipcHandlerRegistry.registerHandlers();

      const statusHandler = ipcMain.handle.mock.calls.find(
        call => call[0] === 'device:get-status'
      )[1];

      const result = await statusHandler();

      expect(result.error).toBe('Device error');
      expect(result.connected).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
