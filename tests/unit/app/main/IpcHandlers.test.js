/**
 * IpcHandlers Unit Tests
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

import IpcHandlers from '@main/ipc-handlers.js';
import { ipcMain } from 'electron';

describe('IpcHandlers', () => {
  let ipcHandlers;
  let mockDeviceServiceMain;
  let mockUpdateServiceMain;
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

    mockDeviceServiceMain = {
      getStatus: vi.fn()
    };

    mockUpdateServiceMain = {
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      getStatus: vi.fn()
    };

    ipcHandlers = new IpcHandlers({
      deviceServiceMain: mockDeviceServiceMain,
      updateServiceMain: mockUpdateServiceMain,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('IpcHandlers');
    });

    it('should store device service', () => {
      expect(ipcHandlers.deviceServiceMain).toBe(mockDeviceServiceMain);
    });
  });

  describe('registerHandlers', () => {
    it('should log registration', () => {
      ipcHandlers.registerHandlers();

      expect(mockLogger.info).toHaveBeenCalledWith('Registering IPC handlers');
    });

    it('should register device handlers', () => {
      ipcHandlers.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith('device:get-status', expect.any(Function));
    });
  });

  describe('Device Handler: GET_STATUS', () => {
    it('should return device status on success', async () => {
      mockDeviceServiceMain.getStatus.mockReturnValue({
        connected: true,
        device: { deviceName: 'Chromatic' }
      });

      ipcHandlers.registerHandlers();

      const statusHandler = ipcMain.handle.mock.calls.find(
        call => call[0] === 'device:get-status'
      )[1];

      const result = await statusHandler();

      expect(result.connected).toBe(true);
      expect(result.device.deviceName).toBe('Chromatic');
    });

    it('should handle error getting status', async () => {
      mockDeviceServiceMain.getStatus.mockImplementation(() => {
        throw new Error('Device error');
      });

      ipcHandlers.registerHandlers();

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
