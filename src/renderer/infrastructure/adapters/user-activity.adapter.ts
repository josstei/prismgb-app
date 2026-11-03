
import { throttle } from '@platform/core';

const DEFAULT_ACTIVITY_EVENTS = ['pointermove', 'keydown', 'wheel', 'touchstart'] as const;
const ACTIVITY_ADD_LISTENER_OPTIONS: AddEventListenerOptions = { passive: true };
const THROTTLE_INTERVAL_MS = 100;

export class UserActivityAdapter {
  onActivity(callback: () => void): () => void {
    const source = document;
    const listener = throttle(callback, THROTTLE_INTERVAL_MS);
    DEFAULT_ACTIVITY_EVENTS.forEach((event) => {
      source.addEventListener(event, listener, ACTIVITY_ADD_LISTENER_OPTIONS);
    });

    return () => {
      DEFAULT_ACTIVITY_EVENTS.forEach((event) => {
        source.removeEventListener(event, listener);
      });
    };
  }
}
