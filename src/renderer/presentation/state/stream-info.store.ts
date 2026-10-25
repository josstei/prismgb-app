import { signal, type ReadonlySignal } from '@platform/ui-base/reactive';
import { EventChannels, type TypedEventBusLike } from '@platform/events';
import { ReactiveStore } from './reactive-store.base.js';

export interface StreamInfoStoreDependencies {
  eventBus: Pick<TypedEventBusLike, 'subscribe'>;
}

export class StreamInfoStore extends ReactiveStore {
  private readonly _resolution = signal<string>('—');
  private readonly _fps = signal<string>('—');

  constructor(private readonly dependencies: StreamInfoStoreDependencies) {
    super();

    const bus = this.dependencies.eventBus;

    this.track(
      bus.subscribe(EventChannels.UI.STREAM_INFO, (payload) => {
        const settings = payload?.settings;
        if (settings && typeof settings.width === 'number' && typeof settings.height === 'number' && typeof settings.frameRate === 'number') {
          this._resolution.value = `${settings.width}x${settings.height}`;
          this._fps.value = `${settings.frameRate} fps`;
        } else {
          this.reset();
        }
      })
    );

    this.track(
      bus.subscribe(EventChannels.STREAM.STOPPED, () => {
        this.reset();
      })
    );
  }

  get resolution(): ReadonlySignal<string> { return this._resolution; }
  get fps(): ReadonlySignal<string> { return this._fps; }

  reset(): void {
    this._resolution.value = '—';
    this._fps.value = '—';
  }
}
