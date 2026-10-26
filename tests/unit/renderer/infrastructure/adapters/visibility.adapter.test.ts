import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisibilityAdapter } from '@renderer/infrastructure/adapters/visibility.adapter.js';
import { installDocumentPropertyMock } from '../../../../support/mocks/browser-api.installers.js';

describe('VisibilityAdapter', () => {
  const adapter = new VisibilityAdapter();
  let hidden: ReturnType<typeof installDocumentPropertyMock>;
  let releases: Array<() => void>;

  beforeEach(() => {
    releases = [];
    hidden = installDocumentPropertyMock('hidden', false);
  });
  afterEach(() => {
    releases.forEach((release) => release());
    hidden.cleanup();
  });

  it('reads and publishes current document visibility', () => {
    const callback = vi.fn();
    releases.push(adapter.onVisibilityChange(callback));
    expect(adapter.isHidden()).toBe(false);
    hidden.setValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(adapter.isHidden()).toBe(true);
    expect(callback).toHaveBeenLastCalledWith(true);
    hidden.setValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).toHaveBeenLastCalledWith(false);
  });

  it('releases concurrent subscriptions independently and repeatedly', () => {
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = adapter.onVisibilityChange(first);
    releases.push(releaseFirst, adapter.onVisibilityChange(second));
    releaseFirst();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    releaseFirst();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(second).toHaveBeenCalledTimes(2);
  });
});
