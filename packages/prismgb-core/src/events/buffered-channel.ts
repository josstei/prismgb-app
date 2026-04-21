import { ReplaySubject, type Subscription } from 'rxjs';

/**
 * Buffered push channel backed by an RxJS `ReplaySubject`.
 *
 * Replays up to `maxBufferSize` past values to each new subscriber,
 * making it suitable for state channels where late consumers need
 * the most recent history. Use `Channel` when replay is not required.
 *
 * @typeParam T - Payload type emitted on this channel.
 *
 * @example
 * ```ts
 * const state = new BufferedChannel<AppState>(1);
 * state.next({ connected: false });
 * state.subscribe(s => console.log(s.connected));
 * ```
 */
export class BufferedChannel<T> {
  private readonly subject: ReplaySubject<T>;

  /**
   * Creates a `BufferedChannel` that replays at most `maxBufferSize` values.
   *
   * @param maxBufferSize - Maximum number of past values replayed to new subscribers. Must be >= 1.
   * @throws {Error} When `maxBufferSize` is less than 1.
   */
  constructor(maxBufferSize: number) {
    if (maxBufferSize < 1) {
      throw new Error(`BufferedChannel: maxBufferSize must be >= 1; got ${maxBufferSize}.`);
    }
    this.subject = new ReplaySubject<T>(maxBufferSize);
  }

  /**
   * Emits `value` to every current subscriber and stores it in the replay buffer.
   *
   * @param value - Payload delivered to subscribers and added to the buffer.
   */
  next(value: T): void {
    this.subject.next(value);
  }

  /**
   * Registers `handler` to receive buffered history and future values.
   *
   * @param handler - Receives each replayed and future value.
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
