import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { bindClass, bindText, bindAttr } from '@renderer/presentation/primitives/signal-bindings.utils';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import type { Logger } from '@platform/core';

export interface CinematicToggleAppState {
  cinematicModeSignal: ReadonlySignal<boolean>;
}

export interface CinematicToggleComponentOptions {
  eventBus: EventBus;
  appState?: CinematicToggleAppState | null;
  logger?: Logger | null;
}

export interface CinematicToggleElements {
  toggleElement?: HTMLElement | null;
  textElement?: HTMLElement | null;
}

/** Binds the cinematic pill (active class / aria-pressed / label) to the cinematic-mode signal. */
class CinematicToggleComponent extends PresentationComponent {
  declare eventBus: EventBus;
  declare appState: CinematicToggleAppState | null | undefined;
  declare logger: Logger | null | undefined;
  declare toggleElement: HTMLElement | null | undefined;
  declare textElement: HTMLElement | null | undefined;

  constructor(options: CinematicToggleComponentOptions) {
    super();

    this.applyOptions<CinematicToggleComponentOptions>({}, options);

    this.toggleElement = null;
    this.textElement = null;
  }

  initialize(options: CinematicToggleElements): void {
    void this.dispose();
    this.applyOptions<CinematicToggleElements>({}, options);

    if (!this.toggleElement) {
      this.logger?.warn('Cinematic toggle elements not found');
      return;
    }

    const enabled = this.appState?.cinematicModeSignal;
    if (enabled) {
      this.track(bindClass(this.toggleElement, CSSClasses.ACTIVE, enabled));
      this.track(bindAttr(this.toggleElement, 'aria-pressed', computed(() => (enabled.value ? 'true' : 'false'))));
      this.track(bindText(this.textElement ?? null, computed(() => (enabled.value ? 'Cinematic On' : 'Cinematic Off'))));
    }

    this.listen(this.toggleElement, 'click', () => {
      this.eventBus.publish(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);
    });

    this.logger?.debug('Cinematic toggle initialized');
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.toggleElement = null;
    this.textElement = null;
    return disposed;
  }
}

export { CinematicToggleComponent };
