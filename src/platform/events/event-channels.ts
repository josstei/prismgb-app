import { EventDefinitions } from './event.manifest.js';
import { deriveEventChannelMap } from './event-channel-derivation.js';

export const EventChannels = deriveEventChannelMap(EventDefinitions);
