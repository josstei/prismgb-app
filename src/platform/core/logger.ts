export interface Logger {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LoggerFactory {
  create(name: string): Logger;
}

export class ConsoleLoggerFactory implements LoggerFactory {
  create(name: string): Logger {
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
