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
   * Initialize all UI components
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

    // Create StreamControlsComponent
    const streamControlsComponent = this.factory.createStreamControlsComponent({
      currentResolution: elements.currentResolution,
      currentFPS: elements.currentFPS,
      screenshotBtn: elements.screenshotBtn,
      recordBtn: elements.recordBtn,
      streamOverlay: elements.streamOverlay
    });
    this.components.set('streamControlsComponent', streamControlsComponent);

    // Create VolumeControl
    const volumeControl = this.factory.createVolumeControl({
      volumeSlider: elements.volumeSlider,
      volumePercentage: elements.volumePercentage,
      volumeSliderContainer: elements.volumeSliderContainer,
      streamVideo: elements.streamVideo,
      volumeButton: elements.volumeBtn
    });
    this.components.set('volumeControl', volumeControl);

    // Setup click-outside behavior for volume control
    volumeControl.setupClickOutside();

    this.logger?.info(`Initialized ${this.components.size} UI components`);
  }

  /**
   * Initialize settings menu component (lazy initialization)
   * @param {Object} dependencies - { settingsService, eventBus, logger }
   */
  initSettingsMenu(dependencies) {
    this.logger?.debug('Initializing settings menu component');

    const settingsMenuComponent = this.factory.createSettingsMenuComponent(dependencies);
    this.components.set('settingsMenuComponent', settingsMenuComponent);

    this.logger?.info('Settings menu component initialized');
  }

  /**
   * Initialize shader selector component (lazy initialization)
   * @param {Object} dependencies - { settingsService, logger }
   * @param {Object} elements - DOM element references for the shader panel
   */
  initShaderSelector(dependencies, elements) {
    this.logger?.debug('Initializing shader selector component');

    const shaderSelectorComponent = this.factory.createShaderSelectorComponent(dependencies);
    shaderSelectorComponent.initialize(elements);
    this.components.set('shaderSelectorComponent', shaderSelectorComponent);

    this.logger?.info('Shader selector component initialized');
  }

  /**
   * Get a component by name
   * @param {string} name - Component name
   * @returns {*} Component instance or undefined
   */
  get(name) {
    return this.components.get(name);
  }

  /**
   * Dispose all components
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
