/**
 * System Factory
 *
 * Creates mock primitives and ambient-service mocks
 * (callback maps, media queries, canvas contexts).
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';

export function createCallbackMap(methods = []) {
  return Object.fromEntries(methods.map((method) => [method, vi.fn()]));
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
