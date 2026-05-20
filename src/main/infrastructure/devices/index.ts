/**
 * Device Infrastructure - Barrel Export
 * Exports all device-related services and types
 */

export { DeviceService } from './device.service.js';
export { DeviceBridgeService } from './device-bridge.service.js';
export { DeviceLifecycleService } from './device-lifecycle.service.js';
export { DeviceProfileRegistry } from './device-profile.registry.js';
export {
  createNodeUsbDeviceMonitor,
  createNoopUsbDeviceMonitor
} from './usb-device-monitor.js';

export type {
  DeviceServiceDependencies,
  DeviceMatch,
  DeviceStatus,
  ConnectedDeviceInfo,
  ProfileClass
} from './device.service.js';

export type {
  DeviceBridgeServiceDependencies
} from './device-bridge.service.js';

export type {
  DeviceLifecycleServiceDependencies
} from './device-lifecycle.service.js';

export type {
  DeviceProfileRegistryDependencies,
  USBDevice,
  DetectionResult
} from './device-profile.registry.js';

export type {
  UsbDeviceEvent,
  UsbDeviceInfo,
  UsbDeviceMonitor
} from './usb-device-monitor.js';
