/**
 * ActivityAutoHideController Unit Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActivityAutoHideController } from '@renderer/presentation/primitives/activity-auto-hide.controller';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
class TestComponent extends PresentationComponent {
  listenTo(target: EventTarget | null, type: string, handler: EventListener) {
    return this.listen(target, type, handler);
  }
  replaceTimeoutForTest(key: string, handler: () => void, delay: number) {
    return this.replaceTimeout(key, handler, delay);
  }
  replaceAnimationFrameForTest(key: string, handler: FrameRequestCallback) {
    return this.replaceAnimationFrame(key, handler);
  }
  get disposableCount() {
    return this._disposables.size;
  }
}
describe('ActivityAutoHideController', () => {
  let controller;
  let callbacks;
  let element;
  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = {
      onActivity: vi.fn(),
      onTimeout: vi.fn(),
      onEnable: vi.fn(),
      onDisable: vi.fn()
    };
    element = document.createElement('div');
  });
  afterEach(() => {
    controller?.dispose();
    vi.restoreAllMocks();
  });
  it('binds listeners on enable and unbinds on disable', () => {
    const addEventSpy = vi.spyOn(document, 'addEventListener');
    const removeEventSpy = vi.spyOn(document, 'removeEventListener');
    controller = new ActivityAutoHideController({
      onActivity: callbacks.onActivity,
      onEnable: callbacks.onEnable,
      onDisable: callbacks.onDisable
    });
    controller.enable({
      activityEvents: [{ target: document, type: 'mousemove' }],
      directEvents: [{ target: document, type: 'click', handler: vi.fn() }]
    });
    expect(callbacks.onEnable).toHaveBeenCalledTimes(1);
    expect(addEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addEventSpy).toHaveBeenCalledWith('click', expect.any(Function));
    controller.disable();
    expect(callbacks.onDisable).toHaveBeenCalledTimes(1);
    expect(removeEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeEventSpy).toHaveBeenCalledWith('click', expect.any(Function));
  });
  it('throttles activity callbacks through RAF and clears pending callbacks on disable', () => {
    controller = new ActivityAutoHideController({
      onActivity: callbacks.onActivity
    });
    controller.enable({ activityEvents: [{ target: document, type: 'mousemove' }] });
    document.dispatchEvent(new MouseEvent('mousemove'));
    document.dispatchEvent(new MouseEvent('mousemove'));
    expect(callbacks.onActivity).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(callbacks.onActivity).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new MouseEvent('mousemove'));
    controller.disable();
    vi.advanceTimersByTime(16);
    expect(callbacks.onActivity).toHaveBeenCalledTimes(1);
  });
  it('starts and clears timer on start/disable', () => {
    controller = new ActivityAutoHideController({
      onTimeout: callbacks.onTimeout,
      timeoutMs: 1000
    });
    controller.enable({
      startTimer: true
    });
    vi.advanceTimersByTime(999);
    expect(callbacks.onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callbacks.onTimeout).toHaveBeenCalledTimes(1);
  });
  it('does not start timer when shouldStartTimer returns false', () => {
    const shouldStartTimer = vi.fn(() => false);
    controller = new ActivityAutoHideController({
      onTimeout: callbacks.onTimeout,
      shouldStartTimer,
      timeoutMs: 1000
    });
    controller.enable();
    controller.startTimer();
    vi.advanceTimersByTime(2000);
    expect(shouldStartTimer).toHaveBeenCalledTimes(1);
    expect(callbacks.onTimeout).not.toHaveBeenCalled();
  });
  it('does not fire timeout after disable', () => {
    controller = new ActivityAutoHideController({
      onTimeout: callbacks.onTimeout,
      timeoutMs: 1000
    });
    controller.enable({
      startTimer: true
    });
    controller.disable();
    vi.advanceTimersByTime(2000);
    expect(callbacks.onTimeout).not.toHaveBeenCalled();
  });
  it('removes base listeners through disposable cleanup', () => {
    const component = new TestComponent();
    const handler = vi.fn();
    const target = new EventTarget();
    component.listenTo(null, 'activity', handler)();
    component.listenTo(target, 'activity', handler);
    target.dispatchEvent(new Event('activity'));
    component.dispose();
    target.dispatchEvent(new Event('activity'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it('removes completed managed timeout and animation frame disposers from cleanup tracking', () => {
    const component = new TestComponent();
    component.replaceTimeoutForTest('debounce', callbacks.onTimeout, 100);
    expect(component.disposableCount).toBe(1);
    vi.advanceTimersByTime(100);
    expect(callbacks.onTimeout).toHaveBeenCalledTimes(1);
    expect(component.disposableCount).toBe(0);
    component.replaceAnimationFrameForTest('frame', callbacks.onActivity);
    expect(component.disposableCount).toBe(1);
    vi.advanceTimersByTime(16);
    expect(callbacks.onActivity).toHaveBeenCalledTimes(1);
    expect(component.disposableCount).toBe(0);
    component.dispose();
  });
});
