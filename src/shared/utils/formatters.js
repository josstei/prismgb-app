/**
 * Data formatting utilities
 */

/**
 * Format complete device info
 * Handles both vendorId/productId (numeric) and vid/pid (hex string) formats
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
