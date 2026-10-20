import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => {
  class MockBrowserWindow {}
  class MockTray {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
  }
  return {
    app: {
      getAppPath: vi.fn(() => '/app'),
      getVersion: vi.fn(() => '1.0.0'),
      getPath: vi.fn(() => '/tmp'),
      getLoginItemSettings: vi.fn(() => ({ wasOpenedAtLogin: false })),
      setLoginItemSettings: vi.fn(),
      isPackaged: false,
      on: vi.fn(),
      quit: vi.fn(),
      isQuitting: false,
      dock: { setIcon: vi.fn() }
    },
    BrowserWindow: MockBrowserWindow,
    Tray: MockTray,
    Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() },
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn(), on: vi.fn(), removeAllListeners: vi.fn() },
    shell: { openExternal: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => true })) }
  };
});

vi.mock('electron-updater', () => {
  const autoUpdater = {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  };
  return {
    autoUpdater,
    default: { autoUpdater }
  };
});

import type { ServiceIdentifier } from 'inversify';
import { createMainContainer } from '@main/application/container';
import { TOKENS } from '@main/application/di/tokens';
import { createLoggerFactory } from '../../../factories/index.js';
import { applyBindingOverrides } from '../../../support/di/binding-overrides';

describe('Main container', () => {
  let loggerFactory: ReturnType<typeof createLoggerFactory>;

  beforeEach(() => {
    loggerFactory = createLoggerFactory();
  });

  it('resolves every token without throwing', () => {
    const container = createMainContainer(loggerFactory);

    for (const token of Object.values(TOKENS)) {
      expect(() => container.get(token as ServiceIdentifier)).not.toThrow();
    }
  });

  it('returns the same singleton instance for every token across repeated resolutions', () => {
    const container = createMainContainer(loggerFactory);

    for (const [key, token] of Object.entries(TOKENS)) {
      expect(container.get(token as ServiceIdentifier), key).toBe(container.get(token as ServiceIdentifier));
    }
  });

  it('replaces an already-bound token with an override', () => {
    const fakeLoggerFactory = { create: vi.fn() };
    const container = applyBindingOverrides(createMainContainer(loggerFactory), TOKENS, { loggerFactory: fakeLoggerFactory });

    expect(container.get(TOKENS.loggerFactory)).toBe(fakeLoggerFactory);
  });

  it('binds an override for a token constructed from the overridden value', () => {
    const fakeTranscodeService = { initialize: vi.fn(), dispose: vi.fn() };
    const container = applyBindingOverrides(createMainContainer(loggerFactory), TOKENS, { transcodeService: fakeTranscodeService });

    expect(container.get(TOKENS.transcodeService)).toBe(fakeTranscodeService);
  });
});
