import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedbackEffect } from '@renderer/presentation/effects/feedback.effect';
import { TIMING } from '@renderer/lib/timing.config';

describe('FeedbackEffect', () => {
  let screenshotBtn: HTMLButtonElement;
  let recordBtn: HTMLButtonElement;
  let effect: FeedbackEffect;

  const flashes = () => document.body.querySelectorAll('.shutter-flash');

  beforeEach(() => {
    vi.useFakeTimers();
    screenshotBtn = document.createElement('button');
    recordBtn = document.createElement('button');
    document.body.append(screenshotBtn, recordBtn);
    effect = new FeedbackEffect({ screenshotBtn, recordBtn });
  });

  afterEach(async () => {
    await effect.dispose();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('shutterFlash', () => {
    it('appends a shutter-flash overlay to the body', () => {
      effect.shutterFlash();

      expect(flashes()).toHaveLength(1);
      expect(flashes()[0].className).toBe('shutter-flash');
      expect(flashes()[0].parentElement).toBe(document.body);
    });

    it('removes the overlay when its animation ends', () => {
      effect.shutterFlash();

      flashes()[0].dispatchEvent(new Event('animationend'));

      expect(flashes()).toHaveLength(0);
    });

    it('removes the overlay after the 500 ms fallback when no animationend fires', () => {
      effect.shutterFlash();

      vi.advanceTimersByTime(499);
      expect(flashes()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(flashes()).toHaveLength(0);
    });

    it('cleans up once when animationend fires before the fallback', () => {
      effect.shutterFlash();
      const flash = flashes()[0];
      const remove = vi.spyOn(flash, 'remove');

      flash.dispatchEvent(new Event('animationend'));
      vi.advanceTimersByTime(500);

      expect(remove).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('tolerates an overlay that was already detached', () => {
      effect.shutterFlash();
      const flash = flashes()[0];
      flash.remove();

      expect(() => flash.dispatchEvent(new Event('animationend'))).not.toThrow();
      expect(flashes()).toHaveLength(0);
    });

    it('keeps rapid flashes independent', () => {
      effect.shutterFlash();
      vi.advanceTimersByTime(300);
      effect.shutterFlash();
      expect(flashes()).toHaveLength(2);

      vi.advanceTimersByTime(200);
      expect(flashes()).toHaveLength(1);
      vi.advanceTimersByTime(300);
      expect(flashes()).toHaveLength(0);
    });

    it('removes pending overlays on dispose', async () => {
      effect.shutterFlash();

      await effect.dispose();

      expect(flashes()).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('button pulses', () => {
    it.each([
      ['screenshotFeedback', () => screenshotBtn, 'capturing', TIMING.BUTTON_FEEDBACK_MS],
      ['recordButtonPop', () => recordBtn, 'btn-pop', TIMING.UI_TIMEOUT_MS],
      ['recordButtonPress', () => recordBtn, 'btn-press', TIMING.UI_TIMEOUT_MS]
    ] as const)('%s adds %s for its duration', (method, element, className, durationMs) => {
      effect[method]();
      expect(element().classList.contains(className)).toBe(true);

      vi.advanceTimersByTime(durationMs - 1);
      expect(element().classList.contains(className)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(element().classList.contains(className)).toBe(false);
    });

    it('restarts the pulse with a forced reflow when re-triggered', () => {
      const classes: boolean[] = [];
      vi.spyOn(screenshotBtn, 'offsetWidth', 'get').mockImplementation(() => {
        classes.push(screenshotBtn.classList.contains('capturing'));
        return 0;
      });

      effect.screenshotFeedback();
      vi.advanceTimersByTime(TIMING.BUTTON_FEEDBACK_MS - 50);
      effect.screenshotFeedback();

      expect(classes).toEqual([false, false]);
      vi.advanceTimersByTime(TIMING.BUTTON_FEEDBACK_MS - 1);
      expect(screenshotBtn.classList.contains('capturing')).toBe(true);
      vi.advanceTimersByTime(1);
      expect(screenshotBtn.classList.contains('capturing')).toBe(false);
    });

    it('runs pop and press independently on the record button', () => {
      effect.recordButtonPop();
      effect.recordButtonPress();

      expect(recordBtn.classList.contains('btn-pop')).toBe(true);
      expect(recordBtn.classList.contains('btn-press')).toBe(true);
    });

    it('removes active pulse classes on dispose', async () => {
      effect.screenshotFeedback();
      effect.recordButtonPop();

      await effect.dispose();

      expect(screenshotBtn.classList.contains('capturing')).toBe(false);
      expect(recordBtn.classList.contains('btn-pop')).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does nothing when the buttons are missing', () => {
      const detached = new FeedbackEffect({ screenshotBtn: null, recordBtn: null });

      expect(() => {
        detached.screenshotFeedback();
        detached.recordButtonPop();
        detached.recordButtonPress();
        detached.setRecording(true);
        detached.setRecordButtonDisabled(true);
      }).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('record button state', () => {
    it('toggles the recording class', () => {
      effect.setRecording(true);
      expect(recordBtn.classList.contains('recording')).toBe(true);

      effect.setRecording(false);
      expect(recordBtn.classList.contains('recording')).toBe(false);
    });

    it('toggles only the disabled attribute', () => {
      effect.setRecordButtonDisabled(true);
      expect(recordBtn.disabled).toBe(true);
      expect(recordBtn.hasAttribute('disabled')).toBe(true);
      expect(recordBtn.classList.contains('disabled')).toBe(false);

      effect.setRecordButtonDisabled(false);
      expect(recordBtn.disabled).toBe(false);
      expect(recordBtn.hasAttribute('disabled')).toBe(false);
    });
  });
});
