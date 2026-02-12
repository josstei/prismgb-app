export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LoggerFactoryLike {
  create(name?: string): LoggerLike;
}

export interface EventBusLike {
  subscribe(event: string, handler: (...args: unknown[]) => void): () => void;
  publish(event: string, data?: unknown): void;
}
