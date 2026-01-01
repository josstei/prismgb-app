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
import { UpdateSectionComponent } from '@renderer/features/updates/ui/update-section.component.js';

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
   * @param {Object} config - { settingsService, updateOrchestrator, loggerFactory, logger }
   * @returns {SettingsMenuComponent}
   */
  createSettingsMenuComponent(config) {
    // Compose UpdateSectionComponent if updateOrchestrator is available
    let updateSectionComponent = null;
    if (config.updateOrchestrator) {
      updateSectionComponent = new UpdateSectionComponent({
        updateOrchestrator: config.updateOrchestrator,
        eventBus: this.eventBus,
        loggerFactory: config.loggerFactory
      });
    }

    return new SettingsMenuComponent({
      settingsService: config.settingsService,
      updateSectionComponent,
      eventBus: this.eventBus,
      loggerFactory: config.loggerFactory,
      logger: config.logger
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
