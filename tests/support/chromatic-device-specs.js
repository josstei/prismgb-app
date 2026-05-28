import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const deviceManifestPath = path.join(projectRoot, 'packages/prismgb-devices/src/device.manifest.json');
const deviceManifest = JSON.parse(fs.readFileSync(deviceManifestPath, 'utf8'));

const chromaticDeviceManifestEntry = deviceManifest.devices.find((device) => device.id === 'chromatic-mod-retro');

if (!chromaticDeviceManifestEntry) {
  throw new Error('Device manifest must define chromatic-mod-retro');
}

export const CHROMATIC_DEVICE_MANIFEST_ENTRY = Object.freeze(chromaticDeviceManifestEntry);

const fixture = CHROMATIC_DEVICE_MANIFEST_ENTRY.fixture;
if (!fixture?.audio) {
  throw new Error('Chromatic device manifest fixture must define audio and media test metadata');
}

const supportedFrameRates = fixture.supportedFrameRates ?? [
  CHROMATIC_DEVICE_MANIFEST_ENTRY.media.video.frameRate.ideal
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function createBaseUsbDeviceInfo() {
  return {
    vendorId: CHROMATIC_DEVICE_MANIFEST_ENTRY.usb.vendorId,
    productId: CHROMATIC_DEVICE_MANIFEST_ENTRY.usb.productId,
    deviceName: fixture.label,
    manufacturer: CHROMATIC_DEVICE_MANIFEST_ENTRY.manufacturer,
    serialNumber: 'MOCK-001',
    configName: CHROMATIC_DEVICE_MANIFEST_ENTRY.name
  };
}

const chromaticSpecs = {
  vendorId: CHROMATIC_DEVICE_MANIFEST_ENTRY.usb.vendorId,
  productId: CHROMATIC_DEVICE_MANIFEST_ENTRY.usb.productId,
  name: fixture.label,
  label: fixture.label,
  configName: CHROMATIC_DEVICE_MANIFEST_ENTRY.name,
  manufacturer: CHROMATIC_DEVICE_MANIFEST_ENTRY.manufacturer,
  nativeWidth: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.nativeWidth,
  nativeHeight: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.nativeHeight,
  aspectRatio: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.aspectRatio,
  frameRates: Object.freeze([...supportedFrameRates]),
  supportedFrameRates: Object.freeze([...supportedFrameRates]),
  defaultFrameRate: fixture.defaultFrameRate,
  audioSampleRate: fixture.audio.sampleRate,
  audioChannels: fixture.audio.channels,
  deviceId: fixture.videoDeviceId,
  audioDeviceId: fixture.audioDeviceId,
  groupId: fixture.groupId,
  labelPatterns: Object.freeze([...CHROMATIC_DEVICE_MANIFEST_ENTRY.labelPatterns])
};

export const CHROMATIC_SPECS = Object.freeze(chromaticSpecs);

export const CHROMATIC_E2E_FIXTURE = deepFreeze({
  manifestId: CHROMATIC_DEVICE_MANIFEST_ENTRY.id,
  device: {
    name: CHROMATIC_DEVICE_MANIFEST_ENTRY.name,
    label: fixture.label,
    audioLabel: `${fixture.label} Audio`,
    manufacturer: CHROMATIC_DEVICE_MANIFEST_ENTRY.manufacturer,
    configName: CHROMATIC_DEVICE_MANIFEST_ENTRY.name
  },
  usbDeviceInfo: createBaseUsbDeviceInfo(),
  display: {
    nativeWidth: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.nativeWidth,
    nativeHeight: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.nativeHeight,
    aspectRatio: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.aspectRatio
  },
  videoDevice: {
    deviceId: fixture.videoDeviceId,
    groupId: fixture.groupId,
    kind: 'videoinput',
    label: fixture.label
  },
  audioDevice: {
    deviceId: fixture.audioDeviceId,
    groupId: fixture.groupId,
    kind: 'audioinput',
    label: `${fixture.label} Audio`
  },
  videoSettings: {
    deviceId: fixture.videoDeviceId,
    groupId: fixture.groupId,
    width: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.nativeWidth,
    height: CHROMATIC_DEVICE_MANIFEST_ENTRY.display.nativeHeight,
    frameRate: fixture.defaultFrameRate
  },
  audioSettings: {
    deviceId: fixture.audioDeviceId,
    groupId: fixture.groupId,
    sampleRate: fixture.audio.sampleRate,
    channelCount: fixture.audio.channels,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  },
  stream: {
    defaultFrameRate: fixture.defaultFrameRate,
    supportedFrameRates: [...supportedFrameRates]
  },
  labelPatterns: [...CHROMATIC_DEVICE_MANIFEST_ENTRY.labelPatterns]
});

export function createChromaticUsbDeviceInfo(overrides = {}) {
  return {
    ...CHROMATIC_E2E_FIXTURE.usbDeviceInfo,
    ...overrides
  };
}
