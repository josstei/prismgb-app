import { signal, computed, type ReadonlySignal } from '@platform/ui-base/reactive';
import { EventChannels } from '@platform/events';
import type { EventBusLike } from '@platform/core';
import { ReactiveStore } from './reactive-store.base.js';

const SUCCESS_HIDE_DELAY_MS = 1200;
const ERROR_HIDE_DELAY_MS = 2000;
const SUCCESS_LABEL = '✓';
const ERROR_LABEL = '✗';

export type TranscodePhase = 'idle' | 'transcoding' | 'success' | 'error';

export interface TranscodeProgressStoreDependencies {
  eventBus: EventBusLike;
}

/**
 * Owns the transcode-toast state machine: subscribes the `TRANSCODE.*` bus channels and
 * drives phase/progress/label signals, including the timed auto-hide after success/error.
 * The component binds to the exposed signals; no imperative DOM writes live here.
 */
export class TranscodeProgressStore extends ReactiveStore {
  private readonly _phase = signal<TranscodePhase>('idle');
  private readonly _progress = signal(0);
  private readonly _label = signal('');

  private _hideTimer: ReturnType<typeof setTimeout> | null = null;
  private _disposed = false;

  readonly transcoding = computed(() => this._phase.value === 'transcoding');
  readonly succeeded = computed(() => this._phase.value === 'success');
  readonly failed = computed(() => this._phase.value === 'error');
  readonly progressVariable = computed(() => String(this._progress.value));

  constructor(private readonly dependencies: TranscodeProgressStoreDependencies) {
    super();

    const bus = this.dependencies.eventBus;
    this.track(bus.subscribe(EventChannels.TRANSCODE.STARTED, () => this.start()));
    this.track(bus.subscribe(EventChannels.TRANSCODE.PROGRESS, (payload: unknown) => this.advance(payload)));
    this.track(bus.subscribe(EventChannels.TRANSCODE.COMPLETED, () => this.complete()));
    this.track(bus.subscribe(EventChannels.TRANSCODE.ERROR, () => this.fail()));
    this.track(bus.subscribe(EventChannels.TRANSCODE.CANCELLED, () => this.hide()));
  }

  get phase(): ReadonlySignal<TranscodePhase> {
    return this._phase;
  }

  get progress(): ReadonlySignal<number> {
    return this._progress;
  }

  get label(): ReadonlySignal<string> {
    return this._label;
  }

  private start(): void {
    this.clearHideTimer();
    this._phase.value = 'transcoding';
    this._progress.value = 0;
    this._label.value = '';
  }

  private advance(payload: unknown): void {
    if (this._phase.value !== 'transcoding') return;
    const percent =
      typeof payload === 'object' && payload !== null
        ? (payload as { percent?: number }).percent ?? -1
        : -1;
    if (percent <= 0) return;
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    this._progress.value = clamped;
    this._label.value = `${clamped}%`;
  }

  private complete(): void {
    this._phase.value = 'success';
    this._label.value = SUCCESS_LABEL;
    this.scheduleHide(SUCCESS_HIDE_DELAY_MS);
  }

  private fail(): void {
    this._phase.value = 'error';
    this._label.value = ERROR_LABEL;
    this.scheduleHide(ERROR_HIDE_DELAY_MS);
  }

  private hide(): void {
    this.clearHideTimer();
    this._phase.value = 'idle';
    this._progress.value = 0;
    this._label.value = '';
  }

  private scheduleHide(delayMs: number): void {
    this.clearHideTimer();
    this._hideTimer = setTimeout(() => {
      this._hideTimer = null;
      if (this._disposed) return;
      this.hide();
    }, delayMs);
  }

  private clearHideTimer(): void {
    if (this._hideTimer !== null) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  }

  override dispose(): void | Promise<void> {
    this._disposed = true;
    this.clearHideTimer();
    return super.dispose();
  }
}
