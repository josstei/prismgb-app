import type { IpcMainInvokeEvent } from 'electron';

export interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export type IpcHandlerResponseMode = 'bare' | 'result-envelope';

export interface IpcHandlerDescriptor<TDependencies> {
  channel: string;
  dependencyTokens: readonly string[];
  argumentSchema?: readonly string[];
  responseMode: IpcHandlerResponseMode;
  mapError: (
    error: unknown,
    dependencies: TDependencies,
    event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => unknown;
  invoke(
    dependencies: TDependencies,
    event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): Promise<unknown> | unknown;
}

export function defineIpcHandlers<TDependencies>(
  descriptors: readonly IpcHandlerDescriptor<TDependencies>[]
): readonly IpcHandlerDescriptor<TDependencies>[] {
  return descriptors;
}

export function registerIpcHandlerDescriptors<TDependencies extends { registerHandler: RegisterHandler }>(
  dependencies: TDependencies,
  descriptors: readonly IpcHandlerDescriptor<TDependencies>[]
): void {
  for (const descriptor of descriptors) {
    dependencies.registerHandler(descriptor.channel, async (event, ...args) => {
      try {
        return await descriptor.invoke(dependencies, event, ...args);
      } catch (error) {
        return descriptor.mapError(error, dependencies, event, ...args);
      }
    });
  }
}
