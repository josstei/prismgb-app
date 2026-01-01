/**
 * BaseOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';

describe('BaseOrchestrator', () => {
  let mockLoggerFactory;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };
  });

  describe('Constructor', () => {
    it('should create orchestrator with valid dependencies', () => {
      const orchestrator = new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory, eventBus: {} },
        ['loggerFactory', 'eventBus'],
        'TestOrchestrator'
      );

      expect(orchestrator.loggerFactory).toBe(mockLoggerFactory);
      expect(orchestrator.logger).toBe(mockLogger);
      expect(orchestrator.isInitialized).toBe(false);
    });

    it('should throw for missing required dependencies', () => {
      expect(() => new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory },
        ['loggerFactory', 'eventBus'],
        'TestOrchestrator'
      )).toThrow('TestOrchestrator: Missing required dependencies: eventBus');
    });

    it('should use constructor name if name not provided', () => {
      class MyOrchestrator extends BaseOrchestrator {
        constructor(deps) {
          super(deps, ['eventBus'], null);
        }
      }

      expect(() => new MyOrchestrator({})).toThrow('MyOrchestrator: Missing required dependencies: eventBus');
    });

    it('should work without loggerFactory', () => {
      const orchestrator = new BaseOrchestrator(
        { eventBus: {} },
        ['eventBus'],
        'TestOrchestrator'
      );

      expect(orchestrator.logger).toBeUndefined();
    });
  });

  describe('initialize', () => {
    it('should initialize and set isInitialized to true', async () => {
      const orchestrator = new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory },
        [],
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
        [],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('TestOrchestrator already initialized');
    });

    it('should call onInitialize', async () => {
      class TestOrchestrator extends BaseOrchestrator {
        constructor(deps) {
          super(deps, [], 'TestOrchestrator');
          this.onInitializeCalled = false;
        }

        async onInitialize() {
          this.onInitializeCalled = true;
        }
      }

      const orchestrator = new TestOrchestrator({ loggerFactory: mockLoggerFactory });
      await orchestrator.initialize();

      expect(orchestrator.onInitializeCalled).toBe(true);
    });

    it('should work without logger', async () => {
      const orchestrator = new BaseOrchestrator({}, [], 'TestOrchestrator');
      await orchestrator.initialize();

      expect(orchestrator.isInitialized).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup and set isInitialized to false', async () => {
      const orchestrator = new BaseOrchestrator(
        { loggerFactory: mockLoggerFactory },
        [],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(orchestrator.isInitialized).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up TestOrchestrator');
    });

    it('should call onCleanup', async () => {
      class TestOrchestrator extends BaseOrchestrator {
        constructor(deps) {
          super(deps, [], 'TestOrchestrator');
          this.onCleanupCalled = false;
        }

        async onCleanup() {
          this.onCleanupCalled = true;
        }
      }

      const orchestrator = new TestOrchestrator({ loggerFactory: mockLoggerFactory });
      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(orchestrator.onCleanupCalled).toBe(true);
    });
  });

  describe('onInitialize / onCleanup defaults', () => {
    it('should have default onInitialize that does nothing', async () => {
      const orchestrator = new BaseOrchestrator({}, [], 'TestOrchestrator');
      await expect(orchestrator.onInitialize()).resolves.toBeUndefined();
    });

    it('should have default onCleanup that does nothing', async () => {
      const orchestrator = new BaseOrchestrator({}, [], 'TestOrchestrator');
      await expect(orchestrator.onCleanup()).resolves.toBeUndefined();
    });
  });
});
