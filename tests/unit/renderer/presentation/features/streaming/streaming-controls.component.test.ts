/**
 * StreamingControlsComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamingControlsComponent } from '@renderer/presentation/features/streaming/streaming-controls.component.js';
import { StreamInfoStore } from '@renderer/presentation/state/stream-info.store.js';
import { createStreamingControlsElementsMock, createUIBodyClassManagerMock, createEventBus } from '../../../../../factories/index.js';
import { EventChannels } from '@platform/events';

describe('StreamingControlsComponent', () => {
  let component;
  let mockElements;
  let mockBodyClassManager;
  let mockEventBus;
  let store;

  beforeEach(() => {
    mockBodyClassManager = createUIBodyClassManagerMock({ areAnimationsOff: vi.fn(() => false) });
    mockElements = createStreamingControlsElementsMock();
    mockEventBus = createEventBus();
    store = new StreamInfoStore({ eventBus: mockEventBus });

    component = new StreamingControlsComponent({
      elements: mockElements,
      bodyClassManager: mockBodyClassManager,
      store
    });
  });

  describe('Constructor', () => {
    it('should store elements reference', () => {
      expect(component.elements).toBe(mockElements);
    });
  });

  describe('setStreamingMode', () => {
    it('should animate overlay out with cross-fade then enable controls', () => {
      vi.useFakeTimers();

      component.setStreamingMode(true);

      // Immediate: transitioning class added AND streaming-mode for cross-fade
      expect(mockElements.streamOverlay.classList.add).toHaveBeenCalledWith('transitioning-to-stream');
      expect(mockBodyClassManager.setStreamingMode).toHaveBeenCalledWith(true);
      // Controls still disabled during animation
      expect(mockElements.screenshotBtn.disabled).toBe(true);
      expect(mockElements.recordBtn.disabled).toBe(true);

      // After 1000ms: animation complete, enable controls and finalize overlay
      vi.advanceTimersByTime(1000);

      expect(mockElements.screenshotBtn.disabled).toBe(false);
      expect(mockElements.recordBtn.disabled).toBe(false);
      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('transitioning-to-stream');
      expect(mockElements.streamOverlay.classList.add).toHaveBeenCalledWith('hidden');

      vi.useRealTimers();
    });

    it('should clear stream transition timeout on rapid toggle', () => {
      vi.useFakeTimers();

      component.setStreamingMode(true);
      vi.advanceTimersByTime(100); // Partial animation

      // Clear mocks to check new calls
      mockElements.streamOverlay.classList.add.mockClear();
      mockElements.streamOverlay.classList.remove.mockClear();

      component.setStreamingMode(true); // Rapid toggle

      // Original timeout should be cleared, new one set
      vi.advanceTimersByTime(1000);

      // Should have completed the second transition
      expect(mockElements.streamOverlay.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('transitioning-to-stream');

      vi.useRealTimers();
    });

    it('should clean up stream transition timeout on dispose', () => {
      vi.useFakeTimers();

      component.setStreamingMode(true);
      vi.advanceTimersByTime(100); // Partial animation

      component.dispose();

      // Clear mocks after dispose to verify no further calls are made by any timer
      mockElements.streamOverlay.classList.add.mockClear();

      // Timeout should be cleared, no further calls
      vi.advanceTimersByTime(500);

      // classList.add should not be called for 'hidden' after dispose
      expect(mockElements.streamOverlay.classList.add).not.toHaveBeenCalledWith('hidden');

      vi.useRealTimers();
    });

    it('should clear stream transition timeout when disabling during transition', () => {
      vi.useFakeTimers();

      // Start streaming (begins 300ms transition)
      component.setStreamingMode(true);
      vi.advanceTimersByTime(100); // Partial animation

      // Clear mocks to verify behavior
      mockElements.streamOverlay.classList.add.mockClear();
      mockElements.streamOverlay.classList.remove.mockClear();

      // Disable streaming before transition completes
      component.setStreamingMode(false);

      // Transitioning class should be removed immediately
      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('transitioning-to-stream');

      // Advance past the original transition timeout
      vi.advanceTimersByTime(500);

      // hidden should NOT be added (transition was cancelled)
      expect(mockElements.streamOverlay.classList.add).not.toHaveBeenCalledWith('hidden');

      vi.useRealTimers();
    });

    it('should disable streaming mode', () => {
      vi.useFakeTimers();
      mockElements.screenshotBtn.disabled = false;
      mockElements.recordBtn.disabled = false;

      // Put some initial content in stream info to verify it gets reset
      mockEventBus.publish(EventChannels.UI.STREAM_INFO, {
        settings: { width: 160, height: 144, frameRate: 60 }
      });
      expect(mockElements.currentResolution.textContent).toBe('160x144');
      expect(mockElements.currentFPS.textContent).toBe('60 fps');

      component.setStreamingMode(false);

      // Immediate effects: hiding animation classes added
      expect(mockElements.screenshotBtn.classList.add).toHaveBeenCalledWith('hiding');
      expect(mockElements.recordBtn.classList.add).toHaveBeenCalledWith('hiding');

      // Advance timers to trigger delayed effects
      vi.advanceTimersByTime(150);

      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('hidden', 'transitioning-to-stream');
      expect(mockBodyClassManager.setStreamingMode).toHaveBeenCalledWith(false);
      expect(mockElements.screenshotBtn.disabled).toBe(true);
      expect(mockElements.recordBtn.disabled).toBe(true);
      expect(mockElements.currentResolution.textContent).toBe('—');
      expect(mockElements.currentFPS.textContent).toBe('—');

      vi.useRealTimers();
    });
  });

  describe('updateStreamInfo via event', () => {
    it('should update resolution and FPS', () => {
      mockEventBus.publish(EventChannels.UI.STREAM_INFO, {
        settings: { width: 160, height: 144, frameRate: 60 }
      });

      expect(mockElements.currentResolution.textContent).toBe('160x144');
      expect(mockElements.currentFPS.textContent).toBe('60 fps');
    });

    it('should handle null settings by resetting', () => {
      // Setup some initial state
      mockEventBus.publish(EventChannels.UI.STREAM_INFO, {
        settings: { width: 160, height: 144, frameRate: 60 }
      });

      mockEventBus.publish(EventChannels.UI.STREAM_INFO, { settings: null });

      expect(mockElements.currentResolution.textContent).toBe('—');
      expect(mockElements.currentFPS.textContent).toBe('—');
    });

    it('should handle undefined settings by resetting', () => {
      mockEventBus.publish(EventChannels.UI.STREAM_INFO, {
        settings: { width: 160, height: 144, frameRate: 60 }
      });

      mockEventBus.publish(EventChannels.UI.STREAM_INFO, { settings: undefined });

      expect(mockElements.currentResolution.textContent).toBe('—');
      expect(mockElements.currentFPS.textContent).toBe('—');
    });
  });

  describe('Performance mode (animations off)', () => {
    beforeEach(() => {
      mockBodyClassManager.areAnimationsOff.mockReturnValue(true);
    });

    it('should enable streaming immediately without animation delay', () => {
      component.setStreamingMode(true);

      // Should show stream immediately, no timeout needed
      expect(mockBodyClassManager.setStreamingMode).toHaveBeenCalledWith(true);
      expect(mockElements.screenshotBtn.disabled).toBe(false);
      expect(mockElements.recordBtn.disabled).toBe(false);
      expect(mockElements.streamOverlay.classList.add).toHaveBeenCalledWith('hidden');

      // Should NOT add transitioning class
      expect(mockElements.streamOverlay.classList.add).not.toHaveBeenCalledWith('transitioning-to-stream');
    });

    it('should disable streaming immediately without animation delay', () => {
      mockElements.screenshotBtn.disabled = false;
      mockElements.recordBtn.disabled = false;

      mockEventBus.publish(EventChannels.UI.STREAM_INFO, {
        settings: { width: 160, height: 144, frameRate: 60 }
      });

      component.setStreamingMode(false);

      // Should hide stream immediately, no timeout needed
      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockBodyClassManager.setStreamingMode).toHaveBeenCalledWith(false);
      expect(mockElements.screenshotBtn.disabled).toBe(true);
      expect(mockElements.recordBtn.disabled).toBe(true);
      expect(mockElements.currentResolution.textContent).toBe('—');
      expect(mockElements.currentFPS.textContent).toBe('—');

      // Should NOT add hiding class (no animation)
      expect(mockElements.screenshotBtn.classList.add).not.toHaveBeenCalledWith('hiding');
      expect(mockElements.recordBtn.classList.add).not.toHaveBeenCalledWith('hiding');
    });
  });
});
