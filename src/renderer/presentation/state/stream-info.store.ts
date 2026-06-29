import { signal, type ReadonlySignal } from '@prismgb/ui-base/reactive';
import { EventChannels } from '@prismgb/events';
import type { EventBusLike, DisposableFunction } from '@prismgb/core';
import type { StreamInfoSettings } from '@renderer/presentation/features/streaming/streaming-controls.component.js';

export interface StreamInfoStoreDependencies {
  eventBus: EventBusLike;
}

export class StreamInfoStore {
  private readonly _resolution = signal<string>('—');
  private readonly _fps = signal<string>('—');
  private readonly _unsubs: DisposableFunction[] = [];

  constructor(private readonly dependencies: StreamInfoStoreDependencies) {
    const bus = this.dependencies.eventBus;

    this._unsubs.push(
      bus.subscribe(EventChannels.UI.STREAM_INFO, (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null ? (payload as { settings?: unknown }).settings : null;
        if (data && typeof data === 'object' && 'width' in data && 'height' in data && 'frameRate' in data) {
          const settings = data as StreamInfoSettings;
          this._resolution.value = `${settings.width}x${settings.height}`;
          this._fps.value = `${settings.frameRate} fps`;
        } else {
          this.reset();
        }
      })
    );

    this._unsubs.push(
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

  dispose(): void {
    this._unsubs.forEach((unsub) => unsub());
    this._unsubs.length = 0;
  }
}
