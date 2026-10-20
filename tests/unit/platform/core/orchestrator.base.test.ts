import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseOrchestrator, type Logger, type LoggerFactory } from '@platform/core';
import { createLoggerFactory } from '../../../factories/index.js';

class TestOrchestrator extends BaseOrchestrator {
  onInitializeCalls = 0;
  onCleanupCalls = 0;

  constructor(loggerFactory: LoggerFactory, name = 'TestOrchestrator') {
    super(loggerFactory, name);
  }

  override async onInitialize(): Promise<void> {
    this.onInitializeCalls += 1;
  }

  override async onCleanup(): Promise<void> {
    this.onCleanupCalls += 1;
  }
}

describe('BaseOrchestrator', () => {
  let loggerFactory: ReturnType<typeof createLoggerFactory>;
  let logger: Logger;

  beforeEach(() => {
    loggerFactory = createLoggerFactory();
    logger = loggerFactory.create('TestOrchestrator');
  });

  describe('initialize', () => {
    it('runs onInitialize and logs the lifecycle', async () => {
      const orchestrator = new TestOrchestrator(loggerFactory);

      expect(orchestrator.isInitialized).toBe(false);
      await orchestrator.initialize();

      expect(orchestrator.isInitialized).toBe(true);
      expect(orchestrator.onInitializeCalls).toBe(1);
      expect(logger.info).toHaveBeenCalledWith('Initializing TestOrchestrator');
      expect(logger.info).toHaveBeenCalledWith('TestOrchestrator initialized');
    });

    it('warns and returns early when already initialized', async () => {
      const orchestrator = new TestOrchestrator(loggerFactory);

      await orchestrator.initialize();
      await orchestrator.initialize();

      expect(orchestrator.onInitializeCalls).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith('TestOrchestrator already initialized');
    });

    it('logs and rethrows initialization failures', async () => {
      const failure = new Error('boom');
      class FailingOrchestrator extends TestOrchestrator {
        override async onInitialize(): Promise<void> {
          throw failure;
        }
      }
      const orchestrator = new FailingOrchestrator(loggerFactory);

      await expect(orchestrator.initialize()).rejects.toBe(failure);
      expect(orchestrator.isInitialized).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('TestOrchestrator initialization failed', failure);
    });
  });

  describe('cleanup', () => {
    it('runs onCleanup, disposes tracked resources and resets isInitialized', async () => {
      const orchestrator = new TestOrchestrator(loggerFactory);
      const tracked = vi.fn();
      orchestrator.disposables.add(tracked);

      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(orchestrator.isInitialized).toBe(false);
      expect(orchestrator.onCleanupCalls).toBe(1);
      expect(tracked).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Cleaning up TestOrchestrator');
    });

    it('runs onCleanup only once when onCleanup re-enters cleanup', async () => {
      class ReentrantOrchestrator extends TestOrchestrator {
        override async onCleanup(): Promise<void> {
          this.onCleanupCalls += 1;
          if (this.onCleanupCalls <= 5) {
            await this.cleanup();
          }
        }
      }
      const orchestrator = new ReentrantOrchestrator(loggerFactory);

      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(orchestrator.onCleanupCalls).toBe(1);
    });

    it('skips a second cleanup', async () => {
      const orchestrator = new TestOrchestrator(loggerFactory);

      await orchestrator.initialize();
      await orchestrator.cleanup();
      await orchestrator.cleanup();

      expect(orchestrator.onCleanupCalls).toBe(1);
      expect(logger.debug).toHaveBeenCalledWith('TestOrchestrator already cleaned up');
    });

    it('logs onCleanup and disposal failures without throwing', async () => {
      const cleanupFailure = new Error('cleanup');
      const disposeFailure = new Error('dispose');
      class FailingOrchestrator extends TestOrchestrator {
        override async onCleanup(): Promise<void> {
          throw cleanupFailure;
        }
      }
      const orchestrator = new FailingOrchestrator(loggerFactory);
      orchestrator.disposables.add(() => {
        throw disposeFailure;
      });

      await orchestrator.initialize();
      await expect(orchestrator.cleanup()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith('TestOrchestrator cleanup failed', cleanupFailure);
      expect(logger.error).toHaveBeenCalledWith('TestOrchestrator lifecycle cleanup failed', disposeFailure);
      expect(orchestrator.isInitialized).toBe(false);
    });

    it('can initialize again after cleanup', async () => {
      const orchestrator = new TestOrchestrator(loggerFactory);

      await orchestrator.initialize();
      await orchestrator.cleanup();
      await orchestrator.initialize();

      expect(orchestrator.isInitialized).toBe(true);
      expect(orchestrator.onInitializeCalls).toBe(2);
    });
  });
});
