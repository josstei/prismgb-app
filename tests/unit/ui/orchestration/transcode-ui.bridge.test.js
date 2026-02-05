/**
 * TranscodeUIBridge Unit Tests
 * Tests the event bridge between transcode events and UI feedback
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge.ts';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

describe('TranscodeUIBridge', () => {
  let bridge;
  let mockEventBus;
  let mockUIController;
  let mockTranscodeToast;
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

    // Create mock TranscodeToast
    mockTranscodeToast = {
      show: vi.fn(),
      updateProgress: vi.fn(),
      showSuccess: vi.fn(),
      showError: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn()
    };

    // Create mock UIController with registry
    mockUIController = {
      registry: {
        get: vi.fn((name) => {
          if (name === 'transcodeToastComponent') {
            return mockTranscodeToast;
          }
          return null;
        })
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

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store eventBus', () => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge.eventBus).toBe(mockEventBus);
    });

    it('should store uiController', () => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge.uiController).toBe(mockUIController);
    });

    it('should create logger from loggerFactory', () => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TranscodeUIBridge');
      expect(bridge.logger).toBe(mockLogger);
    });

    it('should throw when loggerFactory is missing', () => {
      expect(() => new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController
      })).toThrow(/Missing required dependencies.*loggerFactory/);
    });

    it('should initialize subscriptions array', () => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge._subscriptions).toEqual([]);
    });

    it('should initialize currentFormat as null', () => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge._currentFormat).toBeNull();
    });
  });

  describe('_toast getter', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should return toast from registry', () => {
      expect(bridge._toast).toBe(mockTranscodeToast);
    });

    it('should return undefined when registry is missing', () => {
      bridge.uiController = {};
      expect(bridge._toast).toBeUndefined();
    });

    it('should return undefined when uiController is null', () => {
      bridge.uiController = null;
      expect(bridge._toast).toBeUndefined();
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should subscribe to all transcode events', () => {
      bridge.initialize();

      const expectedEvents = [
        EventChannels.TRANSCODE.STARTED,
        EventChannels.TRANSCODE.PROGRESS,
        EventChannels.TRANSCODE.COMPLETED,
        EventChannels.TRANSCODE.ERROR,
        EventChannels.TRANSCODE.CANCELLED
      ];

      expectedEvents.forEach(event => {
        expect(mockEventBus.subscribe).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should subscribe to exactly 5 events', () => {
      bridge.initialize();
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(5);
    });

    it('should store unsubscribe functions', () => {
      bridge.initialize();

      expect(bridge._subscriptions.length).toBe(5);
      bridge._subscriptions.forEach(unsub => {
        expect(typeof unsub).toBe('function');
      });
    });

    it('should log initialization', () => {
      bridge.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeUIBridge initialized');
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should call all unsubscribe functions', () => {
      bridge.initialize();
      const unsubscribeFns = bridge._subscriptions;

      bridge.dispose();

      unsubscribeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should clear subscriptions array', () => {
      bridge.initialize();
      bridge.dispose();
      expect(bridge._subscriptions).toEqual([]);
    });

    it('should dispose toast component', () => {
      bridge.initialize();
      bridge.dispose();
      expect(mockTranscodeToast.dispose).toHaveBeenCalled();
    });

    it('should log disposal', () => {
      bridge.initialize();
      bridge.dispose();
      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeUIBridge disposed');
    });

    it('should handle non-function items in subscriptions array gracefully', () => {
      bridge.initialize();
      bridge._subscriptions.push(null, undefined, 'not-a-function');
      expect(() => bridge.dispose()).not.toThrow();
    });

    it('should work when called multiple times', () => {
      bridge.initialize();
      bridge.dispose();
      bridge.dispose();
      expect(bridge._subscriptions).toEqual([]);
    });

    it('should not throw when toast is unavailable', () => {
      mockUIController.registry.get = vi.fn().mockReturnValue(null);
      bridge.initialize();
      expect(() => bridge.dispose()).not.toThrow();
    });
  });

  describe('Event Handlers - Started', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should log transcode started', () => {
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mp4' });
      expect(mockLogger.info).toHaveBeenCalledWith('Transcode started', { format: 'mp4' });
    });

    it('should store current format in uppercase', () => {
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mp4' });
      expect(bridge._currentFormat).toBe('MP4');
    });

    it('should default to MP4 when format is missing', () => {
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({});
      expect(bridge._currentFormat).toBe('MP4');
    });

    it('should default to MP4 when data is undefined', () => {
      subscribedHandlers[EventChannels.TRANSCODE.STARTED](undefined);
      expect(bridge._currentFormat).toBe('MP4');
    });

    it('should disable record button', () => {
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mp4' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_DISABLED);
    });

    it('should show toast with format', () => {
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mov' });
      expect(mockTranscodeToast.show).toHaveBeenCalledWith('MOV');
    });

    it('should not throw when toast is unavailable', () => {
      mockUIController.registry.get = vi.fn().mockReturnValue(null);
      expect(() => {
        subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mp4' });
      }).not.toThrow();
    });
  });

  describe('Event Handlers - Progress', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should update toast progress', () => {
      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: 50 });
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(50);
    });

    it('should default to -1 when percent is missing', () => {
      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({});
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(-1);
    });

    it('should default to -1 when data is null', () => {
      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS](null);
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(-1);
    });

    it('should handle 0 percent correctly', () => {
      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: 0 });
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(0);
    });

    it('should handle 100 percent correctly', () => {
      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: 100 });
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should not throw when toast is unavailable', () => {
      mockUIController.registry.get = vi.fn().mockReturnValue(null);
      expect(() => {
        subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: 50 });
      }).not.toThrow();
    });
  });

  describe('Event Handlers - Completed', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
      // Simulate a started transcode
      bridge._currentFormat = 'MP4';
    });

    it('should log transcode completed', () => {
      subscribedHandlers[EventChannels.TRANSCODE.COMPLETED]({ outputPath: '/path/to/file.mp4' });
      expect(mockLogger.info).toHaveBeenCalledWith('Transcode completed', { outputPath: '/path/to/file.mp4' });
    });

    it('should re-enable record button', () => {
      subscribedHandlers[EventChannels.TRANSCODE.COMPLETED]({});
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
    });

    it('should show success on toast', () => {
      subscribedHandlers[EventChannels.TRANSCODE.COMPLETED]({});
      expect(mockTranscodeToast.showSuccess).toHaveBeenCalled();
    });

    it('should clear current format', () => {
      subscribedHandlers[EventChannels.TRANSCODE.COMPLETED]({});
      expect(bridge._currentFormat).toBeNull();
    });

    it('should not throw when toast is unavailable', () => {
      mockUIController.registry.get = vi.fn().mockReturnValue(null);
      expect(() => {
        subscribedHandlers[EventChannels.TRANSCODE.COMPLETED]({});
      }).not.toThrow();
    });
  });

  describe('Event Handlers - Error', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
      // Simulate a started transcode
      bridge._currentFormat = 'MP4';
    });

    it('should log transcode error', () => {
      const errorData = { message: 'FFmpeg crashed' };
      subscribedHandlers[EventChannels.TRANSCODE.ERROR](errorData);
      expect(mockLogger.error).toHaveBeenCalledWith('Transcode error', errorData);
    });

    it('should re-enable record button', () => {
      subscribedHandlers[EventChannels.TRANSCODE.ERROR]({ message: 'Error' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
    });

    it('should show error on toast with message', () => {
      subscribedHandlers[EventChannels.TRANSCODE.ERROR]({ message: 'FFmpeg crashed' });
      expect(mockTranscodeToast.showError).toHaveBeenCalledWith('FFmpeg crashed');
    });

    it('should use error property if message is missing', () => {
      subscribedHandlers[EventChannels.TRANSCODE.ERROR]({ error: 'Some error' });
      expect(mockTranscodeToast.showError).toHaveBeenCalledWith('Some error');
    });

    it('should default to generic error message', () => {
      subscribedHandlers[EventChannels.TRANSCODE.ERROR]({});
      expect(mockTranscodeToast.showError).toHaveBeenCalledWith('Conversion failed');
    });

    it('should clear current format', () => {
      subscribedHandlers[EventChannels.TRANSCODE.ERROR]({ message: 'Error' });
      expect(bridge._currentFormat).toBeNull();
    });

    it('should not throw when toast is unavailable', () => {
      mockUIController.registry.get = vi.fn().mockReturnValue(null);
      expect(() => {
        subscribedHandlers[EventChannels.TRANSCODE.ERROR]({ message: 'Error' });
      }).not.toThrow();
    });
  });

  describe('Event Handlers - Cancelled', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
      // Simulate a started transcode
      bridge._currentFormat = 'MP4';
    });

    it('should log transcode cancelled', () => {
      subscribedHandlers[EventChannels.TRANSCODE.CANCELLED]();
      expect(mockLogger.info).toHaveBeenCalledWith('Transcode cancelled');
    });

    it('should re-enable record button', () => {
      subscribedHandlers[EventChannels.TRANSCODE.CANCELLED]();
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
    });

    it('should hide toast', () => {
      subscribedHandlers[EventChannels.TRANSCODE.CANCELLED]();
      expect(mockTranscodeToast.hide).toHaveBeenCalled();
    });

    it('should clear current format', () => {
      subscribedHandlers[EventChannels.TRANSCODE.CANCELLED]();
      expect(bridge._currentFormat).toBeNull();
    });

    it('should not throw when toast is unavailable', () => {
      mockUIController.registry.get = vi.fn().mockReturnValue(null);
      expect(() => {
        subscribedHandlers[EventChannels.TRANSCODE.CANCELLED]();
      }).not.toThrow();
    });
  });

  describe('Integration - Full Workflow', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should handle complete successful transcode workflow', () => {
      // Start transcode
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mp4' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_DISABLED);
      expect(mockTranscodeToast.show).toHaveBeenCalledWith('MP4');

      // Progress updates
      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: 25 });
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(25);

      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: 50 });
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(50);

      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: 100 });
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(100);

      // Complete
      subscribedHandlers[EventChannels.TRANSCODE.COMPLETED]({ outputPath: '/path/to/file.mp4' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
      expect(mockTranscodeToast.showSuccess).toHaveBeenCalled();
    });

    it('should handle transcode error workflow', () => {
      // Start transcode
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mov' });
      expect(bridge._currentFormat).toBe('MOV');

      // Error occurs
      subscribedHandlers[EventChannels.TRANSCODE.ERROR]({ message: 'Encoder failure' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
      expect(mockTranscodeToast.showError).toHaveBeenCalledWith('Encoder failure');
      expect(bridge._currentFormat).toBeNull();
    });

    it('should handle transcode cancellation workflow', () => {
      // Start transcode
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'webm' });

      // User cancels
      subscribedHandlers[EventChannels.TRANSCODE.CANCELLED]();
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
      expect(mockTranscodeToast.hide).toHaveBeenCalled();
      expect(bridge._currentFormat).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      bridge = new TranscodeUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should not throw when disposing before initialization', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect(bridge._subscriptions).toEqual([]);
    });

    it('should handle indeterminate progress (-1)', () => {
      bridge.initialize();
      subscribedHandlers[EventChannels.TRANSCODE.PROGRESS]({ percent: -1 });
      expect(mockTranscodeToast.updateProgress).toHaveBeenCalledWith(-1);
    });
  });
});
