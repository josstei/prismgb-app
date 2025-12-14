/**
 * UIComponentFactory
 *
 * Factory for creating UI components with proper dependency injection.
 * Eliminates window global pollution from UI components.
 */

import { StatusNotificationComponent } from './components/status-notification.js';
import { DeviceStatusComponent } from './components/device-status.js';
import { StreamControlsComponent } from './components/stream-controls.js';
import { SettingsMenuComponent } from '../features/settings/ui/settings-menu.js';
import { VolumeControl } from './components/volume-control.js';
import { ShaderSelectorComponent } from './components/shader-selector.js';

export class UIComponentFactory {
  constructor(dependencies) {
    this.eventBus = dependencies.eventBus;
  }

  /**
   * Create StatusNotificationComponent
   * @param {Object} config - { statusMessage: HTMLElement }
   * @returns {StatusNotificationComponent}
   */
  createStatusNotificationComponent(config) {
    return new StatusNotificationComponent(config);
  }

  /**
   * Create DeviceStatusComponent
   * @param {Object} config - DOM element references
   * @returns {DeviceStatusComponent}
   */
  createDeviceStatusComponent(config) {
    return new DeviceStatusComponent(config);
  }

  /**
   * Create StreamControlsComponent
   * @param {Object} config - DOM element references
   * @returns {StreamControlsComponent}
   */
  createStreamControlsComponent(config) {
    return new StreamControlsComponent(config);
  }

  /**
   * Create SettingsMenuComponent
   * @param {Object} config - { settingsService, eventBus, logger }
   * @returns {SettingsMenuComponent}
   */
  createSettingsMenuComponent(config) {
    return new SettingsMenuComponent({
      ...config,
      eventBus: this.eventBus
    });
  }

  /**
   * Create VolumeControl
   * @param {Object} config - DOM element references
   * @returns {VolumeControl}
   */
  createVolumeControl(config) {
    return new VolumeControl(config);
  }

  /**
   * Create ShaderSelectorComponent
   * @param {Object} config - { settingsService, logger }
   * @returns {ShaderSelectorComponent}
   */
  createShaderSelectorComponent(config) {
    return new ShaderSelectorComponent({
      ...config,
      eventBus: this.eventBus
    });
  }
}
