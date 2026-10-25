import { afterEach, describe, expect, it, vi } from 'vitest';
import { runApplicationSmoke } from '@main/application/smoke-lifecycle';

describe('real application smoke lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for both application startup and renderer readiness before cleaning up', async () => {
    const startup = Promise.withResolvers<void>();
    const renderer = Promise.withResolvers<void>();
    const application = { initialize: vi.fn(() => startup.promise), cleanup: vi.fn(async () => {}) };
    const result = runApplicationSmoke(application, renderer.promise);

    renderer.resolve();
    await Promise.resolve();
    expect(application.cleanup).not.toHaveBeenCalled();
    startup.resolve();
    await result;
    expect(application.initialize).toHaveBeenCalledTimes(1);
    expect(application.cleanup).toHaveBeenCalledTimes(1);
  });

  it('fails and rolls back when startup fails', async () => {
    const application = {
      initialize: vi.fn(async () => { throw new Error('startup failed'); }),
      cleanup: vi.fn(async () => {})
    };
    await expect(runApplicationSmoke(application, Promise.resolve())).rejects.toThrow('startup failed');
    expect(application.cleanup).toHaveBeenCalledTimes(1);
  });

  it('fails if the renderer never reports ready', async () => {
    vi.useFakeTimers();
    const application = { initialize: vi.fn(async () => {}), cleanup: vi.fn(async () => {}) };
    const result = runApplicationSmoke(application, new Promise(() => {}), 100);
    const rejected = expect(result).rejects.toThrow('lifecycle timed out');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(application.cleanup).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails when normal cleanup fails', async () => {
    const application = {
      initialize: vi.fn(async () => {}),
      cleanup: vi.fn(async () => { throw new Error('cleanup failed'); })
    };
    await expect(runApplicationSmoke(application, Promise.resolve())).rejects.toThrow('cleanup failed');
  });

  it('bounds shutdown as well as startup when cleanup never settles', async () => {
    vi.useFakeTimers();
    const application = {
      initialize: vi.fn(async () => {}),
      cleanup: vi.fn(() => new Promise<void>(() => {}))
    };
    const result = runApplicationSmoke(application, Promise.resolve(), 100);
    const rejected = expect(result).rejects.toThrow('lifecycle timed out');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(application.cleanup).toHaveBeenCalledTimes(1);
  });
});
