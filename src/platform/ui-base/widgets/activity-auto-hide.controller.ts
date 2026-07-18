import { PresentationComponent } from '../lifecycle/presentation-component.base.js';
import type { EventTargetLike } from '@platform/core';


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

const ACTIVITY_FRAME_LIFECYCLE = Symbol('activityAutoHideFrameLifecycle');
const ACTIVITY_LISTENER_LIFECYCLE = Symbol('activityAutoHideListenerLifecycle');
const ACTIVITY_TIMER_LIFECYCLE = Symbol('activityAutoHideTimerLifecycle');

export class ActivityAutoHideController extends PresentationComponent {
  private _isEnabled = false;
  private _isActivityFramePending = false;
  private _onActivity: () => void;
  private _onTimeout: () => void;
  private _onEnable: () => void;
  private _onDisable: () => void;
  private _shouldStartTimer: () => boolean;
  private _timeoutMs: number | null;

  constructor(options: ActivityAutoHideControllerOptions = {}) {
    super();

    this._onActivity = options.onActivity || (() => {});
    this._onTimeout = options.onTimeout || (() => {});
    this._onEnable = options.onEnable || (() => {});
    this._onDisable = options.onDisable || (() => {});
    this._shouldStartTimer = options.shouldStartTimer || (() => true);
    this._timeoutMs = options.timeoutMs ?? null;
  }

  get isEnabled() {
    return this._isEnabled;
  }

  enable(options: ActivityAutoHideEnableOptions = {}) {
    if (this._isEnabled) return;

    this._isEnabled = true;
    this._onEnable();

    const listenerDisposers: Array<() => void> = [];
    const handleActivity = () => this.triggerActivity();
    const activityEvents = options.activityEvents ?? [];
    for (const binding of activityEvents) {
      listenerDisposers.push(this.listen(binding.target, binding.type, handleActivity, binding.options));
    }

    const directEvents = options.directEvents ?? [];
    for (const binding of directEvents) {
      listenerDisposers.push(this.listen(binding.target, binding.type, binding.handler, binding.options));
    }

    this.replaceManagedGroup(ACTIVITY_LISTENER_LIFECYCLE, listenerDisposers);

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

  override dispose(): void | Promise<void> {
    this.disable();
    return super.dispose();
  }

  triggerActivity() {
    if (!this._isEnabled) return;

    if (this._isActivityFramePending) return;

    this._isActivityFramePending = true;
    this.replaceAnimationFrame(ACTIVITY_FRAME_LIFECYCLE, () => {
      this._isActivityFramePending = false;
      this._onActivity();
      this.startTimer();
    });
  }

  startTimer() {
    if (!this._isEnabled || this._timeoutMs === null) {
      return;
    }

    this._clearTimer();

    if (!this._shouldStartTimer()) {
      return;
    }

    this.replaceTimeout(ACTIVITY_TIMER_LIFECYCLE, () => {
      this._onTimeout();
    }, this._timeoutMs);
  }

  clearTimer() {
    this._clearTimer();
  }

  private _clearActivityFrame() {
    this.cancelManaged(ACTIVITY_FRAME_LIFECYCLE);
    this._isActivityFramePending = false;
  }

  private _clearListeners() {
    this.cancelManaged(ACTIVITY_LISTENER_LIFECYCLE);
  }

  private _clearTimer() {
    this.cancelManaged(ACTIVITY_TIMER_LIFECYCLE);
  }
}
