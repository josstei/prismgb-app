/**
 * UIEffects Unit Tests
 * Tests visual feedback effects and cursor auto-hide functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UIEffects } from '@renderer/ui/effects/ui-effects.js';
import { CSSClasses } from '@shared/config/css-classes.js';
import { TIMING } from '@shared/config/constants.js';

describe('UIEffects', () => {
  let effects;
  let mockElements;

  beforeEach(() => {
    // Create mock elements
    mockElements = {
      recordBtn: {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        offsetWidth: 100 // For reflow trigger
      }
    };

    effects = new UIEffects({ elements: mockElements });
  });

  afterEach(() => {
    effects.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Cursor Auto-Hide', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Mock document.body.classList
      vi.spyOn(document.body.classList, 'add').mockImplementation(() => {});
      vi.spyOn(document.body.classList, 'remove').mockImplementation(() => {});
    });

    describe('enableCursorAutoHide', () => {
      it('should add mousemove listener when enabled', () => {
        const addEventSpy = vi.spyOn(document, 'addEventListener');

        effects.enableCursorAutoHide();

        expect(addEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      });

      it('should not add duplicate listeners when called multiple times', () => {
        const addEventSpy = vi.spyOn(document, 'addEventListener');

        effects.enableCursorAutoHide();
        effects.enableCursorAutoHide();

        expect(addEventSpy).toHaveBeenCalledTimes(1);
      });

      it('should hide cursor after delay', () => {
        effects.enableCursorAutoHide();

        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        expect(document.body.classList.add).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      });
    });

    describe('disableCursorAutoHide', () => {
      it('should remove mousemove listener when disabled', () => {
        const removeEventSpy = vi.spyOn(document, 'removeEventListener');

        effects.enableCursorAutoHide();
        effects.disableCursorAutoHide();

        expect(removeEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      });

      it('should show cursor when disabled', () => {
        effects.enableCursorAutoHide();
        effects.disableCursorAutoHide();

        expect(document.body.classList.remove).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      });

      it('should do nothing when called without enabling first', () => {
        const removeEventSpy = vi.spyOn(document, 'removeEventListener');

        effects.disableCursorAutoHide();

        expect(removeEventSpy).not.toHaveBeenCalled();
      });
    });

    describe('mouse movement', () => {
      it('should show cursor on mouse move', () => {
        effects.enableCursorAutoHide();

        // Hide cursor first
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);
        expect(document.body.classList.add).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);

        // Trigger mouse move
        document.dispatchEvent(new MouseEvent('mousemove'));

        expect(document.body.classList.remove).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      });

      it('should reset hide timer on mouse move', () => {
        effects.enableCursorAutoHide();

        // Advance partway through delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS - 500);

        // Trigger mouse move (resets timer)
        document.dispatchEvent(new MouseEvent('mousemove'));

        // Advance past original timeout
        vi.advanceTimersByTime(500);

        // Cursor should still be visible because timer was reset
        expect(document.body.classList.add).not.toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);

        // Now advance full delay from mouse move
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS - 500);

        // Now cursor should hide
        expect(document.body.classList.add).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      });
    });
  });

  describe('Controls Auto-Hide (Fullscreen)', () => {
    let mockControls;

    beforeEach(() => {
      vi.useFakeTimers();
      mockControls = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
    });

    describe('enableControlsAutoHide', () => {
      it('should add mousemove listener when enabled', () => {
        const addEventSpy = vi.spyOn(document, 'addEventListener');

        effects.enableControlsAutoHide(mockControls);

        expect(addEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      });

      it('should add hover and focus listeners to controls element', () => {
        effects.enableControlsAutoHide(mockControls);

        expect(mockControls.addEventListener).toHaveBeenCalledWith('mouseenter', expect.any(Function));
        expect(mockControls.addEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
        expect(mockControls.addEventListener).toHaveBeenCalledWith('focusin', expect.any(Function));
        expect(mockControls.addEventListener).toHaveBeenCalledWith('focusout', expect.any(Function));
      });

      it('should not add duplicate listeners when called multiple times', () => {
        const addEventSpy = vi.spyOn(document, 'addEventListener');

        effects.enableControlsAutoHide(mockControls);
        effects.enableControlsAutoHide(mockControls);

        expect(addEventSpy).toHaveBeenCalledTimes(1);
      });

      it('should hide controls after delay', () => {
        effects.enableControlsAutoHide(mockControls);

        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should query controls from DOM if not provided', () => {
        const getByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue(mockControls);

        effects.enableControlsAutoHide();

        expect(getByIdSpy).toHaveBeenCalledWith('fullscreenControls');
      });

      it('should not enable if no controls element found', () => {
        vi.spyOn(document, 'getElementById').mockReturnValue(null);
        const addEventSpy = vi.spyOn(document, 'addEventListener');

        effects.enableControlsAutoHide();

        expect(addEventSpy).not.toHaveBeenCalled();
      });
    });

    describe('disableControlsAutoHide', () => {
      it('should remove mousemove listener when disabled', () => {
        const removeEventSpy = vi.spyOn(document, 'removeEventListener');

        effects.enableControlsAutoHide(mockControls);
        effects.disableControlsAutoHide();

        expect(removeEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      });

      it('should remove hover and focus listeners from controls element', () => {
        effects.enableControlsAutoHide(mockControls);
        effects.disableControlsAutoHide();

        expect(mockControls.removeEventListener).toHaveBeenCalledWith('mouseenter', expect.any(Function));
        expect(mockControls.removeEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
        expect(mockControls.removeEventListener).toHaveBeenCalledWith('focusin', expect.any(Function));
        expect(mockControls.removeEventListener).toHaveBeenCalledWith('focusout', expect.any(Function));
      });

      it('should show controls when disabled', () => {
        effects.enableControlsAutoHide(mockControls);
        effects.disableControlsAutoHide();

        expect(mockControls.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should do nothing when called without enabling first', () => {
        const removeEventSpy = vi.spyOn(document, 'removeEventListener');

        effects.disableControlsAutoHide();

        expect(removeEventSpy).not.toHaveBeenCalled();
      });
    });

    describe('mouse movement', () => {
      it('should show controls on mouse move', () => {
        effects.enableControlsAutoHide(mockControls);

        // Hide controls first
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);

        // Trigger mouse move
        document.dispatchEvent(new MouseEvent('mousemove'));

        expect(mockControls.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should reset hide timer on mouse move', () => {
        effects.enableControlsAutoHide(mockControls);

        // Advance partway through delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS - 500);

        // Trigger mouse move (resets timer)
        document.dispatchEvent(new MouseEvent('mousemove'));

        // Advance past original timeout
        vi.advanceTimersByTime(500);

        // Controls should still be visible because timer was reset
        expect(mockControls.classList.add).not.toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);

        // Now advance full delay from mouse move
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS - 500);

        // Now controls should hide
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should throttle rapid mousemove events to prevent infinite loops', () => {
        vi.useRealTimers(); // Use real timers to test throttling
        effects.enableControlsAutoHide(mockControls);

        // Clear any calls from initial setup
        mockControls.classList.remove.mockClear();
        mockControls.classList.add.mockClear();

        // Simulate rapid mousemove events (like synthetic events from DOM changes)
        for (let i = 0; i < 10; i++) {
          document.dispatchEvent(new MouseEvent('mousemove'));
        }

        // Should only process the first event due to throttling
        // removeClass is called once when showing controls
        expect(mockControls.classList.remove).toHaveBeenCalledTimes(1);
        expect(mockControls.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });
    });

    describe('hover behavior', () => {
      it('should pause hide timer when hovering over controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the mouseenter handler that was registered
        const mouseenterHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'mouseenter'
        )[1];

        // Simulate mouse enter (hovering)
        mouseenterHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS * 2);

        // Controls should NOT be hidden because we're hovering
        expect(mockControls.classList.add).not.toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should resume hide timer when mouse leaves controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the handlers
        const mouseenterHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'mouseenter'
        )[1];
        const mouseleaveHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'mouseleave'
        )[1];

        // Simulate mouse enter then leave
        mouseenterHandler();
        mouseleaveHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        // Now controls should hide
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });
    });

    describe('focus behavior', () => {
      it('should pause hide timer when focus is inside controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the focusin handler
        const focusinHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'focusin'
        )[1];

        // Simulate focus in
        focusinHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS * 2);

        // Controls should NOT be hidden because focus is inside
        expect(mockControls.classList.add).not.toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should resume hide timer when focus leaves controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the handlers
        const focusinHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'focusin'
        )[1];
        const focusoutHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'focusout'
        )[1];

        // Simulate focus in then out
        focusinHandler();
        focusoutHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        // Now controls should hide
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should not resume hide timer on focus out if still hovering', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the handlers
        const mouseenterHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'mouseenter'
        )[1];
        const focusinHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'focusin'
        )[1];
        const focusoutHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'focusout'
        )[1];

        // Simulate hovering and focus in, then focus out (but still hovering)
        mouseenterHandler();
        focusinHandler();
        focusoutHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS * 2);

        // Controls should NOT be hidden because we're still hovering
        expect(mockControls.classList.add).not.toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });
    });
  });

  describe('dispose', () => {
    it('should disable cursor auto-hide on dispose', () => {
      vi.useFakeTimers();
      vi.spyOn(document.body.classList, 'remove').mockImplementation(() => {});
      const removeEventSpy = vi.spyOn(document, 'removeEventListener');

      effects.enableCursorAutoHide();
      effects.dispose();

      expect(removeEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    });

    it('should disable controls auto-hide on dispose', () => {
      vi.useFakeTimers();
      const mockControls = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      const removeEventSpy = vi.spyOn(document, 'removeEventListener');

      effects.enableControlsAutoHide(mockControls);
      effects.dispose();

      expect(removeEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(mockControls.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    });
  });
});
