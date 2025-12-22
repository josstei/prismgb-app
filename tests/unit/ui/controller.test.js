/**
 * UIController Unit Tests
 * Tests the thin facade that delegates to UIComponentRegistry and UIEffects
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIController } from '@renderer/ui/controller/controller.js';

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
  let mockLoggerFactory;
  let mockLogger;

  beforeEach(() => {
    // Create mock elements
    mockElements = {
      statusIndicator: { className: '' },
      statusText: { textContent: '' },
      statusMessage: { textContent: '' },
      streamVideo: { volume: 1 },
      streamCanvas: {},
      streamOverlay: { style: {} },
      overlayMessage: { textContent: '' },
      settingsBtn: { addEventListener: vi.fn() },
      screenshotBtn: { disabled: false },
      recordBtn: { disabled: false, classList: { add: vi.fn(), remove: vi.fn() } },
      fullscreenBtn: { title: '', addEventListener: vi.fn() },
      deviceName: { textContent: '' },
      deviceStatusText: { textContent: '' },
      currentResolution: { textContent: '' },
      currentFPS: { textContent: '' }
    };

    // Mock document.getElementById
    vi.spyOn(document, 'getElementById').mockImplementation((id) => mockElements[id] || null);

    // Create mock components
    mockStatusManager = {
      show: vi.fn()
    };
    mockDeviceStatus = {
      updateStatus: vi.fn(),
      updateOverlayMessage: vi.fn(),
      showError: vi.fn(),
      setOverlayVisible: vi.fn()
    };
    mockStreamControls = {
      setCinematicMode: vi.fn(),
      setStreamingMode: vi.fn(),
      updateStreamInfo: vi.fn()
    };
    mockSettingsMenu = {
      toggle: vi.fn(),
      initialize: vi.fn(),
      dispose: vi.fn()
    };
    mockShaderSelector = {
      hide: vi.fn()
    };

    // Create mock registry
    mockRegistry = {
      initialize: vi.fn(),
      initSettingsMenu: vi.fn(),
      get: vi.fn((name) => {
        switch (name) {
          case 'statusNotificationComponent': return mockStatusManager;
          case 'deviceStatusComponent': return mockDeviceStatus;
          case 'streamControlsComponent': return mockStreamControls;
          case 'settingsMenuComponent': return mockSettingsMenu;
          case 'shaderSelectorComponent': return mockShaderSelector;
          default: return null;
        }
      }),
      dispose: vi.fn()
    };

    // Create mock effects
    mockEffects = {
      triggerShutterFlash: vi.fn(),
      triggerRecordButtonPop: vi.fn(),
      triggerRecordButtonPress: vi.fn(),
      triggerButtonFeedback: vi.fn(),
      enableCursorAutoHide: vi.fn(),
      disableCursorAutoHide: vi.fn(),
      dispose: vi.fn()
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

    controller = new UIController({
      uiComponentRegistry: mockRegistry,
      uiEffects: mockEffects,
      loggerFactory: mockLoggerFactory
    });
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

      expect(mockRegistry.initialize).toHaveBeenCalledWith(controller.elements);
    });
  });

  describe('initSettingsMenu', () => {
    it('should call registry.initSettingsMenu with dependencies', () => {
      const deps = { settingsService: {}, eventBus: {}, logger: {} };

      controller.initSettingsMenu(deps);

      expect(mockRegistry.initSettingsMenu).toHaveBeenCalledWith(deps);
    });

    it('should initialize settings menu component with elements', () => {
      const deps = { settingsService: {}, eventBus: {}, logger: {} };

      controller.initSettingsMenu(deps);

      expect(mockSettingsMenu.initialize).toHaveBeenCalledWith(controller.elements);
    });
  });

  describe('toggleSettingsMenu', () => {
    it('should call toggle on settings menu component', () => {
      controller.toggleSettingsMenu();

      expect(mockSettingsMenu.toggle).toHaveBeenCalled();
    });
  });

  describe('updateStatusMessage', () => {
    it('should delegate to StatusNotificationComponent', () => {
      controller.updateStatusMessage('Test message', 'success');

      expect(mockStatusManager.show).toHaveBeenCalledWith('Test message', 'success');
    });

    it('should use info type by default', () => {
      controller.updateStatusMessage('Test message');

      expect(mockStatusManager.show).toHaveBeenCalledWith('Test message', 'info');
    });
  });

  describe('updateDeviceStatus', () => {
    it('should delegate to DeviceStatusComponent', () => {
      const status = { connected: true };

      controller.updateDeviceStatus(status);

      expect(mockDeviceStatus.updateStatus).toHaveBeenCalledWith(status);
    });
  });

  describe('updateOverlayMessage', () => {
    it('should delegate to DeviceStatusComponent', () => {
      controller.updateOverlayMessage(true);

      expect(mockDeviceStatus.updateOverlayMessage).toHaveBeenCalledWith(true);
    });
  });

  describe('deviceStatus getter', () => {
    it('should return device status component from registry', () => {
      const result = controller.deviceStatus;

      expect(result).toBe(mockDeviceStatus);
    });
  });

  describe('setStreamingMode', () => {
    it('should delegate to StreamControlsComponent', () => {
      controller.setStreamingMode(true);

      expect(mockStreamControls.setStreamingMode).toHaveBeenCalledWith(true);
    });

    it('should enable cursor auto-hide when streaming starts', () => {
      controller.setStreamingMode(true);

      expect(mockEffects.enableCursorAutoHide).toHaveBeenCalled();
    });

    it('should disable cursor auto-hide when streaming stops', () => {
      controller.setStreamingMode(false);

      expect(mockEffects.disableCursorAutoHide).toHaveBeenCalled();
    });

    it('should hide shader selector when disabling streaming', () => {
      controller.setStreamingMode(false);

      expect(mockShaderSelector.hide).toHaveBeenCalled();
    });
  });

  describe('updateStreamInfo', () => {
    it('should delegate to StreamControlsComponent', () => {
      const settings = { width: 160, height: 144 };

      controller.updateStreamInfo(settings);

      expect(mockStreamControls.updateStreamInfo).toHaveBeenCalledWith(settings);
    });
  });

  describe('showErrorOverlay', () => {
    it('should delegate to DeviceStatusComponent', () => {
      controller.showErrorOverlay('Error message');

      expect(mockDeviceStatus.showError).toHaveBeenCalledWith('Error message');
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

  describe('on', () => {
    it('should add event listener to element', () => {
      const handler = vi.fn();

      controller.on('settingsBtn', 'click', handler);

      expect(controller.elements.settingsBtn.addEventListener).toHaveBeenCalledWith('click', handler, undefined);
    });

    it('should warn for missing element when logger is available', () => {
      const handler = vi.fn();

      controller.on('nonExistentElement', 'click', handler);

      expect(mockLogger.warn).toHaveBeenCalledWith('Element not found: nonExistentElement');
    });
  });

  describe('dispose', () => {
    it('should dispose effects', () => {
      controller.dispose();

      expect(mockEffects.dispose).toHaveBeenCalled();
    });

    it('should dispose registry', () => {
      controller.dispose();

      expect(mockRegistry.dispose).toHaveBeenCalled();
    });

    it('should clean up tracked event listeners', () => {
      const handler = vi.fn();
      const mockElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      controller.elements.testBtn = mockElement;
      controller.on('testBtn', 'click', handler);

      controller.dispose();

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('click', handler, undefined);
    });
  });
});
