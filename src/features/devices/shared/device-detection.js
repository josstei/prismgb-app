/**
 * Unified device detection helper
 * Works in both main and renderer processes
 *
 * Purpose: Provide a single source of truth for device detection logic
 * that can be used consistently across main process (USB detection)
 * and renderer process (MediaStream device detection).
 *
 * Uses DEVICE_REGISTRY for detection patterns - no device-specific imports needed.
 */

import { DeviceRegistry } from './device-registry.js';

/**
 * Match a device label against label patterns
 * @param {string} label - Device label
 * @param {string[]} patterns - Patterns to match
 * @returns {boolean}
 */
function matchesLabelPatterns(label, patterns) {
  if (!label || !patterns) return false;
  const normalizedLabel = label.toLowerCase();
  return patterns.some(pattern => normalizedLabel.includes(pattern.toLowerCase()));
}

/**
 * Match USB identifiers against config
 * @param {Object} device - Device with vendorId/productId
 * @param {Object} usbConfig - USB config with vendorId/productId
 * @returns {boolean}
 */
function matchesUSBConfig(device, usbConfig) {
  if (!device?.vendorId || !device?.productId || !usbConfig) return false;
  return device.vendorId === usbConfig.vendorId &&
         device.productId === usbConfig.productId;
}

/**
 * Detect device type from device info
 * @param {Object} device - Device with label and/or vendorId/productId
 * @returns {string|null} Device ID or null if not matched
 */
function detectDeviceType(device) {
  if (!device) return null;

  for (const entry of DeviceRegistry.getAll()) {
    if (!entry.enabled) continue;

    // Try label matching
    if (device.label && matchesLabelPatterns(device.label, entry.labelPatterns)) {
      return entry.id;
    }

    // Try USB matching
    if (matchesUSBConfig(device, entry.usb)) {
      return entry.id;
    }
  }

  return null;
}

export const DeviceDetectionHelper = {
  /**
   * Detect device type from device info
   * Returns the device ID if matched, null otherwise
   *
   * @param {Object} device - Device with label and/or vendorId/productId
   * @returns {string|null} Device ID or null
   */
  detectDeviceType,

  /**
   * Check if device matches any registered device by label
   * @param {string} label - Device label to check
   * @returns {string|null} Device ID or null
   */
  matchesByLabel(label) {
    return detectDeviceType({ label });
  },

  /**
   * Check if device matches any registered device by USB identifiers
   * @param {Object} usbDevice - USB device info
   * @returns {string|null} Device ID or null
   */
  matchesByUSB(usbDevice) {
    return detectDeviceType(usbDevice);
  }
};
