/**
 * StreamControlsComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamControlsComponent } from '@ui/components/stream-controls.js';

describe('StreamControlsComponent', () => {
  let component;
  let mockElements;

  beforeEach(() => {
    // Mock document.body classList with spies
    const mockBodyClassList = {
      add: vi.fn(),
      remove: vi.fn()
    };
    Object.defineProperty(document.body, 'classList', {
      value: mockBodyClassList,
      writable: true,
      configurable: true
    });

    mockElements = {
      cinematicBtn: {
        title: '',
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      },
      streamOverlay: {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      },
      screenshotBtn: {
        disabled: true,
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      },
      recordBtn: {
        disabled: true,
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      },
      currentResolution: { textContent: '' },
      currentFPS: { textContent: '' }
    };

    component = new StreamControlsComponent(mockElements);
  });

  describe('Constructor', () => {
    it('should store elements reference', () => {
      expect(component.elements).toBe(mockElements);
    });
  });

  describe('setStreamingMode', () => {
    it('should enable streaming mode', () => {
      component.setStreamingMode(true);

      expect(mockElements.streamOverlay.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.screenshotBtn.disabled).toBe(false);
      expect(mockElements.recordBtn.disabled).toBe(false);
    });

    it('should disable streaming mode', () => {
      vi.useFakeTimers();
      mockElements.screenshotBtn.disabled = false;
      mockElements.recordBtn.disabled = false;

      component.setStreamingMode(false);

      // Immediate effects: hiding animation classes added
      expect(mockElements.screenshotBtn.classList.add).toHaveBeenCalledWith('hiding');
      expect(mockElements.recordBtn.classList.add).toHaveBeenCalledWith('hiding');

      // Advance timers to trigger delayed effects
      vi.advanceTimersByTime(150);

      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockElements.screenshotBtn.disabled).toBe(true);
      expect(mockElements.recordBtn.disabled).toBe(true);
      expect(mockElements.currentResolution.textContent).toBe('—');
      expect(mockElements.currentFPS.textContent).toBe('—');

      vi.useRealTimers();
    });
  });

  describe('updateStreamInfo', () => {
    it('should update resolution and FPS', () => {
      component.updateStreamInfo({ width: 160, height: 144, frameRate: 60 });

      expect(mockElements.currentResolution.textContent).toBe('160x144');
      expect(mockElements.currentFPS.textContent).toBe('60 fps');
    });

    it('should handle null settings', () => {
      mockElements.currentResolution.textContent = 'existing';
      mockElements.currentFPS.textContent = 'existing';

      component.updateStreamInfo(null);

      expect(mockElements.currentResolution.textContent).toBe('existing');
      expect(mockElements.currentFPS.textContent).toBe('existing');
    });

    it('should handle undefined settings', () => {
      mockElements.currentResolution.textContent = 'existing';

      component.updateStreamInfo(undefined);

      expect(mockElements.currentResolution.textContent).toBe('existing');
    });
  });
});
