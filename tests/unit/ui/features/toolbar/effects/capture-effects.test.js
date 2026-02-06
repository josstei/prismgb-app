/**
 * CaptureEffects Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CaptureEffects } from '@renderer/presentation/effects/capture.effect.ts';

describe('CaptureEffects', () => {
  let captureEffects;

  beforeEach(() => {
    captureEffects = new CaptureEffects();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('triggerShutterFlash', () => {
    it('should create a flash overlay with shutter-flash class', () => {
      captureEffects.triggerShutterFlash();

      const flash = document.querySelector('.shutter-flash');
      expect(flash).not.toBeNull();
      expect(flash.className).toBe('shutter-flash');
    });

    it('should remove flash overlay after animationend', () => {
      captureEffects.triggerShutterFlash();

      const flash = document.querySelector('.shutter-flash');
      expect(flash).not.toBeNull();

      flash.dispatchEvent(new Event('animationend'));

      expect(document.querySelector('.shutter-flash')).toBeNull();
    });

    it('should remove flash overlay after timeout fallback', () => {
      captureEffects.triggerShutterFlash();

      const flash = document.querySelector('.shutter-flash');
      expect(flash).not.toBeNull();

      vi.advanceTimersByTime(500);

      expect(document.querySelector('.shutter-flash')).toBeNull();
    });
  });

  describe('dispose', () => {
    it('should complete without error', () => {
      expect(() => captureEffects.dispose()).not.toThrow();
    });
  });
});
