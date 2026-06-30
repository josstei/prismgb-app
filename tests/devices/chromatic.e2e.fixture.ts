import {
  CHROMATIC_AUDIO_DEVICE_INFO,
  CHROMATIC_AUDIO_LABEL,
  CHROMATIC_AUDIO_TRACK_SETTINGS,
  CHROMATIC_DESCRIPTOR,
  CHROMATIC_FIXTURE,
  CHROMATIC_SPECS,
  CHROMATIC_STREAM_CAPABILITIES,
  CHROMATIC_VIDEO_DEVICE_INFO,
  CHROMATIC_VIDEO_TRACK_SETTINGS,
  createChromaticDeviceInfoPayload,
  createChromaticDeviceStatusPayload,
  createChromaticUsbDeviceInfo
} from './chromatic-manifest.testkit';

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

export const CHROMATIC_E2E_FIXTURE = deepFreeze({
  manifestId: CHROMATIC_DESCRIPTOR.id,
  device: {
    name: CHROMATIC_DESCRIPTOR.name,
    label: CHROMATIC_FIXTURE.label,
    audioLabel: CHROMATIC_AUDIO_LABEL,
    manufacturer: CHROMATIC_DESCRIPTOR.manufacturer
  },
  deviceInfoPayload: createChromaticDeviceInfoPayload(),
  usbDeviceInfo: createChromaticUsbDeviceInfo(),
  display: {
    nativeWidth: CHROMATIC_DESCRIPTOR.display.nativeWidth,
    nativeHeight: CHROMATIC_DESCRIPTOR.display.nativeHeight,
    aspectRatio: CHROMATIC_DESCRIPTOR.display.aspectRatio
  },
  videoDevice: CHROMATIC_VIDEO_DEVICE_INFO,
  audioDevice: CHROMATIC_AUDIO_DEVICE_INFO,
  videoSettings: CHROMATIC_VIDEO_TRACK_SETTINGS,
  audioSettings: CHROMATIC_AUDIO_TRACK_SETTINGS,
  capabilities: CHROMATIC_STREAM_CAPABILITIES,
  stream: {
    defaultFrameRate: CHROMATIC_FIXTURE.defaultFrameRate,
    supportedFrameRates: [...CHROMATIC_FIXTURE.supportedFrameRates]
  },
  labelPatterns: [...CHROMATIC_DESCRIPTOR.labelPatterns]
});

export {
  CHROMATIC_SPECS,
  createChromaticDeviceInfoPayload,
  createChromaticDeviceStatusPayload,
  createChromaticUsbDeviceInfo
};
