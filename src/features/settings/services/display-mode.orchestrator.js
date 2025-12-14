/**
 * Display Mode Orchestrator
 *
 * Coordinates display modes and UI controls (fullscreen, cinematic mode)
 *
 * Responsibilities:
 * - Toggle fullscreen mode
 * - Toggle cinematic mode
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';
import { CSSClasses } from '@shared/config/css-classes.js';

export class DisplayModeOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['appState', 'settingsService', 'uiController', 'eventBus', 'loggerFactory'],
      'DisplayModeOrchestrator'
    );

    this._boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._isFullscreenActive = false;
    this._unsubscribeEnterFullscreen = null;
    this._unsubscribeLeaveFullscreen = null;
  }

  /**
   * Initialize the orchestrator - setup fullscreen listeners
   */
  async onInitialize() {
    document.addEventListener('fullscreenchange', this._boundHandleFullscreenChange);

    if (window.windowAPI) {
      this._unsubscribeEnterFullscreen = window.windowAPI.onEnterFullscreen(() => {
        this._handleNativeFullscreen(true);
      });
      this._unsubscribeLeaveFullscreen = window.windowAPI.onLeaveFullscreen(() => {
        this._handleNativeFullscreen(false);
      });
    }
  }

  /**
   * Cleanup - remove fullscreen listeners
   */
  async onCleanup() {
    document.removeEventListener('fullscreenchange', this._boundHandleFullscreenChange);

    if (this._unsubscribeEnterFullscreen) {
      this._unsubscribeEnterFullscreen();
      this._unsubscribeEnterFullscreen = null;
    }
    if (this._unsubscribeLeaveFullscreen) {
      this._unsubscribeLeaveFullscreen();
      this._unsubscribeLeaveFullscreen = null;
    }
  }

  /**
   * Handle fullscreenchange event - for web Fullscreen API
   * @private
   */
  _handleFullscreenChange() {
    this._applyFullscreenState(!!document.fullscreenElement);
  }

  /**
   * Handle native Electron fullscreen events (macOS green button)
   * @param {boolean} active - Whether entering or leaving fullscreen
   * @private
   */
  _handleNativeFullscreen(active) {
    this._applyFullscreenState(active);
  }

  /**
   * Apply fullscreen UI state
   * @param {boolean} active - Whether fullscreen is active
   * @private
   */
  _applyFullscreenState(active) {
    if (this._isFullscreenActive === active) return;
    this._isFullscreenActive = active;

    if (active) {
      document.body.classList.add(CSSClasses.FULLSCREEN_ACTIVE);
      this.uiController.enableControlsAutoHide();
      this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
    } else {
      document.body.classList.remove(CSSClasses.FULLSCREEN_ACTIVE);
      this.uiController.disableControlsAutoHide();
      this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
    }
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        this.logger.error('Error entering fullscreen:', err);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
        this._isFullscreenActive = false;
        this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
      });
    } else {
      document.exitFullscreen();
    }
  }

  /**
   * Toggle cinematic mode
   */
  toggleCinematicMode() {
    const newMode = !this.appState.cinematicModeEnabled;

    this.appState.setCinematicMode(newMode);
    this.eventBus.publish(EventChannels.UI.CINEMATIC_MODE, { enabled: newMode });

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Cinematic mode ' + (newMode ? 'enabled' : 'disabled') });
  }
}
