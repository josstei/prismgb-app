/**
 * UIComponentFactory
 *
 * Factory for creating UI components with proper dependency injection.
 * Eliminates window global pollution from UI components.
 */

import { StatusNotificationComponent } from '../components/status-notification.component.js';
import { DeviceStatusComponent } from '../components/device-status.component.js';
import { SettingsMenuComponent } from '@renderer/features/settings/ui/settings-menu.component.js';
import { StreamControlsComponent } from '@renderer/features/streaming/ui/stream-controls.component.js';
import { ShaderSelectorComponent } from '@renderer/features/streaming/ui/shader-selector.component.js';

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
   * Create ShaderSelectorComponent
   * @param {Object} config - { settingsService, appState, logger }
   * @returns {ShaderSelectorComponent}
   */
  createShaderSelectorComponent(config) {
    return new ShaderSelectorComponent({
      ...config,
      eventBus: this.eventBus
    });
  }
}
