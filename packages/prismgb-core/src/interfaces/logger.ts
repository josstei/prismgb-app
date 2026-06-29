export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LoggerFactory {
  create(name?: string): Logger;
}
