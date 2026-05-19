import { vi } from 'vitest';

function createCleanupStack() {
  const cleanups = [];

  return {
    add(cleanup) {
      cleanups.push(cleanup);
    },
    cleanup() {
      while (cleanups.length > 0) {
        cleanups.pop()?.();
      }
    }
  };
}

function installResizeObserverMock() {
  const stack = createCleanupStack();

  class ResizeObserverMock {
    constructor(callback = () => {}) {
      this.callback = callback;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    }
  }

  const previous = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  stack.add(() => {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, 'ResizeObserver');
      return;
    }
    vi.stubGlobal('ResizeObserver', previous);
  });

  return stack;
}

function installAnimationFrameMock() {
  const stack = createCleanupStack();
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;

  vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => setTimeout(() => callback(Date.now()), 0)));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((handle) => clearTimeout(handle)));

  stack.add(() => {
    if (previousRequest === undefined) {
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    } else {
      vi.stubGlobal('requestAnimationFrame', previousRequest);
    }

    if (previousCancel === undefined) {
      Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
    } else {
      vi.stubGlobal('cancelAnimationFrame', previousCancel);
    }
  });

  return stack;
}

function installMediaMocks({ devices = [], stream = {} } = {}) {
  const stack = createCleanupStack();
  const previousMediaDevices = globalThis.navigator?.mediaDevices;

  const mediaDevices = {
    enumerateDevices: vi.fn(async () => devices),
    getUserMedia: vi.fn(async () => stream),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: mediaDevices
  });

  stack.add(() => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: previousMediaDevices
    });
  });

  return {
    ...stack,
    mediaDevices
  };
}

export {
  installAnimationFrameMock,
  installMediaMocks,
  installResizeObserverMock
};

