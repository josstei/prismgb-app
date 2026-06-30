import { matchByLabel } from '@prismgb/devices';
import type { DeviceDescriptor } from '@prismgb/devices';

export interface DeviceSelectionInput {
  devices: readonly MediaDeviceInfo[];
  storedDeviceIds: readonly string[];
}

export interface DeviceSelectionResult {
  supportedDevices: readonly MediaDeviceInfo[];
  selectedDevice: MediaDeviceInfo | null;
  descriptor: DeviceDescriptor | null;
}

function isVideoInput(device: MediaDeviceInfo): boolean {
  return device.kind === 'videoinput';
}

export function isSupportedMediaDevice(device: MediaDeviceInfo): boolean {
  return isVideoInput(device) && matchByLabel(device.label).matched;
}

export function getDeviceDescriptor(device: MediaDeviceInfo): DeviceDescriptor | null {
  return matchByLabel(device.label).descriptor;
}

export function selectDevice(input: DeviceSelectionInput): DeviceSelectionResult {
  const supportedDevices = input.devices.filter(isSupportedMediaDevice);
  const selectedDevice = supportedDevices.find((device) => input.storedDeviceIds.includes(device.deviceId)) ??
    supportedDevices[0] ??
    null;

  return {
    supportedDevices,
    selectedDevice,
    descriptor: selectedDevice ? getDeviceDescriptor(selectedDevice) : null
  };
}

export function labelsAreHidden(devices: readonly MediaDeviceInfo[]): boolean {
  const videoDevices = devices.filter(isVideoInput);
  return videoDevices.length > 0 && videoDevices.every((device) => !device.label);
}
