// @ts-nocheck
/**
 * TranscodeUIBridge Unit Tests
 * Bridges transcode lifecycle events to record-button feedback. Toast display now
 * lives in TranscodeProgressStore; this bridge only republishes RECORD_BUTTON_* events.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import { EventChannels } from '@platform/events';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';

describe('TranscodeUIBridge', () => {
  let bridge;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let subscribedHandlers;

  const createBridge = () =>
    new TranscodeUIBridge({ eventBus: mockEventBus, loggerFactory: mockLoggerFactory });

  beforeEach(() => {
    subscribedHandlers = {};
    mockEventBus = createEventBus({
      onSubscribe: (event, handlerFn) => {
        subscribedHandlers[event] = handlerFn;
      },
    });
    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory.create('TranscodeUIBridge');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store eventBus', () => {
      bridge = createBridge();
      expect(bridge.eventBus).toBe(mockEventBus);
    });

    it('should create logger from loggerFactory', () => {
      bridge = createBridge();
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TranscodeUIBridge');
      expect(bridge.logger).toBe(mockLogger);
    });

    it('should initialize disposables bag', () => {
      bridge = createBridge();
      expect(bridge.disposables).toBeDefined();
      expect(bridge.disposables.size).toBe(0);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      bridge = createBridge();
    });

    it('should subscribe to the transcode lifecycle events', () => {
      bridge.initialize();
      const expectedEvents = [
        EventChannels.TRANSCODE.STARTED,
        EventChannels.TRANSCODE.COMPLETED,
        EventChannels.TRANSCODE.ERROR,
        EventChannels.TRANSCODE.CANCELLED
      ];
      expectedEvents.forEach(event => {
        expect(mockEventBus.subscribe).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should subscribe to exactly 4 events', () => {
      bridge.initialize();
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(4);
    });

    it('should store unsubscribe functions in disposables bag', () => {
      bridge.initialize();
      expect(bridge.disposables.size).toBe(4);
    });

    it('should log initialization', () => {
      bridge.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeUIBridge initialized');
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      bridge = createBridge();
    });

    it('should call all unsubscribe functions on dispose', async () => {
      const unsubscribers = [];
      mockEventBus.subscribe.mockImplementation(() => {
        const unsub = vi.fn();
        unsubscribers.push(unsub);
        return unsub;
      });

      bridge.initialize();
      await bridge.dispose();

      expect(unsubscribers.length).toBe(4);
      unsubscribers.forEach(unsub => {
        expect(unsub).toHaveBeenCalled();
      });
    });

    it('should clear disposables bag on dispose', async () => {
      bridge.initialize();
      await bridge.dispose();
      expect(bridge.disposables.size).toBe(0);
    });

    it('should log disposal', async () => {
      bridge.initialize();
      await bridge.dispose();
      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeUIBridge disposed');
    });

    it('should work when called multiple times', async () => {
      bridge.initialize();
      await bridge.dispose();
      await expect(bridge.dispose()).resolves.not.toThrow();
      expect(bridge.disposables.size).toBe(0);
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
      bridge = createBridge();
      bridge.initialize();
    });

    it('should log and disable the record button on start', () => {
      subscribedHandlers[EventChannels.TRANSCODE.STARTED]({ format: 'mp4' });
      expect(mockLogger.info).toHaveBeenCalledWith('Transcode started', { format: 'mp4' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_DISABLED);
    });

    it('should log and re-enable the record button on completion', () => {
      subscribedHandlers[EventChannels.TRANSCODE.COMPLETED]({ outputPath: '/path/file.mp4' });
      expect(mockLogger.info).toHaveBeenCalledWith('Transcode completed', { outputPath: '/path/file.mp4' });
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
    });

    it('should log and re-enable the record button on error', () => {
      const errorData = { message: 'FFmpeg crashed' };
      subscribedHandlers[EventChannels.TRANSCODE.ERROR](errorData);
      expect(mockLogger.error).toHaveBeenCalledWith('Transcode error', errorData);
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
    });

    it('should log and re-enable the record button on cancellation', () => {
      subscribedHandlers[EventChannels.TRANSCODE.CANCELLED]();
      expect(mockLogger.info).toHaveBeenCalledWith('Transcode cancelled');
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.RECORD_BUTTON_ENABLED);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      bridge = createBridge();
    });

    it('should not throw when disposing before initialization', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect(bridge.disposables.size).toBe(0);
    });
  });
});
