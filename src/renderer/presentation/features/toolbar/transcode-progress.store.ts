import { signal, computed, type ReadonlySignal } from '@preact/signals-core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

const SUCCESS_HIDE_DELAY_MS = 1200;
const ERROR_HIDE_DELAY_MS = 2000;
const SUCCESS_LABEL = '✓';
const ERROR_LABEL = '✗';
const HIDE_TIMEOUT = Symbol('transcodeProgressHide');

type TranscodePhase = 'idle' | 'transcoding' | 'success' | 'error';

/**
 * Transcode progress state machine over the `TRANSCODE.*` channels: phase, progress and
 * label signals, with a timed return to idle after success or error.
 */
export class TranscodeProgressStore extends PresentationComponent {
  private readonly _phase = signal<TranscodePhase>('idle');
  private readonly _progress = signal(0);
  private readonly _label = signal('');

  readonly transcoding = computed(() => this._phase.value === 'transcoding');
  readonly succeeded = computed(() => this._phase.value === 'success');
  readonly failed = computed(() => this._phase.value === 'error');
  readonly progressVariable = computed(() => String(this._progress.value));

  constructor({ eventBus }: { eventBus: EventBus }) {
    super();

    this.disposables.add(eventBus.subscribe(EventChannels.TRANSCODE.STARTED, () => this.start()));
    this.disposables.add(eventBus.subscribe(EventChannels.TRANSCODE.PROGRESS, ({ percent }) => this.advance(percent)));
    this.disposables.add(eventBus.subscribe(EventChannels.TRANSCODE.COMPLETED, () => this.finish('success', SUCCESS_LABEL, SUCCESS_HIDE_DELAY_MS)));
    this.disposables.add(eventBus.subscribe(EventChannels.TRANSCODE.ERROR, () => this.finish('error', ERROR_LABEL, ERROR_HIDE_DELAY_MS)));
    this.disposables.add(eventBus.subscribe(EventChannels.TRANSCODE.CANCELLED, () => this.hide()));
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
    void this.disposables.cancel(HIDE_TIMEOUT);
    this._phase.value = 'transcoding';
    this._progress.value = 0;
    this._label.value = '';
  }

  private advance(percent: number): void {
    if (this._phase.value !== 'transcoding' || percent <= 0) return;
    const clamped = Math.min(100, Math.round(percent));
    this._progress.value = clamped;
    this._label.value = `${clamped}%`;
  }

  private finish(phase: 'success' | 'error', label: string, hideDelayMs: number): void {
    this._phase.value = phase;
    this._label.value = label;
    this.disposables.schedule(HIDE_TIMEOUT, () => this.hide(), hideDelayMs);
  }

  private hide(): void {
    void this.disposables.cancel(HIDE_TIMEOUT);
    this._phase.value = 'idle';
    this._progress.value = 0;
    this._label.value = '';
  }
}
