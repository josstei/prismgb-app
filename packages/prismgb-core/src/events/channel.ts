import { Subject, type Subscription } from 'rxjs';

export class Channel<T> {
  private readonly subject = new Subject<T>();

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
