/**
 * UIComponentFactory
 *
 * Factory for creating UI components with proper dependency injection.
 * Eliminates window global pollution from UI components.
 *
 * Component classes from feature modules are injected via DI to avoid
 * compile-time coupling between UI infrastructure and feature layers.
 */

import { StatusNotificationComponent } from '../components/status-notification.component.js';
import { DeviceStatusComponent } from '../components/device-status.component.js';

export class UIComponentFactory {
  constructor(dependencies) {
    this.eventBus = dependencies.eventBus;

    // Store injected component classes from feature modules
    // This avoids direct imports from features layer, maintaining proper layering
    this._componentClasses = {
      SettingsMenuComponent: dependencies.settingsMenuComponent,
      StreamControlsComponent: dependencies.streamControlsComponent,
      ShaderSelectorComponent: dependencies.shaderSelectorComponent,
      UpdateSectionComponent: dependencies.updateSectionComponent,
      NotesPanelComponent: dependencies.notesPanelComponent
    };
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
    const ComponentClass = this._componentClasses.StreamControlsComponent;
    return new ComponentClass(config);
  }

  /**
   * Create SettingsMenuComponent
   * @param {Object} config - { settingsService, updateOrchestrator, loggerFactory, logger }
   * @returns {SettingsMenuComponent}
   */
  createSettingsMenuComponent(config) {
    const SettingsMenuClass = this._componentClasses.SettingsMenuComponent;
    const UpdateSectionClass = this._componentClasses.UpdateSectionComponent;

    // Compose UpdateSectionComponent if updateOrchestrator is available
    let updateSectionComponent = null;
    if (config.updateOrchestrator && UpdateSectionClass) {
      updateSectionComponent = new UpdateSectionClass({
        updateOrchestrator: config.updateOrchestrator,
        eventBus: this.eventBus,
        loggerFactory: config.loggerFactory
      });
    }

    return new SettingsMenuClass({
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
    const ComponentClass = this._componentClasses.ShaderSelectorComponent;
    return new ComponentClass({
      ...config,
      eventBus: this.eventBus
    });
  }

  /**
   * Create NotesPanelComponent
   * @param {Object} config - { notesService, logger }
   * @returns {NotesPanelComponent}
   */
  createNotesPanelComponent(config) {
    const ComponentClass = this._componentClasses.NotesPanelComponent;
    return new ComponentClass({
      ...config,
      eventBus: this.eventBus
    });
  }
}
