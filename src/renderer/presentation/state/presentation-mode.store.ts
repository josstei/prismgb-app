import { signal, computed, type ReadonlySignal } from '@platform/ui-base/reactive';
import { EventChannels, type TypedEventBusLike } from '@platform/events';
import { ManagedLifecycleHost } from '@platform/core';

export interface PresentationModeStoreDependencies {
  eventBus: Pick<TypedEventBusLike, 'subscribe'>;
  cinematicEnabled: ReadonlySignal<boolean>;
}

/** Derives cinematic and minimalist modes from stream, fullscreen, and preference state. */
export class PresentationModeStore extends ManagedLifecycleHost {
  private readonly _streamingActive = signal(false);
  private readonly _fullscreenActive = signal(Boolean(document.fullscreenElement));
  private readonly _minimalistEnabled = signal(false);
  private readonly cinematicEnabled: ReadonlySignal<boolean>;

  readonly cinematicActive: ReadonlySignal<boolean>;
  readonly minimalistActive: ReadonlySignal<boolean>;

  constructor(private readonly dependencies: PresentationModeStoreDependencies) {
    super();

    this.cinematicEnabled = dependencies.cinematicEnabled;

    this.cinematicActive = computed(
      () => this.cinematicEnabled.value && this._streamingActive.value
    );
    this.minimalistActive = computed(
      () => this._minimalistEnabled.value && this._fullscreenActive.value && this._streamingActive.value
    );

    const bus = this.dependencies.eventBus;
    this.track(bus.subscribe(EventChannels.UI.STREAMING_MODE, (payload) => {
      if (typeof payload?.enabled === 'boolean') this._streamingActive.value = payload.enabled;
    }));
    this.track(bus.subscribe(EventChannels.UI.FULLSCREEN_STATE, (payload) => {
      if (typeof payload?.active === 'boolean') this._fullscreenActive.value = payload.active;
    }));
    this.track(bus.subscribe(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, (enabled) => {
      if (typeof enabled === 'boolean') this._minimalistEnabled.value = enabled;
    }));
  }

  get fullscreenActive(): ReadonlySignal<boolean> {
    return this._fullscreenActive;
  }

}
