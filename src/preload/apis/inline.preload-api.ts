import type { IpcRenderer } from 'electron';
import type { IpcChannels, IpcManifest } from '@shared/ipc/ipc.manifest.js';
import type { GpuPolicyPayload, LoginItemSetResponse, ShellOpenExternalResponse } from '@shared/ipc/preload-api.contract.js';
import { createManifestInvokeMethods } from '../subscription.factory.js';

type InvokeOnlyIpcRenderer = Pick<IpcRenderer, 'invoke'>;
type InvokeManifestEntry = { request?: readonly string[] };
type BaseInvokeFactoryContext = { ipcRenderer: InvokeOnlyIpcRenderer; channels: IpcChannels; manifest?: IpcManifest };
type ShellPreloadAPI = NonNullable<Window['shellAPI']>;
type MetricsPreloadAPI = NonNullable<Window['metricsAPI']>;
type GpuPreloadAPI = NonNullable<Window['gpuAPI']>;
type LoginItemPreloadAPI = NonNullable<Window['loginItemAPI']>;
type InvokeMethodOptions<TArgs extends unknown[], TResult> = { channel: string; ipcRenderer: InvokeOnlyIpcRenderer; validateArgs?: (...args: TArgs) => boolean; invalidArgMessage?: string; fallback: TResult; manifestEntry?: InvokeManifestEntry };
type ResponseFallbackOptions<TResult> = { apiName: string; methodName: string; channel: string; ipcRenderer: InvokeOnlyIpcRenderer; fallback: TResult; onFailure?: (result: unknown) => boolean; onInvalid?: (result: unknown) => boolean; onSuccess?: (result: unknown) => TResult };
const hasObjectShape = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function createInvokeMethod<TArgs extends unknown[], TResult>({ channel, ipcRenderer, validateArgs = () => true, invalidArgMessage, fallback, manifestEntry }: InvokeMethodOptions<TArgs, TResult>): (...args: TArgs) => Promise<TResult> {
  const argumentCount = Array.isArray(manifestEntry?.request) ? manifestEntry.request.length : null;
  return (...args) => {
    const forwardedArgs = (argumentCount === null ? args : args.slice(0, argumentCount)) as TArgs;
    if (!validateArgs(...forwardedArgs)) { if (invalidArgMessage) console.warn(invalidArgMessage); return Promise.resolve(fallback); }
    return ipcRenderer.invoke(channel, ...forwardedArgs) as Promise<TResult>;
  };
}

function createResponseFallbackInvoker<TResult>({ apiName, methodName, channel, ipcRenderer, fallback, onFailure, onInvalid, onSuccess }: ResponseFallbackOptions<TResult>): () => Promise<TResult> {
  return async () => {
    try {
      const result = await ipcRenderer.invoke(channel);
      if (onFailure && !onFailure(result)) return fallback;
      if (onInvalid && !onInvalid(result)) return fallback;
      return onSuccess ? onSuccess(result) : result as TResult;
    } catch (error) {
      console.warn(`${apiName}.${methodName}: IPC error:`, error);
      return fallback;
    }
  };
}

function createGpuPolicyInvoker({ apiName, ipcRenderer, channel, isValidGpuPolicy }: { apiName: 'gpuAPI'; ipcRenderer: InvokeOnlyIpcRenderer; channel: string; isValidGpuPolicy: (policy: unknown) => boolean }): GpuPreloadAPI['getPolicy'] {
  return createResponseFallbackInvoker({
    apiName,
    methodName: 'getPolicy',
    channel,
    ipcRenderer,
    onFailure: (result) => {
      if (!hasObjectShape(result) || result.success !== true) { console.warn('gpuAPI.getPolicy: Failed to get policy:', hasObjectShape(result) ? result.error : undefined); return false; }
      return true;
    },
    onInvalid: (result) => {
      if (!isValidGpuPolicy(result)) { console.warn('gpuAPI.getPolicy: Invalid policy received'); return false; }
      return true;
    },
    fallback: { skipWebGPU: false, reason: null },
    onSuccess: (result) => {
      const policy = result as GpuPolicyPayload;
      return { skipWebGPU: policy.skipWebGPU, reason: policy.reason };
    }
  });
}

function createLoginItemInvoker({ apiName, methodName, ipcRenderer, channel, validator, fallback, manifestEntry }: { apiName: 'loginItemAPI'; methodName: 'set'; ipcRenderer: InvokeOnlyIpcRenderer; channel: string; validator: (enabled: unknown) => boolean; fallback: LoginItemSetResponse; manifestEntry?: InvokeManifestEntry }): LoginItemPreloadAPI['set'] {
  return createInvokeMethod<[boolean], LoginItemSetResponse>({ channel, ipcRenderer, validateArgs: (enabled) => validator(enabled), invalidArgMessage: `${apiName}.${methodName}: Invalid parameter - expected boolean`, fallback, manifestEntry });
}

function createShellPreloadAPI({ ipcRenderer, channels, isValidExternalUrl, manifest }: BaseInvokeFactoryContext & { isValidExternalUrl: (url: unknown) => boolean }): ShellPreloadAPI {
  return createManifestInvokeMethods({
    apiName: 'shellAPI',
    ipcRenderer,
    channels,
    manifest,
    methodFactories: {
      openExternal: ({ channel, manifestEntry }) => createInvokeMethod<[string], ShellOpenExternalResponse>({ channel, ipcRenderer, validateArgs: (url) => isValidExternalUrl(url), invalidArgMessage: 'shellAPI.openExternal: Invalid URL provided', fallback: { success: false, error: 'Invalid URL' }, manifestEntry })
    }
  });
}

const createMetricsPreloadAPI = ({ ipcRenderer, channels, manifest }: BaseInvokeFactoryContext): MetricsPreloadAPI => createManifestInvokeMethods({ apiName: 'metricsAPI', ipcRenderer, channels, manifest });

function createGpuPreloadAPI({ ipcRenderer, channels, isValidGpuPolicy, manifest }: BaseInvokeFactoryContext & { isValidGpuPolicy: (policy: unknown) => boolean }): GpuPreloadAPI {
  return createManifestInvokeMethods({
    apiName: 'gpuAPI',
    ipcRenderer,
    channels,
    manifest,
    methodFactories: {
      getPolicy: ({ channel }) => createGpuPolicyInvoker({ apiName: 'gpuAPI', ipcRenderer, channel, isValidGpuPolicy })
    }
  });
}

function createLoginItemPreloadAPI({ ipcRenderer, channels, manifest }: BaseInvokeFactoryContext): LoginItemPreloadAPI {
  return createManifestInvokeMethods({
    apiName: 'loginItemAPI',
    ipcRenderer,
    channels,
    manifest,
    methodFactories: {
      get: ({ channel }) => createResponseFallbackInvoker({ apiName: 'loginItemAPI', methodName: 'get', channel, ipcRenderer, fallback: false }),
      set: ({ channel, manifestEntry }) => createLoginItemInvoker({ apiName: 'loginItemAPI', methodName: 'set', ipcRenderer, channel, validator: (enabled) => typeof enabled === 'boolean', fallback: { success: false, error: 'Invalid parameter' }, manifestEntry })
    }
  });
}

export { createShellPreloadAPI, createMetricsPreloadAPI, createGpuPreloadAPI, createLoginItemPreloadAPI };
