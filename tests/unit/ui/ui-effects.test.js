/**
 * UIEffects Unit Tests
 * Tests visual feedback effects and cursor auto-hide functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UIEffects } from '@renderer/ui/effects/ui-effects.class.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { TIMING } from '@shared/config/constants.config.js';

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

        // Trigger mouse move (RAF-throttled, advance one frame)
        document.dispatchEvent(new MouseEvent('mousemove'));
        vi.advanceTimersByTime(16);

        expect(document.body.classList.remove).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      });

      it('should reset hide timer on mouse move', () => {
        effects.enableCursorAutoHide();

        // Advance partway through delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS - 500);

        // Trigger mouse move (RAF-throttled, advance one frame to execute)
        document.dispatchEvent(new MouseEvent('mousemove'));
        vi.advanceTimersByTime(16);

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

        // 3 listeners per enable (mousemove + pointermove + mousedown), but guard prevents duplicate
        expect(addEventSpy).toHaveBeenCalledTimes(3);
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

        // Trigger mouse move (RAF-throttled, so need to advance one frame)
        document.dispatchEvent(new MouseEvent('mousemove'));
        vi.advanceTimersByTime(16); // Execute RAF callback

        expect(mockControls.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should reset hide timer on mouse move', () => {
        effects.enableControlsAutoHide(mockControls);

        // Advance partway through delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS - 500);

        // Trigger mouse move (RAF-throttled, so need to advance one frame to execute)
        document.dispatchEvent(new MouseEvent('mousemove'));
        vi.advanceTimersByTime(16); // Execute RAF callback (resets timer)

        // Advance past original timeout
        vi.advanceTimersByTime(500);

        // Controls should still be visible because timer was reset
        expect(mockControls.classList.add).not.toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);

        // Now advance full delay from mouse move
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS - 500);

        // Now controls should hide
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

    });

    describe('hover behavior', () => {
      it('should reset hide timer when hovering over controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the mouseenter handler that was registered
        const mouseenterHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'mouseenter'
        )[1];

        // Simulate mouse enter (hovering) - this resets the timer
        mouseenterHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        // Controls should hide after delay (no hover pause anymore)
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should reset hide timer when mouse leaves controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the handlers
        const mouseleaveHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'mouseleave'
        )[1];

        // Simulate mouse leave - resets the timer
        mouseleaveHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        // Now controls should hide
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });
    });

    describe('focus behavior', () => {
      it('should reset hide timer when focus is inside controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the focusin handler
        const focusinHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'focusin'
        )[1];

        // Simulate focus in - resets the timer
        focusinHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        // Controls should hide after delay (no focus pause anymore)
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });

      it('should reset hide timer when focus leaves controls', () => {
        effects.enableControlsAutoHide(mockControls);

        // Get the handlers
        const focusoutHandler = mockControls.addEventListener.mock.calls.find(
          call => call[0] === 'focusout'
        )[1];

        // Simulate focus out - resets the timer
        focusoutHandler();

        // Advance past the hide delay
        vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

        // Now controls should hide
        expect(mockControls.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      });
    });
  });

  describe('setRecordingButtonState', () => {
    it('should add recording class when isActive is true', () => {
      const mockElement = { classList: { add: vi.fn(), remove: vi.fn() } };
      effects.setRecordingButtonState(mockElement, true);

      expect(mockElement.classList.add).toHaveBeenCalledWith(CSSClasses.RECORDING);
    });

    it('should remove recording class when isActive is false', () => {
      const mockElement = { classList: { add: vi.fn(), remove: vi.fn() } };
      effects.setRecordingButtonState(mockElement, false);

      expect(mockElement.classList.remove).toHaveBeenCalledWith(CSSClasses.RECORDING);
    });

    it('should do nothing when element is null', () => {
      expect(() => effects.setRecordingButtonState(null, true)).not.toThrow();
    });

    it('should do nothing when element is undefined', () => {
      expect(() => effects.setRecordingButtonState(undefined, true)).not.toThrow();
    });
  });

  describe('setCinematicMode', () => {
    beforeEach(() => {
      vi.spyOn(document.body.classList, 'add').mockImplementation(() => {});
      vi.spyOn(document.body.classList, 'remove').mockImplementation(() => {});
    });

    it('should add cinematic-active class when isActive is true', () => {
      effects.setCinematicMode(true);

      expect(document.body.classList.add).toHaveBeenCalledWith(CSSClasses.CINEMATIC_ACTIVE);
    });

    it('should remove cinematic-active class when isActive is false', () => {
      effects.setCinematicMode(false);

      expect(document.body.classList.remove).toHaveBeenCalledWith(CSSClasses.CINEMATIC_ACTIVE);
    });
  });

  describe('Unified Timer (Cursor + Toolbar)', () => {
    let mockToolbar;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(document.body.classList, 'add').mockImplementation(() => {});
      vi.spyOn(document.body.classList, 'remove').mockImplementation(() => {});

      mockToolbar = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        querySelector: vi.fn().mockReturnValue(null)
      };
    });

    it('should hide both cursor and toolbar together after delay', () => {
      effects.enableCursorAutoHide();
      effects.enableToolbarAutoHide(mockToolbar);

      vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

      expect(document.body.classList.add).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      expect(mockToolbar.classList.add).toHaveBeenCalledWith(CSSClasses.TOOLBAR_HIDDEN);
    });

    it('should show both cursor and toolbar on mouse move', () => {
      effects.enableCursorAutoHide();
      effects.enableToolbarAutoHide(mockToolbar);

      vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);
      document.body.classList.add.mockClear();
      mockToolbar.classList.remove.mockClear();

      // Dispatch mousemove and advance one frame to execute RAF callback
      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16);

      expect(document.body.classList.remove).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      expect(mockToolbar.classList.remove).toHaveBeenCalledWith(CSSClasses.TOOLBAR_HIDDEN);
    });

    it('should keep both cursor and toolbar visible when hovering toolbar', () => {
      effects.enableCursorAutoHide();
      effects.enableToolbarAutoHide(mockToolbar);

      const mouseenterHandler = mockToolbar.addEventListener.mock.calls.find(
        call => call[0] === 'mouseenter'
      )[1];

      mouseenterHandler();

      vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS * 2);

      expect(document.body.classList.add).not.toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      expect(mockToolbar.classList.add).not.toHaveBeenCalledWith(CSSClasses.TOOLBAR_HIDDEN);
    });

    it('should resume hiding both after mouse leaves toolbar', () => {
      effects.enableCursorAutoHide();
      effects.enableToolbarAutoHide(mockToolbar);

      const mouseenterHandler = mockToolbar.addEventListener.mock.calls.find(
        call => call[0] === 'mouseenter'
      )[1];
      const mouseleaveHandler = mockToolbar.addEventListener.mock.calls.find(
        call => call[0] === 'mouseleave'
      )[1];

      mouseenterHandler();
      mouseleaveHandler();

      vi.advanceTimersByTime(TIMING.CURSOR_HIDE_DELAY_MS);

      expect(document.body.classList.add).toHaveBeenCalledWith(CSSClasses.CURSOR_HIDDEN);
      expect(mockToolbar.classList.add).toHaveBeenCalledWith(CSSClasses.TOOLBAR_HIDDEN);
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
