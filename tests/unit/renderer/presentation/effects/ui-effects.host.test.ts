/**
 * UIEffects Unit Tests
 * Coordination/delegation with mocked auto-hide collaborators, plus
 * integrated capture-flash and button-feedback behavior through the
 * real sub-effects.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let cursorInstance;
let toolbarInstance;
let controlsInstance;
let unifiedControllerInstance;
let cursorOptions;
let toolbarOptions;
let controlsOptions;
let unifiedControllerOptions;

vi.mock('@renderer/presentation/effects/cursor-auto-hide.effect.ts', () => ({
  CursorAutoHide: vi.fn().mockImplementation(function CursorAutoHideMock(options) {
    cursorOptions = options;
    this.enable = vi.fn();
    this.disable = vi.fn();
    this.show = vi.fn();
    this.hide = vi.fn();
    this.dispose = vi.fn();
    this.isEnabled = false;
    cursorInstance = this;
  })
}));

vi.mock('@renderer/presentation/effects/toolbar-auto-hide.effect.ts', () => ({
  ToolbarAutoHide: vi.fn().mockImplementation(function ToolbarAutoHideMock(options) {
    toolbarOptions = options;
    this.enable = vi.fn();
    this.disable = vi.fn();
    this.show = vi.fn();
    this.hide = vi.fn();
    this.invalidatePanelCache = vi.fn();
    this.dispose = vi.fn();
    this.isEnabled = false;
    this.isHovering = false;
    this.isPanelOpen = vi.fn(() => false);
    toolbarInstance = this;
  })
}));

vi.mock('@renderer/presentation/effects/controls-auto-hide.effect.ts', () => ({
  ControlsAutoHide: vi.fn().mockImplementation(function ControlsAutoHideMock(options) {
    controlsOptions = options;
    this.enable = vi.fn();
    this.disable = vi.fn();
    this.dispose = vi.fn();
    this.isEnabled = false;
    controlsInstance = this;
  })
}));

vi.mock('@platform/ui-base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@platform/ui-base')>();
  return {
    ...actual,
    ActivityAutoHideController: vi.fn().mockImplementation(function ActivityAutoHideControllerMock(options) {
      unifiedControllerOptions = options;
      this.enable = vi.fn();
      this.disable = vi.fn();
      this.startTimer = vi.fn();
      this.clearTimer = vi.fn();
      this.dispose = vi.fn();
      this.isEnabled = false;
      unifiedControllerInstance = this;
    })
  };
});

import { UIEffects } from '@renderer/presentation/effects/ui-effects.host';
import { TIMING } from '@platform/config';
import { createUIBodyClassManagerMock, createUIEffectsElementsMock } from '../../../../factories/index.js';
import { installDocumentCreateElementMock } from '../../../../support/mocks/browser-api.installers.js';

describe('UIEffects', () => {
  describe('coordination and delegation', () => {
  let effects;
  let mockElements;
  let mockBodyClassManager;

  beforeEach(() => {
    mockElements = createUIEffectsElementsMock();
    mockBodyClassManager = createUIBodyClassManagerMock();

    effects = new UIEffects({ elements: mockElements, bodyClassManager: mockBodyClassManager });
  });

  afterEach(() => {
    cursorInstance = null;
    toolbarInstance = null;
    controlsInstance = null;
    unifiedControllerInstance = null;
    cursorOptions = null;
    toolbarOptions = null;
    controlsOptions = null;
    unifiedControllerOptions = null;
  });

  it('delegates cursor auto-hide enable/disable', () => {
    effects.enableCursorAutoHide();
    effects.disableCursorAutoHide();

    expect(cursorInstance.enable).toHaveBeenCalled();
    expect(cursorInstance.disable).toHaveBeenCalled();
  });

  it('clears unified timer when disabling cursor and toolbar is inactive', () => {
    toolbarInstance.isEnabled = false;

    effects.disableCursorAutoHide();

    expect(unifiedControllerInstance.clearTimer).toHaveBeenCalled();
  });

  it('delegates toolbar auto-hide enable/disable', () => {
    const toolbar = document.createElement('div');

    effects.enableToolbarAutoHide(toolbar);
    effects.disableToolbarAutoHide();

    expect(toolbarInstance.enable).toHaveBeenCalledWith(toolbar);
    expect(toolbarInstance.disable).toHaveBeenCalled();
  });

  it('clears unified timer when disabling toolbar and cursor is inactive', () => {
    cursorInstance.isEnabled = false;

    effects.disableToolbarAutoHide();

    expect(unifiedControllerInstance.clearTimer).toHaveBeenCalled();
  });

  it('delegates controls auto-hide enable/disable', () => {
    const controls = document.createElement('div');

    effects.enableControlsAutoHide(controls);
    effects.disableControlsAutoHide();

    expect(controlsInstance.enable).toHaveBeenCalledWith(controls);
    expect(controlsInstance.disable).toHaveBeenCalled();
  });

  it('invalidates toolbar panel cache', () => {
    effects.invalidateToolbarPanelCache();

    expect(toolbarInstance.invalidatePanelCache).toHaveBeenCalled();
  });

  it('enables unified timer controller on construction', () => {
    expect(unifiedControllerInstance.enable).toHaveBeenCalled();
  });

  it('starts unified timer on activity when controls are not managing', () => {
    toolbarInstance.isEnabled = true;
    controlsInstance.isEnabled = false;

    cursorOptions.onActivity();

    expect(toolbarInstance.show).toHaveBeenCalled();
    expect(unifiedControllerInstance.startTimer).toHaveBeenCalled();
  });

  it('pauses unified timer on toolbar hover start', () => {
    cursorInstance.isEnabled = true;

    toolbarOptions.onHoverStart();

    expect(unifiedControllerInstance.clearTimer).toHaveBeenCalled();
    expect(cursorInstance.show).toHaveBeenCalled();
  });

  it('resumes unified timer on toolbar hover end when panel is closed', () => {
    toolbarInstance.isPanelOpen.mockReturnValue(false);

    toolbarOptions.onHoverEnd();

    expect(unifiedControllerInstance.startTimer).toHaveBeenCalled();
  });

  it('clears unified timer when controls auto-hide enables', () => {
    controlsOptions.onEnable();

    expect(unifiedControllerInstance.clearTimer).toHaveBeenCalled();
  });

  it('restarts unified timer when controls auto-hide disables', () => {
    controlsInstance.isEnabled = false;
    toolbarInstance.isEnabled = false;

    controlsOptions.onDisable();

    expect(unifiedControllerInstance.startTimer).toHaveBeenCalled();
  });

  describe('delegated capture and button effects', () => {
    it('delegates setRecordingButtonState with parameters', () => {
      effects._buttonFeedback.setRecordingButtonState = vi.fn();
      const element = document.createElement('button');

      effects.setRecordingButtonState(element, true);

      expect(effects._buttonFeedback.setRecordingButtonState).toHaveBeenCalledWith(element, true);
    });
  });

  describe('coordination edge cases', () => {
    it('does not start unified timer when controls are managing', () => {
      controlsInstance.isEnabled = true;

      cursorOptions.onActivity();

      expect(unifiedControllerInstance.startTimer).not.toHaveBeenCalled();
    });

    it('does not show cursor on toolbar hover start when cursor is disabled', () => {
      cursorInstance.isEnabled = false;

      toolbarOptions.onHoverStart();

      expect(unifiedControllerInstance.clearTimer).toHaveBeenCalled();
      expect(cursorInstance.show).not.toHaveBeenCalled();
    });

    it('does not restart unified timer on toolbar hover end when panel is open', () => {
      toolbarInstance.isPanelOpen.mockReturnValue(true);

      toolbarOptions.onHoverEnd();

      expect(unifiedControllerInstance.startTimer).not.toHaveBeenCalled();
    });

    it('does not show toolbar on activity when toolbar is disabled', () => {
      toolbarInstance.isEnabled = false;
      controlsInstance.isEnabled = false;

      cursorOptions.onActivity();

      expect(toolbarInstance.show).not.toHaveBeenCalled();
      expect(unifiedControllerInstance.startTimer).toHaveBeenCalled();
    });

    it('shouldStartUnifiedTimer returns false when controls are enabled', () => {
      controlsInstance.isEnabled = true;

      const result = unifiedControllerOptions.shouldStartTimer();

      expect(result).toBe(false);
    });

    it('shouldStartUnifiedTimer returns false when toolbar is hovering', () => {
      controlsInstance.isEnabled = false;
      toolbarInstance.isHovering = true;

      const result = unifiedControllerOptions.shouldStartTimer();

      expect(result).toBe(false);
    });

    it('shouldStartUnifiedTimer returns false when panel is open', () => {
      controlsInstance.isEnabled = false;
      toolbarInstance.isHovering = false;
      toolbarInstance.isPanelOpen.mockReturnValue(true);

      const result = unifiedControllerOptions.shouldStartTimer();

      expect(result).toBe(false);
    });

    it('shouldStartUnifiedTimer returns true when no blocking conditions', () => {
      controlsInstance.isEnabled = false;
      toolbarInstance.isHovering = false;
      toolbarInstance.isPanelOpen.mockReturnValue(false);

      const result = unifiedControllerOptions.shouldStartTimer();

      expect(result).toBe(true);
    });
  });

  describe('unified timer timeout behavior', () => {
    it('hides cursor on timeout when cursor is enabled', () => {
      cursorInstance.isEnabled = true;
      toolbarInstance.isEnabled = false;

      unifiedControllerOptions.onTimeout();

      expect(cursorInstance.hide).toHaveBeenCalled();
    });

    it('hides toolbar on timeout when toolbar is enabled', () => {
      cursorInstance.isEnabled = false;
      toolbarInstance.isEnabled = true;

      unifiedControllerOptions.onTimeout();

      expect(toolbarInstance.hide).toHaveBeenCalled();
    });

    it('hides both cursor and toolbar on timeout when both enabled', () => {
      cursorInstance.isEnabled = true;
      toolbarInstance.isEnabled = true;

      unifiedControllerOptions.onTimeout();

      expect(cursorInstance.hide).toHaveBeenCalled();
      expect(toolbarInstance.hide).toHaveBeenCalled();
    });

    it('does not hide cursor when disabled', () => {
      cursorInstance.isEnabled = false;
      toolbarInstance.isEnabled = true;

      unifiedControllerOptions.onTimeout();

      expect(cursorInstance.hide).not.toHaveBeenCalled();
    });

    it('does not hide toolbar when disabled', () => {
      cursorInstance.isEnabled = true;
      toolbarInstance.isEnabled = false;

      unifiedControllerOptions.onTimeout();

      expect(toolbarInstance.hide).not.toHaveBeenCalled();
    });
  });

  describe('controls auto-hide showAll/hideAll callbacks', () => {
    it('showAll shows cursor and toolbar when toolbar is enabled', () => {
      toolbarInstance.isEnabled = true;

      controlsOptions.onShowAll();

      expect(cursorInstance.show).toHaveBeenCalled();
      expect(toolbarInstance.show).toHaveBeenCalled();
    });

    it('showAll shows cursor but not toolbar when toolbar is disabled', () => {
      toolbarInstance.isEnabled = false;

      controlsOptions.onShowAll();

      expect(cursorInstance.show).toHaveBeenCalled();
      expect(toolbarInstance.show).not.toHaveBeenCalled();
    });

    it('hideAll hides toolbar and cursor when toolbar is enabled', () => {
      toolbarInstance.isEnabled = true;

      controlsOptions.onHideAll();

      expect(toolbarInstance.hide).toHaveBeenCalled();
      expect(cursorInstance.hide).toHaveBeenCalled();
    });

    it('hideAll hides only cursor when toolbar is disabled', () => {
      toolbarInstance.isEnabled = false;

      controlsOptions.onHideAll();

      expect(toolbarInstance.hide).not.toHaveBeenCalled();
      expect(cursorInstance.hide).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('disposes all sub-components', () => {
      effects._buttonFeedback.dispose = vi.fn();
      effects._captureEffects.dispose = vi.fn();

      effects.dispose();

      expect(cursorInstance.dispose).toHaveBeenCalled();
      expect(toolbarInstance.dispose).toHaveBeenCalled();
      expect(controlsInstance.dispose).toHaveBeenCalled();
      expect(effects._buttonFeedback.dispose).toHaveBeenCalled();
      expect(effects._captureEffects.dispose).toHaveBeenCalled();
      expect(unifiedControllerInstance.dispose).toHaveBeenCalled();
      expect(effects.elements).toBeNull();
    });

    it('disposes bodyClassManager if it has dispose method', () => {
      effects._buttonFeedback.dispose = vi.fn();
      effects._captureEffects.dispose = vi.fn();
      mockBodyClassManager.dispose = vi.fn();

      effects.dispose();

      expect(mockBodyClassManager.dispose).toHaveBeenCalled();
    });

    it('handles bodyClassManager without dispose method', () => {
      effects._buttonFeedback.dispose = vi.fn();
      effects._captureEffects.dispose = vi.fn();
      delete mockBodyClassManager.dispose;

      expect(() => effects.dispose()).not.toThrow();
    });
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

  afterEach(() => {
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
