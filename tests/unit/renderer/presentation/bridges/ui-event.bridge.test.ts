import { createEventBus } from '../../../../factories/event-bus.factory.js';
import { createUIEventBridgeControllerMock } from '../../../../factories/ui.factory.js';
import { createLoggerFactory } from '../../../../factories/logger.factory.js';
/**
 * UIEventBridge Unit Tests
 * Tests the event bridge between EventBus and UIController
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import { EventChannels } from '@platform/events';
import { createServiceHarness } from '../../../../support/service.harness.js';

describe('UIEventBridge', () => {
  let handler;
  let mockEventBus;
  let mockUiController;
  let mockLogger;
  let mockLoggerFactory;
  let subscribedHandlers;

  beforeEach(() => {
    subscribedHandlers = {};

    const h = createServiceHarness(UIEventBridge, {
      loggerFactory: createLoggerFactory(),
      eventBus: createEventBus({
          onSubscribe: (event, handlerFn) => {
            subscribedHandlers[event] = handlerFn;
          },
        }),
      uiController: createUIEventBridgeControllerMock()
    });
    handler = h.subject;
    mockLogger = h.logger;
    ({
      eventBus: mockEventBus,
      uiController: mockUiController,
      loggerFactory: mockLoggerFactory
    } = h.deps);
  });

  describe('Constructor', () => {
    it('should store dependencies', () => {
      expect(handler.eventBus).toBe(mockEventBus);
      expect(handler.uiController).toBe(mockUiController);
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

    it('routes streaming mode changes to UI controller', () => {
      subscribedHandlers[EventChannels.UI.STREAMING_MODE]({ enabled: true });

      expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(true);
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

    it('routes fullscreen state changes to UI controller', () => {
      subscribedHandlers[EventChannels.UI.FULLSCREEN_STATE]({ active: true });

      expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(true);
      expect(mockUiController.enableControlsAutoHide).toHaveBeenCalledOnce();
      subscribedHandlers[EventChannels.UI.FULLSCREEN_STATE]({ active: false });
      expect(mockUiController.updateFullscreenButton).toHaveBeenLastCalledWith(false);
      expect(mockUiController.disableControlsAutoHide).toHaveBeenCalledOnce();
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
