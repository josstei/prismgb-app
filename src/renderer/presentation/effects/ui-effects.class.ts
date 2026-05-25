/**
 * UIEffects - Facade for visual feedback effects
 *
 * Coordinates feature-specific effect classes for cursor hiding, toolbar hiding,
 * fullscreen controls, button feedback, and body mode management.
 */

import { CursorAutoHide } from '@renderer/presentation/effects/cursor-auto-hide.effect';
import { ToolbarAutoHide } from '@renderer/presentation/effects/toolbar-auto-hide.effect';
import { ButtonFeedback } from '@renderer/presentation/effects/button-feedback.effect';
import { CaptureEffects } from '@renderer/presentation/effects/capture.effect';
import { ControlsAutoHide } from '@renderer/presentation/effects/controls-auto-hide.effect';
import { TIMING } from '@renderer/presentation/config/constants.config';
import { ActivityAutoHideController } from '@renderer/presentation/primitives/activity-auto-hide.controller';

type BodyClassManagerLike = {
  setCinematicMode?: (isActive: boolean) => void;
  setMinimalistFullscreen?: (isActive: boolean) => void;
  setFullscreenMode?: (isActive: boolean) => void;
  dispose?: () => void;
};

type UIElements = Record<string, HTMLElement | null>;

type UIEffectsDependencies = {
  elements?: UIElements | null;
  bodyClassManager?: BodyClassManagerLike | null;
};

export class UIEffects {
  elements: UIElements | null;
  _bodyClassManager: BodyClassManagerLike | null;
  _buttonFeedback: ButtonFeedback;
  _captureEffects: CaptureEffects;
  _cursor: CursorAutoHide;
  _toolbar: ToolbarAutoHide;
  _controls: ControlsAutoHide;
  _unifiedTimer: ActivityAutoHideController;

  constructor(dependencies: UIEffectsDependencies = {}) {
    const { elements, bodyClassManager } = dependencies;
    this.elements = elements ?? null;

    // Shared body class manager (global)
    this._bodyClassManager = bodyClassManager || null;

    // Initialize button feedback
    this._buttonFeedback = new ButtonFeedback({ elements });

    // Initialize capture effects
    this._captureEffects = new CaptureEffects();

    // Initialize cursor auto-hide with activity callback
    this._cursor = new CursorAutoHide({
      onActivity: () => this._handleActivity(),
      onHide: () => {}
    });

    // Initialize toolbar auto-hide with hover callbacks
    this._toolbar = new ToolbarAutoHide({
      onActivity: () => this._handleActivity(),
      onHide: () => {},
      onHoverStart: () => this._handleToolbarHoverStart(),
      onHoverEnd: () => this._handleToolbarHoverEnd()
    });

    // Initialize fullscreen controls auto-hide
    this._controls = new ControlsAutoHide({
      onShowAll: () => this._showAll(),
      onHideAll: () => this._hideAll(),
      onEnable: () => this._unifiedTimer.clearTimer(),
      onDisable: () => this._handleActivity()
    });

    // Unified hide timer for cursor and toolbar
    this._unifiedTimer = new ActivityAutoHideController({
      onTimeout: () => this._handleUnifiedTimeout(),
      shouldStartTimer: () => this._shouldStartUnifiedTimer(),
      timeoutMs: TIMING.CURSOR_HIDE_DELAY_MS
    });
    this._unifiedTimer.enable();
  }

  // =====================================================
  // Capture Effects (delegated)
  // =====================================================

  /**
   * Trigger shutter flash effect
   */
  triggerShutterFlash() {
    this._captureEffects.triggerShutterFlash();
  }

  // =====================================================
  // Button Feedback (delegated)
  // =====================================================

  /**
   * Trigger record button pop effect (for recording start)
   */
  triggerRecordButtonPop() {
    this._buttonFeedback.triggerRecordButtonPop();
  }

  /**
   * Trigger record button press effect (for recording stop)
   */
  triggerRecordButtonPress() {
    this._buttonFeedback.triggerRecordButtonPress();
  }

  triggerButtonFeedback(elementKey: string, className: string, duration: number) {
    this._buttonFeedback.triggerButtonFeedback(elementKey, className, duration);
  }

  setRecordingButtonState(element: HTMLElement, isActive: boolean) {
    this._buttonFeedback.setRecordingButtonState(element, isActive);
  }

  // =====================================================
  // Cursor Auto-Hide (delegated)
  // =====================================================

  /**
   * Enable cursor auto-hide
   */
  enableCursorAutoHide() {
    this._cursor.enable();
  }

  /**
   * Disable cursor auto-hide
   */
  disableCursorAutoHide() {
    this._cursor.disable();
    if (!this._toolbar.isEnabled) {
      this._unifiedTimer.clearTimer();
    }
  }

  // =====================================================
  // Toolbar Auto-Hide (delegated)
  // =====================================================

  enableToolbarAutoHide(toolbarElement: HTMLElement) {
    this._toolbar.enable(toolbarElement);
  }

  /**
   * Disable toolbar auto-hide
   */
  disableToolbarAutoHide() {
    this._toolbar.disable();
    if (!this._cursor.isEnabled) {
      this._unifiedTimer.clearTimer();
    }
  }

  /**
   * Invalidate the toolbar panel open state cache
   */
  invalidateToolbarPanelCache() {
    this._toolbar.invalidatePanelCache();
  }

  // =====================================================
  // Fullscreen Controls Auto-Hide (delegated)
  // =====================================================

  enableControlsAutoHide(controlsElement: HTMLElement) {
    this._controls.enable(controlsElement);
  }

  /**
   * Disable fullscreen controls auto-hide
   */
  disableControlsAutoHide() {
    this._controls.disable();
  }

  // =====================================================
  // Body Modes (delegated)
  // =====================================================

  setCinematicMode(isActive: boolean) {
    this._bodyClassManager?.setCinematicMode?.(isActive);
  }

  setMinimalistFullscreen(isActive: boolean) {
    this._bodyClassManager?.setMinimalistFullscreen?.(isActive);
  }

  setFullscreenMode(isActive: boolean) {
    this._bodyClassManager?.setFullscreenMode?.(isActive);
  }

  // =====================================================
  // Coordination Logic
  // =====================================================

  _handleActivity() {
    // Don't start unified timer if controls auto-hide is managing
    if (this._controls.isEnabled) {
      return;
    }

    if (this._toolbar.isEnabled) {
      this._toolbar.show();
    }

    this._unifiedTimer.startTimer();
  }

  _handleToolbarHoverStart() {
    this._unifiedTimer.clearTimer();
    if (this._cursor.isEnabled) {
      this._cursor.show();
    }
  }

  _handleToolbarHoverEnd() {
    if (!this._toolbar.isPanelOpen()) {
      this._unifiedTimer.startTimer();
    }
  }

  _shouldStartUnifiedTimer() {
    if (this._controls.isEnabled) {
      return false;
    }
    if (this._toolbar.isHovering || this._toolbar.isPanelOpen()) {
      return false;
    }
    return true;
  }

  _handleUnifiedTimeout() {
    if (this._cursor.isEnabled) {
      this._cursor.hide();
    }
    if (this._toolbar.isEnabled) {
      this._toolbar.hide();
    }
  }

  _showAll() {
    this._cursor.show();
    if (this._toolbar.isEnabled) {
      this._toolbar.show();
    }
  }

  _hideAll() {
    if (this._toolbar.isEnabled) {
      this._toolbar.hide();
    }
    this._cursor.hide();
  }

  // =====================================================
  // Lifecycle
  // =====================================================

  /**
   * Dispose of UIEffects and cleanup resources
   */
  dispose() {
    this._cursor.dispose();
    this._toolbar.dispose();
    this._controls.dispose();
    this._buttonFeedback.dispose();
    this._captureEffects.dispose();
    this._bodyClassManager?.dispose?.();
    this._unifiedTimer.dispose();
    this.elements = null;
  }
}
