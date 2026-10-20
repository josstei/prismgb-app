import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoHideEffect } from '@renderer/presentation/effects/auto-hide.effect';
import { TIMING } from '@renderer/lib/timing.config';

const DELAY = TIMING.CURSOR_HIDE_DELAY_MS;
const FRAME_MS = 16;

describe('AutoHideEffect', () => {
  let effect: AutoHideEffect;
  let toolbar: HTMLElement;
  let shaderPanel: HTMLElement;
  let shaderButton: HTMLElement;
  let controls: HTMLElement;

  const cursorHidden = () => document.body.classList.contains('cursor-hidden');
  const toolbarHidden = () => toolbar.classList.contains('toolbar-hidden');
  const controlsHidden = () => controls.classList.contains('fullscreen-hidden');
  const fire = (target: EventTarget, type: string) => target.dispatchEvent(new Event(type));

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = '';
    document.body.innerHTML = `
      <div id="toolbar"><button class="shader-btn"></button><div class="shader-panel"></div></div>
      <div id="controls"><button id="exit"></button></div>
    `;
    toolbar = document.getElementById('toolbar')!;
    shaderButton = toolbar.querySelector('.shader-btn')!;
    shaderPanel = toolbar.querySelector('.shader-panel')!;
    controls = document.getElementById('controls')!;
    effect = new AutoHideEffect();
  });

  afterEach(async () => {
    await effect.dispose();
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.body.className = '';
  });

  describe('cursor', () => {
    it('shows the cursor immediately on enable and hides it after the idle delay', () => {
      document.body.classList.add('cursor-hidden');

      effect.enableCursor();
      expect(cursorHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY - 1);
      expect(cursorHidden()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(cursorHidden()).toBe(true);
    });

    it('binds one document mousemove listener even when enabled twice', () => {
      const addListener = vi.spyOn(document, 'addEventListener');

      effect.enableCursor();
      effect.enableCursor();

      expect(addListener.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(1);
    });

    it('shows the cursor and restarts the idle timer on the next frame after mouse movement', () => {
      effect.enableCursor();
      vi.advanceTimersByTime(DELAY);
      expect(cursorHidden()).toBe(true);

      fire(document, 'mousemove');
      expect(cursorHidden()).toBe(true);
      vi.advanceTimersByTime(FRAME_MS);
      expect(cursorHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY - FRAME_MS - 1);
      expect(cursorHidden()).toBe(false);
      vi.advanceTimersByTime(FRAME_MS + 1);
      expect(cursorHidden()).toBe(true);
    });

    it('drops mouse movement while an activity frame is pending', () => {
      const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
      effect.enableCursor();

      fire(document, 'mousemove');
      fire(document, 'mousemove');
      fire(document, 'mousemove');
      expect(requestFrame).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(FRAME_MS);
      fire(document, 'mousemove');
      expect(requestFrame).toHaveBeenCalledTimes(2);
    });

    it('shows the cursor, unbinds mousemove and cancels the pending frame on disable', () => {
      const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
      effect.enableCursor();
      vi.advanceTimersByTime(DELAY);
      expect(cursorHidden()).toBe(true);

      fire(document, 'mousemove');
      effect.disableCursor();
      expect(cursorHidden()).toBe(false);

      document.body.classList.add('cursor-hidden');
      vi.advanceTimersByTime(FRAME_MS);
      expect(cursorHidden()).toBe(true);

      requestFrame.mockClear();
      fire(document, 'mousemove');
      expect(requestFrame).not.toHaveBeenCalled();
    });

    it('re-arms the frame throttle after a disable cancelled a pending frame', () => {
      const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
      effect.enableCursor();
      fire(document, 'mousemove');
      effect.disableCursor();

      effect.enableCursor();
      requestFrame.mockClear();
      fire(document, 'mousemove');

      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it('cancels the idle timer on disable when the toolbar is not managed', () => {
      effect.enableCursor();
      expect(vi.getTimerCount()).toBe(1);

      effect.disableCursor();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the idle timer for the toolbar after the cursor is disabled', () => {
      effect.enableToolbar(toolbar);
      effect.enableCursor();
      effect.disableCursor();

      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(true);
      expect(cursorHidden()).toBe(false);
    });
  });

  describe('toolbar', () => {
    it('ignores a missing element', () => {
      effect.enableToolbar(null);
      effect.enableCursor();

      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(true);
    });

    it('shows the toolbar on enable and hides it after the idle delay', () => {
      toolbar.classList.add('toolbar-hidden');

      effect.enableToolbar(toolbar);
      expect(toolbarHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY);
      expect(toolbarHidden()).toBe(true);
      expect(cursorHidden()).toBe(false);
    });

    it('keeps the first toolbar when enabled again', () => {
      const other = document.createElement('div');
      effect.enableToolbar(toolbar);
      effect.enableToolbar(other);

      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(true);
      expect(other.classList.contains('toolbar-hidden')).toBe(false);
    });

    it('hides cursor and toolbar together when both are managed', () => {
      effect.enableToolbar(toolbar);
      effect.enableCursor();

      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(true);
      expect(cursorHidden()).toBe(true);
    });

    it('shows the toolbar again on cursor activity', () => {
      effect.enableToolbar(toolbar);
      effect.enableCursor();
      vi.advanceTimersByTime(DELAY);

      fire(document, 'mousemove');
      vi.advanceTimersByTime(FRAME_MS);

      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);
    });

    it('pauses the idle timer while hovered and shows the managed cursor', () => {
      effect.enableToolbar(toolbar);
      effect.enableCursor();
      vi.advanceTimersByTime(DELAY);

      fire(toolbar, 'mouseenter');
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY * 2);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);
    });

    it('does not touch the cursor on hover when cursor auto-hide is off', () => {
      effect.enableToolbar(toolbar);
      document.body.classList.add('cursor-hidden');

      fire(toolbar, 'mouseenter');

      expect(cursorHidden()).toBe(true);
    });

    it('does not restart the idle timer from cursor activity while hovered', () => {
      effect.enableToolbar(toolbar);
      effect.enableCursor();
      fire(toolbar, 'mouseenter');

      fire(document, 'mousemove');
      vi.advanceTimersByTime(FRAME_MS + DELAY);

      expect(toolbarHidden()).toBe(false);
    });

    it('restarts the idle timer when the pointer leaves', () => {
      effect.enableToolbar(toolbar);
      fire(toolbar, 'mouseenter');

      fire(toolbar, 'mouseleave');
      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(true);
    });

    it('stays visible after the pointer leaves while the shader panel is visible', () => {
      effect.enableToolbar(toolbar);
      fire(toolbar, 'mouseenter');
      shaderPanel.classList.add('visible');

      fire(toolbar, 'mouseleave');
      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(false);
    });

    it('does not start the idle timer while a toolbar button has panel-open', () => {
      shaderButton.classList.add('panel-open');
      effect.enableCursor();
      effect.enableToolbar(toolbar);

      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);
    });

    it('still hides the cursor but keeps the toolbar when a panel opens during the idle delay', () => {
      effect.enableToolbar(toolbar);
      effect.enableCursor();

      shaderPanel.classList.add('visible');
      vi.advanceTimersByTime(DELAY);

      expect(cursorHidden()).toBe(true);
      expect(toolbarHidden()).toBe(false);
    });

    it('shows and releases the toolbar on disable', () => {
      effect.enableToolbar(toolbar);
      vi.advanceTimersByTime(DELAY);

      effect.disableToolbar();
      expect(toolbarHidden()).toBe(false);

      fire(toolbar, 'mouseleave');
      vi.advanceTimersByTime(DELAY);
      expect(toolbarHidden()).toBe(false);
    });

    it('cancels the idle timer on disable when the cursor is not managed', () => {
      effect.enableToolbar(toolbar);
      expect(vi.getTimerCount()).toBe(1);

      effect.disableToolbar();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the idle timer for the cursor after the toolbar is disabled', () => {
      effect.enableCursor();
      effect.enableToolbar(toolbar);
      effect.disableToolbar();

      vi.advanceTimersByTime(DELAY);

      expect(cursorHidden()).toBe(true);
      expect(toolbarHidden()).toBe(false);
    });

    it('resets hover state when re-enabled', () => {
      effect.enableToolbar(toolbar);
      fire(toolbar, 'mouseenter');
      effect.disableToolbar();

      effect.enableToolbar(toolbar);
      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(true);
    });
  });

  describe('fullscreen controls', () => {
    it('ignores a missing element', () => {
      effect.enableToolbar(toolbar);
      effect.enableControls(null);

      vi.advanceTimersByTime(DELAY);

      expect(toolbarHidden()).toBe(true);
      expect(cursorHidden()).toBe(false);
    });

    it('hides controls, toolbar and cursor together after the delay', () => {
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);

      vi.advanceTimersByTime(DELAY - 1);
      expect(controlsHidden()).toBe(false);
      vi.advanceTimersByTime(1);

      expect(controlsHidden()).toBe(true);
      expect(toolbarHidden()).toBe(true);
      expect(cursorHidden()).toBe(true);
    });

    it('hides the cursor even when cursor auto-hide is off', () => {
      effect.enableControls(controls);

      vi.advanceTimersByTime(DELAY);

      expect(cursorHidden()).toBe(true);
    });

    it('keeps the toolbar visible when a panel is open as the controls hide', () => {
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);
      shaderPanel.classList.add('visible');

      vi.advanceTimersByTime(DELAY);

      expect(controlsHidden()).toBe(true);
      expect(toolbarHidden()).toBe(false);
    });

    it('takes over from the idle timer', () => {
      effect.enableCursor();
      effect.enableToolbar(toolbar);
      vi.advanceTimersByTime(DELAY - 500);

      effect.enableControls(controls);
      vi.advanceTimersByTime(500);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY - 500);
      expect(controlsHidden()).toBe(true);
      expect(toolbarHidden()).toBe(true);
      expect(cursorHidden()).toBe(true);
    });

    it('does not start the idle timer while managing', () => {
      effect.enableCursor();
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);

      fire(toolbar, 'mouseleave');
      vi.advanceTimersByTime(DELAY - 1);
      fire(controls, 'focusin');
      vi.advanceTimersByTime(1);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY - 1);
      expect(controlsHidden()).toBe(true);
      expect(toolbarHidden()).toBe(true);
    });

    it.each(['mousemove', 'pointermove', 'mousedown'])('shows everything on the next frame after document %s', (type) => {
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);
      vi.advanceTimersByTime(DELAY);

      fire(document, type);
      expect(controlsHidden()).toBe(true);
      vi.advanceTimersByTime(FRAME_MS);

      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY);
      expect(controlsHidden()).toBe(true);
    });

    it('throttles document activity to one frame', () => {
      const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
      effect.enableControls(controls);

      fire(document, 'mousemove');
      fire(document, 'pointermove');
      fire(document, 'mousedown');

      expect(requestFrame).toHaveBeenCalledTimes(1);
    });

    it.each(['mouseenter', 'focusin'])('shows immediately on controls %s', (type) => {
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);
      vi.advanceTimersByTime(DELAY);

      fire(controls, type);

      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);
    });

    it.each(['mouseleave', 'focusout'])('restarts the hide timer on controls %s', (type) => {
      effect.enableControls(controls);
      vi.advanceTimersByTime(DELAY - 1);

      fire(controls, type);
      vi.advanceTimersByTime(DELAY - 1);
      expect(controlsHidden()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(controlsHidden()).toBe(true);
    });

    it('shows the controls, cancels the pending frame and resumes the idle timer on disable', () => {
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);
      vi.advanceTimersByTime(DELAY);
      fire(document, 'mousemove');

      effect.disableControls();
      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(false);

      vi.advanceTimersByTime(FRAME_MS);
      expect(cursorHidden()).toBe(true);

      fire(controls, 'mouseenter');
      vi.advanceTimersByTime(DELAY - FRAME_MS);
      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(true);
    });

    it('lets the managed cursor take over again after disable', () => {
      effect.enableCursor();
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);
      vi.advanceTimersByTime(DELAY);

      effect.disableControls();
      fire(document, 'mousemove');
      vi.advanceTimersByTime(FRAME_MS);
      expect(cursorHidden()).toBe(false);

      vi.advanceTimersByTime(DELAY);
      expect(cursorHidden()).toBe(true);
      expect(toolbarHidden()).toBe(true);
      expect(controlsHidden()).toBe(false);
    });

    it('leaves the cursor hidden after disable when cursor auto-hide is off', () => {
      effect.enableControls(controls);
      vi.advanceTimersByTime(DELAY);

      effect.disableControls();

      expect(cursorHidden()).toBe(true);
    });

    it('keeps the first listeners but tracks the latest element when enabled again', () => {
      const other = document.createElement('div');
      effect.enableControls(controls);
      effect.enableControls(other);
      vi.advanceTimersByTime(DELAY);

      expect(other.classList.contains('fullscreen-hidden')).toBe(true);
      fire(other, 'mouseenter');
      expect(other.classList.contains('fullscreen-hidden')).toBe(true);
      fire(controls, 'mouseenter');
      expect(other.classList.contains('fullscreen-hidden')).toBe(false);

      vi.advanceTimersByTime(DELAY);
      effect.disableControls();
      expect(other.classList.contains('fullscreen-hidden')).toBe(false);
    });

    it('does nothing on disable when not enabled', () => {
      effect.enableToolbar(toolbar);
      vi.advanceTimersByTime(DELAY);

      effect.disableControls();

      expect(toolbarHidden()).toBe(true);
    });
  });

  describe('dispose', () => {
    it('restores every class and stops all timers and listeners', async () => {
      effect.enableCursor();
      effect.enableToolbar(toolbar);
      effect.enableControls(controls);
      vi.advanceTimersByTime(DELAY);

      await effect.dispose();

      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);

      fire(document, 'mousemove');
      fire(toolbar, 'mouseleave');
      vi.advanceTimersByTime(DELAY * 2);
      expect(controlsHidden()).toBe(false);
      expect(toolbarHidden()).toBe(false);
      expect(cursorHidden()).toBe(false);
    });
  });
});
