/**
 * DI-metadata-driven construction harness for @injectable classes.
 *
 * Derives a class's ordered constructor dependencies from its @inject token
 * metadata (the same registry the W1/W2 binding modules consume), builds each
 * from the token-mock registry or a suite override, and constructs the subject
 * positionally. Trailing non-token defaulted parameters are naturally omitted
 * because they carry no injection metadata.
 */

import { getClassMetadata } from './class-metadata.js';
import { TOKEN_MOCK_FACTORIES } from './token-mock.registry.js';

export interface InjectableHarnessOptions {
  overrides?: Record<string, unknown>;
}

export interface LoggerMockLike {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface InjectableHarness<TSubject> {
  readonly subject: TSubject;
  readonly deps: Record<string, any>;
  readonly logger: LoggerMockLike;
  recreate(overrides?: Record<string, unknown>): TSubject;
}

type InjectableConstructor<TSubject> = new (...args: any[]) => TSubject;

function tokenNameOf(value: unknown, constructorName: string, index: number): string {
  if (typeof value === 'symbol') {
    const registered = Symbol.keyFor(value);
    if (registered !== undefined) {
      return registered;
    }
    return value.description ?? String(value);
  }
  throw new Error(
    `Unsupported constructor argument metadata at position ${index} of ${constructorName}: expected a token symbol`
  );
}

export function createInjectableHarness<TSubject>(
  constructor: InjectableConstructor<TSubject>,
  options: InjectableHarnessOptions = {}
): InjectableHarness<TSubject> {
  const overrides = options.overrides ?? {};
  const metadata = getClassMetadata(constructor);
  const tokenNames = metadata.constructorArguments.map((argument, index) =>
    tokenNameOf((argument as { value?: unknown }).value, constructor.name, index)
  );

  const deps: Record<string, any> = {};
  for (const name of tokenNames) {
    if (name in overrides) {
      deps[name] = overrides[name];
      continue;
    }
    const factory = TOKEN_MOCK_FACTORIES[name];
    if (!factory) {
      throw new Error(
        `No mock factory registered for token "${name}" required by ${constructor.name}; pass it as a harness override`
      );
    }
    deps[name] = factory();
  }

  const build = (): TSubject => new constructor(...tokenNames.map((name) => deps[name]));

  let subject = build();

  return {
    get subject(): TSubject {
      return subject;
    },
    deps,
    get logger(): LoggerMockLike {
      const loggerFactory = deps.loggerFactory as
        | { _getLoggers?: () => Map<string, LoggerMockLike>; create: (name: string) => LoggerMockLike }
        | undefined;
      if (!loggerFactory) {
        throw new Error(`${constructor.name} has no loggerFactory dependency to extract a logger from`);
      }
      const created = loggerFactory._getLoggers?.();
      if (created && created.size > 0) {
        return created.values().next().value as LoggerMockLike;
      }
      return loggerFactory.create(constructor.name);
    },
    recreate(nextOverrides: Record<string, unknown> = {}): TSubject {
      for (const [name, value] of Object.entries(nextOverrides)) {
        deps[name] = value;
      }
      subject = build();
      return subject;
    }
  };
}
