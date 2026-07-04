import type { ValueOf } from '@platform/core';
import { getEventManifestScopeEvents } from './event.manifest.js';
import { deriveEventChannelMap } from './event-channel-derivation.js';

const mainScopeEvents = getEventManifestScopeEvents('main');

export const MainEventChannels = deriveEventChannelMap(mainScopeEvents);

type MainEventChannelMap = typeof MainEventChannels;

/**
 * Type representing all main event channels
 */
export type MainEventChannel = ValueOf<{
  [Domain in keyof MainEventChannelMap]: ValueOf<MainEventChannelMap[Domain]>;
}>;
