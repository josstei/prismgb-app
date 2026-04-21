import mitt, { type Emitter } from 'mitt';
import type { EventChannelMap } from './event-channel-map';

type EmitterMap<TMap> = { [K in keyof TMap]: TMap[K] };

/**
 * Typed in-process event bus backed by `mitt`.
 *
 * Constrain the channel map with a concrete `EventChannelMap` subtype to get
 * fully typed `publish` and `subscribe` calls. Provide no type argument to
 * use the open-ended default map.
 *
 * @typeParam TMap - Map of channel name to payload type. Defaults to `EventChannelMap`.
 *
 * @example
 * ```ts
 * interface AppEvents extends EventChannelMap {
 *   'device:connected': DeviceInfo;
 *   'device:disconnected': void;
 * }
 * const bus = new EventBus<AppEvents>();
 * bus.subscribe('device:connected', (info) => console.log(info.id));
 * bus.publish('device:connected', { id: 'chromatic-1' });
 * ```
 */
export class EventBus<TMap extends EventChannelMap = EventChannelMap> {
  private readonly emitter: Emitter<EmitterMap<TMap>>;

  /**
   * Creates a new `EventBus` with an isolated mitt emitter instance.
   */
  constructor() {
    this.emitter = mitt<EmitterMap<TMap>>();
  }

  /**
   * Publishes `payload` to every subscriber registered on `channel`.
   *
   * @param channel - Channel name identifying the event type.
   * @param payload - Data delivered to all subscribers.
   */
  publish<K extends keyof TMap>(channel: K, payload: TMap[K]): void {
    this.emitter.emit(channel, payload);
  }

  /**
   * Registers `handler` to receive every future payload published on `channel`.
   *
   * @param channel - Channel name to subscribe to.
   * @param handler - Invoked with each published payload.
   * @returns An unsubscribe function that removes the handler when called.
   */
  subscribe<K extends keyof TMap>(
    channel: K,
    handler: (payload: TMap[K]) => void
  ): () => void {
    this.emitter.on(channel, handler as (payload: TMap[keyof TMap]) => void);
    return () => {
      this.emitter.off(channel, handler as (payload: TMap[keyof TMap]) => void);
    };
  }
}
