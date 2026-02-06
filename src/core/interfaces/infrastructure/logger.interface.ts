/**
 * Log level enum.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Interface for logger implementations.
 */
export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Interface for logger factory.
 */
export interface ILoggerFactory {
  /**
   * Create a new logger instance with the given name.
   * @param name - Logger name (typically service/class name)
   */
  create(name: string): ILogger;
}
