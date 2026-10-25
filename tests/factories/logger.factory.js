import { vi } from 'vitest';

/** Logger calls are captured by Vitest mocks for assertions. */
export function createLogger({ name = 'test' } = {}) {
  return {
    name,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

export function createLoggerFactory() {
  const loggers = new Map();

  return {
    create: vi.fn((name) => {
      if (!loggers.has(name)) loggers.set(name, createLogger({ name }));
      return loggers.get(name);
    }),
    _getLogger(name) {
      return loggers.get(name);
    },
    _getLoggers() {
      return new Map(loggers);
    }
  };
}
