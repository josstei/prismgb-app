import { vi } from 'vitest';
import { createCleanupStack, installTargetProperty } from '../runtime-property.installers.js';
import { installProperty } from './install-property.helper.js';

function installWindowProperty(key, value) {
  const target = globalThis.window;

  if (!target) {
    throw new Error(`Cannot install window.${String(key)} mock without a window global`);
  }

  return installTargetProperty(target, key, value);
}

export function installMissingWindowMock() {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

  Reflect.deleteProperty(globalThis, 'window');

  stack.add(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  return stack;
}

export function installWindowPropertyMock(key, value) {
  if (!globalThis.window) {
    throw new Error(`Cannot install window.${String(key)} mock without a window global`);
  }
  return installTargetProperty(globalThis.window, key, value);
}

/**
 * Canonical window.getComputedStyle installer.
 */
export function installGetComputedStyleMock(implementation = () => ({})) {
  const mockGetComputedStyle = vi.fn(implementation);
  const stack = installWindowProperty('getComputedStyle', mockGetComputedStyle);

  return {
    ...stack,
    getComputedStyle: mockGetComputedStyle,
  };
}

/**
 * Canonical window.matchMedia installer.
 */
export function installMatchMediaMock(options = {}) {
  const mediaQuery = options.mediaQuery ?? {
    matches: options.matches ?? false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const mockMatchMedia = vi.fn((query) => {
    if (typeof options.matchMedia === 'function') {
      return options.matchMedia(query, mediaQuery);
    }
    return mediaQuery;
  });
  const stack = installWindowProperty('matchMedia', mockMatchMedia);

  return {
    ...stack,
    matchMedia: mockMatchMedia,
    mediaQuery,
  };
}

export function installDocumentPropertyMock(key, value) {
  if (!globalThis.document) {
    throw new Error(`Cannot install document.${String(key)} mock without a document global`);
  }
  return installTargetProperty(globalThis.document, key, value);
}

/**
 * Canonical document.createElement installer.
 */
export function installDocumentCreateElementMock(options = {}) {
  const documentTarget = globalThis.document;

  if (!documentTarget) {
    throw new Error('Cannot install document.createElement mock without a document global');
  }

  const createElement = options.createElement ?? vi.fn(() => (
    options.element ?? {
      id: '',
      className: '',
      style: {},
    }
  ));
  const shouldInstallBodyMethods = Object.prototype.hasOwnProperty.call(options, 'appendChild') || Object.prototype.hasOwnProperty.call(options, 'removeChild');
  const bodyTarget = shouldInstallBodyMethods ? (options.body ?? documentTarget.body) : null;
  let appendChild;
  let removeChild;

  if (shouldInstallBodyMethods) {
    if (!bodyTarget) {
      throw new Error('Cannot install document.body mock without document.body');
    }

    appendChild = options.appendChild;
    removeChild = options.removeChild;
  }

  const stack = createCleanupStack();
  const createElementStack = installTargetProperty(documentTarget, 'createElement', createElement);
  stack.add(() => createElementStack.cleanup());

  if (shouldInstallBodyMethods) {
    if (appendChild) {
      const appendChildStack = installTargetProperty(bodyTarget, 'appendChild', appendChild);
      stack.add(() => appendChildStack.cleanup());
    }

    if (removeChild) {
      const removeChildStack = installTargetProperty(bodyTarget, 'removeChild', removeChild);
      stack.add(() => removeChildStack.cleanup());
    }
  }

  return {
    ...stack,
    createElement,
    appendChild,
    removeChild,
  };
}

/**
 * Canonical fullscreen document installer.
 */
export function installFullscreenDocumentMock(options = {}) {
  const requestFullscreen = options.requestFullscreen ?? vi.fn().mockResolvedValue(undefined);
  const documentElement = options.documentElement ?? {
    requestFullscreen,
  };
  const body = options.body ?? {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  };
  const exitFullscreen = options.exitFullscreen ?? vi.fn().mockResolvedValue(undefined);
  const addEventListener = options.addEventListener ?? vi.fn();
  const removeEventListener = options.removeEventListener ?? vi.fn();
  const documentMock = options.document ?? {
    fullscreenElement: options.fullscreenElement ?? null,
    documentElement,
    exitFullscreen,
    addEventListener,
    removeEventListener,
    body,
  };
  const stack = installProperty(globalThis, 'document', documentMock);

  return {
    ...stack,
    document: documentMock,
    documentElement,
    body,
    requestFullscreen,
    exitFullscreen,
    addEventListener,
    removeEventListener,
  };
}

/**
 * Canonical installer for tests that need MutationObserver absent.
 */
export function installMissingMutationObserverMock() {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver');

  Reflect.deleteProperty(globalThis, 'MutationObserver');

  stack.add(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'MutationObserver', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'MutationObserver');
    }
  });

  return stack;
}

/**
 * Canonical ResizeObserver installer.
 */
export function installResizeObserverMock() {
  const stack = createCleanupStack();

  class MockResizeObserver {
    constructor(callback) {
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
      this.callback = callback;
    }
  }

  const original = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);

  stack.add(() => {
    if (typeof original === 'undefined') {
      Reflect.deleteProperty(globalThis, 'ResizeObserver');
    } else {
      vi.stubGlobal('ResizeObserver', original);
    }
  });

  return {
    ...stack,
    ResizeObserver: MockResizeObserver,
  };
}

/**
 * Canonical devicePixelRatio installer.
 */
export function installDevicePixelRatioMock(value = 1) {
  const stack = installProperty(globalThis, 'devicePixelRatio', value);

  return {
    ...stack,
    devicePixelRatio: value,
  };
}
