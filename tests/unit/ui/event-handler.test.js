/**
 * UIEventHandler Unit Tests
 * Tests the event bridge between EventBus and UIController
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UIEventHandler } from '@ui/orchestration/event-handler.js';

describe('UIEventHandler', () => {
  let handler;
  let mockEventBus;
  let mockUiController;
  let mockAppState;
  let mockLogger;
  let mockLoggerFactory;
  let subscribedHandlers;

  beforeEach(() => {
    // Track subscribed handlers
    subscribedHandlers = {};

    // Create mock EventBus
    mockEventBus = {
      subscribe: vi.fn((event, handlerFn) => {
        subscribedHandlers[event] = handlerFn;
        return vi.fn(); // Return unsubscribe function
      }),
      publish: vi.fn()
    };

    // Create mock UIController
    mockUiController = {
      updateStatusMessage: vi.fn(),
      updateDeviceStatus: vi.fn(),
      updateOverlayMessage: vi.fn(),
      showErrorOverlay: vi.fn(),
      setStreamingMode: vi.fn(),
      updateStreamInfo: vi.fn(),
      triggerShutterFlash: vi.fn(),
      triggerRecordButtonPop: vi.fn(),
      triggerRecordButtonPress: vi.fn(),
      triggerButtonFeedback: vi.fn(),
      setCinematicMode: vi.fn(),
      updateFullscreenButton: vi.fn(),
      elements: {
        recordBtn: {
          classList: {
            add: vi.fn(),
            remove: vi.fn()
          }
        }
      },
      deviceStatus: {
        setOverlayVisible: vi.fn()
      }
    };

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    // Create mock AppState
    mockAppState = {
      cinematicModeEnabled: true,
      isStreaming: false
    };

    handler = new UIEventHandler({
      eventBus: mockEventBus,
      uiController: mockUiController,
      appState: mockAppState,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store event bus', () => {
      expect(handler.eventBus).toBe(mockEventBus);
    });

    it('should store ui controller', () => {
      expect(handler.uiController).toBe(mockUiController);
    });

    it('should store app state', () => {
      expect(handler.appState).toBe(mockAppState);
    });

    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UIEventHandler');
      expect(handler.logger).toBe(mockLogger);
    });

    it('should initialize subscriptions array', () => {
      expect(handler._subscriptions).toEqual([]);
    });

    it('should initialize cinematic state tracking', () => {
      expect(handler._cinematicModeEnabled).toBe(false);
      expect(handler._isStreaming).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should subscribe to all UI events', () => {
      handler.initialize();

      const expectedEvents = [
        'ui:status-message',
        'ui:device-status',
        'ui:overlay-message',
        'ui:overlay-visible',
        'ui:overlay-error',
        'ui:streaming-mode',
        'ui:stream-info',
        'ui:shutter-flash',
        'ui:record-button-pop',
        'ui:record-button-press',
        'ui:button-feedback',
        'ui:recording-state',
        'ui:cinematic-mode',
        'ui:fullscreen-state'
      ];

      expectedEvents.forEach(event => {
        expect(mockEventBus.subscribe).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should log initialization', () => {
      handler.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('UIEventHandler initialized');
    });

    it('should store unsubscribe functions', () => {
      handler.initialize();

      expect(handler._subscriptions.length).toBeGreaterThan(0);
    });

    it('should initialize cinematic state from AppState', () => {
      handler.initialize();

      expect(handler._cinematicModeEnabled).toBe(true);
      expect(handler._isStreaming).toBe(false);
    });
  });

  describe('Event Handlers - Status Messages', () => {
    beforeEach(() => {
      handler.initialize();
    });

    it('should handle ui:status-message event', () => {
      subscribedHandlers['ui:status-message']({ message: 'Test message', type: 'error' });

      expect(mockUiController.updateStatusMessage).toHaveBeenCalledWith('Test message', 'error');
    });

    it('should handle ui:status-message with default type', () => {
      subscribedHandlers['ui:status-message']({ message: 'Test message' });

      expect(mockUiController.updateStatusMessage).toHaveBeenCalledWith('Test message', 'info');
    });

    it('should handle ui:device-status event', () => {
      const status = { connected: true };
      subscribedHandlers['ui:device-status']({ status });

      expect(mockUiController.updateDeviceStatus).toHaveBeenCalledWith(status);
    });

    it('should handle ui:overlay-message event', () => {
      subscribedHandlers['ui:overlay-message']({ deviceConnected: true });

      expect(mockUiController.updateOverlayMessage).toHaveBeenCalledWith(true);
    });

    it('should handle ui:overlay-visible event', () => {
      subscribedHandlers['ui:overlay-visible']({ visible: true });

      expect(mockUiController.deviceStatus.setOverlayVisible).toHaveBeenCalledWith(true);
    });

    it('should handle ui:overlay-error event', () => {
      subscribedHandlers['ui:overlay-error']({ message: 'Error occurred' });

      expect(mockUiController.showErrorOverlay).toHaveBeenCalledWith('Error occurred');
    });
  });

  describe('Event Handlers - Streaming', () => {
    beforeEach(() => {
      handler.initialize();
    });

    it('should handle ui:streaming-mode event', () => {
      subscribedHandlers['ui:streaming-mode']({ enabled: true });

      expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(true);
    });

    it('should update internal streaming state', () => {
      subscribedHandlers['ui:streaming-mode']({ enabled: true });

      expect(handler._isStreaming).toBe(true);
    });

    it('should handle ui:stream-info event', () => {
      const settings = { width: 640, height: 480 };
      subscribedHandlers['ui:stream-info']({ settings });

      expect(mockUiController.updateStreamInfo).toHaveBeenCalledWith(settings);
    });
  });

  describe('Event Handlers - Visual Effects', () => {
    beforeEach(() => {
      handler.initialize();
    });

    it('should handle ui:shutter-flash event', () => {
      subscribedHandlers['ui:shutter-flash']();

      expect(mockUiController.triggerShutterFlash).toHaveBeenCalled();
    });

    it('should handle ui:record-button-pop event', () => {
      subscribedHandlers['ui:record-button-pop']();

      expect(mockUiController.triggerRecordButtonPop).toHaveBeenCalled();
    });

    it('should handle ui:record-button-press event', () => {
      subscribedHandlers['ui:record-button-press']();

      expect(mockUiController.triggerRecordButtonPress).toHaveBeenCalled();
    });

    it('should handle ui:button-feedback event', () => {
      subscribedHandlers['ui:button-feedback']({
        elementKey: 'screenshotBtn',
        className: 'capturing',
        duration: 200
      });

      expect(mockUiController.triggerButtonFeedback).toHaveBeenCalledWith(
        'screenshotBtn',
        'capturing',
        200
      );
    });
  });

  describe('Event Handlers - Recording State', () => {
    beforeEach(() => {
      handler.initialize();
    });

    it('should handle ui:recording-state active event', () => {
      subscribedHandlers['ui:recording-state']({ active: true });

      expect(mockUiController.elements.recordBtn.classList.add).toHaveBeenCalledWith('recording');
    });

    it('should handle ui:recording-state inactive event', () => {
      subscribedHandlers['ui:recording-state']({ active: false });

      expect(mockUiController.elements.recordBtn.classList.remove).toHaveBeenCalledWith('recording');
    });
  });

  describe('Event Handlers - Cinematic Mode (Gated by Streaming)', () => {
    let mockBodyClassList;

    beforeEach(() => {
      handler.initialize();

      // Mock document.body.classList
      mockBodyClassList = {
        add: vi.fn(),
        remove: vi.fn()
      };
      Object.defineProperty(document.body, 'classList', {
        value: mockBodyClassList,
        writable: true,
        configurable: true
      });
    });

    it('should not apply cinematic CSS when enabled but not streaming', () => {
      subscribedHandlers['ui:cinematic-mode']({ enabled: true });

      expect(mockBodyClassList.add).not.toHaveBeenCalled();
      expect(mockBodyClassList.remove).toHaveBeenCalledWith('cinematic-active');
    });

    it('should apply cinematic CSS when enabled and streaming', () => {
      subscribedHandlers['ui:streaming-mode']({ enabled: true });
      mockBodyClassList.add.mockClear();

      subscribedHandlers['ui:cinematic-mode']({ enabled: true });

      expect(mockBodyClassList.add).toHaveBeenCalledWith('cinematic-active');
    });

    it('should remove cinematic CSS when streaming stops', () => {
      subscribedHandlers['ui:streaming-mode']({ enabled: true });
      subscribedHandlers['ui:cinematic-mode']({ enabled: true });
      mockBodyClassList.remove.mockClear();

      subscribedHandlers['ui:streaming-mode']({ enabled: false });

      expect(mockBodyClassList.remove).toHaveBeenCalledWith('cinematic-active');
    });

    it('should apply cinematic CSS when streaming starts with cinematic already enabled', () => {
      subscribedHandlers['ui:cinematic-mode']({ enabled: true });
      mockBodyClassList.add.mockClear();

      subscribedHandlers['ui:streaming-mode']({ enabled: true });

      expect(mockBodyClassList.add).toHaveBeenCalledWith('cinematic-active');
    });

    it('should remove cinematic CSS when disabling cinematic mode while streaming', () => {
      subscribedHandlers['ui:streaming-mode']({ enabled: true });
      subscribedHandlers['ui:cinematic-mode']({ enabled: true });
      mockBodyClassList.remove.mockClear();

      subscribedHandlers['ui:cinematic-mode']({ enabled: false });

      expect(mockBodyClassList.remove).toHaveBeenCalledWith('cinematic-active');
    });

    it('should update internal cinematic state', () => {
      subscribedHandlers['ui:cinematic-mode']({ enabled: true });

      expect(handler._cinematicModeEnabled).toBe(true);
    });
  });

  describe('Event Handlers - Fullscreen', () => {
    beforeEach(() => {
      handler.initialize();
    });

    it('should handle ui:fullscreen-state event', () => {
      subscribedHandlers['ui:fullscreen-state']({ active: true });

      expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(true);
    });
  });

  describe('dispose', () => {
    it('should call all unsubscribe functions', () => {
      handler.initialize();

      const unsubscribeFns = handler._subscriptions;
      handler.dispose();

      unsubscribeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should clear subscriptions array', () => {
      handler.initialize();
      handler.dispose();

      expect(handler._subscriptions).toEqual([]);
    });

    it('should log disposal', () => {
      handler.initialize();
      handler.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('UIEventHandler disposed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing deviceStatus gracefully', () => {
      const handlerWithoutDeviceStatus = new UIEventHandler({
        eventBus: mockEventBus,
        uiController: { ...mockUiController, deviceStatus: null },
        appState: mockAppState,
        loggerFactory: mockLoggerFactory
      });
      handlerWithoutDeviceStatus.initialize();

      // Should not throw
      expect(() => {
        subscribedHandlers['ui:overlay-visible']({ visible: true });
      }).not.toThrow();
    });

    it('should handle missing recordBtn gracefully', () => {
      const handlerWithoutRecordBtn = new UIEventHandler({
        eventBus: mockEventBus,
        appState: mockAppState,
        uiController: { ...mockUiController, elements: {} },
        loggerFactory: mockLoggerFactory
      });
      handlerWithoutRecordBtn.initialize();

      // Should not throw
      expect(() => {
        subscribedHandlers['ui:recording-state']({ active: true });
      }).not.toThrow();
    });

    it('should use console as fallback logger', () => {
      const handlerWithoutLogger = new UIEventHandler({
        eventBus: mockEventBus,
        uiController: mockUiController,
        appState: mockAppState,
        loggerFactory: null
      });

      expect(handlerWithoutLogger.logger).toBe(console);
    });

    it('should handle missing appState gracefully', () => {
      const handlerWithoutAppState = new UIEventHandler({
        eventBus: mockEventBus,
        uiController: mockUiController,
        appState: null,
        loggerFactory: mockLoggerFactory
      });

      handlerWithoutAppState.initialize();

      // Should default to cinematic enabled, streaming false
      expect(handlerWithoutAppState._cinematicModeEnabled).toBe(true);
      expect(handlerWithoutAppState._isStreaming).toBe(false);
    });
  });
});
