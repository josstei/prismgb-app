/**
 * Data formatting utilities
 */

/**
 * Formats USB device information into a standardized object structure.
 *
 * Handles multiple input formats for USB identifiers:
 * - vendorId/productId as numeric values
 * - vid/pid as hexadecimal strings
 *
 * @param {Object} device - Raw device object from USB detection library or device adapter
 * @param {number} [device.vendorId] - Vendor ID as decimal number
 * @param {number} [device.productId] - Product ID as decimal number
 * @param {string} [device.vid] - Vendor ID as hexadecimal string
 * @param {string} [device.pid] - Product ID as hexadecimal string
 * @param {string} [device.deviceName] - Primary device name
 * @param {string} [device.configName] - Configuration name (fallback)
 * @param {string} [device.name] - Generic name (fallback)
 * @param {number} [device.deviceClass] - USB device class as decimal number
 * @param {number} [device.class] - USB device class (alternative property)
 *
 * @returns {Object} Formatted device information
 * @returns {string} [return.vid] - Vendor ID formatted as "0x" prefixed hex string (e.g., "0x1234"), omitted if IDs missing
 * @returns {string} [return.pid] - Product ID formatted as "0x" prefixed hex string (e.g., "0x5678"), omitted if IDs missing
 * @returns {string} return.name - Device name, defaults to "Unknown" if no name provided
 * @returns {string|null} return.class - USB device class as "0x" prefixed hex string, or null if not available
 *
 * @example
 * // With numeric IDs
 * formatDeviceInfo({ vendorId: 4660, productId: 22136, deviceName: "Chromatic" })
 * // Returns: { vid: "0x1234", pid: "0x5678", name: "Chromatic", class: null }
 *
 * @example
 * // With hex string IDs
 * formatDeviceInfo({ vid: "1234", pid: "5678", name: "Chromatic" })
 * // Returns: { vid: "0x1234", pid: "0x5678", name: "Chromatic", class: null }
 */
function formatDeviceInfo(device) {
  // USB detection library returns vid/pid as hex strings, but some code uses vendorId/productId as numbers
  const vendorId = device.vendorId || (device.vid ? parseInt(device.vid, 16) : null);
  const productId = device.productId || (device.pid ? parseInt(device.pid, 16) : null);

  let ids = null;
  if (vendorId && productId) {
    ids = {
      vid: `0x${vendorId.toString(16).padStart(4, '0')}`,
      pid: `0x${productId.toString(16).padStart(4, '0')}`
    };
  }
  return {
    ...ids,
    name: device.deviceName || device.configName || device.name || 'Unknown',
    class: device.deviceClass || device.class ? `0x${(device.deviceClass || device.class).toString(16)}` : null
  };
}

export {
  formatDeviceInfo
};
