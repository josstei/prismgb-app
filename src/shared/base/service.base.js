/**
 * BaseService
 *
 * Base class for all renderer services providing:
 * - Dependency injection and validation
 * - Logger creation and management
 *
 * Usage:
 * ```javascript
 * export class MyService extends BaseService {
 *   constructor(dependencies) {
 *     super(dependencies, ['eventBus', 'loggerFactory'], 'MyService');
 *     // Service-specific state
 *   }
 * }
 * ```
 */

import { validateDependencies } from './validate-deps.utils.js';

export class BaseService {
  /**
   * Create a new service
   * @param {Object} dependencies - Dependency injection object
   * @param {string[]} requiredDeps - Array of required dependency names
   * @param {string} serviceName - Name of the service (for logging)
   */
  constructor(dependencies, requiredDeps = [], serviceName = null) {
    // Validate dependencies
    const name = serviceName || this.constructor.name;
    validateDependencies(dependencies, requiredDeps, name);

    // Explicitly assign only required dependencies (prevents prototype pollution)
    for (const dep of requiredDeps) {
      this[dep] = dependencies[dep];
    }

    // Create logger if loggerFactory provided
    if (dependencies.loggerFactory) {
      this.logger = dependencies.loggerFactory.create(name);
    }

    // Store service name for debugging
    this._serviceName = name;
  }
}
