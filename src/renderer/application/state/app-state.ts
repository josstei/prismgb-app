/**
 * Application State Manager
 * Centralized state management with EventBus integration
 *
 * Single source of truth for cross-domain state queries
 * Orchestrators should use AppState instead of calling each other directly
 */

import { EventChannels } from '@renderer/application/config/event-channels';

import type { EventBusLike } from '@prismgb/core';

interface StreamingServiceLike {
  readonly isStreaming: boolean;
  readonly currentCapabilities: unknown;
  getStream(): MediaStream | null;
}

interface DeviceServiceLike {
  readonly isConnected: boolean;
}

type AppStateDependencies = {
  streamingService?: StreamingServiceLike;
  deviceMediaService?: DeviceServiceLike;
  eventBus?: EventBusLike;
};

class AppState {
  static readonly dependencies = ['streamingService', 'deviceMediaService', 'eventBus'] as const;

  streamingService: StreamingServiceLike | undefined;
  deviceMediaService: DeviceServiceLike | undefined;
  eventBus: EventBusLike | undefined;
  isCinematicModeEnabled: boolean;
  _streamCache: MediaStream | null;
  _capabilitiesCache: unknown;
  _subscriptions: Array<() => void>;

  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {StreamingService} dependencies.streamingService - Streaming service for state derivation
   * @param {DeviceMediaService} dependencies.deviceMediaService - Device media service for connection state
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   */
  constructor(dependencies: AppStateDependencies = {}) {
    const { streamingService, deviceMediaService, eventBus } = dependencies;

    // Service references for derived state
    this.streamingService = streamingService;
    this.deviceMediaService = deviceMediaService;
    this.eventBus = eventBus;

    // UI state
    this.isCinematicModeEnabled = true; // Default enabled

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
    const streamStartedUnsub = this.eventBus!.subscribe(EventChannels.STREAM.STARTED, (...args: unknown[]) => {
      const data = args[0] as { stream: MediaStream; capabilities: unknown };
      this._streamCache = data.stream;
      this._capabilitiesCache = data.capabilities;
    });
    this._subscriptions.push(streamStartedUnsub);

    const streamStoppedUnsub = this.eventBus!.subscribe(EventChannels.STREAM.STOPPED, () => {
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
    return this.deviceMediaService?.isConnected ?? false;
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
  setCinematicMode(enabled: boolean) {
    this.isCinematicModeEnabled = enabled;
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
