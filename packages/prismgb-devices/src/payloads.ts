import type {
  DeviceDescriptor,
  DeviceInfo,
  DeviceInfoPayload,
  DeviceStatus,
  DeviceStatusPayload,
  ObservedUsbDevice
} from './contracts.js';

export function toDeviceInfo(descriptor: DeviceDescriptor, observed: ObservedUsbDevice): DeviceInfo {
  const info: DeviceInfo = {
    id: descriptor.id,
    name: descriptor.name,
    manufacturer: descriptor.manufacturer,
    vendorId: observed.vendorId,
    productId: observed.productId
  };

  if (observed.locationId !== undefined) {
    info.locationId = observed.locationId;
  }

  if (observed.deviceAddress !== undefined) {
    info.deviceAddress = observed.deviceAddress;
  }

  if (observed.serialNumber !== undefined) {
    info.serialNumber = observed.serialNumber;
  }

  return info;
}

export function toDeviceInfoPayload(info: DeviceInfo): DeviceInfoPayload {
  const payload: DeviceInfoPayload = {
    id: info.id,
    name: info.name,
    manufacturer: info.manufacturer,
    vendorId: info.vendorId,
    productId: info.productId
  };

  if (info.locationId !== undefined) {
    payload.locationId = info.locationId;
  }

  if (info.deviceAddress !== undefined) {
    payload.deviceAddress = info.deviceAddress;
  }

  if (info.serialNumber !== undefined) {
    payload.serialNumber = info.serialNumber;
  }

  return payload;
}

export function toDeviceStatusPayload(status: DeviceStatus): DeviceStatusPayload {
  const payload: DeviceStatusPayload = {
    state: status.state,
    connected: status.connected,
    device: status.device ? toDeviceInfoPayload(status.device) : null
  };

  if (status.error !== undefined) {
    payload.error = status.error;
  }

  return payload;
}
