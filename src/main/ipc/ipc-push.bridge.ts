import { EventEmitter } from 'node:events';
import { injectable, inject } from 'inversify';
import { getErrorMessage, type Logger, type LoggerFactory } from '@platform/core';
import { TOKENS } from '@main/application/di/tokens';

type IpcPushListener = (payload: unknown) => void;

/**
 * The only main-to-renderer push path: services emit here and the router's subscription procedures
 * relay each channel to the renderer. A throwing listener is logged and never blocks the others.
 */
@injectable()
export class IpcPushBridge {
  private static readonly MAX_LISTENERS_PER_CHANNEL = 50;
  private readonly emitter = new EventEmitter();
  private readonly logger: Logger;

  constructor(@inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory) {
    this.logger = loggerFactory.create('IpcPushBridge');
    this.emitter.setMaxListeners(IpcPushBridge.MAX_LISTENERS_PER_CHANNEL);
  }

  emit(channel: string, payload?: unknown): void {
    for (const listener of this.emitter.listeners(channel) as IpcPushListener[]) {
      try {
        listener(payload);
      } catch (error) {
        this.logger.warn('Failed to deliver push', { channel, error: getErrorMessage(error) });
      }
    }
  }

  on(channel: string, listener: IpcPushListener): void {
    this.emitter.on(channel, listener);
  }

  off(channel: string, listener: IpcPushListener): void {
    this.emitter.off(channel, listener);
  }
}
