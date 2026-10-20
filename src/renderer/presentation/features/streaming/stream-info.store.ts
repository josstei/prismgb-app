import { signal, type ReadonlySignal } from '@preact/signals-core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

interface StreamInfoSettings {
  width: number;
  height: number;
  frameRate: number;
}

function isStreamInfoSettings(settings: Record<string, unknown>): settings is Record<string, unknown> & StreamInfoSettings {
  return 'width' in settings && 'height' in settings && 'frameRate' in settings;
}

export class StreamInfoStore extends PresentationComponent {
  private readonly _resolution = signal('—');
  private readonly _fps = signal('—');

  constructor({ eventBus }: { eventBus: EventBus }) {
    super();

    this.disposables.add(eventBus.subscribe(EventChannels.UI.STREAM_INFO, ({ settings }) => {
      if (isStreamInfoSettings(settings)) {
        this._resolution.value = `${settings.width}x${settings.height}`;
        this._fps.value = `${settings.frameRate} fps`;
      } else {
        this.reset();
      }
    }));

    this.disposables.add(eventBus.subscribe(EventChannels.STREAM.STOPPED, () => this.reset()));
  }

  get resolution(): ReadonlySignal<string> { return this._resolution; }
  get fps(): ReadonlySignal<string> { return this._fps; }

  reset(): void {
    this._resolution.value = '—';
    this._fps.value = '—';
  }
}
