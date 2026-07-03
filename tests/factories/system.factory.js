/**
 * System Factory
 *
 * Creates mock primitives and ambient-service mocks
 * (login-item, callback maps, media queries, canvas contexts).
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';

export function createCallbackMap(methods = []) {
  return Object.fromEntries(methods.map((method) => [method, vi.fn()]));
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
