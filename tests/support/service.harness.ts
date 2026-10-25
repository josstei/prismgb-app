/** Constructs service subjects from explicit dependency objects, without runtime metadata. */
export interface LoggerMockLike {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createServiceHarness<TDependencies extends object, TSubject, TMocks extends TDependencies>(
  constructor: new (dependencies: TDependencies) => TSubject,
  dependencies: TMocks
) {
  const deps = { ...dependencies };
  let subject = new constructor(deps);
  return {
    get subject(): TSubject { return subject; },
    deps,
    get logger(): LoggerMockLike {
      const factory = (deps as { loggerFactory?: {
        _getLoggers?: () => Map<string, LoggerMockLike>;
        create(name: string): LoggerMockLike;
      } }).loggerFactory;
      if (!factory) throw new Error(`${constructor.name} has no loggerFactory dependency`);
      const created = factory._getLoggers?.();
      return created?.size ? created.values().next().value! : factory.create(constructor.name);
    },
    recreate(overrides: Partial<TDependencies> = {}): TSubject {
      Object.assign(deps, overrides);
      subject = new constructor(deps);
      return subject;
    }
  };
}
