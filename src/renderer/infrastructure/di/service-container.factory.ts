/**
 * ServiceContainer
 * Lightweight dependency injection container for browser/renderer context.
 */

type ServiceInstanceMap = Record<string, unknown>;

type Constructable<T> = new (...args: unknown[]) => T;
type Callable<T> = (...args: unknown[]) => T;
type ServiceFactory<T> = Constructable<T> | Callable<T>;

type RegistryRecord = Record<string, ServiceFactory<unknown> | ValueRegistration<unknown>>;

type RegisteredTypes<T extends RegistryRecord> = {
  [K in keyof T]:
    T[K] extends ValueRegistration<infer TValue>
      ? TValue
      : T[K] extends ServiceFactory<infer TService>
        ? TService
        : never;
};

interface ServiceDefinition {
  type: 'singleton';
  factory: ServiceFactory<unknown>;
  dependencies: string[];
  isClass: boolean;
}

interface DisposableLike {
  dispose?: () => void;
}

interface ResolutionErrorLike {
  message?: string;
}

interface ValueRegistration<T> {
  __asValue: true;
  value: T;
}

class ServiceContainer<TServices extends ServiceInstanceMap = ServiceInstanceMap> {
  private _definitions = new Map<string, ServiceDefinition>();
  private _instances = new Map<string, unknown>();
  private _resolutionStack: string[] = [];

  registerSingleton<TKey extends string, TService>(
    name: TKey,
    ClassOrValue: ServiceFactory<TService>,
    dependencies: string[] = []
  ): ServiceContainer<TServices & Record<TKey, TService>> {
    if (this._definitions.has(name)) {
      console.warn(`[ServiceContainer] Service "${name}" is already registered. Overwriting.`);
    }

    // Preserve existing runtime behavior: every function is treated as constructable.
    const isClass = typeof ClassOrValue === 'function';

    this._definitions.set(name, {
      type: 'singleton',
      factory: ClassOrValue,
      dependencies,
      isClass
    });

    return this as unknown as ServiceContainer<TServices & Record<TKey, TService>>;
  }

  register<TRegistry extends RegistryRecord>(
    services: TRegistry
  ): ServiceContainer<TServices & RegisteredTypes<TRegistry>> {
    for (const [name, value] of Object.entries(services)) {
      if (isValueRegistration(value)) {
        this._instances.set(name, value.value);
        continue;
      }

      this.registerSingleton(name, value);
    }

    return this as unknown as ServiceContainer<TServices & RegisteredTypes<TRegistry>>;
  }

  resolve<TKey extends keyof TServices & string>(name: TKey): TServices[TKey];
  resolve(name: string): unknown;
  resolve(name: string): unknown {
    if (this._instances.has(name)) {
      return this._instances.get(name);
    }

    const definition = this._definitions.get(name);
    if (!definition) {
      throw new Error(`[ServiceContainer] Service "${name}" not found. Did you forget to register it?`);
    }

    if (this._resolutionStack.includes(name)) {
      const cycle = [...this._resolutionStack, name].join(' -> ');
      throw new Error(`[ServiceContainer] Circular dependency detected: ${cycle}`);
    }

    this._resolutionStack.push(name);

    try {
      const resolvedDeps = definition.dependencies.map((dependencyName) => this.resolve(dependencyName));

      let instance: unknown;
      try {
        if (definition.isClass) {
          const constructor = definition.factory as Constructable<unknown>;
          instance = new constructor(...resolvedDeps);
        } else {
          const factory = definition.factory as Callable<unknown>;
          instance = factory(...resolvedDeps);
        }
      } catch (instantiationError: unknown) {
        const dependencyNames = definition.dependencies.join(', ') || 'none';
        const message = (instantiationError as ResolutionErrorLike)?.message || String(instantiationError);
        throw new Error(
          `[ServiceContainer] Failed to instantiate "${name}" (dependencies: ${dependencyNames}): ${message}`
        );
      }

      this._instances.set(name, instance);
      return instance;
    } finally {
      this._resolutionStack.pop();
    }
  }

  has(name: keyof TServices | string): boolean {
    const key = String(name);
    return this._definitions.has(key) || this._instances.has(key);
  }

  dispose(): void {
    for (const [name, instance] of this._instances.entries()) {
      const disposable = instance as DisposableLike;
      if (!disposable || typeof disposable.dispose !== 'function') {
        continue;
      }

      try {
        disposable.dispose();
      } catch (error) {
        console.error(`[ServiceContainer] Error disposing "${name}":`, error);
      }
    }

    this._instances.clear();
    this._definitions.clear();
    this._resolutionStack = [];
  }
}

function isValueRegistration(value: unknown): value is ValueRegistration<unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Boolean((value as { __asValue?: boolean }).__asValue);
}

function asValue<T>(value: T): ValueRegistration<T> {
  return { __asValue: true, value };
}

export { ServiceContainer, asValue };
export type { ValueRegistration };
