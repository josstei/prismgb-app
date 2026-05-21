import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const deviceManifestPath = path.join(projectRoot, 'src/shared/features/devices/device.manifest.json');
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

export const CHROMATIC_SPECS = Object.freeze({
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
});

export function createChromaticUsbDeviceInfo(overrides = {}) {
  return {
    vendorId: CHROMATIC_SPECS.vendorId,
    productId: CHROMATIC_SPECS.productId,
    deviceName: CHROMATIC_SPECS.label,
    manufacturer: CHROMATIC_SPECS.manufacturer,
    serialNumber: 'MOCK-001',
    configName: CHROMATIC_SPECS.configName,
    ...overrides
  };
}
