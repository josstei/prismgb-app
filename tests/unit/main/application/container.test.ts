// @ts-nocheck
/**
 * Main-process DI container binding tests.
 *
 * Proves the Inversify wiring in `main.module.ts` is complete and correct:
 * every token resolves without throwing, resolution is singleton-scoped, and
 * overrides replace an already-bound token — mirroring the renderer's
 * container test shape (tests/unit/renderer/application/container.test.ts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => {
  class MockBrowserWindow {}
  class MockTray {
    constructor() {
      this.setToolTip = vi.fn();
      this.setContextMenu = vi.fn();
      this.on = vi.fn();
      this.destroy = vi.fn();
    }
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
import { createMainContainer } from '@main/application/container.js';
import { TOKENS, TOKEN_KEYS } from '@main/application/di/tokens.js';
import { createLoggerFactory } from '../../../factories/index.js';

describe('Main container', () => {
  let loggerFactory: ReturnType<typeof createLoggerFactory>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerFactory = createLoggerFactory();
  });

  it('resolves every token without throwing', () => {
    const container = createMainContainer(loggerFactory);

    for (const key of TOKEN_KEYS) {
      expect(() => container.get(TOKENS[key] as ServiceIdentifier)).not.toThrow();
    }
  });

  it('returns the same singleton instance across repeated resolutions', () => {
    const container = createMainContainer(loggerFactory);

    expect(container.get(TOKENS.windowService)).toBe(container.get(TOKENS.windowService));
    expect(container.get(TOKENS.appOrchestrator)).toBe(container.get(TOKENS.appOrchestrator));
  });

  it('replaces an already-bound token with an override', () => {
    const fakeLoggerFactory = { create: vi.fn() };
    const container = createMainContainer(loggerFactory, { loggerFactory: fakeLoggerFactory });

    expect(container.get(TOKENS.loggerFactory)).toBe(fakeLoggerFactory);
  });

  it('binds an override for a token constructed from the overridden value', () => {
    const fakeTranscodeService = { initialize: vi.fn(), dispose: vi.fn() };
    const container = createMainContainer(loggerFactory, { transcodeService: fakeTranscodeService });

    expect(container.get(TOKENS.transcodeService)).toBe(fakeTranscodeService);
  });
});
