import { getEventManifestScopeEvents } from './event.manifest.js';

type ManifestEvent = {
  domain: string;
  name: string;
  value: string;
};

type MainEventChannelMap = {
  DEVICE: {
    CONNECTION_CHANGED: 'device:connection-changed';
    CHECK_ERROR: 'device:check-error';
  };
  UPDATE: {
    STATE_CHANGED: 'update:state-changed';
  };
};

const mainScopeEvents = getEventManifestScopeEvents('main');

function normalizeDomainKey(domain: string): string {
  return domain.toUpperCase().replace(/-/g, '_');
}

function normalizeNameKey(name: string): string {
  return name.toUpperCase().replace(/-/g, '_');
}

function buildMainEventChannels(scopeEvents: ReadonlyArray<ManifestEvent>) {
  const channelMap: Record<string, Record<string, string>> = {};

  for (const event of scopeEvents) {
    const domain = normalizeDomainKey(event.domain);
    const name = normalizeNameKey(event.name);
    const bucket = (channelMap[domain] ||= {});
    bucket[name] = event.value;
  }

  return channelMap as Record<string, Record<string, string>>;
}

const mainEvents = buildMainEventChannels(mainScopeEvents) as MainEventChannelMap;

export const MainEventChannels: MainEventChannelMap = mainEvents;

/**
 * Type representing all main event channels
 */
type ValueOf<T> = T[keyof T];
export type MainEventChannel = ValueOf<{
  [Domain in keyof MainEventChannelMap]: ValueOf<MainEventChannelMap[Domain]>;
}>;
