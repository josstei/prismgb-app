import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent, bindClass, bindText, bindAttr, computed } from '@platform/ui-base';
import { EventChannels } from '@platform/events';
import type { TypedEventBusLike } from '@platform/events';
import type { ReadonlySignal } from '@platform/ui-base/reactive';
import type { LoggerLike } from '@platform/core';

export interface CinematicToggleAppState {
  cinematicModeSignal: ReadonlySignal<boolean>;
}

export interface CinematicToggleComponentOptions {
  eventBus: TypedEventBusLike;
  appState?: CinematicToggleAppState | null;
  logger?: LoggerLike | null;
}

export interface CinematicToggleElements {
  toggleElement?: HTMLElement | null;
  textElement?: HTMLElement | null;
}

/** Binds the cinematic pill (active class / aria-pressed / label) to the cinematic-mode signal. */
class CinematicToggleComponent extends PresentationComponent {
  eventBus: TypedEventBusLike;
  appState: CinematicToggleAppState | null | undefined;
  logger: LoggerLike | null | undefined;
  toggleElement: HTMLElement | null | undefined;
  textElement: HTMLElement | null | undefined;

  constructor(options: CinematicToggleComponentOptions) {
    super();

    this.eventBus = options.eventBus;
    this.appState = options.appState;
    this.logger = options.logger;

    this.toggleElement = null;
    this.textElement = null;
  }

  initialize(options: CinematicToggleElements): void {
    void this.dispose();
    this.toggleElement = options.toggleElement;
    this.textElement = options.textElement;

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
