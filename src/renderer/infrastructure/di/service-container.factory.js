/**
 * ServiceContainer
 * Lightweight dependency injection container for browser/renderer context
 *
 * Features:
 * - Constructor injection
 * - Singleton lifecycle management
 * - Dependency resolution
 * - Browser-compatible (no Node.js dependencies)
 */

class ServiceContainer {
  constructor() {
    // Registered service definitions: { name: { type, dependencies, factory } }
    this._definitions = new Map();
    // Resolved singleton instances: { name: instance }
    this._instances = new Map();
    // Resolution stack for circular dependency detection
    this._resolutionStack = [];
  }

  /**
   * Register a singleton service
   * @param {string} name - Service name
   * @param {Function|*} ClassOrValue - Class constructor or value
   * @param {string[]} dependencies - Array of dependency names (for classes)
   * @returns {ServiceContainer} This instance for chaining
   */
  registerSingleton(name, ClassOrValue, dependencies = []) {
    if (this._definitions.has(name)) {
      // Use console.warn since ServiceContainer is infrastructure and logger may not be registered yet
      console.warn(`[ServiceContainer] Service "${name}" is already registered. Overwriting.`);
    }

    // Check if it's a class or a value
    const isClass = typeof ClassOrValue === 'function';

    this._definitions.set(name, {
      type: 'singleton',
      factory: ClassOrValue,
      dependencies,
      isClass
    });

    return this;
  }

  /**
   * Register multiple services at once
   * @param {Object} services - Object with { name: value } pairs
   * @returns {ServiceContainer} This instance for chaining
   */
  register(services) {
    for (const [name, value] of Object.entries(services)) {
      // If value has 'asValue' marker, register as value
      if (value && value.__asValue) {
        this._instances.set(name, value.value);
      } else {
        this.registerSingleton(name, value);
      }
    }
    return this;
  }

  /**
   * Resolve a service by name
   * @param {string} name - Service name
   * @returns {*} Service instance
   * @throws {Error} If service not found or circular dependency detected
   */
  resolve(name) {
    // Check if already resolved
    if (this._instances.has(name)) {
      return this._instances.get(name);
    }

    // Get definition
    const definition = this._definitions.get(name);
    if (!definition) {
      throw new Error(`[ServiceContainer] Service "${name}" not found. Did you forget to register it?`);
    }

    // Check for circular dependencies
    if (this._resolutionStack.includes(name)) {
      const cycle = [...this._resolutionStack, name].join(' -> ');
      throw new Error(`[ServiceContainer] Circular dependency detected: ${cycle}`);
    }

    // Add to resolution stack
    this._resolutionStack.push(name);

    try {
      // Resolve dependencies
      const resolvedDeps = definition.dependencies.map(depName => this.resolve(depName));

      // Create instance with error handling
      let instance;
      try {
        if (definition.isClass) {
          instance = new definition.factory(...resolvedDeps);
        } else {
          instance = definition.factory(...resolvedDeps);
        }
      } catch (instantiationError) {
        // Re-throw with more context about which service failed
        const depNames = definition.dependencies.join(', ') || 'none';
        throw new Error(
          `[ServiceContainer] Failed to instantiate "${name}" (dependencies: ${depNames}): ${instantiationError.message}`
        );
      }

      // Cache for singleton
      if (definition.type === 'singleton') {
        this._instances.set(name, instance);
      }

      return instance;
    } finally {
      // Remove from resolution stack
      this._resolutionStack.pop();
    }
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean} True if registered
   */
  has(name) {
    return this._definitions.has(name) || this._instances.has(name);
  }

  /**
   * Dispose all services and clear container
   */
  dispose() {
    // Call dispose method on services that have it
    for (const [name, instance] of this._instances.entries()) {
      if (instance && typeof instance.dispose === 'function') {
        try {
          instance.dispose();
        } catch (error) {
          // Use console.error since ServiceContainer is infrastructure and this is during teardown
          console.error(`[ServiceContainer] Error disposing "${name}":`, error);
        }
      }
    }

    this._instances.clear();
    this._definitions.clear();
    this._resolutionStack = [];
  }
}

/**
 * Helper to mark a value for registration (not a class)
 * @param {*} value - Value to register
 * @returns {Object} Marked value
 */
function asValue(value) {
  return { __asValue: true, value };
}

export { ServiceContainer, asValue };
