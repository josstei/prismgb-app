/**
 * Device Registry Iterator
 * Shared helper for iterating DEVICE_REGISTRY with consistent filtering.
 * Used by both main process (DeviceServiceMain) and renderer process (StreamingAdapterFactory).
 */

import { DeviceRegistry } from './device.registry.js';

/**
 * Iterate over enabled devices that have the specified module type
 * @param {string} moduleType - 'profileModule' or 'adapterModule'
 * @param {Function} callback - Called with (device) for each matching device
 * @param {Object} [options] - Optional configuration
 * @param {Object} [options.logger] - Logger with debug method
 */
export function forEachDeviceWithModule(moduleType, callback, options = {}) {
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
