/**
 * BaseOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseOrchestrator, type LoggerFactoryLike, type LoggerLike } from '@platform/core';
import { createLoggerFactory } from '../../../factories/index.js';

type MockLoggerFactory = LoggerFactoryLike & ReturnType<typeof createLoggerFactory>;
type OrchestratorDependencies = {
  loggerFactory?: MockLoggerFactory;
  eventBus?: object;
};
type InjectedOrchestratorShape = {
  loggerFactory?: MockLoggerFactory;
  logger?: LoggerLike;
  _orchestratorName: string;
};

describe('BaseOrchestrator', () => {
  let mockLoggerFactory: MockLoggerFactory;
  let mockLogger: LoggerLike;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory() as MockLoggerFactory;
    mockLogger = mockLoggerFactory.create('TestOrchestrator');
  });

  describe('Constructor', () => {
    it('should create orchestrator with valid dependencies', () => {
      const orchestrator = new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory, eventBus: {} },
        'TestOrchestrator'
      );
      const injected = orchestrator as unknown as InjectedOrchestratorShape;

      expect(injected.loggerFactory).toBe(mockLoggerFactory);
      expect(injected.logger).toBe(mockLogger);
      expect(orchestrator.isInitialized).toBe(false);
    });

    it('should use constructor name if name not provided', () => {
      class MyOrchestrator extends BaseOrchestrator {
        constructor(deps: OrchestratorDependencies) {
          super(deps);
        }
      }

      const orchestrator = new MyOrchestrator({ loggerFactory: mockLoggerFactory });

      expect((orchestrator as unknown as InjectedOrchestratorShape)._orchestratorName).toBe('MyOrchestrator');
    });

    it('should work without loggerFactory', () => {
      const orchestrator = new BaseOrchestrator(
        { eventBus: {} },
        'TestOrchestrator'
      );

      expect((orchestrator as unknown as InjectedOrchestratorShape).logger).toBeUndefined();
    });
  });

  describe('initialize', () => {
    it('should initialize and set isInitialized to true', async () => {
      const orchestrator = new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory },
        'TestOrchestrator'
      );

      await orchestrator.initialize();

      expect(orchestrator.isInitialized).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing TestOrchestrator');
      expect(mockLogger.info).toHaveBeenCalledWith('TestOrchestrator initialized');
    });

    it('should warn and return early if already initialized', async () => {
      const orchestrator = new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory },
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('TestOrchestrator already initialized');
    });

    it('should call onInitialize', async () => {
      class TestOrchestrator extends BaseOrchestrator {
        onInitializeCalled: boolean;

        constructor(deps: OrchestratorDependencies) {
          super(deps, 'TestOrchestrator');
          this.onInitializeCalled = false;
        }

        override async onInitialize(): Promise<void> {
          this.onInitializeCalled = true;
        }
      }

      const orchestrator = new TestOrchestrator({ loggerFactory: mockLoggerFactory });
      await orchestrator.initialize();

      expect(orchestrator.onInitializeCalled).toBe(true);
    });

    it('should work without logger', async () => {
      const orchestrator = new BaseOrchestrator({}, 'TestOrchestrator');
      await orchestrator.initialize();

      expect(orchestrator.isInitialized).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup and set isInitialized to false', async () => {
      const orchestrator = new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory },
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(orchestrator.isInitialized).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up TestOrchestrator');
    });

    it('should call onCleanup', async () => {
      class TestOrchestrator extends BaseOrchestrator {
        onCleanupCalled: boolean;

        constructor(deps: OrchestratorDependencies) {
          super(deps, 'TestOrchestrator');
          this.onCleanupCalled = false;
        }

        override async onCleanup(): Promise<void> {
          this.onCleanupCalled = true;
        }
      }

      const orchestrator = new TestOrchestrator({ loggerFactory: mockLoggerFactory });
      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(orchestrator.onCleanupCalled).toBe(true);
    });

    it('should run onCleanup only once when onCleanup re-enters cleanup', async () => {
      class ReentrantOrchestrator extends BaseOrchestrator {
        onCleanupCount: number;

        constructor(deps: OrchestratorDependencies) {
          super(deps, 'ReentrantOrchestrator');
          this.onCleanupCount = 0;
        }

        override async onCleanup(): Promise<void> {
          this.onCleanupCount++;
          if (this.onCleanupCount <= 5) {
            await this.cleanup();
          }
        }
      }

      const orchestrator = new ReentrantOrchestrator({ loggerFactory: mockLoggerFactory });
      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(orchestrator.onCleanupCount).toBe(1);
    });
  });

  describe('onInitialize / onCleanup defaults', () => {
    it('should have default onInitialize that does nothing', async () => {
      const orchestrator = new BaseOrchestrator({}, 'TestOrchestrator');
      await expect(orchestrator.onInitialize()).resolves.toBeUndefined();
    });

    it('should have default onCleanup that does nothing', async () => {
      const orchestrator = new BaseOrchestrator({}, 'TestOrchestrator');
      await expect(orchestrator.onCleanup()).resolves.toBeUndefined();
    });
  });
});
