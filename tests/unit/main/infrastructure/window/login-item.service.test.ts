import * as serviceMocks from '../../../../factories/index.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app as mockApp } from 'electron';
import { installTargetProperty } from '../../../../support/mocks/runtime-property.installers.js';
import { createServiceHarness } from '../../../../support/service.harness.js';

type ProcessRuntimeMockOptions = {
  platform?: NodeJS.Platform;
  argv?: string[];
};

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({
      openAtLogin: false,
      openAsHidden: false,
      wasOpenedAtLogin: false,
      wasOpenedAsHidden: false,
      restoreState: false,
      status: 'not-registered',
      executableWillLaunchAtLogin: false,
      launchItems: []
    }))
  }
}));

import { LoginItemService } from '@main/infrastructure/window/login-item.service.js';

type LoginItemSettings = ReturnType<typeof mockApp.getLoginItemSettings>;

function createLoginItemSettings(overrides: Partial<LoginItemSettings> = {}): LoginItemSettings {
  return {
    openAtLogin: false,
    openAsHidden: false,
    wasOpenedAtLogin: false,
    wasOpenedAsHidden: false,
    restoreState: false,
    status: 'not-registered',
    executableWillLaunchAtLogin: false,
    launchItems: [],
    ...overrides,
  };
}

describe('LoginItemService', () => {
  let service: LoginItemService;
  let processRuntimeMocks: ReturnType<typeof installTargetProperty>[];

  beforeEach(() => {
    processRuntimeMocks = [];

    const h = createServiceHarness(LoginItemService, {
      loggerFactory: serviceMocks.createLoggerFactory()
    });
    service = h.subject;
  });

  afterEach(() => {
    while (processRuntimeMocks.length > 0) {
      processRuntimeMocks.pop()?.cleanup();
    }
  });

  function useProcessRuntimeMock(options: ProcessRuntimeMockOptions): void {
    for (const [key, value] of Object.entries(options)) {
      processRuntimeMocks.push(installTargetProperty(process, key, value));
    }
  }

  describe('isEnabled', () => {
    it('should return false when login item is not set', () => {
      vi.mocked(mockApp.getLoginItemSettings).mockReturnValue(createLoginItemSettings({ openAtLogin: false }));
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when login item is set', () => {
      vi.mocked(mockApp.getLoginItemSettings).mockReturnValue(createLoginItemSettings({ openAtLogin: true }));
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('setEnabled', () => {
    it('should enable login item on macOS with openAsHidden', () => {
      useProcessRuntimeMock({ platform: 'darwin' });
      service.setEnabled(true);

      expect(vi.mocked(mockApp.setLoginItemSettings)).toHaveBeenCalledWith({
        openAtLogin: true,
        openAsHidden: true
      });
    });

    it('should enable login item on Windows with --hidden arg', () => {
      useProcessRuntimeMock({ platform: 'win32' });
      service.setEnabled(true);

      expect(vi.mocked(mockApp.setLoginItemSettings)).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden']
      });
    });

    it('should enable login item on Linux with --hidden arg', () => {
      useProcessRuntimeMock({ platform: 'linux' });
      service.setEnabled(true);

      expect(vi.mocked(mockApp.setLoginItemSettings)).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden']
      });
    });

    it('should disable login item', () => {
      service.setEnabled(false);

      expect(vi.mocked(mockApp.setLoginItemSettings)).toHaveBeenCalledWith(
        expect.objectContaining({ openAtLogin: false })
      );
    });
  });

  describe('wasLaunchedAsHidden', () => {
    it('should return true on macOS when wasOpenedAsHidden is true', () => {
      useProcessRuntimeMock({ platform: 'darwin' });
      vi.mocked(mockApp.getLoginItemSettings).mockReturnValue(createLoginItemSettings({
        openAtLogin: true,
        wasOpenedAsHidden: true
      }));

      expect(service.wasLaunchedAsHidden()).toBe(true);
    });

    it('should return false on macOS when wasOpenedAsHidden is false', () => {
      useProcessRuntimeMock({ platform: 'darwin' });
      vi.mocked(mockApp.getLoginItemSettings).mockReturnValue(createLoginItemSettings({
        openAtLogin: true,
        wasOpenedAsHidden: false
      }));

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
