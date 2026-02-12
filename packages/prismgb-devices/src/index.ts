export { DeviceRegistry, DEVICE_REGISTRY } from './registry/device.registry';
export { DeviceProfile } from './registry/device-profile.base';

export { DeviceDetectionHelper } from './detection/device-detection';
export { forEachDeviceWithModule } from './detection/device-iterator';

export { DeviceChromaticProfile } from './profiles/chromatic/device-chromatic.profile';
export { chromaticConfig, mediaConfig, chromaticHelpers } from './profiles/chromatic/device-chromatic.config';

export { IDeviceAdapter } from './interfaces/device-adapter.interface';
export { IDeviceStatusProvider } from './interfaces/device-status-provider.interface';
export { IFallbackStrategy } from './interfaces/fallback-strategy.interface';
export type { FallbackConfig } from './interfaces/fallback-strategy.interface';

export { formatDeviceInfo } from './utils/formatters';
