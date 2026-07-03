import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranscodeProgressStore } from '../../../../../src/renderer/presentation/state/transcode-progress.store.js';
import { PlatformEventBus, EventChannels } from '@platform/events';

describe('TranscodeProgressStore', () => {
  let bus: PlatformEventBus;
  let store: TranscodeProgressStore;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new PlatformEventBus();
    store = new TranscodeProgressStore({ eventBus: bus });
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  it('enters transcoding on STARTED and resets progress/label', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    expect(store.phase.value).toBe('transcoding');
    expect(store.transcoding.value).toBe(true);
    expect(store.progress.value).toBe(0);
    expect(store.label.value).toBe('');
  });

  it('advances progress while transcoding, rounding and clamping', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    bus.publish(EventChannels.TRANSCODE.PROGRESS, { percent: 33.7 });
    expect(store.progress.value).toBe(34);
    expect(store.label.value).toBe('34%');
    bus.publish(EventChannels.TRANSCODE.PROGRESS, { percent: 150 });
    expect(store.progress.value).toBe(100);
    expect(store.label.value).toBe('100%');
  });

  it('ignores non-positive progress (keeps spinner)', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    bus.publish(EventChannels.TRANSCODE.PROGRESS, { percent: 0 });
    bus.publish(EventChannels.TRANSCODE.PROGRESS, { percent: -5 });
    expect(store.progress.value).toBe(0);
    expect(store.label.value).toBe('');
  });

  it('ignores progress when not transcoding', () => {
    bus.publish(EventChannels.TRANSCODE.PROGRESS, { percent: 50 });
    expect(store.phase.value).toBe('idle');
    expect(store.label.value).toBe('');
  });

  it('shows success and auto-hides after 1200ms', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    bus.publish(EventChannels.TRANSCODE.COMPLETED, {});
    expect(store.phase.value).toBe('success');
    expect(store.succeeded.value).toBe(true);
    expect(store.label.value).toBe('✓');
    vi.advanceTimersByTime(1200);
    expect(store.phase.value).toBe('idle');
    expect(store.label.value).toBe('');
  });

  it('shows error and auto-hides only after 2000ms', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    bus.publish(EventChannels.TRANSCODE.ERROR, { message: 'boom' });
    expect(store.phase.value).toBe('error');
    expect(store.failed.value).toBe(true);
    expect(store.label.value).toBe('✗');
    vi.advanceTimersByTime(1999);
    expect(store.phase.value).toBe('error');
    vi.advanceTimersByTime(1);
    expect(store.phase.value).toBe('idle');
  });

  it('cancels immediately and clears a pending hide timer', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    bus.publish(EventChannels.TRANSCODE.COMPLETED, {});
    bus.publish(EventChannels.TRANSCODE.CANCELLED, {});
    expect(store.phase.value).toBe('idle');
    vi.advanceTimersByTime(1200);
    expect(store.phase.value).toBe('idle');
  });

  it('replaces a pending success hide timer when a new transcode starts', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    bus.publish(EventChannels.TRANSCODE.COMPLETED, {});
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j2', format: 'mp4' });
    expect(store.phase.value).toBe('transcoding');
    vi.advanceTimersByTime(1200);
    expect(store.phase.value).toBe('transcoding');
  });

  it('does not fire the hide timer or write state after dispose', () => {
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    bus.publish(EventChannels.TRANSCODE.COMPLETED, {});
    store.dispose();
    expect(() => vi.advanceTimersByTime(1200)).not.toThrow();
    expect(store.phase.value).toBe('success');
  });

  it('stops reacting to bus events after dispose', () => {
    store.dispose();
    bus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    expect(store.phase.value).toBe('idle');
  });
});
