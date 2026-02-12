export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export type ServiceDependencies = Record<string, any>;

export class BaseService<TDependencies extends ServiceDependencies = ServiceDependencies> {
  protected logger: LoggerLike;
  protected readonly _serviceName: string;
  constructor(
    dependencies: TDependencies,
    requiredDeps?: ReadonlyArray<Extract<keyof TDependencies, string>>,
    serviceName?: string | null
  );
}

/* eslint-disable no-redeclare */
export interface BaseService<TDependencies extends ServiceDependencies = ServiceDependencies>
  extends TDependencies {}
/* eslint-enable no-redeclare */
