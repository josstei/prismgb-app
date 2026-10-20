import { injectable } from 'inversify';
import { TIMING } from '@renderer/lib/timing.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

const IDLE_TIMER = Symbol('auto-hide-idle-timer');
const CONTROLS_TIMER = Symbol('auto-hide-controls-timer');
const CURSOR_LISTENERS = Symbol('auto-hide-cursor-listeners');
const CURSOR_FRAME = Symbol('auto-hide-cursor-frame');
const TOOLBAR_LISTENERS = Symbol('auto-hide-toolbar-listeners');
const CONTROLS_LISTENERS = Symbol('auto-hide-controls-listeners');
const CONTROLS_FRAME = Symbol('auto-hide-controls-frame');

const PANEL_OPEN_SELECTOR = '.shader-panel.visible, .panel-open';

/**
 * Hides the cursor and streaming toolbar after TIMING.CURSOR_HIDE_DELAY_MS without mouse activity
 * (paused while the toolbar is hovered or one of its panels is open). While fullscreen controls are
 * enabled they own the cursor and toolbar instead and hide together with the controls.
 */
@injectable()
export class AutoHideEffect extends PresentationComponent {
  private cursorEnabled = false;
  private toolbar: HTMLElement | null = null;
  private hovering = false;
  private controls: HTMLElement | null = null;
  private controlsEnabled = false;
  private readonly pendingFrames = new Set<symbol>();

  enableCursor(): void {
    if (this.cursorEnabled) return;
    this.cursorEnabled = true;
    this.disposables.replaceGroup(CURSOR_LISTENERS, [
      this.disposables.listen(document, 'mousemove', this.throttled(CURSOR_FRAME, () => this.cursorActivity()))
    ]);
    this.cursorActivity();
  }

  disableCursor(): void {
    if (this.cursorEnabled) {
      this.cursorEnabled = false;
      void this.disposables.cancel(CURSOR_LISTENERS);
      this.cancelFrame(CURSOR_FRAME);
      document.body.classList.remove(CSSClasses.CURSOR_HIDDEN);
    }
    if (!this.toolbar) {
      void this.disposables.cancel(IDLE_TIMER);
    }
  }

  enableToolbar(element: HTMLElement | null): void {
    if (this.toolbar || !element) return;
    this.toolbar = element;
    this.hovering = false;
    this.disposables.replaceGroup(TOOLBAR_LISTENERS, [
      this.disposables.listen(element, 'mouseenter', () => {
        this.hovering = true;
        element.classList.remove(CSSClasses.TOOLBAR_HIDDEN);
        void this.disposables.cancel(IDLE_TIMER);
        if (this.cursorEnabled) {
          document.body.classList.remove(CSSClasses.CURSOR_HIDDEN);
        }
      }),
      this.disposables.listen(element, 'mouseleave', () => {
        this.hovering = false;
        if (!this.isPanelOpen()) {
          this.startIdle();
        }
      })
    ]);
    this.activity();
  }

  disableToolbar(): void {
    if (this.toolbar) {
      void this.disposables.cancel(TOOLBAR_LISTENERS);
      this.toolbar.classList.remove(CSSClasses.TOOLBAR_HIDDEN);
      this.toolbar = null;
      this.hovering = false;
    }
    if (!this.cursorEnabled) {
      void this.disposables.cancel(IDLE_TIMER);
    }
  }

  enableControls(element: HTMLElement | null): void {
    if (!element) return;
    this.controls = element;
    if (this.controlsEnabled) return;
    this.controlsEnabled = true;
    void this.disposables.cancel(IDLE_TIMER);

    const showOnActivity = this.throttled(CONTROLS_FRAME, () => this.showControls());
    const show = () => this.showControls();
    const startTimer = () => this.startControlsTimer();
    this.disposables.replaceGroup(CONTROLS_LISTENERS, [
      this.disposables.listen(document, 'mousemove', showOnActivity),
      this.disposables.listen(document, 'pointermove', showOnActivity),
      this.disposables.listen(document, 'mousedown', showOnActivity),
      this.disposables.listen(element, 'mouseenter', show),
      this.disposables.listen(element, 'mouseleave', startTimer),
      this.disposables.listen(element, 'focusin', show),
      this.disposables.listen(element, 'focusout', startTimer)
    ]);
    this.startControlsTimer();
  }

  disableControls(): void {
    if (this.controlsEnabled) {
      void this.disposables.cancel(CONTROLS_TIMER);
      this.cancelFrame(CONTROLS_FRAME);
      void this.disposables.cancel(CONTROLS_LISTENERS);
      this.controlsEnabled = false;
      this.controls?.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
      this.activity();
    }
    this.controls = null;
  }

  override dispose(): void | Promise<void> {
    this.disableCursor();
    this.disableToolbar();
    this.disableControls();
    void this.disposables.cancel(IDLE_TIMER);
    return super.dispose();
  }

  private cursorActivity(): void {
    document.body.classList.remove(CSSClasses.CURSOR_HIDDEN);
    this.activity();
  }

  private activity(): void {
    if (this.controlsEnabled) return;
    this.toolbar?.classList.remove(CSSClasses.TOOLBAR_HIDDEN);
    this.startIdle();
  }

  private startIdle(): void {
    void this.disposables.cancel(IDLE_TIMER);
    if (this.controlsEnabled || this.hovering || this.isPanelOpen()) return;
    this.disposables.schedule(IDLE_TIMER, () => this.onIdle(), TIMING.CURSOR_HIDE_DELAY_MS);
  }

  private onIdle(): void {
    if (this.cursorEnabled) {
      document.body.classList.add(CSSClasses.CURSOR_HIDDEN);
    }
    if (this.toolbar && !this.isPanelOpen()) {
      this.toolbar.classList.add(CSSClasses.TOOLBAR_HIDDEN);
    }
  }

  // Fullscreen controls own the cursor class unconditionally, even when cursor auto-hide is off.
  private showControls(): void {
    this.controls?.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    document.body.classList.remove(CSSClasses.CURSOR_HIDDEN);
    this.toolbar?.classList.remove(CSSClasses.TOOLBAR_HIDDEN);
    this.startControlsTimer();
  }

  private hideControls(): void {
    this.controls?.classList.add(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    if (this.toolbar && !this.isPanelOpen()) {
      this.toolbar.classList.add(CSSClasses.TOOLBAR_HIDDEN);
    }
    document.body.classList.add(CSSClasses.CURSOR_HIDDEN);
  }

  private startControlsTimer(): void {
    this.disposables.schedule(CONTROLS_TIMER, () => this.hideControls(), TIMING.CURSOR_HIDE_DELAY_MS);
  }

  private isPanelOpen(): boolean {
    return !!this.toolbar?.querySelector(PANEL_OPEN_SELECTOR);
  }

  // Runs fn on the next animation frame; activity arriving while a frame is pending is dropped.
  private throttled(frameKey: symbol, fn: () => void): () => void {
    return () => {
      if (this.pendingFrames.has(frameKey)) return;
      this.pendingFrames.add(frameKey);
      this.disposables.scheduleFrame(frameKey, () => {
        this.pendingFrames.delete(frameKey);
        fn();
      });
    };
  }

  private cancelFrame(frameKey: symbol): void {
    void this.disposables.cancel(frameKey);
    this.pendingFrames.delete(frameKey);
  }
}
