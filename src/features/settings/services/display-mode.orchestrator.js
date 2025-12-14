/**
 * Display Mode Orchestrator
 *
 * Coordinates display modes and UI controls (fullscreen, volume, cinematic mode)
 *
 * Responsibilities:
 * - Toggle fullscreen mode
 * - Toggle and handle volume slider
 * - Toggle cinematic mode
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class DisplayModeOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['appState', 'settingsService', 'uiController', 'eventBus', 'loggerFactory'],
      'DisplayModeOrchestrator'
    );
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        this.logger.error('Error entering fullscreen:', err);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
      });
      this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
    } else {
      document.exitFullscreen();
      this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
    }
  }

  /**
   * Toggle volume slider visibility
   * @param {Event} e - Click event
   */
  toggleVolumeSlider(e) {
    e.stopPropagation();
    const isVisible = this.uiController.isVolumeSliderVisible();
    this.eventBus.publish(EventChannels.UI.VOLUME_SLIDER_VISIBLE, { visible: !isVisible });
  }

  /**
   * Handle volume slider value change
   * Slider range is 0-100, settings service expects 0-100, UI events use 0-1 for video element
   */
  handleVolumeSliderChange() {
    // Parse slider value as number (slider.value returns string, range is 0-100)
    const rawValue = parseFloat(this.uiController.elements.volumeSlider.value);

    // Clamp volume to valid range (0-100 matching slider range)
    const volume = Math.max(0, Math.min(100, isNaN(rawValue) ? 0 : rawValue));

    // Publish normalized 0-1 value for video element volume
    this.eventBus.publish(EventChannels.UI.VOLUME_LEVEL, { level: volume / 100 });
    // Save 0-100 value to settings
    this.settingsService.setVolume(volume);
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
