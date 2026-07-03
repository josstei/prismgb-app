/**
 * Window Factory
 *
 * Creates mock Electron BrowserWindow, Tray, and window-service instances for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';

/**
 * @typedef {import('@main/infrastructure/window.service').WindowService} WindowService
 */

/**
 * Creates a mock WindowService.
 *
 * @param {Partial<import('vitest').Mocked<WindowService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<WindowService>} A strongly-typed mock WindowService.
 */
export function createWindowServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    setFullScreen: vi.fn(),
    isFullScreen: vi.fn(),
    ...overrides
  });
}

export function createBrowserWindowMock(overrides = {}) {
  const {
    webContents: webContentsOverrides = {},
    ...windowOverrides
  } = overrides;

  const defaultWebContents = {
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isDevToolsOpened: vi.fn().mockReturnValue(false),
    closeDevTools: vi.fn(),
    session: {
      on: vi.fn(),
      off: vi.fn()
    }
  };

  return {
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    destroy: vi.fn(),
    isMinimized: vi.fn().mockReturnValue(false),
    isDestroyed: vi.fn().mockReturnValue(false),
    setSkipTaskbar: vi.fn(),
    removeAllListeners: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    webContents: {
      ...defaultWebContents,
      ...webContentsOverrides,
      session: {
        ...defaultWebContents.session,
        ...(webContentsOverrides.session ?? {})
      }
    },
    ...windowOverrides
  };
}

export function createWindowServiceElectronMock(overrides = {}) {
  const {
    app: appOverrides = {},
    browserWindow: browserWindowOverrides = {}
  } = overrides;

  const BrowserWindow = class MockBrowserWindow {
    constructor() {
      Object.assign(this, createBrowserWindowMock(browserWindowOverrides));
    }
  };

  return {
    BrowserWindow,
    app: {
      isPackaged: false,
      getAppPath: vi.fn(() => '/app/path'),
      getPath: vi.fn(() => '/downloads'),
      isQuitting: false,
      focus: vi.fn(),
      ...appOverrides
    }
  };
}

