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
 * Match a device label against registered label patterns
 * Performs case-insensitive substring matching
 * @param {string} label - Device label from MediaDeviceInfo or device name
 * @param {string[]} patterns - Array of label patterns to match against
 * @returns {boolean} True if label matches any pattern, false otherwise
 */
function matchesLabelPatterns(label, patterns) {
  if (!label || !patterns) return false;
  const normalizedLabel = label.toLowerCase();
  return patterns.some(pattern => normalizedLabel.includes(pattern.toLowerCase()));
}

/**
 * Match USB vendorId and productId against device configuration
 * Checks if both vendorId and productId match exactly
 * @param {Object} device - Device object with vendorId and productId properties
 * @param {number} device.vendorId - USB vendor ID
 * @param {number} device.productId - USB product ID
 * @param {Object} usbConfig - USB configuration from device registry
 * @param {number} usbConfig.vendorId - Expected USB vendor ID
 * @param {number} usbConfig.productId - Expected USB product ID
 * @returns {boolean} True if both vendorId and productId match, false otherwise
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
   * Detect device type from MediaDeviceInfo or USB device info
   * Attempts to identify the device by checking label patterns and USB identifiers
   * against all registered devices in the DeviceRegistry
   * @param {Object} device - Device object containing identification properties
   * @param {string} [device.label] - Device label from MediaDeviceInfo
   * @param {number} [device.vendorId] - USB vendor ID
   * @param {number} [device.productId] - USB product ID
   * @returns {string|null} Device ID if matched, null if no match found
   */
  detectDeviceType,

  /**
   * Find device type by matching label against all registered devices
   * Searches through device registry and attempts to match the provided label
   * against registered label patterns for each device
   * @param {string} label - Device label from MediaDeviceInfo or device name
   * @returns {string|null} Device ID if matched, null if no match found
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
