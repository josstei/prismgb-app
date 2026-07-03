import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app as mockApp } from 'electron';
import { createLoggerFactory } from '../../../../factories/index.js';
import { installProcessEnvMock, installProcessRuntimeMock } from '../../../../support/mocks/runtime-property.installers.js';

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false, wasOpenedAsHidden: false }))
  }
}));

import { LoginItemService } from '@main/infrastructure/window/login-item.service.js';

describe('process runtime mock installers', () => {
  it('should normalize and restore process runtime descriptors after cleanup', () => {
    const [originalPlatform, originalArgv, originalEnv] = [process.platform, process.argv, process.env];
    const processRuntimeMock = installProcessRuntimeMock({
      platform: 'win32',
      argv: ['electron', '.', '--hidden'],
      env: { NODE_ENV: 'development' },
    });

    expect(process.platform).toBe('win32');
    expect(process.argv).toEqual(['electron', '.', '--hidden']);
    expect(process.env.NODE_ENV).toBe('development');

    const runtimeEnv = processRuntimeMock.setEnv({
      NODE_ENV: 'production',
      PRISMGB_TEST_LOG_LEVEL: 'warn',
    });
    expect(processRuntimeMock.env).toBe(runtimeEnv);
    expect(process.env.PRISMGB_TEST_LOG_LEVEL).toBe('warn');

    const envMock = installProcessEnvMock({ PRISMGB_TEST_NUMBER_ENV: 7 });
    const replacementEnv = envMock.setValue({ PRISMGB_TEST_BOOLEAN_ENV: false, PRISMGB_TEST_NUMBER_ENV: undefined });
    expect(envMock.env).toBe(replacementEnv);
    expect(process.env.PRISMGB_TEST_BOOLEAN_ENV).toBe('false');
    expect(process.env).not.toHaveProperty('PRISMGB_TEST_NUMBER_ENV');

    envMock.cleanup();
    processRuntimeMock.cleanup();

    expect(process.platform).toBe(originalPlatform);
    expect(process.argv).toBe(originalArgv);
    expect(process.env).toBe(originalEnv);
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

    service = new LoginItemService(mockLoggerFactory);
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
