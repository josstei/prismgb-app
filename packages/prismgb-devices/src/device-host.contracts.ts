/**
 * Structural contracts for the main-process host collaborators the device
 * services depend on. Declared package-locally so @prismgb/devices imports zero
 * app source (mirrors the @prismgb/updates dependency-typing pattern). Logger
 * contracts come from @prismgb/core.
 */

export interface DeviceEventBus {
  publish(event: string, data?: unknown): void;
  subscribe<T = unknown>(event: string, handler: (data: T) => void): () => void;
}

export interface DeviceWindowService {
  send(channel: string, data?: unknown): void;
  showWindow(): void;
}

export interface DeviceTrayService {
  updateTrayMenu(): void;
}
