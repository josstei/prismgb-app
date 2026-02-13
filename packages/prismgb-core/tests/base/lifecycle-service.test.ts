import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LifecycleService } from '../../src/base/lifecycle-service.base';

class TestLifecycleService extends LifecycleService {
  onInitializeCalled = false;
  onDisposeCalled = false;

  protected async onInitialize(): Promise<void> {
    this.onInitializeCalled = true;
  }

  protected async onDispose(): Promise<void> {
    this.onDisposeCalled = true;
  }
}

describe('LifecycleService', () => {
  let service: TestLifecycleService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const mockLoggerFactory = {
      create: () => mockLogger
    };

    service = new TestLifecycleService(
      { loggerFactory: mockLoggerFactory },
      [],
      'TestService'
    );
  });

  describe('addCleanup', () => {
    it('should register cleanup functions', () => {
      const cleanup = vi.fn();
      service.addCleanup(cleanup);
      expect(cleanup).not.toHaveBeenCalled();
    });

    it('should register multiple cleanup functions', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const cleanup3 = vi.fn();

      service.addCleanup(cleanup1);
      service.addCleanup(cleanup2);
      service.addCleanup(cleanup3);

      expect(cleanup1).not.toHaveBeenCalled();
      expect(cleanup2).not.toHaveBeenCalled();
      expect(cleanup3).not.toHaveBeenCalled();
    });
  });

  describe('dispose with cleanups', () => {
    it('should run all registered cleanup functions during dispose', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const cleanup3 = vi.fn();

      service.addCleanup(cleanup1);
      service.addCleanup(cleanup2);
      service.addCleanup(cleanup3);

      await service.dispose();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup3).toHaveBeenCalledTimes(1);
    });

    it('should run cleanups in registration order', async () => {
      const order: number[] = [];
      const cleanup1 = vi.fn(() => order.push(1));
      const cleanup2 = vi.fn(() => order.push(2));
      const cleanup3 = vi.fn(() => order.push(3));

      service.addCleanup(cleanup1);
      service.addCleanup(cleanup2);
      service.addCleanup(cleanup3);

      await service.dispose();

      expect(order).toEqual([1, 2, 3]);
    });

    it('should run cleanups BEFORE subscription cleanup', async () => {
      const cleanupOrder: string[] = [];
      const cleanup = vi.fn(() => cleanupOrder.push('cleanup'));
      const unsubscribe = vi.fn(() => cleanupOrder.push('unsubscribe'));

      const mockEventBus = {
        subscribe: vi.fn(() => unsubscribe)
      };

      class TestServiceWithEventBus extends LifecycleService<{ eventBus: any; loggerFactory: any }> {
        constructor(deps: any) {
          super(deps, ['eventBus'], 'TestService');
        }
      }

      const serviceWithEvents = new TestServiceWithEventBus({
        loggerFactory: { create: () => mockLogger },
        eventBus: mockEventBus
      });

      serviceWithEvents.subscribeWithCleanup({ 'test:event': vi.fn() });
      serviceWithEvents.addCleanup(cleanup);

      await serviceWithEvents.dispose();

      expect(cleanupOrder).toEqual(['cleanup', 'unsubscribe']);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should run cleanups BEFORE onDispose hook', async () => {
      const order: string[] = [];

      class OrderedService extends LifecycleService {
        protected async onDispose(): Promise<void> {
          order.push('onDispose');
        }
      }

      const orderedService = new OrderedService(
        { loggerFactory: { create: () => mockLogger } },
        [],
        'OrderedService'
      );

      orderedService.addCleanup(() => order.push('cleanup'));

      await orderedService.dispose();

      expect(order).toEqual(['cleanup', 'onDispose']);
    });

    it('should handle async cleanup functions', async () => {
      const asyncCleanup = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      service.addCleanup(asyncCleanup);

      await service.dispose();

      expect(asyncCleanup).toHaveBeenCalledTimes(1);
    });

    it('should catch and log errors in cleanup functions without propagating', async () => {
      const error = new Error('Cleanup failed');
      const faultyCleanup = vi.fn(() => { throw error; });
      const goodCleanup = vi.fn();

      service.addCleanup(faultyCleanup);
      service.addCleanup(goodCleanup);

      await expect(service.dispose()).resolves.not.toThrow();

      expect(faultyCleanup).toHaveBeenCalledTimes(1);
      expect(goodCleanup).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cleanup error in TestService:',
        error
      );
    });

    it('should catch and log errors in async cleanup functions', async () => {
      const error = new Error('Async cleanup failed');
      const faultyAsyncCleanup = vi.fn(async () => {
        throw error;
      });
      const goodCleanup = vi.fn();

      service.addCleanup(faultyAsyncCleanup);
      service.addCleanup(goodCleanup);

      await expect(service.dispose()).resolves.not.toThrow();

      expect(faultyAsyncCleanup).toHaveBeenCalledTimes(1);
      expect(goodCleanup).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cleanup error in TestService:',
        error
      );
    });

    it('should clear cleanups array after dispose', async () => {
      const cleanup = vi.fn();
      service.addCleanup(cleanup);

      await service.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);

      // Dispose again should not call cleanup again
      await service.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should not run cleanups if already disposed', async () => {
      const cleanup = vi.fn();
      service.addCleanup(cleanup);

      await service.dispose();
      expect(cleanup).toHaveBeenCalledTimes(1);

      service.addCleanup(cleanup);
      await service.dispose();

      // Should still only be called once (from first dispose)
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration with existing dispose behavior', () => {
    it('should still call onDispose after cleanups', async () => {
      const cleanup = vi.fn();
      service.addCleanup(cleanup);

      await service.dispose();

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(service.onDisposeCalled).toBe(true);
    });

    it('should set isDisposed flag after all cleanups', async () => {
      const cleanup = vi.fn(() => {
        expect(service.isDisposed).toBe(false);
      });

      service.addCleanup(cleanup);
      expect(service.isDisposed).toBe(false);

      await service.dispose();

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(service.isDisposed).toBe(true);
    });

    it('should handle dispose without any cleanups registered', async () => {
      await expect(service.dispose()).resolves.not.toThrow();
      expect(service.isDisposed).toBe(true);
      expect(service.onDisposeCalled).toBe(true);
    });
  });
});
