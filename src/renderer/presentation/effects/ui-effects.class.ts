import { CursorAutoHide } from '@renderer/presentation/effects/cursor-auto-hide.effect';
import { ToolbarAutoHide } from '@renderer/presentation/effects/toolbar-auto-hide.effect';
import { ButtonFeedback } from '@renderer/presentation/effects/button-feedback.effect';
import { CaptureEffects } from '@renderer/presentation/effects/capture.effect';
import { ControlsAutoHide } from '@renderer/presentation/effects/controls-auto-hide.effect';
import { TIMING } from '@renderer/presentation/config/constants.config';
import { ActivityAutoHideController } from '@renderer/presentation/primitives/activity-auto-hide.controller';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import type { DomBindingsFlat } from '@renderer/presentation/primitives/dom-bindings.utils.js';

type BodyClassManagerLike = {
  setCinematicMode?: (isActive: boolean) => void;
  setMinimalistFullscreen?: (isActive: boolean) => void;
  setFullscreenMode?: (isActive: boolean) => void;
  dispose?: () => void | Promise<void>;
};

type UIElements = DomBindingsFlat;

type UIEffectsDependencies = {
  elements?: UIElements | null;
  bodyClassManager?: BodyClassManagerLike | null;
};

export class UIEffects extends PresentationComponent {
  elements: UIElements | null;
  _bodyClassManager: BodyClassManagerLike | null;
  _buttonFeedback: ButtonFeedback;
  _captureEffects: CaptureEffects;
  _cursor: CursorAutoHide;
  _toolbar: ToolbarAutoHide;
  _controls: ControlsAutoHide;
  _unifiedTimer: ActivityAutoHideController;

  constructor(dependencies: UIEffectsDependencies = {}) {
    super();

    const { elements, bodyClassManager } = dependencies;
    this.elements = elements ?? null;
    this._bodyClassManager = bodyClassManager || null;
    this._buttonFeedback = new ButtonFeedback({ elements });
    this._captureEffects = new CaptureEffects();

    this._cursor = new CursorAutoHide({
      onActivity: () => this._handleActivity(),
      onHide: () => {}
    });

    this._toolbar = new ToolbarAutoHide({
      onActivity: () => this._handleActivity(),
      onHide: () => {},
      onHoverStart: () => this._handleToolbarHoverStart(),
      onHoverEnd: () => this._handleToolbarHoverEnd()
    });

    this._controls = new ControlsAutoHide({
      onShowAll: () => this._showAll(),
      onHideAll: () => this._hideAll(),
      onEnable: () => this._unifiedTimer.clearTimer(),
      onDisable: () => this._handleActivity()
    });

    this._unifiedTimer = new ActivityAutoHideController({
      onTimeout: () => this._handleUnifiedTimeout(),
      shouldStartTimer: () => this._shouldStartUnifiedTimer(),
      timeoutMs: TIMING.CURSOR_HIDE_DELAY_MS
    });
    this._unifiedTimer.enable();
    this.track(() => this._disposeRuntimeEffects());
  }

  setElements(elements: UIElements | null): void {
    this.elements = elements;
    this._buttonFeedback.setElements(elements);
  }

  triggerShutterFlash() {
    this._captureEffects.triggerShutterFlash();
  }

  triggerRecordButtonPop() {
    this._buttonFeedback.triggerRecordButtonPop();
  }

  triggerRecordButtonPress() {
    this._buttonFeedback.triggerRecordButtonPress();
  }

  triggerButtonFeedback(elementKey: string, className: string, duration: number) {
    this._buttonFeedback.triggerButtonFeedback(elementKey, className, duration);
  }

  setRecordingButtonState(element: HTMLElement, isActive: boolean) {
    this._buttonFeedback.setRecordingButtonState(element, isActive);
  }

  enableCursorAutoHide() {
    this._cursor.enable();
  }

  disableCursorAutoHide() {
    this._cursor.disable();
    if (!this._toolbar.isEnabled) {
      this._unifiedTimer.clearTimer();
    }
  }

  enableToolbarAutoHide(toolbarElement: HTMLElement) {
    this._toolbar.enable(toolbarElement);
  }

  disableToolbarAutoHide() {
    this._toolbar.disable();
    if (!this._cursor.isEnabled) {
      this._unifiedTimer.clearTimer();
    }
  }

  invalidateToolbarPanelCache() {
    this._toolbar.invalidatePanelCache();
  }

  enableControlsAutoHide(controlsElement: HTMLElement) {
    this._controls.enable(controlsElement);
  }

  disableControlsAutoHide() {
    this._controls.disable();
  }

  setCinematicMode(isActive: boolean) {
    this._bodyClassManager?.setCinematicMode?.(isActive);
  }

  setMinimalistFullscreen(isActive: boolean) {
    this._bodyClassManager?.setMinimalistFullscreen?.(isActive);
  }

  setFullscreenMode(isActive: boolean) {
    this._bodyClassManager?.setFullscreenMode?.(isActive);
  }

  _handleActivity() {
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

  private async _disposeRuntimeEffects(): Promise<void> {
    await Promise.all([
      this._cursor.dispose(),
      this._toolbar.dispose(),
      this._controls.dispose(),
      this._buttonFeedback.dispose(),
      this._captureEffects.dispose(),
      this._unifiedTimer.dispose()
    ]);
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    if (this._bodyClassManager && 'dispose' in this._bodyClassManager && typeof this._bodyClassManager.dispose === 'function') {
      try {
        void this._bodyClassManager.dispose();
      } catch (error) {
        console.error('Error disposing bodyClassManager', error);
      }
    }
    this.setElements(null);
    return disposed;
  }
}
