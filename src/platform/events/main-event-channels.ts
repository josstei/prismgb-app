import { getEventManifestScopeEvents } from './event.manifest';
import { deriveEventChannelMap } from './event-channel-derivation';

const mainScopeEvents = getEventManifestScopeEvents('main');

export const MainEventChannels = deriveEventChannelMap(mainScopeEvents);

type MainEventChannelMap = typeof MainEventChannels;
type ValueOf<T> = T[keyof T];

export type MainEventChannel = ValueOf<{
  [Domain in keyof MainEventChannelMap]: ValueOf<MainEventChannelMap[Domain]>;
}>;
