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
  subscribe(event: string, handler: (...args: unknown[]) => void | Promise<void>): () => void;
  publish(event: string, data?: unknown): void;
  publishAsync?(event: string, data?: unknown): Promise<void>;
}

export interface StorageServiceLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
}
