export { DeviceProfile } from './device-profile.base.js';
export { DeviceRegistry } from './device.registry.js';
export { DeviceManifest } from './device.manifest.js';
export {
  getDefaultNativeResolution,
  DEFAULT_NATIVE_RESOLUTION
} from './device-defaults.js';
export { DeviceService } from './device.service.js';
export { DeviceProfileRegistry } from './device-profile.registry.js';
export { DeviceLifecycleService } from './device-lifecycle.service.js';
export { DeviceBridgeService } from './device-bridge.service.js';

export type { IDeviceAdapter } from './device-adapter.interface.js';
export type { DeviceStatusProvider } from './device-status-provider.interface.js';
export { chromaticConfig } from './profiles/chromatic/device-chromatic.config.js';
export { DeviceChromaticProfile } from './profiles/chromatic/device-chromatic.profile.js';
export { createNodeUsbDeviceMonitor, createNoopUsbDeviceMonitor } from './usb-device-monitor.js';
export type { UsbDeviceEvent, UsbDeviceInfo, UsbDeviceMonitor } from './usb-device-monitor.js';
