/**
 * TranscodeToastComponent Unit Tests
 * Reactive bindings from TranscodeProgressStore onto the record button
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranscodeToastComponent } from '@renderer/presentation/features/transcode/transcode-toast.component.js';
import { TranscodeProgressStore } from '@renderer/presentation/state/transcode-progress.store.js';
import { createTranscodeToastElementsMock, createEventBus } from '../../../../factories/index.js';
import { EventChannels } from '@platform/events';

describe('TranscodeToastComponent', () => {
  let mockElements;
  let mockEventBus;
  let store;
  let component;

  beforeEach(() => {
    vi.useFakeTimers();
    mockElements = createTranscodeToastElementsMock();
    mockEventBus = createEventBus();
    store = new TranscodeProgressStore({ eventBus: mockEventBus });
    component = new TranscodeToastComponent({ elements: mockElements, store });
  });

  afterEach(() => {
    component.dispose();
    vi.useRealTimers();
  });

  it('marks the record button transcoding on start and resets ring/label', () => {
    mockEventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    expect(mockElements.recordBtn.classList.toggle).toHaveBeenCalledWith('transcoding', true);
    expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '0');
    expect(mockElements.transcodePercentLabel.textContent).toBe('');
  });

  it('reflects progress onto the ring and label', () => {
    mockEventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    mockEventBus.publish(EventChannels.TRANSCODE.PROGRESS, { percent: 42.6 });
    expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '43');
    expect(mockElements.transcodePercentLabel.textContent).toBe('43%');
  });

  it('shows the success checkmark and clears after the auto-hide delay', () => {
    mockEventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    mockEventBus.publish(EventChannels.TRANSCODE.COMPLETED, {});
    expect(mockElements.recordBtn.classList.toggle).toHaveBeenCalledWith('transcode-success', true);
    expect(mockElements.transcodePercentLabel.textContent).toBe('✓');
    vi.advanceTimersByTime(1200);
    expect(mockElements.recordBtn.classList.toggle).toHaveBeenCalledWith('transcode-success', false);
    expect(mockElements.transcodePercentLabel.textContent).toBe('');
  });

  it('shows the error mark and clears after the longer delay', () => {
    mockEventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    mockEventBus.publish(EventChannels.TRANSCODE.ERROR, { message: 'boom' });
    expect(mockElements.recordBtn.classList.toggle).toHaveBeenCalledWith('transcode-error', true);
    expect(mockElements.transcodePercentLabel.textContent).toBe('✗');
    vi.advanceTimersByTime(2000);
    expect(mockElements.recordBtn.classList.toggle).toHaveBeenCalledWith('transcode-error', false);
    expect(mockElements.transcodePercentLabel.textContent).toBe('');
  });

  it('clears the toast immediately on cancel', () => {
    mockEventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    mockEventBus.publish(EventChannels.TRANSCODE.PROGRESS, { percent: 45 });
    mockEventBus.publish(EventChannels.TRANSCODE.CANCELLED, {});
    expect(mockElements.recordBtn.classList.toggle).toHaveBeenCalledWith('transcoding', false);
    expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '0');
    expect(mockElements.transcodePercentLabel.textContent).toBe('');
  });

  it('tears down bindings and store subscriptions on dispose', () => {
    component.dispose();
    mockElements.transcodePercentLabel.textContent = 'stale';
    mockEventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' });
    expect(mockElements.transcodePercentLabel.textContent).toBe('stale');
  });

  it('does not throw when target elements are missing', () => {
    const bareStore = new TranscodeProgressStore({ eventBus: mockEventBus });
    const bareComponent = new TranscodeToastComponent({ elements: {}, store: bareStore });
    expect(() =>
      mockEventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'j1', format: 'mp4' })
    ).not.toThrow();
    bareComponent.dispose();
  });
});
