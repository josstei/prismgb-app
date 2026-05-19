/**
 * IpcHandlerRegistry Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
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
  let mockTranscodeService;
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
      setFullScreen: vi.fn(),
      isFullScreen: vi.fn()
    };

    mockTranscodeService = {
      transcode: vi.fn(),
      cancel: vi.fn(),
      getStatus: vi.fn()
    };

    ipcHandlerRegistry = new IpcHandlerRegistry({
      deviceService: mockDeviceService,
      updateService: mockUpdateService,
      windowService: mockWindowService,
      transcodeService: mockTranscodeService,
      loginItemService: { isEnabled: vi.fn(), setEnabled: vi.fn() },
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

    it('should register each expected IPC channel exactly once', () => {
      ipcHandlerRegistry.registerHandlers();

      expect(ipcMain.handle.mock.calls.map(call => call[0])).toEqual([
        IPC_CHANNELS.DEVICE.GET_STATUS,
        IPC_CHANNELS.SHELL.OPEN_EXTERNAL,
        IPC_CHANNELS.UPDATE.CHECK,
        IPC_CHANNELS.UPDATE.DOWNLOAD,
        IPC_CHANNELS.UPDATE.INSTALL,
        IPC_CHANNELS.UPDATE.GET_STATUS,
        IPC_CHANNELS.PERFORMANCE.GET_METRICS,
        IPC_CHANNELS.WINDOW.SET_FULLSCREEN,
        IPC_CHANNELS.WINDOW.IS_FULLSCREEN,
        IPC_CHANNELS.TRANSCODE.START,
        IPC_CHANNELS.TRANSCODE.CANCEL,
        IPC_CHANNELS.TRANSCODE.GET_STATUS,
        IPC_CHANNELS.GPU.GET_POLICY,
        IPC_CHANNELS.LOGIN_ITEM.GET,
        IPC_CHANNELS.LOGIN_ITEM.SET
      ]);
    });

    it('rejects duplicate registrations', () => {
      ipcHandlerRegistry.registerHandlers();

      expect(() => {
        ipcHandlerRegistry.registerHandlers();
      }).toThrow('Duplicate IPC channel registration');
    });

    it('removes only registered handlers on dispose', () => {
      ipcHandlerRegistry.registerHandlers();
      const registeredChannels = ipcMain.handle.mock.calls.map(call => call[0]);

      ipcHandlerRegistry.dispose();

      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(registeredChannels.length);
      expect(ipcMain.removeHandler.mock.calls.map(call => call[0])).toEqual(registeredChannels);
    });

    it('is idempotent when dispose is called repeatedly', () => {
      ipcHandlerRegistry.registerHandlers();
      ipcHandlerRegistry.dispose();
      ipcHandlerRegistry.dispose();

      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(15);
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
