import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app as mockApp } from 'electron';
import { createLoggerFactory } from '../../../../factories/index.js';

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false, wasOpenedAsHidden: false }))
  }
}));

import { LoginItemService } from '@main/infrastructure/platform/login-item.service.js';

describe('LoginItemService', () => {
  let service;
  let mockLoggerFactory;
  let originalPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPlatform = process.platform;

    mockLoggerFactory = createLoggerFactory();

    service = new LoginItemService({ loggerFactory: mockLoggerFactory });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

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
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        openAsHidden: true
      });
    });

    it('should enable login item on Windows with --hidden arg', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden']
      });
    });

    it('should enable login item on Linux with --hidden arg', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
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
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockApp.getLoginItemSettings.mockReturnValue({
        openAtLogin: true,
        wasOpenedAsHidden: true
      });

      expect(service.wasLaunchedAsHidden()).toBe(true);
    });

    it('should return false on macOS when wasOpenedAsHidden is false', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockApp.getLoginItemSettings.mockReturnValue({
        openAtLogin: true,
        wasOpenedAsHidden: false
      });

      expect(service.wasLaunchedAsHidden()).toBe(false);
    });

    it('should return true on Windows when --hidden arg is present', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const originalArgv = process.argv;
      process.argv = ['electron', '.', '--hidden'];

      expect(service.wasLaunchedAsHidden()).toBe(true);

      process.argv = originalArgv;
    });

    it('should return false on Windows when --hidden arg is absent', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const originalArgv = process.argv;
      process.argv = ['electron', '.'];

      expect(service.wasLaunchedAsHidden()).toBe(false);

      process.argv = originalArgv;
    });
  });
});
