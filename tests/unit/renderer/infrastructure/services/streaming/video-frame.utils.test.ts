import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForVideoFrame } from '@renderer/infrastructure/services/streaming/video-frame.utils';

function fixture() {
  const video = document.createElement('video');
  const callbacks: VideoFrameRequestCallback[] = [];
  video.requestVideoFrameCallback = vi.fn((callback) => { callbacks.push(callback); return callbacks.length; });
  video.cancelVideoFrameCallback = vi.fn();
  const controller = new AbortController();
  const onFrame = (index = 0) => callbacks[index](0, {} as VideoFrameCallbackMetadata);
  return { video, controller, onFrame };
}

describe('waitForVideoFrame', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('requires a delivered frame and releases its timeout and cancellation listener', async () => {
    const { video, controller, onFrame } = fixture();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const ready = waitForVideoFrame(video, controller.signal);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    onFrame();
    await ready;
    expect(vi.getTimerCount()).toBe(0);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('preserves the no-frame error and cancels the pending callback on timeout', async () => {
    const { video, controller, onFrame } = fixture();
    const ready = waitForVideoFrame(video, controller.signal, 2000);
    const failed = expect(ready).rejects.toThrow('No frames received: NO_FRAMES_RECEIVED');
    await vi.advanceTimersByTimeAsync(2000);
    await failed;
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
    onFrame();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts one check without allowing a late frame to settle the next check', async () => {
    const { video, controller, onFrame } = fixture();
    const first = waitForVideoFrame(video, controller.signal);
    const failed = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await failed;
    const next = new AbortController();
    const settled = vi.fn();
    const second = waitForVideoFrame(video, next.signal).then(settled);
    onFrame(0);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    onFrame(1);
    await second;
    expect(settled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not register work for an already aborted operation', async () => {
    const { video, controller } = fixture();
    controller.abort();
    await expect(waitForVideoFrame(video, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans registration resources if requesting the callback fails', async () => {
    const { video, controller } = fixture();
    vi.mocked(video.requestVideoFrameCallback).mockImplementation(() => { throw new Error('unusable video'); });
    await expect(waitForVideoFrame(video, controller.signal)).rejects.toThrow('unusable video');
    expect(vi.getTimerCount()).toBe(0);
  });
});
