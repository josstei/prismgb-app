/**
 * Application State Manager
 * Centralized state management with EventBus integration
 *
 * Single source of truth for cross-domain state queries
 * Orchestrators should use AppState instead of calling each other directly
 */

import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

class AppState {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {StreamingService} dependencies.streamingService - Streaming service for state derivation
   * @param {DeviceService} dependencies.deviceService - Device service for connection state
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   */
  constructor(dependencies = {}) {
    const { streamingService, deviceService, eventBus } = dependencies;

    // Service references for derived state
    this.streamingService = streamingService;
    this.deviceService = deviceService;
    this.eventBus = eventBus;

    // UI state
    this.cinematicModeEnabled = true; // Default enabled

    // Internal state cache (updated via events)
    this._streamCache = null;
    this._capabilitiesCache = null;

    // EventBus subscription tracking for cleanup
    this._subscriptions = [];

    // Setup event subscriptions if eventBus provided
    if (this.eventBus) {
      this._setupEventSubscriptions();
    }
  }

  /**
   * Setup event subscriptions for state updates
   * @private
   */
  _setupEventSubscriptions() {
    const streamStartedUnsub = this.eventBus.subscribe(EventChannels.STREAM.STARTED, (data) => {
      this._streamCache = data.stream;
      this._capabilitiesCache = data.capabilities;
    });
    this._subscriptions.push(streamStartedUnsub);

    const streamStoppedUnsub = this.eventBus.subscribe(EventChannels.STREAM.STOPPED, () => {
      this._streamCache = null;
      this._capabilitiesCache = null;
    });
    this._subscriptions.push(streamStoppedUnsub);
  }

  /**
   * Check if currently streaming (derived from StreamingService)
   * @returns {boolean} True if streaming is active
   */
  get isStreaming() {
    return this.streamingService?.isStreaming ?? false;
  }

  /**
   * Check if device is connected (derived from DeviceService)
   * @returns {boolean} True if device is connected
   */
  get deviceConnected() {
    return this.deviceService?.isConnected ?? false;
  }

  /**
   * Get current media stream (derived from StreamingService)
   * @returns {MediaStream|null} Current stream or null
   */
  get currentStream() {
    if (this._streamCache) {
      return this._streamCache;
    }
    return this.streamingService?.getStream?.() ?? null;
  }

  /**
   * Get current device capabilities
   * @returns {Object|null} Capabilities object or null
   */
  get currentCapabilities() {
    if (this._capabilitiesCache) {
      return this._capabilitiesCache;
    }
    return this.streamingService?.currentCapabilities ?? null;
  }

  /**
   * Set cinematic mode state
   * @param {boolean} enabled - Whether cinematic mode is enabled
   */
  setCinematicMode(enabled) {
    this.cinematicModeEnabled = enabled;
  }

  /**
   * Dispose and cleanup event subscriptions
   */
  dispose() {
    // Unsubscribe from all EventBus subscriptions
    if (this._subscriptions) {
      this._subscriptions.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
      this._subscriptions = [];
    }

    // Clear cached state
    this._streamCache = null;
    this._capabilitiesCache = null;
  }
}

// Export class only - DI container creates instances
export { AppState };
