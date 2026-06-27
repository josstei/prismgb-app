/**
 * Main-process entry point for @prismgb/devices.
 * Imported only by the main process (`@prismgb/devices/service`); kept out of the
 * renderer-facing barrel so the device services' node/native dependencies
 * (usb, electron) never reach the renderer bundle.
 */

export { DeviceService } from './device.service.js';
export type { ProfileClass } from './device.service.js';
export { DeviceProfileRegistry } from './device-profile.registry.js';
export { DeviceLifecycleService } from './device-lifecycle.service.js';
export { DeviceBridgeService } from './device-bridge.service.js';
