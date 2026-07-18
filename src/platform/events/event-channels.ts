/**
 * Event channel constants shared across renderer layers.
 *
 * Derived from the event manifest's renderer scope — this is the
 * source-of-truth contract for EventBus topic names.
 */
import { getEventManifestScopeEvents } from './event.manifest.js';
import { deriveEventChannelMap } from './event-channel-derivation.js';

export const EventChannels = deriveEventChannelMap(getEventManifestScopeEvents('renderer'));
