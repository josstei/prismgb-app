import mitt, { type Emitter } from 'mitt';
import type { EventChannelMap } from './event-channel-map';

type EmitterMap<TMap> = { [K in keyof TMap]: TMap[K] };

export class EventBus<TMap extends EventChannelMap = EventChannelMap> {
  private readonly emitter: Emitter<EmitterMap<TMap>>;

  constructor() {
    this.emitter = mitt<EmitterMap<TMap>>();
  }

  publish<K extends keyof TMap>(channel: K, payload: TMap[K]): void {
    this.emitter.emit(channel, payload);
  }

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
