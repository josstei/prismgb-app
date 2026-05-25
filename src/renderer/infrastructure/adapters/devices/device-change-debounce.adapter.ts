/**
 * Device Change Debounce Adapter
 *
 * Wraps browser devicechange events with configurable debouncing
 * to prevent race conditions from rapid USB connect/disconnect sequences.
 *
 * Follows the adapter pattern established by VisibilityAdapter, UserActivityAdapter.
 */

import { TIMING } from '@shared/config/timing.config';

/**
 * Default debounce delay in milliseconds
 * Browser devicechange events can burst during USB operations
 * 150ms balances responsiveness with race prevention
 */
const DEFAULT_DEBOUNCE_MS = TIMING?.DEVICE_CHANGE_DEBOUNCE_MS ?? 150;

type DeviceChangeEventSource = {
  addEventListener(event: 'devicechange', handler: () => void): void;
  removeEventListener(event: 'devicechange', handler: () => void): void;
};

type DeviceChangeLogger = {
  debug?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

type DeviceChangeDebounceOptions = {
  browserMediaService: DeviceChangeEventSource;
  logger?: DeviceChangeLogger;
  debounceMs?: number;
};

export class DeviceChangeDebounceAdapter {
  _browserMediaService: DeviceChangeEventSource;
  _logger: DeviceChangeLogger | undefined;
  _debounceMs: number;
  _debounceTimer: ReturnType<typeof setTimeout> | null;
  _rawHandler: (() => void) | null;
  _callback: (() => void) | null;
  _suppressedCount: number;

  constructor({ browserMediaService, logger, debounceMs = DEFAULT_DEBOUNCE_MS }: DeviceChangeDebounceOptions) {
    if (!browserMediaService) {
      throw new Error('DeviceChangeDebounceAdapter: browserMediaService is required');
    }

    this._browserMediaService = browserMediaService;
    this._logger = logger;
    this._debounceMs = debounceMs;

    this._debounceTimer = null;

    this._rawHandler = null;

    this._callback = null;

    this._suppressedCount = 0;
  }

  subscribe(callback: () => void) {
    if (typeof callback !== 'function') {
      this._logger?.warn?.('DeviceChangeDebounceAdapter: Invalid callback');
      return () => {};
    }

    // Prevent multiple subscriptions
    if (this._rawHandler) {
      this._logger?.warn?.('DeviceChangeDebounceAdapter: Already subscribed');
      return () => this.unsubscribe();
    }

    this._callback = callback;
    this._suppressedCount = 0;

    // Create raw handler that implements debouncing
    this._rawHandler = () => {
      // Clear existing timer if event arrives during debounce window
      if (this._debounceTimer !== null) {
        clearTimeout(this._debounceTimer);
        this._suppressedCount++;
        this._logger?.debug?.(`Device change suppressed (${this._suppressedCount} total)`);
      }

      // Schedule debounced callback
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = null;

        if (this._suppressedCount > 0) {
          this._logger?.debug?.(`Processing device change (suppressed ${this._suppressedCount} intermediate events)`);
          this._suppressedCount = 0;
        }

        this._callback?.();
      }, this._debounceMs);
    };

    this._browserMediaService.addEventListener('devicechange', this._rawHandler);
    this._logger?.debug?.(`Device change listener registered (debounce: ${this._debounceMs}ms)`);

    return () => this.unsubscribe();
  }

  /**
   * Unsubscribe from device change events
   */
  unsubscribe() {
    // Clear pending debounce timer
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    // Remove raw event listener
    if (this._rawHandler) {
      this._browserMediaService.removeEventListener('devicechange', this._rawHandler);
      this._rawHandler = null;
    }

    this._callback = null;
    this._logger?.debug?.('Device change listener removed');
  }

  getSuppressedCount() {
    return this._suppressedCount;
  }

  isSubscribed() {
    return this._rawHandler !== null;
  }
}
