import { signal, computed, type ReadonlySignal } from '@preact/signals-core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

interface PresentationModeStoreDependencies {
  eventBus: EventBus;
  cinematicEnabled: ReadonlySignal<boolean>;
}

/**
 * Inputs of the presentation-mode body classes and their gated composites:
 * cinematic = cinematicEnabled && streaming; minimalist = minimalist && fullscreen && streaming.
 */
export class PresentationModeStore extends PresentationComponent {
  private readonly _streamingActive = signal(false);
  private readonly _fullscreenActive = signal(Boolean(document.fullscreenElement));
  private readonly _minimalistEnabled = signal(false);

  readonly cinematicActive: ReadonlySignal<boolean>;
  readonly minimalistActive = computed(
    () => this._minimalistEnabled.value && this._fullscreenActive.value && this._streamingActive.value
  );

  constructor({ eventBus, cinematicEnabled }: PresentationModeStoreDependencies) {
    super();

    this.cinematicActive = computed(() => cinematicEnabled.value && this._streamingActive.value);

    this.disposables.add(eventBus.subscribe(EventChannels.UI.STREAMING_MODE, ({ enabled }) => {
      this._streamingActive.value = enabled;
    }));
    this.disposables.add(eventBus.subscribe(EventChannels.UI.FULLSCREEN_STATE, ({ active }) => {
      this._fullscreenActive.value = active;
    }));
    this.disposables.add(eventBus.subscribe(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, (enabled) => {
      this._minimalistEnabled.value = enabled;
    }));
  }

  get fullscreenActive(): ReadonlySignal<boolean> {
    return this._fullscreenActive;
  }
}
