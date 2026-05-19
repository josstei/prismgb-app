import { DisposableBag } from '@shared/base/disposable-bag.js';

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

export class PresentationComponent {
  protected readonly _disposables = new DisposableBag();

  protected listen(
    target: EventTargetLike | null,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): () => void {
    if (!target) {
      return () => {};
    }

    if (options === undefined) {
      target.addEventListener(type, handler);
      return this._disposables.add(() => target.removeEventListener(type, handler));
    }

    return this._disposables.addEvent(target, type, handler, options);
  }

  protected timeout(handler: () => void, delay: number, ...args: unknown[]) {
    const handle = setTimeout(handler, delay, ...args);
    return this._disposables.addTimeout(handle);
  }

  protected interval(handler: () => void, delay: number, ...args: unknown[]) {
    const handle = setInterval(handler, delay, ...args);
    return this._disposables.addInterval(handle);
  }

  protected animationFrame(handler: FrameRequestCallback) {
    const handle = requestAnimationFrame(handler);
    return this._disposables.addAnimationFrame(handle);
  }

  protected observe(observer: { disconnect(): void }) {
    return this._disposables.addObserver(observer);
  }

  dispose(): void {
    void this._disposables.clear();
  }
}
