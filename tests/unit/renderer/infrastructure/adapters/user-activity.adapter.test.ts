import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserActivityAdapter } from '@renderer/infrastructure/adapters/user-activity.adapter.js';

describe('UserActivityAdapter', () => {
  const adapter = new UserActivityAdapter();
  let releases: Array<() => void>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    releases = [];
  });
  afterEach(() => {
    releases.forEach((release) => release());
    vi.useRealTimers();
  });

  it.each(['pointermove', 'keydown', 'wheel', 'touchstart'])('observes %s and throttles activity across event kinds', (event) => {
    const callback = vi.fn();
    releases.push(adapter.onActivity(callback));
    document.dispatchEvent(new Event(event));
    document.dispatchEvent(new Event('pointermove'));
    expect(callback).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(100);
    document.dispatchEvent(new Event('keydown'));
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('keeps activity listeners passive', () => {
    const add = vi.spyOn(document, 'addEventListener');
    releases.push(adapter.onActivity(vi.fn()));
    for (const event of ['pointermove', 'keydown', 'wheel', 'touchstart']) {
      expect(add).toHaveBeenCalledWith(event, expect.any(Function), { passive: true });
    }
  });

  it('releases only its own subscription and removes every event kind', () => {
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = adapter.onActivity(first);
    const releaseSecond = adapter.onActivity(second);
    releases.push(releaseFirst, releaseSecond);
    releaseFirst();
    document.dispatchEvent(new Event('pointermove'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    releaseFirst();
    vi.advanceTimersByTime(100);
    document.dispatchEvent(new Event('keydown'));
    expect(second).toHaveBeenCalledTimes(2);
    releaseSecond();
    for (const event of ['pointermove', 'keydown', 'wheel', 'touchstart']) {
      vi.advanceTimersByTime(100);
      document.dispatchEvent(new Event(event));
    }
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(2);
  });
});
