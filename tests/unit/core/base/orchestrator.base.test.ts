import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseOrchestrator } from '@core/base/orchestrator.base';

describe('BaseOrchestrator', () => {
  let mockEventBus: any;
  let mockLoggerFactory: any;

  beforeEach(() => {
    mockEventBus = {
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      publish: vi.fn()
    };
    mockLoggerFactory = {
      create: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      })
    };
  });

  describe('lifecycle', () => {
    it('should track initialization state', async () => {
      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {}
        protected async onCleanup(): Promise<void> {}
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      expect(orchestrator.isInitialized).toBe(false);
      await orchestrator.initialize();
      expect(orchestrator.isInitialized).toBe(true);
    });

    it('should call onInitialize during initialize()', async () => {
      const onInitializeSpy = vi.fn();

      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {
          onInitializeSpy();
        }
        protected async onCleanup(): Promise<void> {}
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      expect(onInitializeSpy).toHaveBeenCalled();
    });

    it('should call onCleanup during cleanup()', async () => {
      const onCleanupSpy = vi.fn();

      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {}
        protected async onCleanup(): Promise<void> {
          onCleanupSpy();
        }
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.cleanup();
      expect(onCleanupSpy).toHaveBeenCalled();
    });
  });

  describe('subscribeWithCleanup', () => {
    it('should track subscriptions for cleanup', async () => {
      const unsubscribe = vi.fn();
      mockEventBus.subscribe.mockReturnValue(unsubscribe);

      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {
          this.subscribeWithCleanup({
            'test:event': () => {}
          });
        }
        protected async onCleanup(): Promise<void> {}
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
