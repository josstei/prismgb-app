import type { LogLevel } from './logger.js';

export interface LogWriter {
  write(level: LogLevel, name: string, args: unknown[]): void;
}
