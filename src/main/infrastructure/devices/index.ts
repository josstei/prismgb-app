/**
 * Device Infrastructure - Barrel Export
 * Exports all device-related services and types
 */

export { DeviceService } from './device.service.js';
export { DeviceEventHandler } from './device-event-handler.service.js';
export { DeviceProfileRegistry } from './device-profile.registry.js';

export type {
  DeviceServiceDependencies,
  DeviceMatch,
  DeviceStatus,
  ConnectedDeviceInfo,
  ProfileClass
} from './device.service.js';

export type {
  DeviceEventHandlerDependencies
} from './device-event-handler.service.js';

export type {
  DeviceProfileRegistryDependencies,
  USBDevice,
  DetectionResult
} from './device-profile.registry.js';
