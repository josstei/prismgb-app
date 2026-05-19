import manifest from './event.manifest.json';

export type EventManifestShape = typeof manifest;
export type EventScopeManifest = EventManifestShape['scopes'][number];
export type EventManifestEntry = EventScopeManifest['events'][number];

export const EventManifest = manifest;
