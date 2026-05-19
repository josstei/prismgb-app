import { describe, expect, it, vi } from 'vitest';
import { createPreloadEventBridge } from '@renderer/infrastructure/services/preload-event-bridge.factory';

describe('createPreloadEventBridge', () => {
  it('tracks unsubscribe closures returned by preload subscriptions', () => {
    const unsubscribeA = vi.fn();
    const unsubscribeB = vi.fn();
    const api = {
      onA: vi.fn(() => unsubscribeA),
      onB: vi.fn(() => unsubscribeB)
    };

    const bridge = createPreloadEventBridge({
      api,
      bridgeName: 'TestBridge',
      subscriptions: [
        { id: 'a', subscribe: (preloadApi) => preloadApi.onA(() => {}) },
        { id: 'b', subscribe: (preloadApi) => preloadApi.onB(() => {}) }
      ]
    });

    expect(bridge.size).toBe(2);

    bridge.dispose();
    bridge.dispose();

    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    expect(unsubscribeA).toHaveBeenCalledTimes(1);
  });

  it('warns when a preload subscription does not return an unsubscribe function', () => {
    const logger = {
      warn: vi.fn(),
      error: vi.fn()
    };

    const bridge = createPreloadEventBridge({
      api: { onMissing: vi.fn(() => undefined) },
      bridgeName: 'TestBridge',
      logger,
      subscriptions: [
        { id: 'missing', subscribe: (preloadApi) => preloadApi.onMissing(() => {}) }
      ]
    });

    expect(bridge.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      'TestBridge: subscription "missing" did not return an unsubscribe function'
    );
  });
});
