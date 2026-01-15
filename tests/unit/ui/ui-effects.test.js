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
});
