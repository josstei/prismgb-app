/**
 * UIEventBridge Unit Tests
 * Tests the event bridge between EventBus and UIController
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge.ts';
import { EventChannels } from '@renderer/common/config/event-channels';

describe('UIEventBridge', () => {
  let handler;
  let mockEventBus;
  let mockUiController;
  let mockUiEffects;
  let mockPresentationModeService;
  let mockLogger;
  let mockLoggerFactory;
  let subscribedHandlers;

  beforeEach(() => {
    subscribedHandlers = {};

    mockEventBus = {
      subscribe: vi.fn((event, handlerFn) => {
        subscribedHandlers[event] = handlerFn;
        return vi.fn();
      }),
      publish: vi.fn()
    };

    mockUiController = {
      updateStatusMessage: vi.fn(),
      updateDeviceStatus: vi.fn(),
      updateOverlayMessage: vi.fn(),
      showErrorOverlay: vi.fn(),
      updateStreamInfo: vi.fn(),
      updateRecordingButtonState: vi.fn(),
      setRecordButtonDisabled: vi.fn(),
      deviceStatus: {
        setOverlayVisible: vi.fn()
      }
    };

    mockUiEffects = {
      triggerShutterFlash: vi.fn(),
      triggerRecordButtonPop: vi.fn(),
      triggerRecordButtonPress: vi.fn(),
      triggerButtonFeedback: vi.fn()
    };

    mockPresentationModeService = {
      handleStreamingMode: vi.fn(),
      handleCinematicModeChanged: vi.fn(),
      handleMinimalistFullscreenChanged: vi.fn(),
      handleFullscreenState: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    handler = new UIEventBridge({
      eventBus: mockEventBus,
      uiController: mockUiController,
      uiEffects: mockUiEffects,
      presentationModeService: mockPresentationModeService,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store dependencies', () => {
      expect(handler.eventBus).toBe(mockEventBus);
      expect(handler.uiController).toBe(mockUiController);
      expect(handler.uiEffects).toBe(mockUiEffects);
      expect(handler.presentationModeService).toBe(mockPresentationModeService);
    });

    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UIEventBridge');
      expect(handler.logger).toBe(mockLogger);
    });

    it('should initialize subscriptions array', () => {
      expect(handler._subscriptions).toEqual([]);
    });
  });

  describe('initialize', () => {
    it('should subscribe to all UI events', () => {
      handler.initialize();

      const expectedEvents = [
        EventChannels.UI.STATUS_MESSAGE,
        EventChannels.UI.DEVICE_STATUS,
        EventChannels.UI.OVERLAY_MESSAGE,
        EventChannels.UI.OVERLAY_VISIBLE,
        EventChannels.UI.OVERLAY_ERROR,
        EventChannels.UI.STREAMING_MODE,
        EventChannels.UI.STREAM_INFO,
        EventChannels.UI.SHUTTER_FLASH,
        EventChannels.UI.RECORD_BUTTON_POP,
        EventChannels.UI.RECORD_BUTTON_PRESS,
        EventChannels.UI.BUTTON_FEEDBACK,
        EventChannels.UI.RECORDING_STATE,
        EventChannels.UI.RECORD_BUTTON_DISABLED,
        EventChannels.UI.RECORD_BUTTON_ENABLED,
        EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
        EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED,
        EventChannels.UI.FULLSCREEN_STATE
      ];

      expectedEvents.forEach(event => {
        expect(mockEventBus.subscribe).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should log initialization', () => {
      handler.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('UIEventBridge initialized');
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
      handler.initialize();
    });

    it('routes status messages to UIController', () => {
      subscribedHandlers[EventChannels.UI.STATUS_MESSAGE]({ message: 'Test message', type: 'error' });

      expect(mockUiController.updateStatusMessage).toHaveBeenCalledWith('Test message', 'error');
    });

    it('defaults status message type to info', () => {
      subscribedHandlers[EventChannels.UI.STATUS_MESSAGE]({ message: 'Test message' });

      expect(mockUiController.updateStatusMessage).toHaveBeenCalledWith('Test message', 'info');
    });

    it('routes device status updates', () => {
      const status = { connected: true };
      subscribedHandlers[EventChannels.UI.DEVICE_STATUS]({ status });

      expect(mockUiController.updateDeviceStatus).toHaveBeenCalledWith(status);
    });

    it('routes overlay message updates', () => {
      subscribedHandlers[EventChannels.UI.OVERLAY_MESSAGE]({ deviceConnected: true });

      expect(mockUiController.updateOverlayMessage).toHaveBeenCalledWith(true);
    });

    it('routes overlay visibility updates', () => {
      subscribedHandlers[EventChannels.UI.OVERLAY_VISIBLE]({ visible: true });

      expect(mockUiController.deviceStatus.setOverlayVisible).toHaveBeenCalledWith(true);
    });

    it('routes overlay errors', () => {
      subscribedHandlers[EventChannels.UI.OVERLAY_ERROR]({ message: 'Error occurred' });

      expect(mockUiController.showErrorOverlay).toHaveBeenCalledWith('Error occurred');
    });

    it('routes streaming mode changes to presentation service', () => {
      subscribedHandlers[EventChannels.UI.STREAMING_MODE]({ enabled: true });

      expect(mockPresentationModeService.handleStreamingMode).toHaveBeenCalledWith(true);
    });

    it('routes stream info updates', () => {
      const settings = { width: 640, height: 480 };
      subscribedHandlers[EventChannels.UI.STREAM_INFO]({ settings });

      expect(mockUiController.updateStreamInfo).toHaveBeenCalledWith(settings);
    });

    it('routes visual effects events', () => {
      subscribedHandlers[EventChannels.UI.SHUTTER_FLASH]();
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_POP]();
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_PRESS]();

      expect(mockUiEffects.triggerShutterFlash).toHaveBeenCalled();
      expect(mockUiEffects.triggerRecordButtonPop).toHaveBeenCalled();
      expect(mockUiEffects.triggerRecordButtonPress).toHaveBeenCalled();
    });

    it('routes button feedback events', () => {
      subscribedHandlers[EventChannels.UI.BUTTON_FEEDBACK]({
        elementKey: 'screenshotBtn',
        className: 'capturing',
        duration: 200
      });

      expect(mockUiEffects.triggerButtonFeedback).toHaveBeenCalledWith(
        'screenshotBtn',
        'capturing',
        200
      );
    });

    it('routes recording state updates', () => {
      subscribedHandlers[EventChannels.UI.RECORDING_STATE]({ active: true });

      expect(mockUiController.updateRecordingButtonState).toHaveBeenCalledWith(true);
    });

    it('disables and enables record button when requested', () => {
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_DISABLED]();
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_ENABLED]();

      expect(mockUiController.setRecordButtonDisabled).toHaveBeenCalledWith(true);
      expect(mockUiController.setRecordButtonDisabled).toHaveBeenCalledWith(false);
    });

    it('routes cinematic mode changes to presentation service', () => {
      subscribedHandlers[EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED]({ enabled: true });

      expect(mockPresentationModeService.handleCinematicModeChanged).toHaveBeenCalledWith(true);
      expect(mockUiController.updateStatusMessage).toHaveBeenCalledWith('Cinematic mode enabled');
    });

    it('routes minimalist fullscreen changes to presentation service', () => {
      subscribedHandlers[EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED](true);

      expect(mockPresentationModeService.handleMinimalistFullscreenChanged).toHaveBeenCalledWith(true);
    });

    it('routes fullscreen state changes to presentation service', () => {
      subscribedHandlers[EventChannels.UI.FULLSCREEN_STATE]({ active: true });

      expect(mockPresentationModeService.handleFullscreenState).toHaveBeenCalledWith(true);
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

      expect(mockLogger.info).toHaveBeenCalledWith('UIEventBridge disposed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing deviceStatus gracefully', () => {
      const handlerWithoutDeviceStatus = new UIEventBridge({
        eventBus: mockEventBus,
        uiController: { ...mockUiController, deviceStatus: null },
        uiEffects: mockUiEffects,
        presentationModeService: mockPresentationModeService,
        loggerFactory: mockLoggerFactory
      });
      handlerWithoutDeviceStatus.initialize();

      expect(() => {
        subscribedHandlers[EventChannels.UI.OVERLAY_VISIBLE]({ visible: true });
      }).not.toThrow();
    });

    it('should throw when loggerFactory is missing (undefined)', () => {
      expect(() => new UIEventBridge({
        eventBus: mockEventBus,
        uiController: mockUiController,
        uiEffects: mockUiEffects,
        presentationModeService: mockPresentationModeService
      })).toThrow(/Missing required dependencies.*loggerFactory/);
    });
  });
});
