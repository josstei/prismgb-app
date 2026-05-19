import manifest from './device.manifest.json';

export type DeviceManifestShape = typeof manifest;
export type DeviceManifestEntry = DeviceManifestShape['devices'][number];

export const DeviceManifest = manifest;
