import { describe, expect, it } from 'vitest';
import {
  matchDevice,
  toDeviceInfo,
  toDeviceStatusPayload
} from '@platform/devices';
import {
  CHROMATIC_DESCRIPTOR,
  CHROMATIC_SPECS,
  createChromaticDeviceInfoPayload,
  createChromaticDeviceStatusPayload,
  createChromaticUsbDevice
} from '../../../devices/media.testkit';

describe('device contract mappers', () => {
  it('maps observed USB devices to canonical device info without fixture-only fields', () => {
    const observed = createChromaticUsbDevice({
      locationId: 4,
      deviceAddress: 12,
      serialNumber: 'CONTRACT-001'
    });

    expect(toDeviceInfo(CHROMATIC_DESCRIPTOR, observed)).toEqual({
      id: CHROMATIC_DESCRIPTOR.id,
      name: CHROMATIC_DESCRIPTOR.name,
      manufacturer: CHROMATIC_DESCRIPTOR.manufacturer,
      vendorId: CHROMATIC_DESCRIPTOR.usb.vendorId,
      productId: CHROMATIC_DESCRIPTOR.usb.productId,
      locationId: 4,
      deviceAddress: 12,
      serialNumber: 'CONTRACT-001'
    });
  });

  it('creates transport-safe device info payloads with only canonical optional fields', () => {
    const payload = createChromaticDeviceInfoPayload({
      locationId: 2,
      deviceAddress: 3,
      serialNumber: 'CONTRACT-002'
    });

    expect(payload).toEqual({
      id: CHROMATIC_DESCRIPTOR.id,
      name: CHROMATIC_DESCRIPTOR.name,
      manufacturer: CHROMATIC_DESCRIPTOR.manufacturer,
      vendorId: CHROMATIC_DESCRIPTOR.usb.vendorId,
      productId: CHROMATIC_DESCRIPTOR.usb.productId,
      locationId: 2,
      deviceAddress: 3,
      serialNumber: 'CONTRACT-002'
    });
    expect('deviceName' in payload).toBe(false);
    expect('success' in payload).toBe(false);
  });

  it('maps connected and disconnected statuses without IPC response envelopes', () => {
    expect(createChromaticDeviceStatusPayload(true)).toEqual({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload()
    });

    expect(createChromaticDeviceStatusPayload(false)).toEqual({
      state: 'disconnected',
      connected: false,
      device: null
    });
  });

  it('drops runtime-only updatedAt from status payloads and preserves errors', () => {
    const payload = toDeviceStatusPayload({
      state: 'error',
      connected: false,
      device: null,
      error: 'scan failed',
      updatedAt: 123
    });

    expect(payload).toEqual({
      state: 'error',
      connected: false,
      device: null,
      error: 'scan failed'
    });
    expect('updatedAt' in payload).toBe(false);
  });

  it('matches fixture media labels through catalog label patterns', () => {
    expect(matchDevice({
      deviceId: CHROMATIC_SPECS.deviceId,
      groupId: CHROMATIC_SPECS.groupId,
      kind: 'videoinput',
      label: CHROMATIC_SPECS.label
    })).toMatchObject({
      matched: true,
      deviceId: CHROMATIC_DESCRIPTOR.id,
      reason: 'label'
    });
  });
});
