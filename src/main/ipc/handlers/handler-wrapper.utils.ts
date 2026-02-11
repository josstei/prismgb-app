import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';

export interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

type WrappedHandler<TArgs extends unknown[], TResult> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => TResult | Promise<TResult>;

type WrappedHandlerOptions<TArgs extends unknown[], TResult> = {
  registerHandler: RegisterHandler;
  channel: string;
  logger: Logger;
  logMessage: string;
  handler: WrappedHandler<TArgs, TResult>;
  onError: (error: unknown, event: IpcMainInvokeEvent, ...args: TArgs) => TResult;
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function registerWrappedHandler<TArgs extends unknown[], TResult>({
  registerHandler,
  channel,
  logger,
  logMessage,
  handler,
  onError
}: WrappedHandlerOptions<TArgs, TResult>): void {
  registerHandler(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      return await handler(event, ...(args as TArgs));
    } catch (error) {
      logger.error(logMessage, error);
      return onError(error, event, ...(args as TArgs));
    }
  });
}
