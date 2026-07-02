import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent, bindText } from '@platform/ui-base';
import type { StreamInfoStore } from '@renderer/presentation/state/stream-info.store.js';

const STREAM_TRANSITION_DURATION = 1000;
const STREAMING_HIDE_TIMEOUT = Symbol('streaming-controls-hide-timeout');
const STREAMING_TRANSITION_TIMEOUT = Symbol('streaming-controls-transition-timeout');

type ClassListLike = {
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
  contains?(token: string): boolean;
};

type ButtonElementLike = {
  disabled: boolean;
  classList: ClassListLike;
};

type TextElementLike = {
  textContent: string | null;
};

export interface StreamingControlsElements {
  streamOverlay?: { classList: ClassListLike } | null;
  screenshotBtn?: ButtonElementLike | null;
  recordBtn?: ButtonElementLike | null;
  shaderControls?: { classList: ClassListLike } | null;
  currentResolution?: TextElementLike | null;
  currentFPS?: TextElementLike | null;
}

export interface StreamingControlsBodyClassManager {
  setStreamingMode?(isStreaming: boolean): void;
  areAnimationsOff?(): boolean;
}

export interface StreamingControlsComponentOptions {
  elements: StreamingControlsElements;
  bodyClassManager?: StreamingControlsBodyClassManager | null;
  store: StreamInfoStore;
}

export interface StreamInfoSettings {
  width: number;
  height: number;
  frameRate: number;
}

class StreamingControlsComponent extends PresentationComponent {
  declare elements: StreamingControlsElements | null;
  declare bodyClassManager: StreamingControlsBodyClassManager | null;
  declare store: StreamInfoStore;
  declare _targetStreamingMode: boolean | null;

  constructor({ elements, bodyClassManager, store }: StreamingControlsComponentOptions) {
    super();
    this.elements = elements;
    this.bodyClassManager = bodyClassManager || null;
    this.store = store;
    this._targetStreamingMode = null;

    this.track(store);
    this.track(bindText(elements.currentResolution ?? null, store.resolution));
    this.track(bindText(elements.currentFPS ?? null, store.fps));
  }

  private _areAnimationsDisabled(): boolean {
    return this.bodyClassManager?.areAnimationsOff?.()
      ?? document.body.classList.contains(CSSClasses.APP_ANIMATIONS_OFF);
  }

  setStreamingMode(isStreaming: boolean): void {
    const elements = this.elements!;
    const skipAnimation = this._areAnimationsDisabled();
    this._targetStreamingMode = isStreaming;

    if (isStreaming) {
      elements.screenshotBtn?.classList.remove(CSSClasses.HIDING);
      elements.recordBtn?.classList.remove(CSSClasses.HIDING);
      elements.shaderControls?.classList.remove(CSSClasses.HIDING);

      this.cancelManaged(STREAMING_HIDE_TIMEOUT);
      this.cancelManaged(STREAMING_TRANSITION_TIMEOUT);

      if (skipAnimation) {
        this.bodyClassManager?.setStreamingMode?.(true);
        if (elements.screenshotBtn) elements.screenshotBtn.disabled = false;
        if (elements.recordBtn) elements.recordBtn.disabled = false;
        elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
      } else {
        elements.streamOverlay?.classList.add(CSSClasses.TRANSITIONING_TO_STREAM);
        this.bodyClassManager?.setStreamingMode?.(true);

        this.replaceTimeout(STREAMING_TRANSITION_TIMEOUT, () => {
          this._finishStreamingEnter(elements);
        }, STREAM_TRANSITION_DURATION);
      }
    } else {
      this.cancelManaged(STREAMING_TRANSITION_TIMEOUT);
      elements.streamOverlay?.classList.remove(CSSClasses.TRANSITIONING_TO_STREAM);
      this.cancelManaged(STREAMING_HIDE_TIMEOUT);

      if (skipAnimation) {
        elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
        this.bodyClassManager?.setStreamingMode?.(false);
        if (elements.screenshotBtn) elements.screenshotBtn.disabled = true;
        if (elements.recordBtn) elements.recordBtn.disabled = true;
        this.store.reset();
      } else {
        elements.screenshotBtn?.classList.add(CSSClasses.HIDING);
        elements.recordBtn?.classList.add(CSSClasses.HIDING);
        elements.shaderControls?.classList.add(CSSClasses.HIDING);

        this.replaceTimeout(STREAMING_HIDE_TIMEOUT, () => {
          this._finishStreamingExit(elements);
        }, 150);
      }
    }
  }

  _finishStreamingEnter(elements: StreamingControlsElements | null = this.elements): void {
    if (!elements) return;
    if (elements.screenshotBtn) elements.screenshotBtn.disabled = false;
    if (elements.recordBtn) elements.recordBtn.disabled = false;
    elements.streamOverlay?.classList.remove(CSSClasses.TRANSITIONING_TO_STREAM);
    elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
  }

  _finishStreamingExit(elements: StreamingControlsElements | null = this.elements): void {
    if (!elements) return;
    elements.screenshotBtn?.classList.remove(CSSClasses.HIDING);
    elements.recordBtn?.classList.remove(CSSClasses.HIDING);
    elements.shaderControls?.classList.remove(CSSClasses.HIDING);
    elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN, CSSClasses.TRANSITIONING_TO_STREAM);
    this.bodyClassManager?.setStreamingMode?.(false);
    if (elements.screenshotBtn) elements.screenshotBtn.disabled = true;
    if (elements.recordBtn) elements.recordBtn.disabled = true;
    this.store.reset();
  }

  override dispose(): void | Promise<void> {
    if (this._targetStreamingMode === true) this._finishStreamingEnter();
    else if (this._targetStreamingMode === false) this._finishStreamingExit();
    const disposed = super.dispose();
    this.elements = null;
    this.bodyClassManager = null;
    this._targetStreamingMode = null;
    return disposed;
  }
}

export { StreamingControlsComponent };
