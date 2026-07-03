// @ts-nocheck
/**
 * UIEventBridge Unit Tests
 * Tests the event bridge between EventBus and UIController
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import { EventChannels } from '@platform/events';
import {
  createEventBus,
  createLoggerFactory,
  createUIEventBridgeControllerMock,
  createPresentationModeServiceMock
} from '../../../../factories/index.js';

describe('UIEventBridge', () => {
  let handler;
  let mockEventBus;
  let mockUiController;
  let mockPresentationModeService;
  let mockLogger;
  let mockLoggerFactory;
  let subscribedHandlers;

  beforeEach(() => {
    subscribedHandlers = {};

    mockEventBus = createEventBus({
      onSubscribe: (event, handlerFn) => {
        subscribedHandlers[event] = handlerFn;
      },
    });

    mockUiController = createUIEventBridgeControllerMock();

    mockPresentationModeService = createPresentationModeServiceMock();

    mockLoggerFactory = createLoggerFactory();

    handler = new UIEventBridge(
      mockEventBus,
      mockUiController,
      mockPresentationModeService,
      mockLoggerFactory
    );
    mockLogger = mockLoggerFactory._getLogger('UIEventBridge');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store dependencies', () => {
      expect(handler.eventBus).toBe(mockEventBus);
      expect(handler.uiController).toBe(mockUiController);
      expect(handler.presentationModeService).toBe(mockPresentationModeService);
    });

    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('UIEventBridge');
      expect(handler.logger).toBe(mockLogger);
    });

    it('should initialize disposables bag', () => {
      expect(handler.disposables).toBeDefined();
      expect(handler.disposables.size).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should subscribe to all UI events', () => {
      handler.initialize();

      const expectedEvents = [
        EventChannels.UI.STREAMING_MODE,
        EventChannels.UI.SHUTTER_FLASH,
        EventChannels.UI.RECORD_BUTTON_POP,
        EventChannels.UI.RECORD_BUTTON_PRESS,
        EventChannels.UI.BUTTON_FEEDBACK,
        EventChannels.UI.RECORDING_STATE,
        EventChannels.UI.RECORD_BUTTON_DISABLED,
        EventChannels.UI.RECORD_BUTTON_ENABLED,
        EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
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


    it('routes streaming mode changes to presentation service', () => {
      subscribedHandlers[EventChannels.UI.STREAMING_MODE]({ enabled: true });

      expect(mockPresentationModeService.handleStreamingMode).toHaveBeenCalledWith(true);
    });

    it('ignores invalid streaming mode payloads', () => {
      subscribedHandlers[EventChannels.UI.STREAMING_MODE]({ enabled: 'true' });

      expect(mockPresentationModeService.handleStreamingMode).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Ignoring invalid streaming mode payload');
    });


    it('routes visual effects events', () => {
      subscribedHandlers[EventChannels.UI.SHUTTER_FLASH]();
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_POP]();
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_PRESS]();

      expect(mockUiController.triggerShutterFlash).toHaveBeenCalled();
      expect(mockUiController.triggerRecordButtonPop).toHaveBeenCalled();
      expect(mockUiController.triggerRecordButtonPress).toHaveBeenCalled();
    });

    it('routes button feedback events', () => {
      subscribedHandlers[EventChannels.UI.BUTTON_FEEDBACK]({
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

    it('routes recording state updates', () => {
      subscribedHandlers[EventChannels.UI.RECORDING_STATE]({ active: true });

      expect(mockUiController.updateRecordingButtonState).toHaveBeenCalledWith(true);
    });

    it('ignores invalid recording state payloads', () => {
      subscribedHandlers[EventChannels.UI.RECORDING_STATE]({ active: 'true' });

      expect(mockUiController.updateRecordingButtonState).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Ignoring invalid recording state payload');
    });

    it('disables and enables record button when requested', () => {
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_DISABLED]();
      subscribedHandlers[EventChannels.UI.RECORD_BUTTON_ENABLED]();

      expect(mockUiController.setRecordButtonDisabled).toHaveBeenCalledWith(true);
      expect(mockUiController.setRecordButtonDisabled).toHaveBeenCalledWith(false);
    });

    it('publishes a status message on cinematic mode changes', () => {
      subscribedHandlers[EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED]({ enabled: true });

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Cinematic mode enabled'
      });
    });

    it('routes fullscreen state changes to presentation service', () => {
      subscribedHandlers[EventChannels.UI.FULLSCREEN_STATE]({ active: true });

      expect(mockPresentationModeService.handleFullscreenState).toHaveBeenCalledWith(true);
    });
  });

  describe('dispose', () => {
    it('should call all unsubscribe functions', () => {
      handler.initialize();

      const unsubscribeFns = mockEventBus.subscribe.mock.results.map(r => r.value);
      handler.dispose();

      unsubscribeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should clear subscriptions array', () => {
      handler.initialize();
      handler.dispose();

      expect(handler.disposables.size).toBe(0);
    });

    it('should log disposal', () => {
      handler.initialize();
      handler.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('UIEventBridge disposed');
    });
  });
});
