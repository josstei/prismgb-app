import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_ID,
  DEFAULT_NATIVE_RESOLUTION,
  DeviceCatalog,
  matchByLabel,
  matchByUsb,
  matchDevice,
  toDeviceInfo,
  toDeviceStatusPayload
} from '@prismgb/devices';
import * as DevicesPublicApi from '@prismgb/devices';
import {
  CHROMATIC_DESCRIPTOR,
  CHROMATIC_SPECS
} from '../../../devices/chromatic-manifest.testkit';

describe('DeviceCatalog', () => {
  it('uses the manifest as the canonical device source', () => {
    const chromatic = DeviceCatalog.get(CHROMATIC_DESCRIPTOR.id);

    expect(chromatic).not.toBeNull();
    expect(chromatic?.id).toBe(DEFAULT_DEVICE_ID);
    expect(chromatic?.name).toBe(CHROMATIC_DESCRIPTOR.name);
    expect(chromatic?.manufacturer).toBe(CHROMATIC_DESCRIPTOR.manufacturer);
    expect(chromatic?.usb).toMatchObject(CHROMATIC_DESCRIPTOR.usb);
  });

  it('returns immutable descriptors and descriptor collections', () => {
    const devices = DeviceCatalog.all();
    const chromatic = DeviceCatalog.default();

    expect(Object.isFrozen(devices)).toBe(true);
    expect(Object.isFrozen(chromatic)).toBe(true);
    expect(Object.isFrozen(chromatic.usb)).toBe(true);
    expect(Object.isFrozen(chromatic.display.resolutions)).toBe(true);
    expect(Object.isFrozen(chromatic.media.audio.full)).toBe(true);
  });

  it('normalizes missing manifest audio and behavior once in the catalog', () => {
    const chromatic = DeviceCatalog.default();

    expect(chromatic.media.audio.full).toMatchObject({
      echoCancellation: { exact: false },
      noiseSuppression: { exact: false },
      autoGainControl: { exact: false }
    });
    expect(chromatic.media.audio.simple).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    });
    expect(chromatic.media.fallbackStrategy).toBe('audio-simple');
    expect(chromatic.behavior).toEqual({
      showWindowOnConnectDelayMs: 500,
      autoStreamOnConnect: true,
      allowFallback: true,
      requiresStrictMode: true
    });
  });

  it('exposes default native resolution through catalog helpers', () => {
    expect(DEFAULT_NATIVE_RESOLUTION).toEqual({
      width: CHROMATIC_DESCRIPTOR.display.nativeWidth,
      height: CHROMATIC_DESCRIPTOR.display.nativeHeight
    });
    expect(DeviceCatalog.nativeResolution()).toEqual(DEFAULT_NATIVE_RESOLUTION);
    expect(DeviceCatalog.nativeResolution(CHROMATIC_DESCRIPTOR.id)).toEqual(DEFAULT_NATIVE_RESOLUTION);
  });

  it('matches observed USB devices and media labels through one matcher', () => {
    expect(matchByUsb({
      vendorId: CHROMATIC_DESCRIPTOR.usb.vendorId,
      productId: CHROMATIC_DESCRIPTOR.usb.productId
    }).deviceId).toBe(CHROMATIC_DESCRIPTOR.id);
    expect(matchByUsb({ vendorId: 0x9999, productId: CHROMATIC_DESCRIPTOR.usb.productId }).matched).toBe(false);
    expect(matchByLabel(`USB ${CHROMATIC_DESCRIPTOR.name} Device`).deviceId).toBe(CHROMATIC_DESCRIPTOR.id);
    expect(matchDevice({
      deviceId: 'media-1',
      kind: 'videoinput',
      label: `${CHROMATIC_SPECS.hexVendorId.slice(2)}:${CHROMATIC_SPECS.hexProductId.slice(2)}`,
      groupId: 'g1'
    }).reason).toBe('label');
  });

  it('maps canonical domain status to transport-safe payloads without IPC envelopes', () => {
    const descriptor = DeviceCatalog.default();
    const info = toDeviceInfo(descriptor, {
      vendorId: descriptor.usb.vendorId,
      productId: descriptor.usb.productId,
      locationId: 7,
      deviceAddress: 12,
      serialNumber: 'abc'
    });

    const payload = toDeviceStatusPayload({
      state: 'connected',
      connected: true,
      device: info,
      updatedAt: 12345
    });

    expect(payload).toEqual({
      state: 'connected',
      connected: true,
      device: {
        id: descriptor.id,
        name: descriptor.name,
        manufacturer: descriptor.manufacturer,
        vendorId: descriptor.usb.vendorId,
        productId: descriptor.usb.productId,
        locationId: 7,
        deviceAddress: 12,
        serialNumber: 'abc'
      }
    });
    expect('success' in payload).toBe(false);
  });

  it('keeps the package root to catalog, matcher, and payload helpers', () => {
    expect(Object.keys(DevicesPublicApi).sort()).toEqual([
      'DEFAULT_DEVICE_ID',
      'DEFAULT_NATIVE_RESOLUTION',
      'DeviceCatalog',
      'matchByLabel',
      'matchByUsb',
      'matchDevice',
      'toDeviceInfo',
      'toDeviceInfoPayload',
      'toDeviceStatusPayload'
    ]);
  });
});
