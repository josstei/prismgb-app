import { DisposableBag } from './disposable-bag';
import { getEventHandlerBindings } from './event-decorator';
import type { Logger, LoggerFactory } from './logger';

/** Declared with method syntax so typed buses stay assignable through method bivariance. */
export type EventSource = {
  subscribe(channel: string, handler: (payload: unknown) => unknown): () => void;
};

export abstract class BaseService {
  protected readonly logger: Logger;
  readonly disposables = new DisposableBag();

  constructor(loggerFactory: LoggerFactory, name: string) {
    this.logger = loggerFactory.create(name);
  }

  protected bindEventHandlers(source: EventSource): void {
    const handlers = this as unknown as Record<string | symbol, (payload: unknown) => unknown>;
    for (const { channel, methodKey } of getEventHandlerBindings(this.constructor)) {
      this.disposables.add(source.subscribe(channel, (payload) => handlers[methodKey](payload)));
    }
  }

  dispose(): Promise<void> {
    return this.disposables.dispose();
  }
}
