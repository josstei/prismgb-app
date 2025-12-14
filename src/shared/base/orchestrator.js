/**
 * Base Orchestrator
 *
 * Abstract base class for all orchestrators providing common initialization,
 * dependency validation, logging, lifecycle management, and event subscription patterns.
 *
 * Features:
 * - Dependency validation
 * - Logger setup
 * - Template method lifecycle (initialize/cleanup)
 * - EventBus subscription management with automatic cleanup
 */

import { validateDependencies } from './validate-deps.js';

export class BaseOrchestrator {
  /**
   * Create base orchestrator
   * @param {Object} dependencies - Injected dependencies
   * @param {Array<string>} requiredDeps - Array of required dependency names
   * @param {string} name - Orchestrator name for logging
   */
  constructor(dependencies, requiredDeps, name) {
    // Validate required dependencies
    const orchestratorName = name || this.constructor.name;
    validateDependencies(dependencies, requiredDeps, orchestratorName);

    // Explicitly assign only required dependencies (prevents prototype pollution)
    for (const dep of requiredDeps) {
      this[dep] = dependencies[dep];
    }

    // Create logger if loggerFactory is provided
    if (dependencies.loggerFactory) {
      this.logger = dependencies.loggerFactory.create(orchestratorName);
    }

    // Track initialization state
    this.isInitialized = false;
    this._isCleanedUp = false;
    this._orchestratorName = orchestratorName;

    // EventBus subscription tracking for automatic cleanup
    this._subscriptions = [];
  }

  /**
   * Initialize the orchestrator
   * Template method - calls onInitialize() for subclass-specific logic
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger?.warn(`${this._orchestratorName} already initialized`);
      return;
    }

    this.logger?.info(`Initializing ${this._orchestratorName}`);

    // Call subclass initialization
    await this.onInitialize();

    this.isInitialized = true;
    this._isCleanedUp = false;
    this.logger?.info(`${this._orchestratorName} initialized`);
  }

  /**
   * Subclass override point for initialization logic
   * @abstract
   */
  async onInitialize() {
    // Override in subclasses
  }

  /**
   * Cleanup the orchestrator
   * Template method - calls onCleanup() for subclass-specific logic
   * Idempotent - safe to call multiple times
   */
  async cleanup() {
    if (this._isCleanedUp) {
      this.logger?.debug(`${this._orchestratorName} already cleaned up`);
      return;
    }

    this.logger?.info(`Cleaning up ${this._orchestratorName}`);

    // Cleanup all EventBus subscriptions
    this._cleanupSubscriptions();

    // Call subclass cleanup
    await this.onCleanup();

    this.isInitialized = false;
    this._isCleanedUp = true;
  }

  /**
   * Subscribe to multiple events with automatic cleanup tracking
   * @param {Object} eventMap - Map of event names to handlers { 'event:name': handler }
   * @example
   * this.subscribeWithCleanup({
   *   'stream:started': (data) => this._handleStreamStarted(data),
   *   'stream:stopped': () => this._handleStreamStopped()
   * });
   */
  subscribeWithCleanup(eventMap) {
    if (!this.eventBus) {
      this.logger?.warn('Cannot subscribe - eventBus not available');
      return;
    }

    Object.entries(eventMap).forEach(([event, handler]) => {
      const unsubscribe = this.eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    });
  }

  /**
   * Cleanup all tracked EventBus subscriptions
   * Called automatically during cleanup(), but can be called manually if needed
   * @protected
   */
  _cleanupSubscriptions() {
    this._subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
  }

  /**
   * Subclass override point for cleanup logic
   * @abstract
   */
  async onCleanup() {
    // Override in subclasses
  }
}
