/**
 * UIEffects Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UIEffects } from '@ui/effects/ui-effects.js';
import { TIMING } from '@shared/config/constants.js';

describe('UIEffects', () => {
  let uiEffects;
  let mockElements;
  let mockFlashElement;
  let mockRecordBtn;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock record button element
    mockRecordBtn = {
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      },
      offsetWidth: 100
    };

    // Mock elements
    mockElements = {
      recordBtn: mockRecordBtn
    };

    // Mock flash element
    mockFlashElement = {
      className: '',
      addEventListener: vi.fn(),
      remove: vi.fn(),
      parentNode: {} // Mock parentNode to simulate element being in DOM
    };

    // Mock document
    global.document = {
      createElement: vi.fn(() => mockFlashElement),
      body: {
        appendChild: vi.fn()
      }
    };

    uiEffects = new UIEffects({
      elements: mockElements
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should store elements reference', () => {
      expect(uiEffects.elements).toBe(mockElements);
    });
  });

  describe('triggerShutterFlash', () => {
    it('should create div with shutter-flash class', () => {
      uiEffects.triggerShutterFlash();

      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(mockFlashElement.className).toBe('shutter-flash');
    });

    it('should append flash element to body', () => {
      uiEffects.triggerShutterFlash();

      expect(document.body.appendChild).toHaveBeenCalledWith(mockFlashElement);
    });

    it('should add animationend listener', () => {
      uiEffects.triggerShutterFlash();

      expect(mockFlashElement.addEventListener).toHaveBeenCalledWith(
        'animationend',
        expect.any(Function),
        { once: true }
      );
    });

    it('should remove flash element on animationend', () => {
      uiEffects.triggerShutterFlash();

      // Get the animationend handler
      const animationendHandler = mockFlashElement.addEventListener.mock.calls[0][1];

      // Trigger animationend
      animationendHandler();

      expect(mockFlashElement.remove).toHaveBeenCalled();
    });

    it('should remove flash element via timeout fallback if animationend does not fire', () => {
      uiEffects.triggerShutterFlash();

      // Don't trigger animationend - let timeout handle cleanup
      vi.advanceTimersByTime(500);

      expect(mockFlashElement.remove).toHaveBeenCalled();
    });

    it('should not remove element twice if animationend fires before timeout', () => {
      uiEffects.triggerShutterFlash();

      // Get the animationend handler and trigger it
      const animationendHandler = mockFlashElement.addEventListener.mock.calls[0][1];
      animationendHandler();

      // Element should be removed once
      expect(mockFlashElement.remove).toHaveBeenCalledTimes(1);

      // Clear the mock to verify no additional calls
      mockFlashElement.remove.mockClear();

      // Advance time past the timeout
      vi.advanceTimersByTime(500);

      // Should not be called again
      expect(mockFlashElement.remove).not.toHaveBeenCalled();
    });

    it('should handle element already removed from DOM', () => {
      uiEffects.triggerShutterFlash();

      // Simulate element being removed from DOM
      mockFlashElement.parentNode = null;

      // Get the animationend handler and trigger it
      const animationendHandler = mockFlashElement.addEventListener.mock.calls[0][1];

      // Should not throw
      expect(() => animationendHandler()).not.toThrow();

      // remove() should not be called if parentNode is null
      expect(mockFlashElement.remove).not.toHaveBeenCalled();
    });
  });

  describe('triggerRecordButtonPop', () => {
    it('should call triggerButtonFeedback with correct arguments', () => {
      const spy = vi.spyOn(uiEffects, 'triggerButtonFeedback');

      uiEffects.triggerRecordButtonPop();

      expect(spy).toHaveBeenCalledWith('recordBtn', 'btn-pop', TIMING.UI_TIMEOUT_MS);
    });
  });

  describe('triggerRecordButtonPress', () => {
    it('should call triggerButtonFeedback with correct arguments', () => {
      const spy = vi.spyOn(uiEffects, 'triggerButtonFeedback');

      uiEffects.triggerRecordButtonPress();

      expect(spy).toHaveBeenCalledWith('recordBtn', 'btn-press', TIMING.UI_TIMEOUT_MS);
    });
  });

  describe('triggerButtonFeedback', () => {
    it('should remove class first to handle rapid clicks', () => {
      uiEffects.triggerButtonFeedback('recordBtn', 'btn-pop', 150);

      expect(mockRecordBtn.classList.remove).toHaveBeenCalledWith('btn-pop');
      expect(mockRecordBtn.classList.remove).toHaveBeenCalledBefore(
        mockRecordBtn.classList.add
      );
    });

    it('should add class after removing it', () => {
      uiEffects.triggerButtonFeedback('recordBtn', 'btn-pop', 150);

      expect(mockRecordBtn.classList.add).toHaveBeenCalledWith('btn-pop');
    });

    it('should remove class after specified duration', () => {
      uiEffects.triggerButtonFeedback('recordBtn', 'btn-pop', 150);

      // Class should not be removed yet
      expect(mockRecordBtn.classList.remove).toHaveBeenCalledTimes(1);

      // Advance timers
      vi.advanceTimersByTime(150);

      // Class should be removed again
      expect(mockRecordBtn.classList.remove).toHaveBeenCalledTimes(2);
      expect(mockRecordBtn.classList.remove).toHaveBeenLastCalledWith('btn-pop');
    });

    it('should do nothing if element does not exist', () => {
      uiEffects.triggerButtonFeedback('nonExistentBtn', 'btn-pop', 150);

      expect(mockRecordBtn.classList.remove).not.toHaveBeenCalled();
      expect(mockRecordBtn.classList.add).not.toHaveBeenCalled();
    });

    it('should handle element key with null value', () => {
      mockElements.recordBtn = null;

      expect(() => {
        uiEffects.triggerButtonFeedback('recordBtn', 'btn-pop', 150);
      }).not.toThrow();
    });

    it('should work with different class names', () => {
      uiEffects.triggerButtonFeedback('recordBtn', 'btn-press', 200);

      expect(mockRecordBtn.classList.remove).toHaveBeenCalledWith('btn-press');
      expect(mockRecordBtn.classList.add).toHaveBeenCalledWith('btn-press');

      vi.advanceTimersByTime(200);

      expect(mockRecordBtn.classList.remove).toHaveBeenLastCalledWith('btn-press');
    });

    it('should work with different durations', () => {
      uiEffects.triggerButtonFeedback('recordBtn', 'btn-pop', 500);

      // Should not remove after 150ms
      vi.advanceTimersByTime(150);
      expect(mockRecordBtn.classList.remove).toHaveBeenCalledTimes(1);

      // Should remove after 500ms
      vi.advanceTimersByTime(350);
      expect(mockRecordBtn.classList.remove).toHaveBeenCalledTimes(2);
    });
  });
});
