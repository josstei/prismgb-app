import { Subject, type Subscription } from 'rxjs';

/**
 * Single-value push channel backed by an RxJS `Subject`.
 *
 * Emits values to all current subscribers via `next()`. Unlike
 * `BufferedChannel`, late subscribers do not receive past values.
 *
 * @typeParam T - Payload type emitted on this channel.
 *
 * @example
 * ```ts
 * const ready = new Channel<void>();
 * ready.subscribe(() => console.log('ready'));
 * ready.next(undefined);
 * ```
 */
export class Channel<T> {
  private readonly subject = new Subject<T>();

  /**
   * Emits `value` to every current subscriber.
   *
   * @param value - Payload delivered to subscribers.
   */
  next(value: T): void {
    this.subject.next(value);
  }

  /**
   * Registers `handler` to receive future values emitted on this channel.
   *
   * @param handler - Receives each emitted value.
   * @returns A subscription whose `unsubscribe()` stops delivery.
   */
  subscribe(handler: (value: T) => void): Subscription {
    return this.subject.subscribe(handler);
  }

  /**
   * Completes the channel so that future `next()` calls are ignored.
   */
  complete(): void {
    this.subject.complete();
  }
}
