/**
 * Main-process logger interfaces.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface LoggerFactory {
  create(name: string): Logger;
}

// Backward-compatible aliases while legacy imports are migrated.
export type ILogger = Logger;
export type ILoggerFactory = LoggerFactory;
