import { injectable } from 'inversify';
import { throttle } from '@platform/core';

type Cleanup = () => void;

const DEFAULT_ACTIVITY_EVENTS = ['pointermove', 'keydown', 'wheel', 'touchstart'] as const;
const ACTIVITY_ADD_LISTENER_OPTIONS: AddEventListenerOptions = { passive: true };
const ACTIVITY_REMOVE_LISTENER_OPTIONS: EventListenerOptions = { capture: false };
const THROTTLE_INTERVAL_MS = 100;

@injectable()
export class UserActivityAdapter {
  private _handleUserActivity: (() => void) | null = null;
  private readonly _activityEvents = DEFAULT_ACTIVITY_EVENTS;

  onActivity(callback: () => void): Cleanup {
    if (typeof document === 'undefined') return () => {};

    this._handleUserActivity = throttle(callback, THROTTLE_INTERVAL_MS);

    this._activityEvents.forEach((event) => {
      document.addEventListener(event, this._handleUserActivity as EventListener, ACTIVITY_ADD_LISTENER_OPTIONS);
    });

    return () => this.dispose();
  }

  dispose(): void {
    if (this._handleUserActivity && typeof document !== 'undefined') {
      this._activityEvents.forEach((event) => {
        document.removeEventListener(event, this._handleUserActivity as EventListener, ACTIVITY_REMOVE_LISTENER_OPTIONS);
      });
      this._handleUserActivity = null;
    }
  }
}
