import type { LoggerFactoryLike, LoggerLike } from './service.base.js';

/**
 * Console-backed {@link LoggerFactoryLike} implementation. Domain-agnostic and
 * safe in both Node and browser contexts; the default concrete logger for the
 * base layer.
 */
export class ConsoleLoggerFactory implements LoggerFactoryLike {
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
