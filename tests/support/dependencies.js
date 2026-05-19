import { vi } from 'vitest';

function createLogger(overrides = {}) {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    ...overrides
  };
}

function createLoggerFactory(logger = createLogger()) {
  return {
    create: vi.fn(() => logger)
  };
}

function createEventBus() {
  const handlers = new Map();

  return {
    publish: vi.fn((event, payload) => {
      for (const handler of handlers.get(event) || []) {
        handler(payload);
      }
    }),
    subscribe: vi.fn((event, handler) => {
      const eventHandlers = handlers.get(event) || new Set();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);

      return () => {
        eventHandlers.delete(handler);
      };
    }),
    unsubscribe: vi.fn((event, handler) => {
      handlers.get(event)?.delete(handler);
    }),
    getHandlerCount(event) {
      return handlers.get(event)?.size || 0;
    }
  };
}

function createStorageService(initialValues = {}) {
  const store = new Map(Object.entries(initialValues));

  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    dump() {
      return Object.fromEntries(store.entries());
    }
  };
}

function createAppState(overrides = {}) {
  return {
    getState: vi.fn(() => ({})),
    setState: vi.fn(),
    updateState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    ...overrides
  };
}

export {
  createAppState,
  createEventBus,
  createLogger,
  createLoggerFactory,
  createStorageService
};

