import { Service } from '@shared/di/decorators.js';
type MediaDevicesListener = EventListenerOrEventListenerObject;

/**
 * Browser Media Adapter - Abstraction for navigator.mediaDevices API
 *
 * Provides a testable interface for media device operations.
 * Allows mocking in tests without polluting the global navigator object.
 * Tracks added listeners for cleanup.
 */
@Service({
  "token": "browserMediaService",
  "disposal": "dispose"
})
export class BrowserMediaAdapter {
  _listeners: Map<string, Set<MediaDevicesListener>>;

  constructor() {
    this._listeners = new Map();
  }

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && navigator.mediaDevices !== undefined;
  }

  _ensureAvailable(): MediaDevices {
    if (!this.isAvailable()) {
      throw new Error('MediaDevices API not available');
    }

    return navigator.mediaDevices;
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return this._ensureAvailable().enumerateDevices();
  }

  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    return this._ensureAvailable().getUserMedia(constraints);
  }

  addEventListener(event: string, handler: MediaDevicesListener): void {
    const mediaDevices = this._ensureAvailable();
    mediaDevices.addEventListener(event, handler);

    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)?.add(handler);
  }

  removeEventListener(event: string, handler: MediaDevicesListener): void {
    const mediaDevices = this._ensureAvailable();
    mediaDevices.removeEventListener(event, handler);

    const handlers = this._listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  _removeTrackedListeners(): void {
    if (!this.isAvailable()) return;

    const mediaDevices = navigator.mediaDevices;
    for (const [event, handlers] of this._listeners) {
      for (const handler of handlers) {
        mediaDevices.removeEventListener(event, handler);
      }
    }
    this._listeners.clear();
  }

  dispose(): void {
    this._removeTrackedListeners();
  }
}
