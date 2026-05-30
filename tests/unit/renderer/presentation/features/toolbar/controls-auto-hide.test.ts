/**
 * ControlsAutoHide Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ControlsAutoHide } from '@renderer/presentation/effects/controls-auto-hide.effect';
import { createCallbackMap } from '../../../../../factories/index.js';

describe('ControlsAutoHide', () => {
  let autoHide;
  let controlsElement;
  let callbacks;

  beforeEach(() => {
    vi.useFakeTimers();

    callbacks = createCallbackMap(['onShowAll', 'onHideAll', 'onEnable', 'onDisable']);

    controlsElement = document.createElement('div');
    controlsElement.className = 'fullscreen-controls';
    document.body.appendChild(controlsElement);
  });

  afterEach(() => {
    autoHide?.dispose();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      autoHide = new ControlsAutoHide();
      expect(autoHide.isEnabled).toBe(false);
    });

    it('should accept callback options', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);

      expect(callbacks.onEnable).toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it('should enable auto-hide behavior', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);

      expect(autoHide.isEnabled).toBe(true);
    });

    it('should not enable without element', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(null);

      expect(autoHide.isEnabled).toBe(false);
    });

    it('should not re-enable if already enabled', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      autoHide.enable(controlsElement);

      expect(callbacks.onEnable).toHaveBeenCalledTimes(1);
    });

    it('should call onEnable callback', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);

      expect(callbacks.onEnable).toHaveBeenCalled();
    });

    it('should start hide timer', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);

      vi.advanceTimersByTime(2000); // TIMING.CURSOR_HIDE_DELAY_MS

      expect(callbacks.onHideAll).toHaveBeenCalled();
    });

    it('should add document event listeners', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    });
  });

  describe('disable', () => {
    it('should disable auto-hide behavior', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      autoHide.disable();

      expect(autoHide.isEnabled).toBe(false);
    });

    it('should call onDisable callback', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      autoHide.disable();

      expect(callbacks.onDisable).toHaveBeenCalled();
    });

    it('should not call onDisable if not enabled', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.disable();

      expect(callbacks.onDisable).not.toHaveBeenCalled();
    });

    it('should show controls on disable', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      controlsElement.classList.add('fullscreen-hidden');

      autoHide.disable();

      expect(controlsElement.classList.contains('fullscreen-hidden')).toBe(false);
    });

    it('should remove document event listeners', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      autoHide.disable();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    });

    it('should clear hide timer', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      autoHide.disable();

      vi.advanceTimersByTime(5000);

      // onHideAll should not be called because timer was cleared
      expect(callbacks.onHideAll).not.toHaveBeenCalled();
    });

    it('should clear element reference', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      autoHide.disable();

      expect(autoHide._element).toBeNull();
    });
  });

  describe('mouse move handling', () => {
    beforeEach(() => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
    });

    it('should show controls and reset timer on mouse move', () => {
      controlsElement.classList.add('fullscreen-hidden');

      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16); // RAF tick

      expect(controlsElement.classList.contains('fullscreen-hidden')).toBe(false);
      expect(callbacks.onShowAll).toHaveBeenCalled();
    });

    it('should use RAF throttling for mouse moves', () => {
      // First move
      document.dispatchEvent(new MouseEvent('mousemove'));

      // Second move before RAF fires
      document.dispatchEvent(new MouseEvent('mousemove'));

      // Only one RAF should be pending
      vi.advanceTimersByTime(16);

      // onShowAll should only be called once
      expect(callbacks.onShowAll).toHaveBeenCalledTimes(1);
    });

    it('should reset hide timer on each mouse move', () => {
      // TIMING.CURSOR_HIDE_DELAY_MS is 2000ms
      vi.advanceTimersByTime(1500); // Advance 1500ms, timer hasn't fired yet

      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16); // RAF tick - this resets the timer

      vi.advanceTimersByTime(1500); // 1500ms after reset, timer hasn't fired yet
      expect(callbacks.onHideAll).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500); // Total 2000ms since last move - timer fires
      expect(callbacks.onHideAll).toHaveBeenCalled();
    });
  });

  describe('element event handling', () => {
    beforeEach(() => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
      callbacks.onShowAll.mockClear();
    });

    it('should show controls on mouseenter', () => {
      controlsElement.classList.add('fullscreen-hidden');
      controlsElement.dispatchEvent(new MouseEvent('mouseenter'));

      expect(controlsElement.classList.contains('fullscreen-hidden')).toBe(false);
      expect(callbacks.onShowAll).toHaveBeenCalled();
    });

    it('should reset timer on mouseleave', () => {
      controlsElement.dispatchEvent(new MouseEvent('mouseleave'));

      vi.advanceTimersByTime(2000);
      expect(callbacks.onHideAll).toHaveBeenCalled();
    });

    it('should show controls on focusin', () => {
      controlsElement.classList.add('fullscreen-hidden');
      controlsElement.dispatchEvent(new FocusEvent('focusin'));

      expect(controlsElement.classList.contains('fullscreen-hidden')).toBe(false);
      expect(callbacks.onShowAll).toHaveBeenCalled();
    });

    it('should reset timer on focusout', () => {
      controlsElement.dispatchEvent(new FocusEvent('focusout'));

      vi.advanceTimersByTime(2000);
      expect(callbacks.onHideAll).toHaveBeenCalled();
    });
  });

  describe('hide behavior', () => {
    beforeEach(() => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
    });

    it('should add hidden class after timer expires', () => {
      vi.advanceTimersByTime(2000);

      expect(controlsElement.classList.contains('fullscreen-hidden')).toBe(true);
    });

    it('should call onHideAll when hiding', () => {
      vi.advanceTimersByTime(2000);

      expect(callbacks.onHideAll).toHaveBeenCalled();
    });
  });

  describe('show behavior', () => {
    beforeEach(() => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);
    });

    it('should remove hidden class', () => {
      vi.advanceTimersByTime(2000);
      expect(controlsElement.classList.contains('fullscreen-hidden')).toBe(true);

      document.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(16);

      expect(controlsElement.classList.contains('fullscreen-hidden')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should call disable', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);

      autoHide.dispose();

      expect(autoHide.isEnabled).toBe(false);
      expect(callbacks.onDisable).toHaveBeenCalled();
    });
  });

  describe('RAF cleanup', () => {
    it('should cancel pending RAF on disable', () => {
      autoHide = new ControlsAutoHide(callbacks);
      autoHide.enable(controlsElement);

      // Trigger a mouse move to start RAF
      document.dispatchEvent(new MouseEvent('mousemove'));

      // Disable before RAF fires
      autoHide.disable();

      // Advance time - RAF callback should not execute
      vi.advanceTimersByTime(100);

      // onShowAll was called during enable, but should not be called again
      expect(callbacks.onShowAll).toHaveBeenCalledTimes(0);
    });
  });
});
