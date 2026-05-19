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
import { DisposableBag } from './disposable-bag.js';

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

    // Lifecycle cleanup bag for subscriptions, listeners, and timers
    this.disposables = new DisposableBag();

    // Store service name for debugging
    this._serviceName = name;
  }

  /**
   * Subscribe to an EventBus event and track cleanup
   * @param {string} event - Event topic
   * @param {Function} handler - Event handler
   */
  listen(event, handler) {
    if (!this.eventBus || typeof this.eventBus.subscribe !== 'function') {
      this.logger?.warn(`Cannot subscribe to "${event}" - eventBus not available`);
      return () => {};
    }

    const unsubscribe = this.eventBus.subscribe(event, handler);
    return this.disposables.add(unsubscribe);
  }

  /**
   * Subscribe to an event target and track cleanup
   */
  subscribe(target, type, handler, options) {
    return this.disposables.addEvent(target, type, handler, options);
  }

  /**
   * Schedule a timeout and track cleanup
   */
  timeout(handler, delay, ...args) {
    const handle = setTimeout(handler, delay, ...args);
    return this.disposables.addTimeout(handle);
  }

  /**
   * Schedule an interval and track cleanup
   */
  interval(handler, delay, ...args) {
    const handle = setInterval(handler, delay, ...args);
    return this.disposables.addInterval(handle);
  }

  /**
   * Schedule an animation frame and track cleanup
   */
  animationFrame(handler) {
    const handle = requestAnimationFrame(handler);
    return this.disposables.addAnimationFrame(handle);
  }

  /**
   * Dispose all tracked lifecycle resources
   */
  async dispose() {
    await this.disposables.clear();
  }
}
