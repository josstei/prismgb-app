/**
 * UISetupOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator.ts';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config.ts';

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let mockAppState;
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
      subscribe: vi.fn(() => vi.fn()), // Return unsubscribe function
      unsubscribe: vi.fn()
    };

    mockAppState = {
      isStreaming: false
    };

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

    orchestrator = new UISetupOrchestrator({
      appState: mockAppState,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.appState).toBe(mockAppState);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new UISetupOrchestrator({
        eventBus: mockEventBus
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('setupOverlayClickHandlers', () => {
    it('should add click listener to stream overlay', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      orchestrator.setupOverlayClickHandlers(elements);

      expect(mockStreamOverlay.addEventListener).toHaveBeenCalled();
      expect(mockStreamOverlay.addEventListener.mock.calls[0][0]).toBe('click');
      expect(typeof mockStreamOverlay.addEventListener.mock.calls[0][1]).toBe('function');
    });

    it('should add click listener to stream video', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      orchestrator.setupOverlayClickHandlers(elements);

      expect(mockStreamVideo.addEventListener).toHaveBeenCalled();
      expect(mockStreamVideo.addEventListener.mock.calls[0][0]).toBe('click');
      expect(typeof mockStreamVideo.addEventListener.mock.calls[0][1]).toBe('function');
    });

    it('should add click listener to stream canvas', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      orchestrator.setupOverlayClickHandlers(elements);

      expect(mockStreamCanvas.addEventListener).toHaveBeenCalled();
      expect(mockStreamCanvas.addEventListener.mock.calls[0][0]).toBe('click');
      expect(typeof mockStreamCanvas.addEventListener.mock.calls[0][1]).toBe('function');
    });

    it('should publish STREAM_START_REQUESTED when overlay is clicked and visible', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      mockStreamOverlay.classList.contains.mockReturnValue(false); // Not hidden
      orchestrator.setupOverlayClickHandlers(elements);

      // Trigger the overlay click
      mockStreamOverlay._trigger('click');

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:stream-start-requested');
    });

    it('should not publish event when overlay is hidden', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      mockStreamOverlay.classList.contains.mockReturnValue(true); // Is hidden
      orchestrator.setupOverlayClickHandlers(elements);

      mockStreamOverlay._trigger('click');

      expect(mockEventBus.publish).not.toHaveBeenCalledWith('ui:stream-start-requested');
    });

    it('should publish STREAM_STOP_REQUESTED when video is clicked while streaming', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      mockAppState.isStreaming = true;
      orchestrator.setupOverlayClickHandlers(elements);

      mockStreamVideo._trigger('click');

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:stream-stop-requested');
    });

    it('should not publish event when video is clicked while not streaming', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      mockAppState.isStreaming = false;
      orchestrator.setupOverlayClickHandlers(elements);

      mockStreamVideo._trigger('click');

      expect(mockEventBus.publish).not.toHaveBeenCalledWith('ui:stream-stop-requested');
    });

    it('should log initialization', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      orchestrator.setupOverlayClickHandlers(elements);

      expect(mockLogger.info).toHaveBeenCalledWith('Overlay click handlers initialized');
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
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      orchestrator.setupOverlayClickHandlers(elements);

      await orchestrator.onCleanup();

      expect(mockStreamOverlay.removeEventListener).toHaveBeenCalled();
      expect(mockStreamVideo.removeEventListener).toHaveBeenCalled();
      expect(mockStreamCanvas.removeEventListener).toHaveBeenCalled();
    });
  });

  describe('canvas recreation integration', () => {
    let canvasRecreatedHandler;

    beforeEach(async () => {
      // Capture the CANVAS_RECREATED handler when onInitialize subscribes
      mockEventBus.subscribe.mockImplementation((event, handler) => {
        if (event === 'render:canvas-recreated') {
          canvasRecreatedHandler = handler;
        }
        return vi.fn(); // Return unsubscribe function
      });

      await orchestrator.onInitialize();
    });

    it('should subscribe to CANVAS_RECREATED event on initialize', async () => {
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'render:canvas-recreated',
        expect.any(Function)
      );
    });

    it('should remove listeners from old canvas on canvas recreation', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      // Set up click handlers first (this registers the canvas listener)
      orchestrator.setupOverlayClickHandlers(elements);

      // Create mock old and new canvas
      const oldCanvas = mockStreamCanvas;
      const newCanvas = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      // Trigger canvas recreation event
      canvasRecreatedHandler({ oldCanvas, newCanvas });

      // Old canvas listeners should be removed
      expect(oldCanvas.removeEventListener).toHaveBeenCalled();
    });

    it('should rebind click handler to new canvas on canvas recreation', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      // Set up click handlers first (this registers the canvas listener and stores _stopStreamHandler)
      orchestrator.setupOverlayClickHandlers(elements);

      // Create mock old and new canvas
      const oldCanvas = mockStreamCanvas;
      const newCanvas = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      // Trigger canvas recreation event
      canvasRecreatedHandler({ oldCanvas, newCanvas });

      // New canvas should have click handler added
      expect(newCanvas.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
        undefined // DomListenerManager passes undefined for opts when not specified
      );
    });

    it('should preserve stop stream functionality after canvas recreation', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      // Set up click handlers
      orchestrator.setupOverlayClickHandlers(elements);

      // Create mock canvases
      const oldCanvas = mockStreamCanvas;
      const newCanvasListeners = {};
      const newCanvas = {
        addEventListener: vi.fn((event, handler) => {
          newCanvasListeners[event] = handler;
        }),
        removeEventListener: vi.fn()
      };

      // Trigger canvas recreation
      canvasRecreatedHandler({ oldCanvas, newCanvas });

      // Simulate streaming state
      mockAppState.isStreaming = true;

      // Trigger click on new canvas
      newCanvasListeners.click();

      // Should publish STREAM_STOP_REQUESTED event
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:stream-stop-requested');
    });

    it('should log debug messages during canvas recreation', () => {
      const elements = {
        streamOverlay: mockStreamOverlay,
        streamVideo: mockStreamVideo,
        streamCanvas: mockStreamCanvas
      };

      orchestrator.setupOverlayClickHandlers(elements);

      const oldCanvas = mockStreamCanvas;
      const newCanvas = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      canvasRecreatedHandler({ oldCanvas, newCanvas });

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringMatching(/Removed \d+ listener\(s\) from old canvas/));
      expect(mockLogger.debug).toHaveBeenCalledWith('Rebound click handler to new canvas');
    });
  });
});
