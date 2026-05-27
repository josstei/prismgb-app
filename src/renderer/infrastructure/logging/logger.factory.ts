import type { LoggerFactoryLike, LoggerLike } from '@shared/interfaces/infrastructure.types.js';

/**
 * Renderer Logger
 * Lightweight console-backed logger for renderer process and tests.
 */
class RendererLogger implements LoggerFactoryLike {
  create(name = 'Log'): LoggerLike {
    const prefix = `[${name}]`;

    return {
      debug: (...args: unknown[]) => console.debug(prefix, ...args),
      info: (...args: unknown[]) => console.log(prefix, ...args),
      warn: (...args: unknown[]) => console.warn(prefix, ...args),
      error: (message: unknown, error?: unknown) => {
        if (error instanceof Error) {
          console.error(prefix, message, error.message);
          console.error(error.stack);
        } else if (error !== undefined) {
          console.error(prefix, message, error);
        } else {
          console.error(prefix, message);
        }
      }
    };
  }
}

export { RendererLogger };
