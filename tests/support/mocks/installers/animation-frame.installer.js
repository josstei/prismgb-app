import { vi } from 'vitest';
import { createCleanupStack } from '../runtime-property.installers.js';
import { installProperty } from './install-property.helper.js';

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
    installProperty(globalThis, 'requestAnimationFrame', mockRequestAnimationFrame),
    installProperty(globalThis, 'cancelAnimationFrame', mockCancelAnimationFrame),
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

  const originalRequest = HTMLVideoElement.prototype.requestVideoFrameCallback;
  const originalCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;

  const mockRequestVideoFrameCallback = vi.fn((callback) => {
    const now = performance.now();
    return setTimeout(() => callback(now, { presentationTime: now }), 0);
  });

  const mockCancelVideoFrameCallback = vi.fn((id) => {
    clearTimeout(id);
  });

  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    writable: true,
    value: mockRequestVideoFrameCallback,
  });

  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
    configurable: true,
    writable: true,
    value: mockCancelVideoFrameCallback,
  });

  stack.add(() => {
    if (typeof originalRequest === 'undefined') {
      delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    } else {
      Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
        configurable: true,
        writable: true,
        value: originalRequest,
      });
    }

    if (typeof originalCancel === 'undefined') {
      delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
    } else {
      Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
        configurable: true,
        writable: true,
        value: originalCancel,
      });
    }
  });

  return {
    ...stack,
    requestVideoFrameCallback: mockRequestVideoFrameCallback,
    cancelVideoFrameCallback: mockCancelVideoFrameCallback,
  };
}
