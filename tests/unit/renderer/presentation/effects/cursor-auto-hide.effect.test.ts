/**
 * CursorAutoHide Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CursorAutoHide } from '@renderer/presentation/effects/cursor-auto-hide.effect';
import { createCallbackMap } from '../../../../factories/index.js';

describe('CursorAutoHide', () => {
  let autoHide;
  let callbacks;

  beforeEach(() => {
    vi.useFakeTimers();

    callbacks = createCallbackMap(['onActivity', 'onHide']);

    document.body.className = '';
  });

  afterEach(() => {
    autoHide?.dispose();
    document.body.className = '';
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      autoHide = new CursorAutoHide();
      expect(autoHide.isEnabled).toBe(false);
    });

    it('should accept callback options', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();

      expect(callbacks.onActivity).toHaveBeenCalled();
    });

    it('should use default callbacks when not provided', () => {
      autoHide = new CursorAutoHide();
      expect(() => autoHide.enable()).not.toThrow();
    });
  });

  describe('enable', () => {
    it('should enable auto-hide behavior', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();

      expect(autoHide.isEnabled).toBe(true);
    });

    it('should not re-enable if already enabled', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();
      autoHide.enable();

      expect(callbacks.onActivity).toHaveBeenCalledTimes(1);
    });

    it('should call onActivity callback', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();

      expect(callbacks.onActivity).toHaveBeenCalled();
    });

    it('should add document mousemove listener', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    });
  });

  describe('disable', () => {
    it('should disable auto-hide behavior', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();
      autoHide.disable();

      expect(autoHide.isEnabled).toBe(false);
    });

    it('should not re-disable if already disabled', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.disable();

      expect(autoHide.isEnabled).toBe(false);
    });

    it('should remove document mousemove listener', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();
      autoHide.disable();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    });

    it('should show cursor on disable', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();
      autoHide.hide();

      expect(document.body.classList.contains('cursor-hidden')).toBe(true);

      autoHide.disable();

      expect(document.body.classList.contains('cursor-hidden')).toBe(false);
    });

    it('should cancel pending RAF', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();

      // Trigger mouse move to start RAF
      document.dispatchEvent(new MouseEvent('mousemove'));

      // Disable before RAF fires
      autoHide.disable();

      expect(autoHide._activityController._isActivityFramePending).toBe(false);
    });
  });

  describe('mouse move handling', () => {
    beforeEach(() => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();
      callbacks.onActivity.mockClear();
    });

    it('should show cursor on mouse move', () => {
      autoHide.hide();

      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16); // RAF tick

      expect(document.body.classList.contains('cursor-hidden')).toBe(false);
    });

    it('should call onActivity on mouse move', () => {
      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16); // RAF tick

      expect(callbacks.onActivity).toHaveBeenCalled();
    });

    it('should use RAF throttling', () => {
      // First move
      document.dispatchEvent(new MouseEvent('mousemove'));

      // Second move before RAF fires
      document.dispatchEvent(new MouseEvent('mousemove'));

      // Third move before RAF fires
      document.dispatchEvent(new MouseEvent('mousemove'));

      vi.advanceTimersByTime(16);

      // onActivity should only be called once
      expect(callbacks.onActivity).toHaveBeenCalledTimes(1);
    });

    it('should allow new RAF after previous completes', () => {
      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16);

      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16);

      expect(callbacks.onActivity).toHaveBeenCalledTimes(2);
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      autoHide = new CursorAutoHide(callbacks);
    });

    it('should add cursor-hidden class to body', () => {
      autoHide.hide();
      expect(document.body.classList.contains('cursor-hidden')).toBe(true);
    });

    it('should call onHide callback', () => {
      autoHide.hide();
      expect(callbacks.onHide).toHaveBeenCalled();
    });
  });

  describe('show', () => {
    beforeEach(() => {
      autoHide = new CursorAutoHide(callbacks);
    });

    it('should remove cursor-hidden class from body', () => {
      document.body.classList.add('cursor-hidden');
      autoHide.show();

      expect(document.body.classList.contains('cursor-hidden')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should call disable', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();

      autoHide.dispose();

      expect(autoHide.isEnabled).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      autoHide = new CursorAutoHide(callbacks);
      autoHide.enable();

      expect(() => {
        autoHide.dispose();
        autoHide.dispose();
      }).not.toThrow();
    });
  });
});
