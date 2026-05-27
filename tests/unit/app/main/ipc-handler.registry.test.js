/**
 * IpcHandlerRegistry Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createDeviceServiceMock,
  createLoggerFactory,
  createTranscodeServiceMock,
  createUpdateServiceMock,
  createWindowServiceMock,
  createLoginItemServiceMock
} from '../../../factories/index.js';

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
import { IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
import { ipcMain } from 'electron';

const expectedRegisteredChannels = () => IpcContractManifest.namespaces.flatMap(({ invoke = [] }) => invoke.map(({ channel }) => channel));

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

    mockLoggerFactory = createLoggerFactory();

    mockDeviceService = createDeviceServiceMock();
    mockUpdateService = createUpdateServiceMock();
    mockWindowService = createWindowServiceMock();
    mockTranscodeService = createTranscodeServiceMock();

    ipcHandlerRegistry = new IpcHandlerRegistry({
      deviceService: mockDeviceService,
      updateService: mockUpdateService,
      windowService: mockWindowService,
      transcodeService: mockTranscodeService,
      loginItemService: createLoginItemServiceMock(),
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('IpcHandlerRegistry');
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

      expect(ipcMain.handle.mock.calls.map(call => call[0])).toEqual(expectedRegisteredChannels());
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

      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(expectedRegisteredChannels().length);
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
