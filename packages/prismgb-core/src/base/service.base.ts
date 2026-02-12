import { validateDependencies } from './validate-deps';

export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export type ServiceDependencies = Record<string, any>;

export class BaseService<TDependencies extends ServiceDependencies = ServiceDependencies> {
  protected logger!: LoggerLike;
  protected readonly _serviceName: string;

  constructor(
    dependencies: TDependencies,
    requiredDeps: ReadonlyArray<Extract<keyof TDependencies, string>> = [],
    serviceName: string | null = null
  ) {
    const name = serviceName || this.constructor.name;
    validateDependencies(dependencies as Record<string, unknown>, requiredDeps as unknown as string[], name);

    for (const dep of requiredDeps) {
      (this as any)[dep] = dependencies[dep];
    }

    if (dependencies.loggerFactory) {
      this.logger = (dependencies.loggerFactory as any).create(name);
    }

    this._serviceName = name;
  }
}

/* eslint-disable no-redeclare */
// @ts-expect-error TS2430: Intentional declaration merging — exposes injected dependencies as typed properties on subclass instances
export interface BaseService<TDependencies extends ServiceDependencies = ServiceDependencies>
  extends TDependencies {}
/* eslint-enable no-redeclare */
