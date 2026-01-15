/**
 * UIEffects Unit Tests
 * Focus on delegation and coordination between auto-hide helpers.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let cursorInstance;
let toolbarInstance;
let controlsInstance;
let hideTimerInstance;
let cursorOptions;
let toolbarOptions;
let controlsOptions;
let hideTimerOptions;

vi.mock('@renderer/ui/features/streaming/effects/cursor-auto-hide.class.js', () => ({
  CursorAutoHide: vi.fn().mockImplementation(function CursorAutoHideMock(options) {
    cursorOptions = options;
    this.enable = vi.fn();
    this.disable = vi.fn();
    this.show = vi.fn();
    this.hide = vi.fn();
    this.isEnabled = false;
    cursorInstance = this;
  })
}));

vi.mock('@renderer/ui/features/toolbar/effects/toolbar-auto-hide.class.js', () => ({
  ToolbarAutoHide: vi.fn().mockImplementation(function ToolbarAutoHideMock(options) {
    toolbarOptions = options;
    this.enable = vi.fn();
    this.disable = vi.fn();
    this.show = vi.fn();
    this.hide = vi.fn();
    this.invalidatePanelCache = vi.fn();
    this.isEnabled = false;
    this.isHovering = false;
    this.isPanelOpen = vi.fn(() => false);
    toolbarInstance = this;
  })
}));

vi.mock('@renderer/ui/features/fullscreen/effects/controls-auto-hide.class.js', () => ({
  ControlsAutoHide: vi.fn().mockImplementation(function ControlsAutoHideMock(options) {
    controlsOptions = options;
    this.enable = vi.fn();
    this.disable = vi.fn();
    this.isEnabled = false;
    controlsInstance = this;
  })
}));

vi.mock('@renderer/ui/primitives/hide-timer.js', () => ({
  HideTimer: vi.fn().mockImplementation(function HideTimerMock(options) {
    hideTimerOptions = options;
    this.start = vi.fn();
    this.clear = vi.fn();
    this.isRunning = false;
    hideTimerInstance = this;
  })
}));

import { UIEffects } from '@renderer/ui/effects/ui-effects.class.js';

describe('UIEffects', () => {
  let effects;
  let mockElements;
  let mockBodyClassManager;

  beforeEach(() => {
    mockElements = {
      recordBtn: {
        classList: { add: vi.fn(), remove: vi.fn() },
        offsetWidth: 100
      }
    };

    mockBodyClassManager = {
      setCinematicMode: vi.fn(),
      setMinimalistFullscreen: vi.fn(),
      setFullscreenMode: vi.fn()
    };

    effects = new UIEffects({ elements: mockElements, bodyClassManager: mockBodyClassManager });
  });

  afterEach(() => {
    vi.clearAllMocks();
    cursorInstance = null;
    toolbarInstance = null;
    controlsInstance = null;
    hideTimerInstance = null;
    cursorOptions = null;
    toolbarOptions = null;
    controlsOptions = null;
    hideTimerOptions = null;
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

    expect(hideTimerInstance.clear).toHaveBeenCalled();
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

    expect(hideTimerInstance.clear).toHaveBeenCalled();
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

  it('delegates body class operations', () => {
    effects.setCinematicMode(true);
    effects.setMinimalistFullscreen(true);
    effects.setFullscreenMode(true);

    expect(mockBodyClassManager.setCinematicMode).toHaveBeenCalledWith(true);
    expect(mockBodyClassManager.setMinimalistFullscreen).toHaveBeenCalledWith(true);
    expect(mockBodyClassManager.setFullscreenMode).toHaveBeenCalledWith(true);
  });

  it('starts unified timer on activity when controls are not managing', () => {
    toolbarInstance.isEnabled = true;
    controlsInstance.isEnabled = false;

    cursorOptions.onActivity();

    expect(toolbarInstance.show).toHaveBeenCalled();
    expect(hideTimerInstance.start).toHaveBeenCalled();
  });

  it('pauses unified timer on toolbar hover start', () => {
    cursorInstance.isEnabled = true;

    toolbarOptions.onHoverStart();

    expect(hideTimerInstance.clear).toHaveBeenCalled();
    expect(cursorInstance.show).toHaveBeenCalled();
  });

  it('resumes unified timer on toolbar hover end when panel is closed', () => {
    toolbarInstance.isPanelOpen.mockReturnValue(false);

    toolbarOptions.onHoverEnd();

    expect(hideTimerInstance.start).toHaveBeenCalled();
  });

  it('clears unified timer when controls auto-hide enables', () => {
    controlsOptions.onEnable();

    expect(hideTimerInstance.clear).toHaveBeenCalled();
  });

  it('restarts unified timer when controls auto-hide disables', () => {
    controlsInstance.isEnabled = false;
    toolbarInstance.isEnabled = false;

    controlsOptions.onDisable();

    expect(hideTimerInstance.start).toHaveBeenCalled();
  });

  describe('delegated capture and button effects', () => {
    it('delegates triggerShutterFlash to capture effects', () => {
      effects._captureEffects.triggerShutterFlash = vi.fn();

      effects.triggerShutterFlash();

      expect(effects._captureEffects.triggerShutterFlash).toHaveBeenCalled();
    });

    it('delegates triggerRecordButtonPop to button feedback', () => {
      effects._buttonFeedback.triggerRecordButtonPop = vi.fn();

      effects.triggerRecordButtonPop();

      expect(effects._buttonFeedback.triggerRecordButtonPop).toHaveBeenCalled();
    });

    it('delegates triggerRecordButtonPress to button feedback', () => {
      effects._buttonFeedback.triggerRecordButtonPress = vi.fn();

      effects.triggerRecordButtonPress();

      expect(effects._buttonFeedback.triggerRecordButtonPress).toHaveBeenCalled();
    });

    it('delegates triggerButtonFeedback with parameters', () => {
      effects._buttonFeedback.triggerButtonFeedback = vi.fn();

      effects.triggerButtonFeedback('recordBtn', 'btn-pop', 150);

      expect(effects._buttonFeedback.triggerButtonFeedback).toHaveBeenCalledWith('recordBtn', 'btn-pop', 150);
    });

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

      expect(hideTimerInstance.start).not.toHaveBeenCalled();
    });

    it('does not show cursor on toolbar hover start when cursor is disabled', () => {
      cursorInstance.isEnabled = false;

      toolbarOptions.onHoverStart();

      expect(hideTimerInstance.clear).toHaveBeenCalled();
      expect(cursorInstance.show).not.toHaveBeenCalled();
    });

    it('does not restart unified timer on toolbar hover end when panel is open', () => {
      toolbarInstance.isPanelOpen.mockReturnValue(true);

      toolbarOptions.onHoverEnd();

      expect(hideTimerInstance.start).not.toHaveBeenCalled();
    });

    it('does not show toolbar on activity when toolbar is disabled', () => {
      toolbarInstance.isEnabled = false;
      controlsInstance.isEnabled = false;

      cursorOptions.onActivity();

      expect(toolbarInstance.show).not.toHaveBeenCalled();
      expect(hideTimerInstance.start).toHaveBeenCalled();
    });

    it('shouldStartUnifiedTimer returns false when controls are enabled', () => {
      controlsInstance.isEnabled = true;

      const result = hideTimerOptions.shouldStart();

      expect(result).toBe(false);
    });

    it('shouldStartUnifiedTimer returns false when toolbar is hovering', () => {
      controlsInstance.isEnabled = false;
      toolbarInstance.isHovering = true;

      const result = hideTimerOptions.shouldStart();

      expect(result).toBe(false);
    });

    it('shouldStartUnifiedTimer returns false when panel is open', () => {
      controlsInstance.isEnabled = false;
      toolbarInstance.isHovering = false;
      toolbarInstance.isPanelOpen.mockReturnValue(true);

      const result = hideTimerOptions.shouldStart();

      expect(result).toBe(false);
    });

    it('shouldStartUnifiedTimer returns true when no blocking conditions', () => {
      controlsInstance.isEnabled = false;
      toolbarInstance.isHovering = false;
      toolbarInstance.isPanelOpen.mockReturnValue(false);

      const result = hideTimerOptions.shouldStart();

      expect(result).toBe(true);
    });
  });

  describe('unified timer timeout behavior', () => {
    it('hides cursor on timeout when cursor is enabled', () => {
      cursorInstance.isEnabled = true;
      toolbarInstance.isEnabled = false;

      hideTimerOptions.onTimeout();

      expect(cursorInstance.hide).toHaveBeenCalled();
    });

    it('hides toolbar on timeout when toolbar is enabled', () => {
      cursorInstance.isEnabled = false;
      toolbarInstance.isEnabled = true;

      hideTimerOptions.onTimeout();

      expect(toolbarInstance.hide).toHaveBeenCalled();
    });

    it('hides both cursor and toolbar on timeout when both enabled', () => {
      cursorInstance.isEnabled = true;
      toolbarInstance.isEnabled = true;

      hideTimerOptions.onTimeout();

      expect(cursorInstance.hide).toHaveBeenCalled();
      expect(toolbarInstance.hide).toHaveBeenCalled();
    });

    it('does not hide cursor when disabled', () => {
      cursorInstance.isEnabled = false;
      toolbarInstance.isEnabled = true;

      hideTimerOptions.onTimeout();

      expect(cursorInstance.hide).not.toHaveBeenCalled();
    });

    it('does not hide toolbar when disabled', () => {
      cursorInstance.isEnabled = true;
      toolbarInstance.isEnabled = false;

      hideTimerOptions.onTimeout();

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

  describe('body class manager edge cases', () => {
    it('handles null bodyClassManager gracefully for setCinematicMode', () => {
      const effectsNoManager = new UIEffects({ elements: mockElements });

      expect(() => effectsNoManager.setCinematicMode(true)).not.toThrow();
    });

    it('handles null bodyClassManager gracefully for setMinimalistFullscreen', () => {
      const effectsNoManager = new UIEffects({ elements: mockElements });

      expect(() => effectsNoManager.setMinimalistFullscreen(true)).not.toThrow();
    });

    it('handles null bodyClassManager gracefully for setFullscreenMode', () => {
      const effectsNoManager = new UIEffects({ elements: mockElements });

      expect(() => effectsNoManager.setFullscreenMode(true)).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('disposes all sub-components', () => {
      // Add dispose methods to the mocked sub-components
      cursorInstance.dispose = vi.fn();
      toolbarInstance.dispose = vi.fn();
      controlsInstance.dispose = vi.fn();
      hideTimerInstance.dispose = vi.fn();
      effects._buttonFeedback.dispose = vi.fn();
      effects._captureEffects.dispose = vi.fn();

      effects.dispose();

      expect(cursorInstance.dispose).toHaveBeenCalled();
      expect(toolbarInstance.dispose).toHaveBeenCalled();
      expect(controlsInstance.dispose).toHaveBeenCalled();
      expect(effects._buttonFeedback.dispose).toHaveBeenCalled();
      expect(effects._captureEffects.dispose).toHaveBeenCalled();
      expect(hideTimerInstance.dispose).toHaveBeenCalled();
      expect(effects.elements).toBeNull();
    });

    it('disposes bodyClassManager if it has dispose method', () => {
      // Add dispose methods to all sub-components first
      cursorInstance.dispose = vi.fn();
      toolbarInstance.dispose = vi.fn();
      controlsInstance.dispose = vi.fn();
      hideTimerInstance.dispose = vi.fn();
      effects._buttonFeedback.dispose = vi.fn();
      effects._captureEffects.dispose = vi.fn();
      mockBodyClassManager.dispose = vi.fn();

      effects.dispose();

      expect(mockBodyClassManager.dispose).toHaveBeenCalled();
    });

    it('handles bodyClassManager without dispose method', () => {
      // Add dispose methods to all sub-components first
      cursorInstance.dispose = vi.fn();
      toolbarInstance.dispose = vi.fn();
      controlsInstance.dispose = vi.fn();
      hideTimerInstance.dispose = vi.fn();
      effects._buttonFeedback.dispose = vi.fn();
      effects._captureEffects.dispose = vi.fn();
      delete mockBodyClassManager.dispose;

      expect(() => effects.dispose()).not.toThrow();
    });
  });
});
