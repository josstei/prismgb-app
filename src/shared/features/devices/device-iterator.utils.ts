/**
 * Device Registry Iterator
 * Shared helper for iterating DeviceRegistry entries with consistent filtering.
 * Used by both main process (DeviceServiceMain) and renderer process (StreamingAdapterFactory).
 */

import { DeviceRegistry, type DeviceRegistryEntry } from './device.registry.js';

interface DeviceIteratorLogger {
  debug(message?: unknown, ...args: unknown[]): void;
}

interface DeviceIteratorOptions {
  logger?: DeviceIteratorLogger;
}

export function forEachDeviceWithModule(
  moduleType: string,
  callback: (device: DeviceRegistryEntry) => void,
  options: DeviceIteratorOptions = {}
): void {
  const { logger } = options;

  for (const device of DeviceRegistry.getAll()) {
    if (!device.enabled) {
      logger?.debug(`Skipping disabled device: ${device.id}`);
      continue;
    }

    if (!device[moduleType]) {
      logger?.debug(`Device ${device.id} has no ${moduleType}`);
      continue;
    }

    callback(device);
  }
}
