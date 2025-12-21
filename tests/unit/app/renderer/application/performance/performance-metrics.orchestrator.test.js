/**
 * PerformanceMetricsOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceMetricsOrchestrator } from '@app/renderer/application/performance/performance-metrics.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('PerformanceMetricsOrchestrator', () => {
  let orchestrator;
  let mockEventBus;
  let mockLogger;
  let mockPerformanceMetricsService;
  let handlers;

  beforeEach(() => {
    handlers = {};
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn((channel, handler) => {
        handlers[channel] = handler;
        return vi.fn();
      })
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockPerformanceMetricsService = {
      requestSnapshot: vi.fn(),
      startPeriodicSnapshots: vi.fn(),
      stopPeriodicSnapshots: vi.fn(),
      clearPendingRequests: vi.fn()
    };

    orchestrator = new PerformanceMetricsOrchestrator({
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) },
      performanceMetricsService: mockPerformanceMetricsService
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with required dependencies', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.performanceMetricsService).toBe(mockPerformanceMetricsService);
    });

    it('should throw if missing performanceMetricsService', () => {
      expect(() => new PerformanceMetricsOrchestrator({
        eventBus: mockEventBus,
        loggerFactory: { create: vi.fn(() => mockLogger) }
      })).toThrow();
    });
  });

  describe('onInitialize', () => {
    it('should subscribe to MEMORY_SNAPSHOT_REQUESTED event', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED,
        expect.any(Function)
      );
    });

    it('should forward snapshot requests to service', async () => {
      await orchestrator.onInitialize();

      const payload = { label: 'test', delayMs: 500 };
      handlers[EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED](payload);

      expect(mockPerformanceMetricsService.requestSnapshot).toHaveBeenCalledWith(payload);
    });

    it('should start periodic snapshots in dev mode', async () => {
      const originalEnv = import.meta.env.DEV;
      import.meta.env.DEV = true;

      await orchestrator.onInitialize();

      expect(mockPerformanceMetricsService.startPeriodicSnapshots).toHaveBeenCalled();

      import.meta.env.DEV = originalEnv;
    });

    it('should not start periodic snapshots in production mode', async () => {
      const originalEnv = import.meta.env.DEV;
      import.meta.env.DEV = false;

      await orchestrator.onInitialize();

      expect(mockPerformanceMetricsService.startPeriodicSnapshots).not.toHaveBeenCalled();

      import.meta.env.DEV = originalEnv;
    });
  });

  describe('onCleanup', () => {
    it('should stop periodic snapshots', async () => {
      await orchestrator.onInitialize();
      await orchestrator.onCleanup();

      expect(mockPerformanceMetricsService.stopPeriodicSnapshots).toHaveBeenCalled();
    });

    it('should clear pending requests', async () => {
      await orchestrator.onInitialize();
      await orchestrator.onCleanup();

      expect(mockPerformanceMetricsService.clearPendingRequests).toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should handle snapshot request with label only', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]({ label: 'before render' });

      expect(mockPerformanceMetricsService.requestSnapshot).toHaveBeenCalledWith({
        label: 'before render'
      });
    });

    it('should handle snapshot request with delay', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]({
        label: 'after cleanup',
        delayMs: 1000
      });

      expect(mockPerformanceMetricsService.requestSnapshot).toHaveBeenCalledWith({
        label: 'after cleanup',
        delayMs: 1000
      });
    });

    it('should handle empty payload', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]({});

      expect(mockPerformanceMetricsService.requestSnapshot).toHaveBeenCalledWith({});
    });
  });
});
