import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { EventChannels } from '@prismgb/events';
import type { TypedEventBusLike } from '@prismgb/events';
import type { LoggerLike } from '@prismgb/core';

export interface CinematicToggleAppState {
  isCinematicModeEnabled?: boolean;
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

class CinematicToggleComponent extends PresentationComponent {
  declare eventBus: TypedEventBusLike;
  declare appState: CinematicToggleAppState | null | undefined;
  declare logger: LoggerLike | null | undefined;
  declare toggleElement: HTMLElement | null | undefined;
  declare textElement: HTMLElement | null | undefined;

  constructor({ eventBus, appState, logger }: CinematicToggleComponentOptions) {
    super();

    this.eventBus = eventBus;
    this.appState = appState;
    this.logger = logger;

    this.toggleElement = null;
    this.textElement = null;
  }

  initialize({ toggleElement, textElement }: CinematicToggleElements): void {
    void this.dispose();
    this.toggleElement = toggleElement;
    this.textElement = textElement;

    if (!this.toggleElement) {
      this.logger?.warn('Cinematic toggle elements not found');
      return;
    }

    const initialState = this.appState?.isCinematicModeEnabled ?? true;
    this._updateCinematicPill(initialState);

    this.listen(this.toggleElement, 'click', () => {
      this.eventBus.publish(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);
    });

    this.trackSubscription(this.eventBus.subscribe(
      EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
      ({ enabled }) => {
        this._updateCinematicPill(Boolean(enabled));
      }
    ));

    this.logger?.debug('Cinematic toggle initialized');
  }

  _updateCinematicPill(enabled: boolean): void {
    if (!this.toggleElement) return;

    if (enabled) {
      this.toggleElement.classList.add(CSSClasses.ACTIVE);
      this.toggleElement.setAttribute('aria-pressed', 'true');
      if (this.textElement) this.textElement.textContent = 'Cinematic On';
    } else {
      this.toggleElement.classList.remove(CSSClasses.ACTIVE);
      this.toggleElement.setAttribute('aria-pressed', 'false');
      if (this.textElement) this.textElement.textContent = 'Cinematic Off';
    }
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.toggleElement = null;
    this.textElement = null;
    return disposed;
  }
}

export { CinematicToggleComponent };
