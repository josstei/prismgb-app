import { ButtonFeedback } from '@renderer/presentation/effects/button-feedback.effect';
import { CaptureEffects } from '@renderer/presentation/effects/capture.effect';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { TIMING } from '@platform/config';
import { PresentationComponent, ActivityAutoHideController } from '@platform/ui-base';
import type { DomBindingsFlat } from '@renderer/presentation/primitives/dom-bindings.utils.js';

const CURSOR_LISTENER = Symbol('cursorListener');
const CURSOR_FRAME = Symbol('cursorActivityFrame');
const TOOLBAR_LISTENERS = Symbol('toolbarListeners');
const STREAM_HIDE_TIMER = Symbol('streamHideTimer');

/** Owns streaming/fullscreen activity and the effects it drives. */
export class UIEffects extends PresentationComponent {
  elements: DomBindingsFlat | null;
  readonly _buttonFeedback: ButtonFeedback;
  private readonly captureEffects: CaptureEffects;
  private readonly fullscreenActivity: ActivityAutoHideController;
  private cursorEnabled = false;
  private cursorFramePending = false;
  private toolbar: HTMLElement | null = null;
  private toolbarHovering = false;
  private controls: HTMLElement | null = null;

  constructor({ elements }: { elements?: DomBindingsFlat | null } = {}) {
    super();
    this.elements = elements ?? null;
    this._buttonFeedback = new ButtonFeedback({ elements });
    this.captureEffects = new CaptureEffects();
    this.fullscreenActivity = new ActivityAutoHideController({
      onActivity: () => this.showAll(),
      onTimeout: () => this.hideAll(),
      onEnable: () => this.cancelManaged(STREAM_HIDE_TIMER),
      onDisable: () => {
        this.controls?.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
        this.handleActivity();
      },
      timeoutMs: TIMING.CURSOR_HIDE_DELAY_MS
    });
    this.track(this._buttonFeedback);
    this.track(this.captureEffects);
    this.track(this.fullscreenActivity);
  }

  setElements(elements: DomBindingsFlat | null): void {
    this.elements = elements;
    this._buttonFeedback.setElements(elements);
  }

  triggerShutterFlash(): void { this.captureEffects.triggerShutterFlash(); }
  triggerRecordButtonPop(): void { this._buttonFeedback.triggerRecordButtonPop(); }
  triggerRecordButtonPress(): void { this._buttonFeedback.triggerRecordButtonPress(); }
  triggerButtonFeedback(elementKey: string, className: string, duration: number): void {
    this._buttonFeedback.triggerButtonFeedback(elementKey, className, duration);
  }
  setRecordingButtonState(element: HTMLElement, isActive: boolean): void {
    this._buttonFeedback.setRecordingButtonState(element, isActive);
  }

  enableCursorAutoHide(): void {
    if (this.cursorEnabled) return;
    this.cursorEnabled = true;
    this.replaceManaged(CURSOR_LISTENER, this.listen(document, 'mousemove', () => {
      if (this.cursorFramePending) return;
      this.cursorFramePending = true;
      this.replaceAnimationFrame(CURSOR_FRAME, () => {
        this.cursorFramePending = false;
        this.showCursor();
        this.handleActivity();
      });
    }));
    this.showCursor();
    this.handleActivity();
  }

  disableCursorAutoHide(): void {
    this.cursorEnabled = false;
    this.cancelManaged(CURSOR_LISTENER);
    this.cancelManaged(CURSOR_FRAME);
    this.cursorFramePending = false;
    this.showCursor();
    if (!this.toolbar) this.cancelManaged(STREAM_HIDE_TIMER);
  }

  enableToolbarAutoHide(element: HTMLElement | null): void {
    if (this.toolbar || !element) return;
    this.toolbar = element;
    this.toolbarHovering = false;
    this.replaceManagedGroup(TOOLBAR_LISTENERS, [
      this.listen(element, 'mouseenter', () => {
        this.toolbarHovering = true;
        this.showToolbar();
        this.cancelManaged(STREAM_HIDE_TIMER);
        if (this.cursorEnabled) this.showCursor();
      }),
      this.listen(element, 'mouseleave', () => {
        this.toolbarHovering = false;
        if (!this.isPanelOpen()) this.startStreamTimer();
      })
    ]);
    this.handleActivity();
  }

  disableToolbarAutoHide(): void {
    this.cancelManaged(TOOLBAR_LISTENERS);
    this.showToolbar();
    this.toolbar = null;
    this.toolbarHovering = false;
    if (!this.cursorEnabled) this.cancelManaged(STREAM_HIDE_TIMER);
  }

  enableControlsAutoHide(element: HTMLElement | null): void {
    if (!element) return;
    this.controls = element;
    this.fullscreenActivity.enable({
      activityEvents: [
        { target: document, type: 'mousemove' },
        { target: document, type: 'pointermove' },
        { target: document, type: 'mousedown' }
      ],
      directEvents: [
        ...['mouseenter', 'focusin'].map((type) => ({ target: element, type, handler: () => {
          this.showAll();
          this.fullscreenActivity.startTimer();
        } })),
        ...['mouseleave', 'focusout'].map((type) => ({ target: element, type, handler: () => this.fullscreenActivity.startTimer() }))
      ],
      startTimer: true
    });
  }

  disableControlsAutoHide(): void {
    this.fullscreenActivity.disable();
    this.controls = null;
  }

  private handleActivity(): void {
    if (this.fullscreenActivity.isEnabled) return;
    this.showToolbar();
    this.startStreamTimer();
  }

  private startStreamTimer(): void {
    this.cancelManaged(STREAM_HIDE_TIMER);
    if (this.fullscreenActivity.isEnabled || this.toolbarHovering || this.isPanelOpen()) return;
    this.replaceTimeout(STREAM_HIDE_TIMER, () => {
      if (this.cursorEnabled) document.body.classList.add(CSSClasses.CURSOR_HIDDEN);
      this.hideToolbar();
    }, TIMING.CURSOR_HIDE_DELAY_MS);
  }

  private isPanelOpen(): boolean {
    return !!this.toolbar?.querySelector('.shader-panel.visible, .panel-open');
  }

  private showCursor(): void { document.body.classList.remove(CSSClasses.CURSOR_HIDDEN); }
  private showToolbar(): void { this.toolbar?.classList.remove(CSSClasses.TOOLBAR_HIDDEN); }
  private hideToolbar(): void {
    if (!this.isPanelOpen()) this.toolbar?.classList.add(CSSClasses.TOOLBAR_HIDDEN);
  }
  private showAll(): void {
    this.controls?.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    this.showCursor();
    this.showToolbar();
  }
  private hideAll(): void {
    this.controls?.classList.add(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    this.hideToolbar();
    document.body.classList.add(CSSClasses.CURSOR_HIDDEN);
  }

  override dispose(): void | Promise<void> {
    this.disableCursorAutoHide();
    this.disableToolbarAutoHide();
    this.disableControlsAutoHide();
    this.setElements(null);
    return super.dispose();
  }
}
