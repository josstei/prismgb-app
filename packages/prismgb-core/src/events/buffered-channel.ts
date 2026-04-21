import { ReplaySubject, type Subscription } from 'rxjs';

export class BufferedChannel<T> {
  private readonly subject: ReplaySubject<T>;

  constructor(maxBufferSize: number) {
    if (maxBufferSize < 1) {
      throw new Error(`BufferedChannel: maxBufferSize must be >= 1; got ${maxBufferSize}.`);
    }
    this.subject = new ReplaySubject<T>(maxBufferSize);
  }

  next(value: T): void {
    this.subject.next(value);
  }

  subscribe(handler: (value: T) => void): Subscription {
    return this.subject.subscribe(handler);
  }

  complete(): void {
    this.subject.complete();
  }
}
