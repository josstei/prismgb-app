import log from 'electron-log/main';
import path from 'path';
import type { LoggerLike, LoggerFactoryLike, LogLevel } from '@platform/core';

/**
 * electron-log-backed logger factory for the main process. Configures the
 * shared console/file transports once from the environment (NODE_ENV,
 * LOG_LEVEL, LOG_FILE, LOG_DIR) and hands out scoped loggers per DI context.
 */
export class MainLogger implements LoggerFactoryLike {
  constructor() {
    this._configureTransports();
  }

  private _configureTransports(): void {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isDevelopment ? 'debug' : 'info');

    log.transports.console.level = logLevel;
    log.transports.file.level = !isDevelopment || process.env.LOG_FILE ? logLevel : false;
    log.transports.file.maxSize = 5242880;

    const logDir = process.env.LOG_DIR;
    if (logDir) {
      log.transports.file.resolvePathFn = () => path.join(logDir, 'combined.log');
    }
  }

  create(context: string): LoggerLike {
    const scoped = log.scope(context);

    return {
      debug: (...args: unknown[]): void => { scoped.debug(...args); },
      info: (...args: unknown[]): void => { scoped.info(...args); },
      warn: (...args: unknown[]): void => { scoped.warn(...args); },
      error: (...args: unknown[]): void => { scoped.error(...args); }
    };
  }
}
