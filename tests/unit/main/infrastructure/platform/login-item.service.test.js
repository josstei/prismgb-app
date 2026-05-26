import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app as mockApp } from 'electron';
import { createLoggerFactory } from '../../../../factories/index.js';
import { installProcessRuntimeMock } from '../../../../support/mocks/node-runtime.installers.js';

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false, wasOpenedAsHidden: false }))
  }
}));

import { LoginItemService } from '@main/infrastructure/platform/login-item.service.js';

describe('process runtime mock installers', () => {
  it('should restore process platform and argv descriptors after cleanup', () => {
    const originalPlatform = process.platform;
    const originalArgv = process.argv;
    const processRuntimeMock = installProcessRuntimeMock({
      platform: 'win32',
      argv: ['electron', '.', '--hidden'],
    });

    expect(process.platform).toBe('win32');
    expect(process.argv).toEqual(['electron', '.', '--hidden']);

    processRuntimeMock.cleanup();

    expect(process.platform).toBe(originalPlatform);
    expect(process.argv).toBe(originalArgv);
  });
});

describe('LoginItemService', () => {
  let service;
  let mockLoggerFactory;
  let processRuntimeMocks;

  beforeEach(() => {
    vi.clearAllMocks();
    processRuntimeMocks = [];

    mockLoggerFactory = createLoggerFactory();

    service = new LoginItemService({ loggerFactory: mockLoggerFactory });
  });

  afterEach(() => {
    while (processRuntimeMocks.length > 0) {
      processRuntimeMocks.pop().cleanup();
    }
  });

  function useProcessRuntimeMock(options) {
    const handle = installProcessRuntimeMock(options);
    processRuntimeMocks.push(handle);
    return handle;
  }

  describe('isEnabled', () => {
    it('should return false when login item is not set', () => {
      mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when login item is set', () => {
      mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true });
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('setEnabled', () => {
    it('should enable login item on macOS with openAsHidden', () => {
      useProcessRuntimeMock({ platform: 'darwin' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        openAsHidden: true
      });
    });

    it('should enable login item on Windows with --hidden arg', () => {
      useProcessRuntimeMock({ platform: 'win32' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden']
      });
    });

    it('should enable login item on Linux with --hidden arg', () => {
      useProcessRuntimeMock({ platform: 'linux' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden']
      });
    });

    it('should disable login item', () => {
      service.setEnabled(false);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith(
        expect.objectContaining({ openAtLogin: false })
      );
    });
  });

  describe('wasLaunchedAsHidden', () => {
    it('should return true on macOS when wasOpenedAsHidden is true', () => {
      useProcessRuntimeMock({ platform: 'darwin' });
      mockApp.getLoginItemSettings.mockReturnValue({
        openAtLogin: true,
        wasOpenedAsHidden: true
      });

      expect(service.wasLaunchedAsHidden()).toBe(true);
    });

    it('should return false on macOS when wasOpenedAsHidden is false', () => {
      useProcessRuntimeMock({ platform: 'darwin' });
      mockApp.getLoginItemSettings.mockReturnValue({
        openAtLogin: true,
        wasOpenedAsHidden: false
      });

      expect(service.wasLaunchedAsHidden()).toBe(false);
    });

    it('should return true on Windows when --hidden arg is present', () => {
      useProcessRuntimeMock({
        platform: 'win32',
        argv: ['electron', '.', '--hidden'],
      });

      expect(service.wasLaunchedAsHidden()).toBe(true);
    });

    it('should return false on Windows when --hidden arg is absent', () => {
      useProcessRuntimeMock({
        platform: 'win32',
        argv: ['electron', '.'],
      });

      expect(service.wasLaunchedAsHidden()).toBe(false);
    });
  });
});
