export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export class BaseService {
  [key: string]: any;
  protected logger: LoggerLike;
  protected readonly _serviceName: string;
  constructor(dependencies: object, requiredDeps?: string[], serviceName?: string | null);
}
