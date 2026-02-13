/**
 * UIComponentRegistry
 *
 * Manages UI component creation and lifecycle.
 * Uses component definitions to avoid hard-coded wiring.
 */

export class UIComponentRegistry {
  /**
   * @param {Object} dependencies
   * @param {Array} dependencies.componentDefinitions - Component definitions list
   * @param {LoggerFactory} dependencies.loggerFactory - Logger factory
   */
  constructor({ componentDefinitions = [], loggerFactory } = {}) {
    this.definitions = new Map();
    this.components = new Map();
    this.logger = loggerFactory?.create('UIComponentRegistry');

    componentDefinitions.forEach((definition) => {
      this.register(definition);
    });
  }

  /**
   * Register a component definition
   * @param {Object} definition
   * @param {string} definition.id
   * @param {string} [definition.stage='core']
   * @param {Function} definition.create
   */
  register(definition) {
    if (!definition?.id || typeof definition.create !== 'function') {
      this.logger?.warn('Invalid component definition provided');
      return;
    }

    const stage = definition.stage || 'core';
    this.definitions.set(definition.id, { ...definition, stage });
  }

  /**
   * Initialize all core UI components with their DOM elements
   * @param {Object} elements - DOM element references
   * @param {Object} dependencies - Shared dependencies for components
   */
  initialize(elements, dependencies = {}) {
    this.logger?.debug('Initializing UI components');

    const coreDefinitions = Array.from(this.definitions.values())
      .filter(definition => definition.stage === 'core');

    coreDefinitions.forEach((definition) => {
      this._createComponent(definition, { elements, dependencies });
    });

    this.logger?.info(`Initialized ${this.components.size} UI components`);
  }

  /**
   * Initialize all deferred UI components with their specific dependencies
   * @param {Object} elements - DOM element references
   * @param {Object} dependencies - Shared dependencies for components
   */
  initializeDeferred(elements, dependencies = {}) {
    this.logger?.debug('Initializing deferred UI components');

    const deferredDefinitions = Array.from(this.definitions.values())
      .filter(definition => definition.stage === 'deferred');

    // Initialize settings menu with merged elements
    const settingsMenuDef = deferredDefinitions.find(def => def.id === 'settingsMenuComponent');
    if (settingsMenuDef) {
      const settingsElements = {
        ...elements.settings,
        ...elements.updates
      };
      this.initializeComponent('settingsMenuComponent', {
        elements: settingsElements,
        dependencies
      });
    }

    // Initialize shader selector with streaming elements
    const shaderSelectorDef = deferredDefinitions.find(def => def.id === 'shaderSelectorComponent');
    if (shaderSelectorDef) {
      const streamingElements = elements.streaming;
      const shaderElements = {
        shaderBtn: streamingElements?.shaderBtn,
        shaderDropdown: streamingElements?.shaderDropdown,
        shaderOptions: streamingElements?.shaderOptions,
        shaderUnavailableMessage: streamingElements?.shaderUnavailableMessage,
        cinematicToggle: streamingElements?.cinematicToggle,
        cinematicPillText: streamingElements?.cinematicPillText,
        streamToolbar: streamingElements?.streamToolbar,
        brightnessSlider: streamingElements?.brightnessSlider,
        brightnessPercentage: streamingElements?.brightnessPercentage,
        brightnessControl: streamingElements?.brightnessControl,
        volumeSlider: streamingElements?.volumeSliderVertical,
        volumePercentage: streamingElements?.volumePercentageVertical,
        streamVideo: streamingElements?.streamVideo
      };
      this.initializeComponent('shaderSelectorComponent', {
        elements: shaderElements,
        dependencies
      });
    }

    // Initialize notes panel with merged elements
    const notesPanelDef = deferredDefinitions.find(def => def.id === 'notesPanelComponent');
    if (notesPanelDef) {
      const notesElements = {
        ...elements.notes,
        streamContainer: elements.streaming?.streamContainer,
        streamToolbar: elements.streaming?.streamToolbar
      };
      this.initializeComponent('notesPanelComponent', {
        elements: notesElements,
        dependencies
      });
    }

    this.logger?.info('Deferred UI components initialized');
  }

  /**
   * Initialize a specific component by ID
   * @param {string} id
   * @param {Object} options
   * @param {Object} options.elements
   * @param {Object} options.dependencies
   * @returns {Object|undefined}
   */
  initializeComponent(id, { elements, dependencies } = {}) {
    if (this.components.has(id)) {
      return this.components.get(id);
    }

    const definition = this.definitions.get(id);
    if (!definition) {
      this.logger?.warn(`Component definition not found: ${id}`);
      return undefined;
    }

    this.logger?.debug(`Initializing component: ${id}`);
    const component = this._createComponent(definition, { elements, dependencies });
    this.logger?.info(`${id} component initialized`);
    return component;
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

  _createComponent(definition, { elements, dependencies }) {
    const component = definition.create({ elements, dependencies });
    if (!component) {
      this.logger?.warn(`Component creation failed: ${definition.id}`);
      return undefined;
    }

    if (elements && typeof component.initialize === 'function') {
      component.initialize(elements);
    }

    this.components.set(definition.id, component);
    return component;
  }
}
