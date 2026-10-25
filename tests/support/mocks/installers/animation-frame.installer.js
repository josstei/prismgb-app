import { vi } from 'vitest';
import { createCleanupStack, installTargetProperty } from '../runtime-property.installers.js';

/**
 * Canonical RAF installer.
 */
export function installAnimationFrameMock(options = {}) {
  const stack = createCleanupStack();

  const mockRequestAnimationFrame = options.requestAnimationFrame ?? vi.fn((callback) => {
    return setTimeout(() => {
      callback(performance.now());
    }, 16);
  });

  const mockCancelAnimationFrame = options.cancelAnimationFrame ?? vi.fn((id) => {
    clearTimeout(id);
  });

  [
    installTargetProperty(globalThis, 'requestAnimationFrame', mockRequestAnimationFrame),
    installTargetProperty(globalThis, 'cancelAnimationFrame', mockCancelAnimationFrame),
  ].forEach((propertyStack) => stack.add(() => propertyStack.cleanup()));

  return {
    ...stack,
    requestAnimationFrame: mockRequestAnimationFrame,
    cancelAnimationFrame: mockCancelAnimationFrame,
  };
}

/**
 * Canonical video-frame installer.
 */
export function installVideoFrameCallbacksMock() {
  const stack = createCleanupStack();

  const mockRequestVideoFrameCallback = vi.fn((callback) => {
    const now = performance.now();
    return setTimeout(() => callback(now, { presentationTime: now }), 0);
  });

  const mockCancelVideoFrameCallback = vi.fn((id) => {
    clearTimeout(id);
  });

  for (const [name, mock] of Object.entries({
    requestVideoFrameCallback: mockRequestVideoFrameCallback,
    cancelVideoFrameCallback: mockCancelVideoFrameCallback
  })) {
    const property = installTargetProperty(HTMLVideoElement.prototype, name, mock);
    stack.add(() => property.cleanup());
  }

  return {
    ...stack,
    requestVideoFrameCallback: mockRequestVideoFrameCallback,
    cancelVideoFrameCallback: mockCancelVideoFrameCallback,
  };
}
