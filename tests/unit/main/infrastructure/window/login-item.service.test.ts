import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app as mockApp } from 'electron';
import { installProcessEnvMock, installProcessRuntimeMock } from '../../../../support/mocks/runtime-property.installers.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

type ProcessEnvOverrides = Record<string, string | number | boolean | undefined>;
type ProcessEnvMock = ReturnType<typeof installProcessEnvMock> & {
  cleanup(): void;
  env: NodeJS.ProcessEnv;
  setValue(nextOverrides?: ProcessEnvOverrides): NodeJS.ProcessEnv;
};
type ProcessRuntimeMockOptions = {
  platform?: NodeJS.Platform;
  argv?: string[];
  env?: ProcessEnvOverrides;
};
type ProcessRuntimeMockHandle = ReturnType<typeof installProcessRuntimeMock> & {
  cleanup(): void;
  platform?: NodeJS.Platform;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
};
type ProcessRuntimeEnvMockHandle = ProcessRuntimeMockHandle & {
  env: NodeJS.ProcessEnv;
  setEnv(nextOverrides?: ProcessEnvOverrides): NodeJS.ProcessEnv;
};
type LoginItemHarness = ReturnType<typeof createInjectableHarness<LoginItemService>>;

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

describe('process runtime mock installers', () => {
  it('should normalize and restore process runtime descriptors after cleanup', () => {
    const [originalPlatform, originalArgv, originalEnv] = [process.platform, process.argv, process.env];
    const processRuntimeMock = installProcessRuntimeMock({
      platform: 'win32',
      argv: ['electron', '.', '--hidden'],
      env: { NODE_ENV: 'development' },
    }) as ProcessRuntimeEnvMockHandle;

    expect(process.platform).toBe('win32');
    expect(process.argv).toEqual(['electron', '.', '--hidden']);
    expect(process.env.NODE_ENV).toBe('development');

    const runtimeEnv = processRuntimeMock.setEnv({
      NODE_ENV: 'production',
      PRISMGB_TEST_LOG_LEVEL: 'warn',
    });
    expect(processRuntimeMock.env).toBe(runtimeEnv);
    expect(process.env.PRISMGB_TEST_LOG_LEVEL).toBe('warn');

    const envMock = installProcessEnvMock({ PRISMGB_TEST_NUMBER_ENV: 7 }) as ProcessEnvMock;
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
  let service: LoginItemService;
  let processRuntimeMocks: ProcessRuntimeMockHandle[];

  beforeEach(() => {
    processRuntimeMocks = [];

    const h: LoginItemHarness = createInjectableHarness(LoginItemService);
    service = h.subject;
  });

  afterEach(() => {
    while (processRuntimeMocks.length > 0) {
      processRuntimeMocks.pop()?.cleanup();
    }
  });

  function useProcessRuntimeMock(options: ProcessRuntimeMockOptions): ProcessRuntimeMockHandle {
    const handle = installProcessRuntimeMock(options) as ProcessRuntimeMockHandle;
    processRuntimeMocks.push(handle);
    return handle;
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
