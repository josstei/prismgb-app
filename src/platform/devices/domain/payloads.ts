import { pruneUndefined } from '@platform/core';
import type {
  DeviceDescriptor,
  DeviceInfo,
  DeviceInfoPayload,
  DeviceStatus,
  DeviceStatusPayload,
  ObservedUsbDevice
} from './types.js';

export function toDeviceInfo(descriptor: DeviceDescriptor, observed: ObservedUsbDevice): DeviceInfo {
  return pruneUndefined<DeviceInfo>({
    id: descriptor.id,
    name: descriptor.name,
    manufacturer: descriptor.manufacturer,
    vendorId: observed.vendorId,
    productId: observed.productId,
    locationId: observed.locationId,
    deviceAddress: observed.deviceAddress,
    serialNumber: observed.serialNumber
  });
}

export function toDeviceInfoPayload(info: DeviceInfo): DeviceInfoPayload {
  return { ...info };
}

export function toDeviceStatusPayload(status: DeviceStatus): DeviceStatusPayload {
  return pruneUndefined<DeviceStatusPayload>({
    state: status.state,
    connected: status.connected,
    device: status.device ? toDeviceInfoPayload(status.device) : null,
    error: status.error
  });
}
