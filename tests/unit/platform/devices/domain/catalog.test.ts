import { describe, expect, it } from 'vitest';
import {
  DeviceCatalog,
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile,
  matchByLabel,
  toDeviceStatusPayload
} from '@platform/devices';
import { matchByUsb } from '../../../../../src/platform/devices/domain/matching';
import { toDeviceInfo } from '../../../../../src/platform/devices/domain/payloads';
import {
  createFixtureDeviceStatus,
  createFixtureFrameData,
  createFixtureMediaDevices,
  getDeviceFixtureProfile
} from '@platform/devices/testkit';
import {
  CHROMATIC_DESCRIPTOR,
  CHROMATIC_SPECS
} from '../../../../devices/media.testkit';

describe('DeviceCatalog', () => {
  it('uses the manifest as the canonical device source', () => {
    const chromatic = DeviceCatalog.get(CHROMATIC_DESCRIPTOR.id);

    expect(chromatic).not.toBeNull();
    expect(chromatic?.id).toBe(DeviceCatalog.default().id);
    expect(chromatic?.name).toBe(CHROMATIC_DESCRIPTOR.name);
    expect(chromatic?.manufacturer).toBe(CHROMATIC_DESCRIPTOR.manufacturer);
    expect(chromatic?.usb).toMatchObject(CHROMATIC_DESCRIPTOR.usb);
  });

  it('returns immutable descriptors and descriptor collections', () => {
    const devices = DeviceCatalog.enabled();
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
    const expectedResolution = {
      width: CHROMATIC_DESCRIPTOR.display.nativeWidth,
      height: CHROMATIC_DESCRIPTOR.display.nativeHeight
    };
    expect(DeviceCatalog.nativeResolution()).toEqual(expectedResolution);
    expect(DeviceCatalog.nativeResolution(CHROMATIC_DESCRIPTOR.id)).toEqual(expectedResolution);
  });

  it('derives stream profiles through the catalog', () => {
    const profile = getDeviceStreamProfile(CHROMATIC_DESCRIPTOR);

    expect(profile).toEqual({
      hasVideo: true,
      audioSupport: true,
      canvasScale: 4,
      nativeResolution: {
        width: CHROMATIC_DESCRIPTOR.display.nativeWidth,
        height: CHROMATIC_DESCRIPTOR.display.nativeHeight
      },
      canvasResolution: {
        width: CHROMATIC_DESCRIPTOR.display.nativeWidth * 4,
        height: CHROMATIC_DESCRIPTOR.display.nativeHeight * 4,
        scale: 4
      },
      frameRate: CHROMATIC_DESCRIPTOR.fixture?.defaultFrameRate,
      fallbackStrategy: CHROMATIC_DESCRIPTOR.media.fallbackStrategy,
      pixelPerfect: CHROMATIC_DESCRIPTOR.display.pixelPerfect,
      supportedResolutions: CHROMATIC_DESCRIPTOR.display.resolutions,
      supportedFrameRates: CHROMATIC_DESCRIPTOR.fixture?.supportedFrameRates
    });
    expect(getDeviceStreamProfile(CHROMATIC_DESCRIPTOR.id)).toEqual(profile);
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it('derives ordered acquisition attempts once in the catalog', () => {
    const profile = getDeviceAcquisitionProfile(CHROMATIC_DESCRIPTOR);
    const [fullAttempt, simpleAttempt, minimalAttempt, videoOnlySimpleAttempt] = profile.attempts;
    const videoConstraints = CHROMATIC_DESCRIPTOR.media.video as {
      width: { ideal: number };
      height: { ideal: number };
      frameRate: { ideal: number };
    };

    expect(profile.allowFallback).toBe(true);
    expect(profile.fallbackStrategy).toBe(CHROMATIC_DESCRIPTOR.media.fallbackStrategy);
    expect(profile.attempts.map((attempt) => attempt.strategy)).toEqual([
      'full',
      'simple',
      'minimal',
      'video-only-simple',
      'video-only-minimal'
    ]);
    expect(fullAttempt).toMatchObject({
      detail: 'full',
      includeAudio: true,
      includeVideo: true,
      audioConstraints: CHROMATIC_DESCRIPTOR.media.audio.full,
      videoConstraints: CHROMATIC_DESCRIPTOR.media.video
    });
    expect(simpleAttempt?.videoConstraints).toEqual({
      width: videoConstraints.width.ideal,
      height: videoConstraints.height.ideal,
      frameRate: videoConstraints.frameRate.ideal
    });
    expect(minimalAttempt).toMatchObject({
      detail: 'minimal',
      audioConstraints: {},
      videoConstraints: {}
    });
    expect(videoOnlySimpleAttempt).toMatchObject({
      includeAudio: false,
      audioConstraints: null
    });
    expect(getDeviceAcquisitionProfile(CHROMATIC_DESCRIPTOR.id)).toEqual(profile);
  });

  it('exposes fixture projection through the package testkit subpath', () => {
    const profile = getDeviceFixtureProfile(CHROMATIC_DESCRIPTOR);

    expect(profile.descriptor.id).toBe(CHROMATIC_DESCRIPTOR.id);
    expect(profile.specs).toMatchObject({
      id: CHROMATIC_DESCRIPTOR.id,
      label: CHROMATIC_DESCRIPTOR.fixture?.label,
      deviceId: CHROMATIC_DESCRIPTOR.fixture?.videoDeviceId,
      audioDeviceId: CHROMATIC_DESCRIPTOR.fixture?.audioDeviceId
    });
    expect(createFixtureMediaDevices(CHROMATIC_DESCRIPTOR)).toEqual([
      profile.videoDevice,
      profile.audioDevice
    ]);
    expect(createFixtureDeviceStatus(CHROMATIC_DESCRIPTOR, true)).toEqual({
      state: 'connected',
      connected: true,
      device: profile.deviceInfoPayload
    });
    expect(createFixtureDeviceStatus(CHROMATIC_DESCRIPTOR, false)).toEqual({
      state: 'disconnected',
      connected: false,
      device: null
    });
    expect(createFixtureFrameData(CHROMATIC_DESCRIPTOR, { timestamp: 5 })).toMatchObject({
      width: CHROMATIC_DESCRIPTOR.display.nativeWidth,
      height: CHROMATIC_DESCRIPTOR.display.nativeHeight,
      timestamp: 5
    });
  });

  it('matches observed USB devices and media labels through the catalog', () => {
    expect(matchByUsb({
      vendorId: CHROMATIC_DESCRIPTOR.usb.vendorId,
      productId: CHROMATIC_DESCRIPTOR.usb.productId
    }).deviceId).toBe(CHROMATIC_DESCRIPTOR.id);
    expect(matchByUsb({ vendorId: 0x9999, productId: CHROMATIC_DESCRIPTOR.usb.productId }).matched).toBe(false);
    expect(matchByLabel(`USB ${CHROMATIC_DESCRIPTOR.name} Device`).deviceId).toBe(CHROMATIC_DESCRIPTOR.id);
    expect(matchByLabel(`${CHROMATIC_SPECS.hexVendorId.slice(2)}:${CHROMATIC_SPECS.hexProductId.slice(2)}`).reason).toBe('label');
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

});
