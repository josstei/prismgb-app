import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { bindText } from '@renderer/presentation/primitives/signal-bindings.utils';
import type { BodyClassEffect } from '@renderer/presentation/effects/body-class.effect';
import type { StreamInfoStore } from '@renderer/presentation/state/stream-info.store';

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

export interface StreamingControlsComponentOptions {
  elements: StreamingControlsElements;
  bodyClassEffect: Pick<BodyClassEffect, 'setStreamingMode' | 'areAnimationsOff'>;
  store: StreamInfoStore;
}

export interface StreamInfoSettings {
  width: number;
  height: number;
  frameRate: number;
}

class StreamingControlsComponent extends PresentationComponent {
  declare elements: StreamingControlsElements | null;
  declare bodyClassEffect: Pick<BodyClassEffect, 'setStreamingMode' | 'areAnimationsOff'>;
  declare store: StreamInfoStore;
  declare _targetStreamingMode: boolean | null;

  constructor(options: StreamingControlsComponentOptions) {
    super();
    this.applyOptions<StreamingControlsComponentOptions>({}, options);
    this._targetStreamingMode = null;

    this.disposables.add(this.store);
    this.disposables.add(bindText(options.elements.currentResolution ?? null, this.store.resolution));
    this.disposables.add(bindText(options.elements.currentFPS ?? null, this.store.fps));
  }

  setStreamingMode(isStreaming: boolean): void {
    const elements = this.elements!;
    const skipAnimation = this.bodyClassEffect.areAnimationsOff();
    this._targetStreamingMode = isStreaming;

    if (isStreaming) {
      elements.screenshotBtn?.classList.remove(CSSClasses.HIDING);
      elements.recordBtn?.classList.remove(CSSClasses.HIDING);
      elements.shaderControls?.classList.remove(CSSClasses.HIDING);

      void this.disposables.cancel(STREAMING_HIDE_TIMEOUT);
      void this.disposables.cancel(STREAMING_TRANSITION_TIMEOUT);

      if (skipAnimation) {
        this.bodyClassEffect.setStreamingMode(true);
        if (elements.screenshotBtn) elements.screenshotBtn.disabled = false;
        if (elements.recordBtn) elements.recordBtn.disabled = false;
        elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
      } else {
        elements.streamOverlay?.classList.add(CSSClasses.TRANSITIONING_TO_STREAM);
        this.bodyClassEffect.setStreamingMode(true);

        this.disposables.schedule(STREAMING_TRANSITION_TIMEOUT, () => {
          this._finishStreamingEnter(elements);
        }, STREAM_TRANSITION_DURATION);
      }
    } else {
      void this.disposables.cancel(STREAMING_TRANSITION_TIMEOUT);
      elements.streamOverlay?.classList.remove(CSSClasses.TRANSITIONING_TO_STREAM);
      void this.disposables.cancel(STREAMING_HIDE_TIMEOUT);

      if (skipAnimation) {
        elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
        this.bodyClassEffect.setStreamingMode(false);
        if (elements.screenshotBtn) elements.screenshotBtn.disabled = true;
        if (elements.recordBtn) elements.recordBtn.disabled = true;
        this.store.reset();
      } else {
        elements.screenshotBtn?.classList.add(CSSClasses.HIDING);
        elements.recordBtn?.classList.add(CSSClasses.HIDING);
        elements.shaderControls?.classList.add(CSSClasses.HIDING);

        this.disposables.schedule(STREAMING_HIDE_TIMEOUT, () => {
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
    this.bodyClassEffect.setStreamingMode(false);
    if (elements.screenshotBtn) elements.screenshotBtn.disabled = true;
    if (elements.recordBtn) elements.recordBtn.disabled = true;
    this.store.reset();
  }

  override dispose(): void | Promise<void> {
    if (this._targetStreamingMode === true) this._finishStreamingEnter();
    else if (this._targetStreamingMode === false) this._finishStreamingExit();
    const disposed = super.dispose();
    this.elements = null;
    this._targetStreamingMode = null;
    return disposed;
  }
}

export { StreamingControlsComponent };
