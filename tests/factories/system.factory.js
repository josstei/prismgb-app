/**
 * System Factory
 *
 * Creates mock primitives, logger mocks, and ambient-service mocks
 * (shell, login-item, callback maps, generic disposables, DOM event stubs).
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';
import { createMockCanvas } from './stream.factory.js';

export function createDisposableMock(overrides = {}) {
  return {
    dispose: vi.fn(),
    ...overrides
  };
}

export function createContextBridgeMock(overrides = {}) {
  return {
    exposeInMainWorld: vi.fn(),
    ...overrides
  };
}

export function createProcessMetricsApiMock(overrides = {}) {
  return {
    getProcessMetrics: vi.fn(),
    ...overrides
  };
}

export function createOffscreenCanvasElementMock(overrides = {}) {
  const {
    clientWidth = 640,
    clientHeight = 576,
    width = clientWidth,
    height = clientHeight,
    transferControlToOffscreen = vi.fn(),
    ...canvasOverrides
  } = overrides;

  return {
    ...createMockCanvas({
      width,
      height,
      ...canvasOverrides
    }),
    clientWidth,
    clientHeight,
    transferControlToOffscreen
  };
}

export function createCallbackMap(methods = []) {
  return Object.fromEntries(methods.map((method) => [method, vi.fn()]));
}

export function createPreloadEventApiMock(overrides = {}) {
  return Object.fromEntries(
    Object.entries(overrides).map(([method, unsubscribe]) => [
      method,
      vi.fn(() => unsubscribe),
    ])
  );
}

export function createMediaQueryListMock(overrides = {}) {
  return {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides
  };
}

export function createCanvasRenderingContextMock(overrides = {}) {
  const {
    drawImage = vi.fn(),
    fillRect = vi.fn(),
    ...contextOverrides
  } = overrides;

  return {
    drawImage,
    fillRect,
    clearRect: vi.fn(),
    drawImageCount: 0,
    fillRectCount: 0,
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    imageSmoothingEnabled: true,
    fillStyle: '',
    ...contextOverrides
  };
}

export function createBitmapMock(overrides = {}) {
  return {
    width: 160,
    height: 144,
    ...overrides
  };
}

export function createPreventDefaultEventMock(overrides = {}) {
  return {
    preventDefault: vi.fn(),
    ...overrides
  };
}

export function createDomEventMock(overrides = {}) {
  return {
    stopPropagation: vi.fn(),
    ...overrides
  };
}

export function createShellServiceMock(overrides = {}) {
  return {
    openExternal: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

/**
 * @typedef {import('@main/infrastructure/login-item.service').LoginItemService} LoginItemService
 */

/**
 * Creates a mock LoginItemService.
 *
 * @param {Partial<import('vitest').Mocked<LoginItemService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<LoginItemService>} A strongly-typed mock LoginItemService.
 */
export function createLoginItemServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    isEnabled: vi.fn(() => false),
    setEnabled: vi.fn(),
    ...overrides
  });
}
