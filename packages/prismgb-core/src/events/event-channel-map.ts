/**
 * Base constraint for typed event-bus channel maps.
 *
 * Extend this interface to declare a concrete set of channel names and
 * their payload types, then pass the subtype to `EventBus<TMap>` for
 * fully typed `publish` and `subscribe` calls.
 */
export interface EventChannelMap {
  [channel: string]: unknown;
}
