import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UIEffects } from '@renderer/presentation/effects/ui-effects.host';
import { CaptureEffects } from '@renderer/presentation/effects/capture.effect';
import { TIMING } from '@platform/config';
import { createUIEffectsElementsMock } from '../../../../factories/ui.factory.js';
import { installDocumentCreateElementMock } from '../../../../support/mocks/browser-api.installers.js';

const HIDE_DELAY = TIMING.CURSOR_HIDE_DELAY_MS;

describe('UIEffects', () => {
  describe('activity and visibility', () => {
    let effects: UIEffects;
    let toolbar: HTMLElement;
    let controls: HTMLElement;
    const cursorHidden = () => document.body.classList.contains('cursor-hidden');
    const toolbarHidden = () => toolbar.classList.contains('toolbar-hidden');
    const controlsHidden = () => controls.classList.contains('fullscreen-hidden');
    const move = () => {
      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16);
    };
    const enableStreaming = () => {
      effects.enableToolbarAutoHide(toolbar);
      effects.enableCursorAutoHide();
    };

    beforeEach(() => {
      vi.useFakeTimers();
      toolbar = document.createElement('div');
      controls = document.createElement('div');
      document.body.append(toolbar, controls);
      effects = new UIEffects();
    });
    afterEach(async () => {
      await effects.dispose();
      vi.restoreAllMocks();
      vi.useRealTimers();
      document.body.innerHTML = '';
      document.body.classList.remove('cursor-hidden');
    });

    it('hides cursor and toolbar after inactivity and restarts the delay on mouse activity', () => {
      enableStreaming();
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(cursorHidden()).toBe(true);
      expect(toolbarHidden()).toBe(true);
      move();
      expect(cursorHidden()).toBe(false);
      expect(toolbarHidden()).toBe(false);
      vi.advanceTimersByTime(HIDE_DELAY - 1);
      expect(toolbarHidden()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(toolbarHidden()).toBe(true);
    });

    it('coalesces cursor activity into one frame and cancels it when disabled', () => {
      const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
      effects.enableCursorAutoHide();
      document.dispatchEvent(new MouseEvent('mousemove'));
      document.dispatchEvent(new MouseEvent('mousemove'));
      expect(requestFrame).toHaveBeenCalledTimes(1);
      effects.disableCursorAutoHide();
      vi.runAllTimers();
      expect(cursorHidden()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not duplicate activity listeners when enabled repeatedly', () => {
      const listen = vi.spyOn(document, 'addEventListener');
      effects.enableCursorAutoHide();
      effects.enableCursorAutoHide();
      expect(listen.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(1);
    });

    it('keeps the remaining streaming effect active when the other is disabled', () => {
      enableStreaming();
      effects.disableCursorAutoHide();
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(cursorHidden()).toBe(false);
      expect(toolbarHidden()).toBe(true);
      effects.enableCursorAutoHide();
      effects.disableToolbarAutoHide();
      expect(toolbarHidden()).toBe(false);
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(cursorHidden()).toBe(true);
    });

    it('pauses streaming hide while hovering and resumes after leaving', () => {
      enableStreaming();
      toolbar.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(HIDE_DELAY * 2);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);
      toolbar.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(toolbarHidden()).toBe(true);
      expect(cursorHidden()).toBe(true);
    });

    it.each(['shader-panel visible', 'panel-open'])('keeps an open %s visible, including a change before the hide callback', (className) => {
      enableStreaming();
      const panel = document.createElement('div');
      panel.className = className;
      toolbar.append(panel);
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(toolbarHidden()).toBe(false);
      move();
      vi.advanceTimersByTime(HIDE_DELAY * 2);
      expect(cursorHidden()).toBe(false);
      panel.className = '';
      move();
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(toolbarHidden()).toBe(true);
    });

    it.each(['mousemove', 'pointermove', 'mousedown'])('fullscreen controls show and reset inactivity on document %s', (type) => {
      enableStreaming();
      effects.enableControlsAutoHide(controls);
      vi.advanceTimersByTime(HIDE_DELAY);
      expect([controlsHidden(), toolbarHidden(), cursorHidden()]).toEqual([true, true, true]);
      document.dispatchEvent(new MouseEvent(type));
      vi.advanceTimersByTime(16);
      expect([controlsHidden(), toolbarHidden(), cursorHidden()]).toEqual([false, false, false]);
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(controlsHidden()).toBe(true);
    });

    it.each(['mouseenter', 'focusin'])('fullscreen controls respond immediately to %s', (type) => {
      effects.enableControlsAutoHide(controls);
      vi.advanceTimersByTime(HIDE_DELAY);
      controls.dispatchEvent(new Event(type));
      expect(controlsHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(controlsHidden()).toBe(true);
    });

    it.each(['mouseleave', 'focusout'])('fullscreen controls restart the delay on %s', (type) => {
      effects.enableControlsAutoHide(controls);
      vi.advanceTimersByTime(HIDE_DELAY - 100);
      controls.dispatchEvent(new Event(type));
      vi.advanceTimersByTime(100);
      expect(controlsHidden()).toBe(false);
      vi.advanceTimersByTime(HIDE_DELAY - 100);
      expect(controlsHidden()).toBe(true);
    });

    it('restores the streaming timer when fullscreen controls release ownership', () => {
      enableStreaming();
      effects.enableControlsAutoHide(controls);
      vi.advanceTimersByTime(HIDE_DELAY);
      effects.disableControlsAutoHide();
      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(false);
      move();
      vi.advanceTimersByTime(HIDE_DELAY);
      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(true);
    });

    it('cleans listeners and pending work across repeated enable/disable cycles and disposal', async () => {
      for (let i = 0; i < 3; i++) {
        enableStreaming();
        effects.enableControlsAutoHide(controls);
        move();
        effects.disableCursorAutoHide();
        effects.disableToolbarAutoHide();
        effects.disableControlsAutoHide();
      }
      await effects.dispose();
      document.dispatchEvent(new MouseEvent('mousemove'));
      toolbar.dispatchEvent(new MouseEvent('mouseenter'));
      vi.runAllTimers();
      expect(vi.getTimerCount()).toBe(0);
      expect([controlsHidden(), toolbarHidden(), cursorHidden()]).toEqual([false, false, false]);
    });

    it('waits for asynchronous effect cleanup after another effect fails', async () => {
      const pending = Promise.withResolvers<void>();
      vi.spyOn(CaptureEffects.prototype, 'dispose').mockReturnValue(pending.promise);
      vi.spyOn(effects._buttonFeedback, 'dispose').mockImplementation(() => { throw new Error('button cleanup failed'); });
      const disposal = Promise.resolve(effects.dispose());
      const rejected = expect(disposal).rejects.toThrow('button cleanup failed');
      let settled = false;
      void disposal.then(() => { settled = true; }, () => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      pending.resolve();
      await rejected;
      vi.restoreAllMocks();
    });
  });
  describe('integrated capture and button effects', () => {
  let uiEffects;
  let mockElements;
  let mockFlashElement;
  let mockRecordBtn;
  let documentMock;

  beforeEach(() => {
    vi.useFakeTimers();

    mockElements = createUIEffectsElementsMock();
    mockRecordBtn = mockElements.recordBtn;
    mockFlashElement = mockElements.flashElement;

    documentMock = installDocumentCreateElementMock({
      createElement: vi.fn(() => mockFlashElement),
      appendChild: vi.fn()
    });

    uiEffects = new UIEffects({
      elements: mockElements
    });
  });

  afterEach(async () => {
    await uiEffects.dispose();
    documentMock?.cleanup();
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
      mockFlashElement.parentNode.removeChild(mockFlashElement);

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
      // Spy on the internal button feedback component
      const spy = vi.spyOn(uiEffects._buttonFeedback, 'triggerButtonFeedback');

      uiEffects.triggerRecordButtonPop();

      expect(spy).toHaveBeenCalledWith('recordBtn', 'btn-pop', TIMING.UI_TIMEOUT_MS);
    });
  });

  describe('triggerRecordButtonPress', () => {
    it('should call triggerButtonFeedback with correct arguments', () => {
      // Spy on the internal button feedback component
      const spy = vi.spyOn(uiEffects._buttonFeedback, 'triggerButtonFeedback');

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
});
