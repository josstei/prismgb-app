/**
 * UIComponentRegistry Unit Tests
 * Tests component creation, lifecycle management, and lazy initialization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIComponentRegistry } from '@ui/controller/component.registry.js';

describe('UIComponentRegistry', () => {
  let registry;
  let mockFactory;
  let mockEventBus;
  let mockLoggerFactory;
  let mockLogger;
  let mockElements;
  let mockComponents;

  beforeEach(() => {
    // Create mock components
    mockComponents = {
      statusNotificationComponent: {
        show: vi.fn()
      },
      deviceStatusComponent: {
        updateStatus: vi.fn(),
        dispose: vi.fn()
      },
      streamControlsComponent: {
        setCinematicMode: vi.fn(),
        dispose: vi.fn()
      },
      settingsMenuComponent: {
        toggle: vi.fn(),
        dispose: vi.fn()
      }
    };

    // Create mock factory with factory methods
    mockFactory = {
      createStatusNotificationComponent: vi.fn().mockReturnValue(mockComponents.statusNotificationComponent),
      createDeviceStatusComponent: vi.fn().mockReturnValue(mockComponents.deviceStatusComponent),
      createStreamControlsComponent: vi.fn().mockReturnValue(mockComponents.streamControlsComponent),
      createSettingsMenuComponent: vi.fn().mockReturnValue(mockComponents.settingsMenuComponent)
    };

    // Create mock event bus
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn()
    };

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn().mockReturnValue(mockLogger)
    };

    // Create mock DOM elements
    mockElements = {
      statusMessage: { textContent: '' },
      statusIndicator: { className: '' },
      statusText: { textContent: '' },
      deviceName: { textContent: '' },
      deviceStatusText: { textContent: '' },
      streamOverlay: { style: {} },
      overlayMessage: { textContent: '' },
      currentResolution: { textContent: '' },
      currentFPS: { textContent: '' },
      screenshotBtn: { disabled: false },
      recordBtn: { disabled: false },
      shaderControls: {}
    };

    registry = new UIComponentRegistry({
      uiComponentFactory: mockFactory,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  describe('Constructor', () => {
    it('should store factory reference', () => {
      expect(registry.factory).toBe(mockFactory);
    });

    it('should store eventBus reference', () => {
      expect(registry.eventBus).toBe(mockEventBus);
    });

    it('should store loggerFactory reference', () => {
      expect(registry.loggerFactory).toBe(mockLoggerFactory);
    });

    it('should create logger with correct name', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UIComponentRegistry');
      expect(registry.logger).toBe(mockLogger);
    });

    it('should initialize empty components Map', () => {
      expect(registry.components).toBeInstanceOf(Map);
      expect(registry.components.size).toBe(0);
    });

    it('should handle missing loggerFactory gracefully', () => {
      const registryWithoutLogger = new UIComponentRegistry({
        uiComponentFactory: mockFactory,
        eventBus: mockEventBus,
        loggerFactory: null
      });

      expect(registryWithoutLogger.logger).toBeUndefined();
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      registry.initialize(mockElements);
    });

    it('should log initialization debug message', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('Initializing UI components');
    });

    it('should create StatusNotificationComponent with correct elements', () => {
      expect(mockFactory.createStatusNotificationComponent).toHaveBeenCalledWith({
        statusMessage: mockElements.statusMessage
      });
    });

    it('should store StatusNotificationComponent in components Map', () => {
      expect(registry.components.get('statusNotificationComponent')).toBe(mockComponents.statusNotificationComponent);
    });

    it('should create DeviceStatusComponent with correct elements', () => {
      expect(mockFactory.createDeviceStatusComponent).toHaveBeenCalledWith({
        statusIndicator: mockElements.statusIndicator,
        statusText: mockElements.statusText,
        deviceName: mockElements.deviceName,
        deviceStatusText: mockElements.deviceStatusText,
        streamOverlay: mockElements.streamOverlay,
        overlayMessage: mockElements.overlayMessage
      });
    });

    it('should store DeviceStatusComponent in components Map', () => {
      expect(registry.components.get('deviceStatusComponent')).toBe(mockComponents.deviceStatusComponent);
    });

    it('should create StreamControlsComponent with correct elements', () => {
      expect(mockFactory.createStreamControlsComponent).toHaveBeenCalledWith({
        currentResolution: mockElements.currentResolution,
        currentFPS: mockElements.currentFPS,
        screenshotBtn: mockElements.screenshotBtn,
        recordBtn: mockElements.recordBtn,
        shaderControls: mockElements.shaderControls,
        streamOverlay: mockElements.streamOverlay
      });
    });

    it('should store StreamControlsComponent in components Map', () => {
      expect(registry.components.get('streamControlsComponent')).toBe(mockComponents.streamControlsComponent);
    });

    it('should create all 3 components', () => {
      expect(registry.components.size).toBe(3);
    });

    it('should log completion info message', () => {
      expect(mockLogger.info).toHaveBeenCalledWith('Initialized 3 UI components');
    });
  });

  describe('initSettingsMenu', () => {
    it('should log initialization debug message', () => {
      const dependencies = {
        settingsService: {},
        eventBus: mockEventBus,
        logger: mockLogger
      };

      registry.initSettingsMenu(dependencies);

      expect(mockLogger.debug).toHaveBeenCalledWith('Initializing settings menu component');
    });

    it('should create SettingsMenuComponent with dependencies', () => {
      const dependencies = {
        settingsService: {},
        eventBus: mockEventBus,
        logger: mockLogger
      };

      registry.initSettingsMenu(dependencies);

      expect(mockFactory.createSettingsMenuComponent).toHaveBeenCalledWith(dependencies);
    });

    it('should store SettingsMenuComponent in components Map', () => {
      const dependencies = {
        settingsService: {},
        eventBus: mockEventBus,
        logger: mockLogger
      };

      registry.initSettingsMenu(dependencies);

      expect(registry.components.get('settingsMenuComponent')).toBe(mockComponents.settingsMenuComponent);
    });

    it('should log completion info message', () => {
      const dependencies = {
        settingsService: {},
        eventBus: mockEventBus,
        logger: mockLogger
      };

      registry.initSettingsMenu(dependencies);

      expect(mockLogger.info).toHaveBeenCalledWith('Settings menu component initialized');
    });
  });

  describe('get', () => {
    beforeEach(() => {
      registry.initialize(mockElements);
    });

    it('should return statusNotificationComponent by name', () => {
      const component = registry.get('statusNotificationComponent');

      expect(component).toBe(mockComponents.statusNotificationComponent);
    });

    it('should return deviceStatusComponent by name', () => {
      const component = registry.get('deviceStatusComponent');

      expect(component).toBe(mockComponents.deviceStatusComponent);
    });

    it('should return streamControlsComponent by name', () => {
      const component = registry.get('streamControlsComponent');

      expect(component).toBe(mockComponents.streamControlsComponent);
    });

    it('should return undefined for unknown component name', () => {
      const component = registry.get('nonExistentComponent');

      expect(component).toBeUndefined();
    });

    it('should return settingsMenuComponent after lazy initialization', () => {
      const dependencies = {
        settingsService: {},
        eventBus: mockEventBus,
        logger: mockLogger
      };

      registry.initSettingsMenu(dependencies);

      const component = registry.get('settingsMenuComponent');

      expect(component).toBe(mockComponents.settingsMenuComponent);
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      registry.initialize(mockElements);
    });

    it('should log disposal debug message', () => {
      registry.dispose();

      expect(mockLogger.debug).toHaveBeenCalledWith('Disposing UI components');
    });

    it('should call dispose on deviceStatusComponent', () => {
      registry.dispose();

      expect(mockComponents.deviceStatusComponent.dispose).toHaveBeenCalled();
    });

    it('should call dispose on streamControlsComponent', () => {
      registry.dispose();

      expect(mockComponents.streamControlsComponent.dispose).toHaveBeenCalled();
    });

    it('should call dispose on settingsMenuComponent if initialized', () => {
      const dependencies = {
        settingsService: {},
        eventBus: mockEventBus,
        logger: mockLogger
      };

      registry.initSettingsMenu(dependencies);
      registry.dispose();

      expect(mockComponents.settingsMenuComponent.dispose).toHaveBeenCalled();
    });

    it('should skip dispose for components without dispose method', () => {
      // statusNotificationManager doesn't have dispose method
      expect(() => registry.dispose()).not.toThrow();
    });

    it('should log debug message for each component disposed', () => {
      registry.dispose();

      expect(mockLogger.debug).toHaveBeenCalledWith('Disposing component: deviceStatusComponent');
      expect(mockLogger.debug).toHaveBeenCalledWith('Disposing component: streamControlsComponent');
    });

    it('should clear components Map', () => {
      expect(registry.components.size).toBe(3);

      registry.dispose();

      expect(registry.components.size).toBe(0);
    });

    it('should log completion info message', () => {
      registry.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('All UI components disposed');
    });

    it('should handle disposal when components Map is empty', () => {
      const emptyRegistry = new UIComponentRegistry({
        uiComponentFactory: mockFactory,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => emptyRegistry.dispose()).not.toThrow();
      expect(emptyRegistry.components.size).toBe(0);
    });
  });
});
