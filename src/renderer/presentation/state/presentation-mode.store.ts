import { signal, computed, type ReadonlySignal } from '@platform/ui-base/reactive';
import { EventChannels } from '@platform/events';
import type { EventBusLike } from '@platform/core';
import { ReactiveStore } from './reactive-store.base.js';

function readBooleanField(payload: unknown, key: string): boolean | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

export interface PresentationModeStoreDependencies {
  eventBus: EventBusLike;
  cinematicEnabled: ReadonlySignal<boolean>;
}

/**
 * Owns the reactive inputs for the presentation-mode body classes and exposes the gated
 * composites, reproducing PresentationModeService's predicates without imperative DOM writes:
 * cinematic = cinematicEnabled && streaming; minimalist = minimalist && fullscreen && streaming.
 * Each input is fed from the same bus channel / signal the imperative service consumed.
 */
export class PresentationModeStore extends ReactiveStore {
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
    this.track(bus.subscribe(EventChannels.UI.STREAMING_MODE, (payload: unknown) => this.applyStreaming(payload)));
    this.track(bus.subscribe(EventChannels.UI.FULLSCREEN_STATE, (payload: unknown) => this.applyFullscreen(payload)));
    this.track(bus.subscribe(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, (payload: unknown) =>
      this.applyMinimalist(payload)
    ));
  }

  get fullscreenActive(): ReadonlySignal<boolean> {
    return this._fullscreenActive;
  }

  private applyStreaming(payload: unknown): void {
    const enabled = readBooleanField(payload, 'enabled');
    if (enabled !== null) this._streamingActive.value = enabled;
  }

  private applyFullscreen(payload: unknown): void {
    const active = readBooleanField(payload, 'active');
    if (active !== null) this._fullscreenActive.value = active;
  }

  private applyMinimalist(payload: unknown): void {
    if (typeof payload === 'boolean') this._minimalistEnabled.value = payload;
  }
}
