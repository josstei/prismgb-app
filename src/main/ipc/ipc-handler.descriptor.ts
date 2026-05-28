import type { IpcMainInvokeEvent } from 'electron';
import { IpcContractManifest } from '@prismgb/ipc';

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

export interface IpcHandlerRegistrationGroup {
  apiName: string;
  descriptors: readonly IpcHandlerDescriptor<Record<string, unknown>>[];
}

interface ManifestInvokeEntry {
  method: string;
  factoryMethod?: string;
  channel: string;
  request?: readonly string[];
  handler?: {
    dependencyTokens?: readonly string[];
    responseMode?: IpcHandlerResponseMode;
  };
}

interface ManifestBackedHandlerDescriptor<TDependencies> {
  method: string;
  channel?: string;
  mapError: IpcHandlerDescriptor<TDependencies>['mapError'];
  invoke: IpcHandlerDescriptor<TDependencies>['invoke'];
}

function requireManifestInvokeEntry(
  apiName: string,
  method: string,
  expectedChannel?: string
): ManifestInvokeEntry {
  const namespace = IpcContractManifest.namespaces.find((entry) => entry.apiName === apiName);
  if (!namespace) throw new Error(`IPC manifest namespace not found for ${apiName}`);
  const invokeEntry = (namespace.invoke as ManifestInvokeEntry[]).find(
    (entry) => (entry.factoryMethod || entry.method) === method
  );
  if (!invokeEntry) throw new Error(`IPC manifest invoke entry not found for ${apiName}.${method}`);
  if (expectedChannel && invokeEntry.channel !== expectedChannel) {
    throw new Error(`IPC manifest channel mismatch for ${apiName}.${method}`);
  }
  return invokeEntry;
}

function requireManifestHandlerMetadata(
  apiName: string,
  method: string,
  invokeEntry: ManifestInvokeEntry
): { dependencyTokens: readonly string[]; responseMode: IpcHandlerResponseMode } {
  const metadata = invokeEntry.handler;
  if (!metadata) throw new Error(`IPC manifest handler metadata missing for ${apiName}.${method}`);
  if (!Array.isArray(metadata.dependencyTokens) || metadata.dependencyTokens.some((token) => typeof token !== 'string' || token.trim().length === 0)) {
    throw new Error(`IPC manifest dependency tokens missing for ${apiName}.${method}`);
  }
  if (metadata.responseMode !== 'bare' && metadata.responseMode !== 'result-envelope') {
    throw new Error(`IPC manifest response mode missing for ${apiName}.${method}`);
  }
  return {
    dependencyTokens: metadata.dependencyTokens,
    responseMode: metadata.responseMode
  };
}

export function defineIpcHandlers<TDependencies>(
  descriptors: readonly IpcHandlerDescriptor<TDependencies>[]
): readonly IpcHandlerDescriptor<TDependencies>[] {
  return descriptors;
}

export function defineManifestIpcHandlers<TDependencies>(
  apiName: string,
  descriptors: readonly ManifestBackedHandlerDescriptor<TDependencies>[]
): readonly IpcHandlerDescriptor<TDependencies>[] {
  return defineIpcHandlers(
    descriptors.map(({ method, channel, ...descriptor }) => {
      const invokeEntry = requireManifestInvokeEntry(apiName, method, channel);
      const metadata = requireManifestHandlerMetadata(apiName, method, invokeEntry);
      return {
        ...descriptor,
        channel: invokeEntry.channel,
        argumentSchema: invokeEntry.request ?? [],
        dependencyTokens: metadata.dependencyTokens,
        responseMode: metadata.responseMode
      };
    })
  );
}

function createRuntimeIpcHandlerDescriptor<TDependencies extends object>(
  descriptor: IpcHandlerDescriptor<TDependencies>
): IpcHandlerDescriptor<Record<string, unknown>> {
  return {
    ...descriptor,
    mapError: (error, dependencies, event, ...args) =>
      descriptor.mapError(error, dependencies as TDependencies, event, ...args),
    invoke: (dependencies, event, ...args) =>
      descriptor.invoke(dependencies as TDependencies, event, ...args)
  };
}

export function defineIpcHandlerRegistrationGroup<TDependencies extends object>(
  apiName: string,
  descriptors: readonly IpcHandlerDescriptor<TDependencies>[]
): IpcHandlerRegistrationGroup {
  return { apiName, descriptors: descriptors.map(createRuntimeIpcHandlerDescriptor) };
}

function validateIpcArguments(schema: readonly string[] = [], args: readonly unknown[]): void {
  if (args.length > schema.length) throw new Error(`expected ${schema.length} argument(s), received ${args.length}`);
  schema.forEach((definition, index) => {
    const [rawName, rawType] = definition.split(':'), value = args[index];
    const validType = rawType === 'array' ? Array.isArray(value) : rawType === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value) : typeof value === rawType;
    if (!(value === undefined && rawName.endsWith('?')) && (value === undefined || !validType)) throw new Error(`argument ${rawName.replace(/\?$/, '')} must be ${rawType}`);
  });
}

export function registerIpcHandlerDescriptors<TDependencies>(
  registerHandler: RegisterHandler,
  dependencies: TDependencies,
  descriptors: readonly IpcHandlerDescriptor<TDependencies>[]
): void {
  for (const descriptor of descriptors) {
    registerHandler(descriptor.channel, async (event, ...args) => {
      try {
        validateIpcArguments(descriptor.argumentSchema, args);
        return await descriptor.invoke(dependencies, event, ...args);
      } catch (error) {
        return descriptor.mapError(error, dependencies, event, ...args);
      }
    });
  }
}

function resolveIpcHandlerDependencies(apiName: string, dependencyContext: Record<string, unknown>, descriptors: readonly IpcHandlerDescriptor<Record<string, unknown>>[]): Record<string, unknown> {
  const dependencies: Record<string, unknown> = {};
  for (const descriptor of descriptors) {
    for (const token of descriptor.dependencyTokens) {
      if (!Object.prototype.hasOwnProperty.call(dependencyContext, token) || dependencyContext[token] === undefined) throw new Error(`IPC handler dependency "${token}" missing for ${apiName}.${descriptor.channel}`);
      dependencies[token] = dependencyContext[token];
    }
  }
  return dependencies;
}

export function registerIpcHandlerRegistrationGroups(
  registerHandler: RegisterHandler,
  dependencyContext: Record<string, unknown>,
  groups: readonly IpcHandlerRegistrationGroup[]
): void {
  for (const group of groups) {
    registerIpcHandlerDescriptors(registerHandler, resolveIpcHandlerDependencies(group.apiName, dependencyContext, group.descriptors), group.descriptors);
  }
}
