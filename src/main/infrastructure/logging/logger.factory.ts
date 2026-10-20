import log from 'electron-log/main';
import path from 'path';
import type { Logger, LoggerFactory } from '@platform/core';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * electron-log-backed logger factory for the main process. Configures the shared console/file
 * transports once from the environment (NODE_ENV, LOG_LEVEL, LOG_FILE, LOG_DIR).
 */
export class MainLoggerFactory implements LoggerFactory {
  constructor() {
    this.configureTransports();
  }

  create(context: string): Logger {
    return log.scope(context);
  }

  private configureTransports(): void {
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
}
