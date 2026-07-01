import { afterEach, describe, expect, it, vi } from 'vitest';

describe('@prismgb/gpu/worker import safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not install worker handlers when imported', async () => {
    const workerScope = {
      onmessage: null
    };
    vi.stubGlobal('self', workerScope);

    await import('@prismgb/gpu/worker');

    expect(workerScope.onmessage).toBeNull();
  });
});
