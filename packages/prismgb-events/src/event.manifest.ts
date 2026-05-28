import manifest from './event.manifest.json';

export type EventManifestShape = typeof manifest;
export type EventScopeManifest = EventManifestShape['scopes'][number];
export type EventManifestEntry = EventScopeManifest['events'][number];

export const EventManifest = manifest;

const scopesByName = new Map(EventManifest.scopes.map((scope) => [scope.scope, scope] as const));

export function getEventManifestScope(scopeName: string): EventScopeManifest {
  const scope = scopesByName.get(scopeName);
  if (!scope) {
    throw new Error(`Event manifest scope "${scopeName}" not found`);
  }
  return scope;
}

export function getEventManifestScopeEvents(scopeName: string): ReadonlyArray<EventManifestEntry> {
  return getEventManifestScope(scopeName).events;
}

export function getEventManifestScopeValues(scopeName: string): string[] {
  return getEventManifestScopeEvents(scopeName).map((entry) => entry.value);
}

export function toManifestEventKey(domain: string, name: string): `${string}:${string}` {
  return `${domain}:${name}`;
}
