export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export class Logger {
  #name: string;
  #writer: (level: LogLevel, name: string, args: unknown[]) => void;
  #minLevel: LogLevel;

  constructor(
    name: string,
    writer: (level: LogLevel, name: string, args: unknown[]) => void,
    minLevel: LogLevel = 'info'
  ) {
    this.#name = name;
    this.#writer = writer;
    this.#minLevel = minLevel;
  }

  #log(level: LogLevel, args: unknown[]): void {
    if (LEVEL_SEVERITY[level] >= LEVEL_SEVERITY[this.#minLevel]) {
      this.#writer(level, this.#name, args);
    }
  }

  debug(...args: unknown[]): void { this.#log('debug', args); }
  info(...args: unknown[]): void { this.#log('info', args); }
  warn(...args: unknown[]): void { this.#log('warn', args); }
  error(...args: unknown[]): void { this.#log('error', args); }
}
