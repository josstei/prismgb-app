/**
 * Cinematic Toggle Component
 *
 * Controls cinematic mode toggle UI and state syncing.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@shared/events/event-channels.js';
import { cleanupCallbacks } from '@renderer/presentation/lib/event-subscriptions.utils';

class CinematicToggleComponent {
  constructor({ eventBus, appState, logger }) {
    this.eventBus = eventBus;
    this.appState = appState;
    this.logger = logger;

    this.toggleElement = null;
    this.textElement = null;
    this._domListeners = createDomListenerManager({ logger });
    this._eventSubscriptions = [];
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} elements
   * @param {HTMLElement} elements.toggleElement
   * @param {HTMLElement} elements.textElement
   */
  initialize({ toggleElement, textElement }) {
    this.toggleElement = toggleElement;
    this.textElement = textElement;

    if (!this.toggleElement) {
      this.logger?.warn('Cinematic toggle elements not found');
      return;
    }

    const initialState = this.appState?.isCinematicModeEnabled ?? true;
    this._updateCinematicPill(initialState);

    this._domListeners.add(this.toggleElement, 'click', () => {
      this.eventBus.publish(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);
    });

    const unsubscribe = this.eventBus.subscribe(
      EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
      ({ enabled }) => {
        this._updateCinematicPill(Boolean(enabled));
      }
    );
    this._eventSubscriptions.push(unsubscribe);

    this.logger?.debug('Cinematic toggle initialized');
  }

  /**
   * Update cinematic pill button state
   * @param {boolean} enabled - Whether cinematic mode is enabled
   * @private
   */
  _updateCinematicPill(enabled) {
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

  dispose() {
    this._domListeners.removeAll();
    cleanupCallbacks(this._eventSubscriptions);
    this._eventSubscriptions = [];
  }
}

export { CinematicToggleComponent };
