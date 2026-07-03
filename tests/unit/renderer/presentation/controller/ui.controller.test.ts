/**
 * UIController Unit Tests
 * Tests delegation to UIComponentRegistry and UIEffects
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIController } from '@renderer/presentation/controller/ui.controller.js';
import {
  createLoggerFactory,
  createSettingsServiceMock,
  createDeviceStatusComponentMock,
  createSettingsMenuComponentMock,
  createShaderSelectorComponentMock,
  createStatusNotificationComponentMock,
  createStreamControlsComponentMock,
  createUIBodyClassManagerMock,
  createUIComponentRegistryMock,
  createUIControllerElementsMock,
  createUIEffectsMock,
  createMockElement
} from '../../../../factories/index.js';

describe('UIController', () => {
  let controller;
  let mockElements;
  let mockRegistry;
  let mockEffects;
  let mockStatusManager;
  let mockDeviceStatus;
  let mockStreamControls;
  let mockSettingsMenu;
  let mockShaderSelector;
  let mockBodyClassManager;
  let mockLoggerFactory;
  let mockLogger;

  beforeEach(() => {
    // Create mock elements
    mockElements = createUIControllerElementsMock();

    // Mock document.getElementById
    vi.spyOn(document, 'getElementById').mockImplementation((id) => mockElements[id] || null);
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      const refMatch = /^\[data-ref="(.+)"\]$/.exec(selector);
      return refMatch ? mockElements[refMatch[1]] || null : null;
    });

    // Create mock components
    mockStatusManager = createStatusNotificationComponentMock();
    mockDeviceStatus = createDeviceStatusComponentMock();
    mockStreamControls = createStreamControlsComponentMock();
    mockSettingsMenu = createSettingsMenuComponentMock();
    mockShaderSelector = createShaderSelectorComponentMock();

    mockBodyClassManager = createUIBodyClassManagerMock();

    // Create mock registry
    mockRegistry = createUIComponentRegistryMock({
      statusNotificationComponent: mockStatusManager,
      deviceStatusComponent: mockDeviceStatus,
      streamControlsComponent: mockStreamControls,
      settingsMenuComponent: mockSettingsMenu,
      shaderSelectorComponent: mockShaderSelector
    });

    // Create mock effects
    mockEffects = createUIEffectsMock();

    mockLoggerFactory = createLoggerFactory();

    controller = new UIController({
      uiComponentRegistry: mockRegistry,
      uiEffects: mockEffects,
      bodyClassManager: mockBodyClassManager,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('UIController');
  });

  describe('Constructor', () => {
    it('should initialize elements', () => {
      expect(controller.elements).toBeDefined();
    });

    it('should store registry reference', () => {
      expect(controller.registry).toBe(mockRegistry);
    });

    it('should store effects reference', () => {
      expect(controller.effects).toBe(mockEffects);
    });

    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UIController');
    });
  });

  describe('initializeElements', () => {
    it('should return object with all required elements', () => {
      const elements = controller.initializeElements();

      expect(elements.statusIndicator).toBeDefined();
      expect(elements.statusText).toBeDefined();
      expect(elements.streamVideo).toBeDefined();
      expect(elements.screenshotBtn).toBeDefined();
      expect(elements.recordBtn).toBeDefined();
    });
  });

  describe('initializeComponents', () => {
    it('should call registry.initialize with elements', () => {
      controller.initializeComponents();

      expect(mockRegistry.initialize).toHaveBeenCalledWith(expect.any(Object), {
        bodyClassManager: mockBodyClassManager,
        eventBus: undefined
      });
    });
  });

  describe('initializeDeferredComponent', () => {
    it('should call registry.initializeComponent with dependencies', () => {
      const deps = {
        settingsService: createSettingsServiceMock(),
        eventBus: {},
        logger: {}
      };

      controller.initializeDeferredComponent('settingsMenuComponent', deps);

      expect(mockRegistry.initializeComponent).toHaveBeenCalledWith(
        'settingsMenuComponent',
        expect.objectContaining({
          dependencies: deps
        })
      );
    });

    it('should initialize component with correct elements', () => {
      const deps = {
        settingsService: createSettingsServiceMock(),
        eventBus: {},
        logger: {}
      };

      controller.initializeDeferredComponent('settingsMenuComponent', deps);

      const call = mockRegistry.initializeComponent.mock.calls.find(
        ([id]) => id === 'settingsMenuComponent'
      );
      expect(call?.[1]?.elements).toBeDefined();
    });
  });

  describe('toggleSettingsMenu', () => {
    it('should call toggle on settings menu component', () => {
      controller.toggleSettingsMenu();

      expect(mockSettingsMenu.toggle).toHaveBeenCalled();
    });
  });


  describe('deviceStatus getter', () => {
    it('should return device status component from registry', () => {
      const result = controller.deviceStatus;

      expect(result).toBe(mockDeviceStatus);
    });
  });

  describe('setStreamingMode', () => {
    it('should delegate to StreamingControlsComponent', () => {
      controller.setStreamingMode(true);

      expect(mockStreamControls.setStreamingMode).toHaveBeenCalledWith(true);
    });

    it('should enable cursor auto-hide when streaming starts', () => {
      controller.setStreamingMode(true);

      expect(mockEffects.enableCursorAutoHide).toHaveBeenCalled();
    });

    it('should enable toolbar auto-hide when streaming starts', () => {
      controller.setStreamingMode(true);

      expect(mockEffects.enableToolbarAutoHide).toHaveBeenCalledWith(
        controller.elements.streamToolbar
      );
    });

    it('should disable cursor auto-hide when streaming stops', () => {
      controller.setStreamingMode(false);

      expect(mockEffects.disableCursorAutoHide).toHaveBeenCalled();
    });

    it('should disable toolbar auto-hide when streaming stops', () => {
      controller.setStreamingMode(false);

      expect(mockEffects.disableToolbarAutoHide).toHaveBeenCalled();
    });

    it('should hide shader selector when disabling streaming', () => {
      controller.setStreamingMode(false);

      expect(mockShaderSelector.hide).toHaveBeenCalled();
    });
  });

  describe('updateFullscreenButton', () => {
    it('should set title to Exit Fullscreen when fullscreen', () => {
      controller.updateFullscreenButton(true);

      expect(controller.elements.fullscreenBtn.title).toBe('Exit Fullscreen');
    });

    it('should set title to Fullscreen when not fullscreen', () => {
      controller.updateFullscreenButton(false);

      expect(controller.elements.fullscreenBtn.title).toBe('Fullscreen');
    });
  });

  describe('Effects delegation', () => {
    it('triggerShutterFlash should delegate to effects', () => {
      controller.triggerShutterFlash();

      expect(mockEffects.triggerShutterFlash).toHaveBeenCalled();
    });

    it('triggerRecordButtonPop should delegate to effects', () => {
      controller.triggerRecordButtonPop();

      expect(mockEffects.triggerRecordButtonPop).toHaveBeenCalled();
    });

    it('triggerRecordButtonPress should delegate to effects', () => {
      controller.triggerRecordButtonPress();

      expect(mockEffects.triggerRecordButtonPress).toHaveBeenCalled();
    });

    it('triggerButtonFeedback should delegate to effects', () => {
      controller.triggerButtonFeedback('screenshotBtn', 'capturing', 200);

      expect(mockEffects.triggerButtonFeedback).toHaveBeenCalledWith('screenshotBtn', 'capturing', 200);
    });
  });

  describe('updateRecordingButtonState', () => {
    beforeEach(() => {
      mockEffects.setRecordingButtonState = vi.fn();
    });

    it('should call setRecordingButtonState when recordBtn exists', () => {
      controller.updateRecordingButtonState(true);

      expect(mockEffects.setRecordingButtonState).toHaveBeenCalledWith(
        controller.elements.recordBtn,
        true
      );
    });

    it('should call setRecordingButtonState with false when not active', () => {
      controller.updateRecordingButtonState(false);

      expect(mockEffects.setRecordingButtonState).toHaveBeenCalledWith(
        controller.elements.recordBtn,
        false
      );
    });

    it('should not call effects when recordBtn is null', () => {
      controller.elements.recordBtn = null;

      expect(() => controller.updateRecordingButtonState(true)).not.toThrow();
      expect(mockEffects.setRecordingButtonState).not.toHaveBeenCalled();
    });

    it('should not call effects when effects is undefined', () => {
      controller.effects = undefined;

      expect(() => controller.updateRecordingButtonState(true)).not.toThrow();
    });
  });

  describe('enableControlsAutoHide', () => {
    beforeEach(() => {
      mockEffects.enableControlsAutoHide = vi.fn();
    });

    it('should call enableControlsAutoHide with fullscreenControls element', () => {
      controller.enableControlsAutoHide();

      expect(mockEffects.enableControlsAutoHide).toHaveBeenCalledWith(
        controller.elements.fullscreenControls
      );
    });
  });

  describe('disableControlsAutoHide', () => {
    beforeEach(() => {
      mockEffects.disableControlsAutoHide = vi.fn();
    });

    it('should call disableControlsAutoHide on effects', () => {
      controller.disableControlsAutoHide();

      expect(mockEffects.disableControlsAutoHide).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose effects', async () => {
      const effects = controller.effects;
      await controller.dispose();

      expect(effects.dispose).toHaveBeenCalled();
    });

    it('should dispose registry', async () => {
      const registry = controller.registry;
      await controller.dispose();

      expect(registry.dispose).toHaveBeenCalled();
    });
  });
});
