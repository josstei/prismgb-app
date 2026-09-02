/**
 * TranscodeUIBridge Unit Tests
 * Bridges transcode lifecycle events to record-button feedback. Toast display now
 * lives in TranscodeProgressStore; this bridge only republishes RECORD_BUTTON_* events.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import { EventChannels } from '@platform/events';
import { createEventBus } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('TranscodeUIBridge', () => {
  let bridge;
  let mockEventBus;
  let mockLogger;
  let subscribedHandlers;

  beforeEach(() => {
    subscribedHandlers = {};
    const h = createInjectableHarness(TranscodeUIBridge, {
      overrides: {
        eventBus: createEventBus({
          onSubscribe: (event, handlerFn) => {
            subscribedHandlers[event] = handlerFn;
          },
        })
      }
    });
    bridge = h.subject;
    mockLogger = h.logger;
    ({ eventBus: mockEventBus } = h.deps);
  });

  describe('initialize', () => {
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

    it('should log disposal', async () => {
      bridge.initialize();
      await bridge.dispose();
      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeUIBridge disposed');
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
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
    it('should not throw when disposing before initialization', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect(bridge.disposables.size).toBe(0);
    });
  });
});
