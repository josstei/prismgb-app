import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

type EventTargetLike = {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean
  ): void;
};

type AutoHideActivityBinding = {
  target: EventTargetLike | null;
  type: string;
  options?: AddEventListenerOptions | boolean;
};

type AutoHideDirectBinding = AutoHideActivityBinding & {
  handler: EventListenerOrEventListenerObject;
};

type ActivityAutoHideControllerOptions = {
  onActivity?: () => void;
  onTimeout?: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
  shouldStartTimer?: () => boolean;
  timeoutMs?: number | null;
};

type ActivityAutoHideEnableOptions = {
  activityEvents?: AutoHideActivityBinding[];
  directEvents?: AutoHideDirectBinding[];
  triggerActivity?: boolean;
  triggerActivityImmediately?: boolean;
  startTimer?: boolean;
};

export class ActivityAutoHideController extends PresentationComponent {
  private _isEnabled = false;
  private _isActivityFramePending = false;
  private _rafId: ReturnType<typeof requestAnimationFrame> | null = null;
  private _timerDisposer: (() => void) | null = null;
  private _activityFrameDisposer: (() => void) | null = null;
  private _listenerDisposers: Array<() => void> = [];
  private _onActivity: () => void;
  private _onTimeout: () => void;
  private _onEnable: () => void;
  private _onDisable: () => void;
  private _shouldStartTimer: () => boolean;
  private _timeoutMs: number | null;
  private _boundHandleActivity: () => void;

  constructor(options: ActivityAutoHideControllerOptions = {}) {
    super();

    this._onActivity = options.onActivity || (() => {});
    this._onTimeout = options.onTimeout || (() => {});
    this._onEnable = options.onEnable || (() => {});
    this._onDisable = options.onDisable || (() => {});
    this._shouldStartTimer = options.shouldStartTimer || (() => true);
    this._timeoutMs = options.timeoutMs ?? null;
    this._boundHandleActivity = this._handleActivityEvent.bind(this);
  }

  get isEnabled() {
    return this._isEnabled;
  }

  get isActivityFramePending() {
    return this._isActivityFramePending;
  }

  get rafId() {
    return this._rafId;
  }

  get isTimerRunning() {
    return this._timerDisposer !== null;
  }

  enable(options: ActivityAutoHideEnableOptions = {}) {
    if (this._isEnabled) return;

    this._isEnabled = true;
    this._listenerDisposers = [];
    this._onEnable();

    const activityEvents = options.activityEvents ?? [];
    for (const binding of activityEvents) {
      const dispose = this.listen(binding.target, binding.type, this._boundHandleActivity, binding.options);
      this._listenerDisposers.push(dispose);
    }

    const directEvents = options.directEvents ?? [];
    for (const binding of directEvents) {
      const dispose = this.listen(binding.target, binding.type, binding.handler, binding.options);
      this._listenerDisposers.push(dispose);
    }

    if (options.triggerActivityImmediately) {
      this._onActivity();
    }

    if (options.triggerActivity) {
      this.triggerActivity();
    } else if (options.startTimer) {
      this.startTimer();
    }
  }

  disable() {
    if (!this._isEnabled) return;

    this._isEnabled = false;
    this._clearTimer();
    this._clearActivityFrame();
    this._clearListeners();
    this._onDisable();
  }

  dispose() {
    this.disable();
  }

  triggerActivity() {
    if (!this._isEnabled) return;

    if (this._isActivityFramePending) return;

    this._isActivityFramePending = true;
    this._rafId = null;
    this._activityFrameDisposer?.();
    const rafId = requestAnimationFrame(() => {
      const disposeFrame = this._activityFrameDisposer;
      this._isActivityFramePending = false;
      this._rafId = null;
      this._activityFrameDisposer = null;
      disposeFrame?.();
      this._onActivity();
      this.startTimer();
    });
    this._rafId = rafId;
    this._activityFrameDisposer = this._disposables.addAnimationFrame(rafId);
  }

  startTimer() {
    if (!this._isEnabled || this._timeoutMs === null) {
      return;
    }

    this._clearTimer();

    if (!this._shouldStartTimer()) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const disposeTimer = this._timerDisposer;
      this._timerDisposer = null;
      disposeTimer?.();
      this._onTimeout();
    }, this._timeoutMs);

    this._timerDisposer = this._disposables.addTimeout(timeoutId);
  }

  clearTimer() {
    this._clearTimer();
  }

  private _handleActivityEvent() {
    this.triggerActivity();
  }

  private _clearActivityFrame() {
    if (this._isActivityFramePending) {
      this._isActivityFramePending = false;
    }

    if (this._activityFrameDisposer) {
      this._activityFrameDisposer();
      this._activityFrameDisposer = null;
    }

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _clearListeners() {
    for (let i = this._listenerDisposers.length - 1; i >= 0; i--) {
      this._listenerDisposers[i]();
    }

    this._listenerDisposers.length = 0;
  }

  private _clearTimer() {
    if (!this._timerDisposer) {
      return;
    }

    this._timerDisposer();
    this._timerDisposer = null;
  }
}
