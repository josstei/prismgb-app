/**
 * UISetupOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UISetupOrchestrator } from '@ui/ui-setup.orchestrator.js';
import { CSSClasses } from '@shared/config/css-classes.js';

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let mockAppState;
  let mockStreamingOrchestrator;
  let mockCaptureOrchestrator;
  let mockDisplayModeOrchestrator;
  let mockSettingsService;
  let mockUiController;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockStreamOverlay;
  let mockStreamVideo;
  let mockStreamCanvas;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    mockAppState = {
      isStreaming: false
    };

    mockStreamingOrchestrator = {
      start: vi.fn(),
      stop: vi.fn()
    };

    mockCaptureOrchestrator = {
      takeScreenshot: vi.fn(),
      toggleRecording: vi.fn()
    };

    mockDisplayModeOrchestrator = {
      toggleFullscreen: vi.fn(),
      toggleVolumeSlider: vi.fn(),
      handleVolumeSliderChange: vi.fn(),
      toggleCinematicMode: vi.fn()
    };

    mockSettingsService = {};

    // Create mock DOM elements with event listener support
    const createMockElement = () => {
      const listeners = {};
      return {
        classList: {
          contains: vi.fn(() => false)
        },
        addEventListener: vi.fn((event, handler) => {
          listeners[event] = handler;
        }),
        removeEventListener: vi.fn((event) => {
          delete listeners[event];
        }),
        _listeners: listeners,
        _trigger: (event) => listeners[event]?.()
      };
    };

    mockStreamOverlay = createMockElement();
    mockStreamVideo = createMockElement();
    mockStreamCanvas = createMockElement();

    mockUiController = {
      on: vi.fn(),
      elements: {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas,
        shaderBtn: createMockElement(),
        shaderDropdown: createMockElement(),
        cinematicToggle: createMockElement(),
        streamToolbar: createMockElement()
      },
      initSettingsMenu: vi.fn(),
      initShaderSelector: vi.fn(),
      toggleSettingsMenu: vi.fn(),
      toggleShaderSelector: vi.fn()
    };

    orchestrator = new UISetupOrchestrator({
      appState: mockAppState,
      streamingOrchestrator: mockStreamingOrchestrator,
      captureOrchestrator: mockCaptureOrchestrator,
      displayModeOrchestrator: mockDisplayModeOrchestrator,
      settingsService: mockSettingsService,
      uiController: mockUiController,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.appState).toBe(mockAppState);
      expect(orchestrator.streamingOrchestrator).toBe(mockStreamingOrchestrator);
      expect(orchestrator.captureOrchestrator).toBe(mockCaptureOrchestrator);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new UISetupOrchestrator({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('initializeSettingsMenu', () => {
    it('should call uiController.initSettingsMenu with config', () => {
      orchestrator.initializeSettingsMenu();

      expect(mockUiController.initSettingsMenu).toHaveBeenCalledWith({
        settingsService: mockSettingsService,
        eventBus: mockEventBus,
        logger: mockLogger
      });
    });
  });

  describe('initializeShaderSelector', () => {
    it('should call uiController.initShaderSelector with dependencies and elements', () => {
      orchestrator.initializeShaderSelector();

      expect(mockUiController.initShaderSelector).toHaveBeenCalledWith(
        {
          settingsService: mockSettingsService,
          logger: mockLogger
        },
        {
          shaderBtn: mockUiController.elements.shaderBtn,
          shaderDropdown: mockUiController.elements.shaderDropdown,
          cinematicToggle: mockUiController.elements.cinematicToggle,
          streamToolbar: mockUiController.elements.streamToolbar
        }
      );
    });
  });

  describe('setupUIEventListeners', () => {
    it('should set up screenshot button listener', () => {
      orchestrator.setupUIEventListeners();

      expect(mockUiController.on).toHaveBeenCalledWith(
        'screenshotBtn',
        'click',
        expect.any(Function)
      );
    });

    it('should set up record button listener', () => {
      orchestrator.setupUIEventListeners();

      expect(mockUiController.on).toHaveBeenCalledWith(
        'recordBtn',
        'click',
        expect.any(Function)
      );
    });

    it('should set up fullscreen button listener', () => {
      orchestrator.setupUIEventListeners();

      expect(mockUiController.on).toHaveBeenCalledWith(
        'fullscreenBtn',
        'click',
        expect.any(Function)
      );
    });

    it('should set up volume button listener', () => {
      orchestrator.setupUIEventListeners();

      expect(mockUiController.on).toHaveBeenCalledWith(
        'volumeBtn',
        'click',
        expect.any(Function)
      );
    });

    it('should set up volume slider listener', () => {
      orchestrator.setupUIEventListeners();

      expect(mockUiController.on).toHaveBeenCalledWith(
        'volumeSlider',
        'input',
        expect.any(Function)
      );
    });

    it('should set up settings button listener', () => {
      orchestrator.setupUIEventListeners();

      expect(mockUiController.on).toHaveBeenCalledWith(
        'settingsBtn',
        'click',
        expect.any(Function)
      );
    });

    it('should set up shader button listener', () => {
      orchestrator.setupUIEventListeners();

      expect(mockUiController.on).toHaveBeenCalledWith(
        'shaderBtn',
        'click',
        expect.any(Function)
      );
    });

    it('should log setup completion', () => {
      orchestrator.setupUIEventListeners();

      expect(mockLogger.info).toHaveBeenCalledWith('UI event listeners set up');
    });

    it('should call takeScreenshot when screenshot handler is invoked', () => {
      orchestrator.setupUIEventListeners();

      // Find the screenshot handler
      const call = mockUiController.on.mock.calls.find(c => c[0] === 'screenshotBtn');
      const handler = call[2];

      handler();

      expect(mockCaptureOrchestrator.takeScreenshot).toHaveBeenCalled();
    });

    it('should call toggleRecording when record handler is invoked', () => {
      orchestrator.setupUIEventListeners();

      const call = mockUiController.on.mock.calls.find(c => c[0] === 'recordBtn');
      const handler = call[2];

      handler();

      expect(mockCaptureOrchestrator.toggleRecording).toHaveBeenCalled();
    });
  });

  describe('setupOverlayClickHandlers', () => {
    it('should add click listener to stream overlay', () => {
      orchestrator.setupOverlayClickHandlers();

      expect(mockStreamOverlay.addEventListener).toHaveBeenCalled();
      expect(mockStreamOverlay.addEventListener.mock.calls[0][0]).toBe('click');
      expect(typeof mockStreamOverlay.addEventListener.mock.calls[0][1]).toBe('function');
    });

    it('should add click listener to stream video', () => {
      orchestrator.setupOverlayClickHandlers();

      expect(mockStreamVideo.addEventListener).toHaveBeenCalled();
      expect(mockStreamVideo.addEventListener.mock.calls[0][0]).toBe('click');
      expect(typeof mockStreamVideo.addEventListener.mock.calls[0][1]).toBe('function');
    });

    it('should add click listener to stream canvas', () => {
      orchestrator.setupOverlayClickHandlers();

      expect(mockStreamCanvas.addEventListener).toHaveBeenCalled();
      expect(mockStreamCanvas.addEventListener.mock.calls[0][0]).toBe('click');
      expect(typeof mockStreamCanvas.addEventListener.mock.calls[0][1]).toBe('function');
    });

    it('should start stream when overlay is clicked and visible', () => {
      mockStreamOverlay.classList.contains.mockReturnValue(false); // Not hidden
      orchestrator.setupOverlayClickHandlers();

      // Trigger the overlay click
      mockStreamOverlay._trigger('click');

      expect(mockStreamingOrchestrator.start).toHaveBeenCalled();
    });

    it('should not start stream when overlay is hidden', () => {
      mockStreamOverlay.classList.contains.mockReturnValue(true); // Is hidden
      orchestrator.setupOverlayClickHandlers();

      mockStreamOverlay._trigger('click');

      expect(mockStreamingOrchestrator.start).not.toHaveBeenCalled();
    });

    it('should stop stream when video is clicked while streaming', () => {
      mockAppState.isStreaming = true;
      orchestrator.setupOverlayClickHandlers();

      mockStreamVideo._trigger('click');

      expect(mockStreamingOrchestrator.stop).toHaveBeenCalled();
    });

    it('should not stop stream when video is clicked while not streaming', () => {
      mockAppState.isStreaming = false;
      orchestrator.setupOverlayClickHandlers();

      mockStreamVideo._trigger('click');

      expect(mockStreamingOrchestrator.stop).not.toHaveBeenCalled();
    });

    it('should log initialization', () => {
      orchestrator.setupOverlayClickHandlers();

      expect(mockLogger.info).toHaveBeenCalledWith('Overlay click handlers initialized');
    });
  });

  describe('_toggleSettingsMenu', () => {
    it('should stop event propagation', () => {
      const mockEvent = { stopPropagation: vi.fn() };

      orchestrator._toggleSettingsMenu(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });

    it('should call uiController.toggleSettingsMenu', () => {
      const mockEvent = { stopPropagation: vi.fn() };

      orchestrator._toggleSettingsMenu(mockEvent);

      expect(mockUiController.toggleSettingsMenu).toHaveBeenCalled();
    });
  });

  describe('_toggleShaderSelector', () => {
    it('should stop event propagation', () => {
      const mockEvent = { stopPropagation: vi.fn() };

      orchestrator._toggleShaderSelector(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });

    it('should call uiController.toggleShaderSelector', () => {
      const mockEvent = { stopPropagation: vi.fn() };

      orchestrator._toggleShaderSelector(mockEvent);

      expect(mockUiController.toggleShaderSelector).toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should log cleanup start', async () => {
      await orchestrator.onCleanup();

      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up UISetupOrchestrator...');
    });

    it('should log cleanup completion', async () => {
      await orchestrator.onCleanup();

      expect(mockLogger.info).toHaveBeenCalledWith('UISetupOrchestrator cleanup complete');
    });

    it('should remove DOM listeners', async () => {
      orchestrator.setupOverlayClickHandlers();

      await orchestrator.onCleanup();

      expect(mockStreamOverlay.removeEventListener).toHaveBeenCalled();
      expect(mockStreamVideo.removeEventListener).toHaveBeenCalled();
      expect(mockStreamCanvas.removeEventListener).toHaveBeenCalled();
    });
  });
});
