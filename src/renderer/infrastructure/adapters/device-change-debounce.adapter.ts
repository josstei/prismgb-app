import { TIMING } from '@prismgb/config';

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

    if (this._rawHandler) {
      this._logger?.warn?.('DeviceChangeDebounceAdapter: Already subscribed');
      return () => this.unsubscribe();
    }

    this._callback = callback;
    this._suppressedCount = 0;

    this._rawHandler = () => {
      if (this._debounceTimer !== null) {
        clearTimeout(this._debounceTimer);
        this._suppressedCount++;
        this._logger?.debug?.(`Device change suppressed (${this._suppressedCount} total)`);
      }

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

  unsubscribe() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    if (this._rawHandler) {
      this._browserMediaService.removeEventListener('devicechange', this._rawHandler);
      this._rawHandler = null;
    }

    this._callback = null;
    this._logger?.debug?.('Device change listener removed');
  }

  dispose(): void {
    this.unsubscribe();
  }

  getSuppressedCount() {
    return this._suppressedCount;
  }

  isSubscribed() {
    return this._rawHandler !== null;
  }
}
