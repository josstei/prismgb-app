/**
 * UIComponentRegistry
 *
 * Manages UI component creation and lifecycle.
 * Extracts component management from UIController for better separation of concerns.
 */

export class UIComponentRegistry {
  /**
   * Create a new component registry
   * @param {Object} dependencies - { uiComponentFactory, eventBus, loggerFactory }
   */
  constructor(dependencies) {
    this.factory = dependencies.uiComponentFactory;
    this.eventBus = dependencies.eventBus;
    this.loggerFactory = dependencies.loggerFactory;

    // Create logger
    this.logger = this.loggerFactory?.create('UIComponentRegistry');

    // Component storage
    this.components = new Map();
  }

  /**
   * Initialize all UI components with their DOM elements
   * Creates instances of DeviceStatus, StatusNotification, and StreamControls.
   * @param {Object} elements - DOM element references
   */
  initialize(elements) {
    this.logger?.debug('Initializing UI components');

    // Create StatusNotificationComponent
    const statusNotificationComponent = this.factory.createStatusNotificationComponent({
      statusMessage: elements.statusMessage
    });
    this.components.set('statusNotificationComponent', statusNotificationComponent);

    // Create DeviceStatusComponent
    const deviceStatusComponent = this.factory.createDeviceStatusComponent({
      statusIndicator: elements.statusIndicator,
      statusText: elements.statusText,
      deviceName: elements.deviceName,
      deviceStatusText: elements.deviceStatusText,
      streamOverlay: elements.streamOverlay,
      overlayMessage: elements.overlayMessage
    });
    this.components.set('deviceStatusComponent', deviceStatusComponent);

    // Create StreamingControlsComponent
    const streamControlsComponent = this.factory.createStreamingControlsComponent({
      currentResolution: elements.currentResolution,
      currentFPS: elements.currentFPS,
      screenshotBtn: elements.screenshotBtn,
      recordBtn: elements.recordBtn,
      shaderControls: elements.shaderControls,
      streamOverlay: elements.streamOverlay
    });
    this.components.set('streamControlsComponent', streamControlsComponent);

    this.logger?.info(`Initialized ${this.components.size} UI components`);
  }

  /**
   * Initialize settings menu component
   * @param {Object} dependencies - Settings menu dependencies
   */
  initSettingsMenu(dependencies) {
    this.logger?.debug('Initializing settings menu component');

    const settingsMenuComponent = this.factory.createSettingsMenuComponent(dependencies);
    this.components.set('settingsMenuComponent', settingsMenuComponent);

    this.logger?.info('Settings menu component initialized');
  }

  /**
   * Initialize shader selector component
   * @param {Object} dependencies - Shader selector dependencies
   * @param {Object} elements - DOM element references for the shader panel
   */
  initShaderSelector(dependencies, elements) {
    this.logger?.debug('Initializing shader selector component');

    const shaderSelectorComponent = this.factory.createStreamingShaderSelectorComponent(dependencies);
    shaderSelectorComponent.initialize(elements);
    this.components.set('shaderSelectorComponent', shaderSelectorComponent);

    this.logger?.info('Shader selector component initialized');
  }

  /**
   * Initialize notes panel component
   * @param {Object} dependencies - Notes panel dependencies
   * @param {Object} elements - DOM element references for the notes panel
   */
  initNotesPanel(dependencies, elements) {
    this.logger?.debug('Initializing notes panel component');

    const notesPanelComponent = this.factory.createNotesPanelComponent(dependencies);
    notesPanelComponent.initialize(elements);
    this.components.set('notesPanelComponent', notesPanelComponent);

    this.logger?.info('Notes panel component initialized');
  }

  /**
   * Get a component by name
   * @param {string} name - Component name
   * @returns {Object|undefined} Component instance or undefined
   */
  get(name) {
    return this.components.get(name);
  }

  /**
   * Dispose all components and cleanup resources
   */
  dispose() {
    this.logger?.debug('Disposing UI components');

    for (const [name, component] of this.components.entries()) {
      if (typeof component.dispose === 'function') {
        this.logger?.debug(`Disposing component: ${name}`);
        component.dispose();
      }
    }

    this.components.clear();
    this.logger?.info('All UI components disposed');
  }
}
