import type { Dimensions } from '@prismgb/events';
import { DeviceManifest } from './device.manifest.js';

function getDefaultDeviceEntry(): typeof DeviceManifest.devices[number] {
  const defaultDevice = DeviceManifest.devices.find((device) => device.enabled) ?? DeviceManifest.devices[0];
  if (!defaultDevice) {
    throw new Error('Device manifest must define at least one device');
  }

  return defaultDevice;
}

export function getDefaultNativeResolution(): Dimensions {
  const { display } = getDefaultDeviceEntry();
  return {
    width: display.nativeWidth,
    height: display.nativeHeight
  };
}

export const DEFAULT_NATIVE_RESOLUTION = Object.freeze(getDefaultNativeResolution());
