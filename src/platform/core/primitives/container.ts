import { safeDispose } from './safe-disposer.utils.js';

/**
 * Minimal structural logger the container uses to report disposal failures.
 */
export interface ContainerDisposalLogger {
  error(...args: unknown[]): void;
}

/**
 * Produces the instance for a token. Receives the owning container so a provider
 * can pull already-registered dependencies via {@link Container.resolve} or the
 * lazily-resolving {@link Container.cradle}.
 */
export type Provider<TTokenMap extends Record<string, unknown>, K extends keyof TTokenMap> = (
  container: Container<TTokenMap>
) => TTokenMap[K];

/**
 * Generic, application-agnostic dependency-injection container.
 *
 * Tokens are registered with a {@link Provider} (constructed lazily and cached
 * as a singleton on first {@link resolve}) or a pre-built value. Services receive
 * the {@link cradle} — a proxy that resolves sibling tokens on property access —
 * enabling locator-style injection tolerant of circular wiring.
 *
 * This primitive is the base layer for application DI: applications register
 * their concrete services against it and never hand-roll a container. Pass a
 * token map type argument for fully-typed resolution, or use the default for a
 * dynamic, locator-style container.
 */
export class Container<TTokenMap extends Record<string, any> = any> {
  #providers = new Map<keyof TTokenMap, Provider<TTokenMap, keyof TTokenMap>>();
  #instances = new Map<keyof TTokenMap, unknown>();
  #insertionOrder: (keyof TTokenMap)[] = [];

  /**
   * Register a lazily-constructed singleton provider for a token.
   */
  register<K extends keyof TTokenMap>(token: K, provider: Provider<TTokenMap, K>): this {
    this.#providers.set(token, provider as Provider<TTokenMap, keyof TTokenMap>);
    return this;
  }

  /**
   * Register a pre-built value for a token, bypassing lazy construction.
   */
  registerValue<K extends keyof TTokenMap>(token: K, value: TTokenMap[K]): this {
    this.#providers.set(token, (() => value) as Provider<TTokenMap, keyof TTokenMap>);
    if (!this.#instances.has(token)) {
      this.#insertionOrder.push(token);
    }
    this.#instances.set(token, value);
    return this;
  }

  /**
   * Whether a token has a provider or a resolved instance.
   */
  has(token: keyof TTokenMap): boolean {
    return this.#instances.has(token) || this.#providers.has(token);
  }

  /**
   * Resolve a token, constructing and caching its singleton on first access.
   * Typed by the token map when known, or by an explicit return type for loosely
   * mapped containers.
   * @throws if the token is not registered.
   */
  resolve<K extends keyof TTokenMap>(token: K): TTokenMap[K];
  resolve<T = unknown>(token: string): T;
  resolve(token: keyof TTokenMap): unknown {
    if (this.#instances.has(token)) {
      return this.#instances.get(token);
    }

    const provider = this.#providers.get(token);
    if (!provider) {
      throw new Error(`Dependency token "${String(token)}" is not registered`);
    }

    const instance = provider(this);
    this.#instances.set(token, instance);
    this.#insertionOrder.push(token);
    return instance;
  }

  /**
   * Return an already-resolved instance without triggering construction.
   */
  peek<K extends keyof TTokenMap>(token: K): TTokenMap[K] | undefined;
  peek<T = unknown>(token: string): T | undefined;
  peek(token: keyof TTokenMap): unknown {
    return this.#instances.get(token);
  }

  /**
   * Every registered token.
   */
  get tokens(): (keyof TTokenMap)[] {
    return [...this.#providers.keys()];
  }

  /**
   * A proxy that resolves a sibling token on property access. Enumeration is
   * intentionally empty so spreading or `Object.assign(this, cradle)` never
   * eagerly resolves the whole graph.
   */
  get cradle(): TTokenMap {
    const container = this;
    return new Proxy({} as TTokenMap, {
      get(_target, property) {
        if (typeof property === 'string' && container.has(property as keyof TTokenMap)) {
          return container.resolve(property as keyof TTokenMap);
        }
        return undefined;
      },
      has(_target, property) {
        return typeof property === 'string' && container.has(property as keyof TTokenMap);
      },
      ownKeys() {
        return [];
      }
    });
  }

  /**
   * Dispose every resolved instance once, in resolution order, calling its
   * `dispose` or `cleanup` method. Failures are isolated so teardown proceeds.
   */
  async dispose(logger: ContainerDisposalLogger = console): Promise<void> {
    for (const token of this.#insertionOrder) {
      const instance = this.#instances.get(token);
      if (!instance) continue;
      const candidate = instance as Record<string, unknown>;
      const method =
        typeof candidate.dispose === 'function'
          ? 'dispose'
          : typeof candidate.cleanup === 'function'
            ? 'cleanup'
            : undefined;
      if (method) {
        await safeDispose(logger, String(token), instance as object, method);
      }
    }
    this.#providers.clear();
    this.#instances.clear();
    this.#insertionOrder = [];
  }
}
