/**
 * Service factory function type.
 */
export type ServiceFactory<T> = (container: IServiceContainer) => T;

/**
 * Interface for dependency injection container.
 */
export interface IServiceContainer {
  /**
   * Register a singleton service.
   * @param name - Service identifier
   * @param implementation - Class constructor or factory
   * @param dependencies - Array of dependency names to inject
   */
  registerSingleton<T>(
    name: string,
    implementation: new (...args: unknown[]) => T,
    dependencies?: string[]
  ): void;

  /**
   * Register a plain value.
   * @param name - Value identifier
   * @param value - Value to register
   */
  registerValue<T>(name: string, value: T): void;

  /**
   * Register a factory function.
   * @param name - Factory identifier
   * @param factory - Factory function
   */
  registerFactory<T>(name: string, factory: ServiceFactory<T>): void;

  /**
   * Resolve a service by name.
   * @param name - Service identifier
   */
  resolve<T>(name: string): T;

  /**
   * Check if a service is registered.
   * @param name - Service identifier
   */
  has(name: string): boolean;
}
