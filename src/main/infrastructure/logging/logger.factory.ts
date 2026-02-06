/**
 * Winston-based MainLogger for Dependency Injection
 * Provides structured logging with context-based child loggers
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import type { ILogger, ILoggerFactory, LogLevel } from '@core/interfaces/infrastructure';

/**
 * Extended logger interface with Winston-specific features.
 * Used by MainLogger to provide access to underlying Winston logger.
 */
export interface IMainLogger extends ILogger {
  /**
   * Get the underlying Winston logger instance.
   * @returns The Winston logger
   */
  getWinstonLogger(): winston.Logger;
}

// Import Electron app for log path resolution
// Falls back gracefully in test environment
let electronApp: Electron.App | null = null;
try {
  const electron = await import('electron');
  electronApp = electron.app;
} catch {
  // Electron unavailable (test environment or non-Electron context)
  // File logging will fall back to process.cwd()/logs
}

/**
 * MainLogger creates context-specific loggers for DI injection
 * Usage in DI container:
 *   mainLogger: asClass(MainLogger).singleton()
 *
 * Usage in services:
 *   constructor({ mainLogger }) {
 *     this.logger = mainLogger.create('ServiceName');
 *   }
 */
export class MainLogger implements ILoggerFactory {
  private rootLogger: winston.Logger;

  constructor() {
    this.rootLogger = this._createRootLogger();
  }

  /**
   * Creates the root Winston logger instance
   */
  private _createRootLogger(): winston.Logger {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isDevelopment ? 'debug' : 'info');

    // Custom format for console output
    const consoleFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, context, stack, ...meta }) => {
        const contextStr = context ? `[${context}]` : '';
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        const stackStr = stack ? `\n${stack}` : '';
        return `${timestamp} ${level} ${contextStr} ${message}${metaStr}${stackStr}`;
      })
    );

    // Format for file output (structured JSON)
    const fileFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const transports: winston.transport[] = [
      // Console transport with colorized output
      new winston.transports.Console({
        format: consoleFormat,
        level: logLevel
      })
    ];

    // Add file transport in production or if LOG_FILE is set
    if (!isDevelopment || process.env.LOG_FILE) {
      // Use Electron's logs path, with env var override for flexibility
      // Falls back to process.cwd() if Electron is not available (test environment)
      let logDir = process.env.LOG_DIR;
      if (!logDir) {
        logDir = electronApp ? electronApp.getPath('logs') : path.join(process.cwd(), 'logs');
      }

      try {
        // Ensure log directory exists before adding file transports
        fs.mkdirSync(logDir, { recursive: true });

        transports.push(
          new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
          }),
          new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
          })
        );
      } catch (error) {
        // Graceful fallback: continue with console-only logging
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to create log directory ${logDir}: ${errorMessage}. File logging disabled.`);
      }
    }

    return winston.createLogger({
      level: logLevel,
      levels: winston.config.npm.levels,
      transports,
      exitOnError: false
    });
  }

  /**
   * Creates a child logger with a specific context
   * @param context - The context name (e.g., 'DeviceServiceMain', 'WebcamService')
   * @returns Logger instance with context-aware methods
   */
  create(context: string): IMainLogger {
    const childLogger = this.rootLogger.child({ context });

    return {
      /**
       * Log debug-level message
       * @param message - Log message
       * @param args - Additional metadata
       */
      debug: (message: string, ...args: unknown[]): void => {
        const meta = args.length > 0 ? args[0] : {};
        childLogger.debug(message, meta);
      },

      /**
       * Log info-level message
       * @param message - Log message
       * @param args - Additional metadata
       */
      info: (message: string, ...args: unknown[]): void => {
        const meta = args.length > 0 ? args[0] : {};
        childLogger.info(message, meta);
      },

      /**
       * Log warning-level message
       * @param message - Log message
       * @param args - Additional metadata
       */
      warn: (message: string, ...args: unknown[]): void => {
        const meta = args.length > 0 ? args[0] : {};
        childLogger.warn(message, meta);
      },

      /**
       * Log error-level message
       * @param message - Log message
       * @param args - Error object or metadata
       */
      error: (message: string, ...args: unknown[]): void => {
        const firstArg = args.length > 0 ? args[0] : {};
        const meta = firstArg instanceof Error
          ? { error: firstArg.message, stack: firstArg.stack }
          : firstArg;
        childLogger.error(message, meta);
      },

      /**
       * Get the underlying Winston logger instance
       * @returns The Winston logger
       */
      getWinstonLogger: (): winston.Logger => childLogger
    };
  }

  /**
   * Get the root logger instance (for advanced use cases)
   * @returns The root Winston logger
   */
  getRootLogger(): winston.Logger {
    return this.rootLogger;
  }

  /**
   * Set the log level dynamically
   * @param level - The log level (error, warn, info, debug)
   */
  setLevel(level: LogLevel): void {
    this.rootLogger.level = level;
  }
}
