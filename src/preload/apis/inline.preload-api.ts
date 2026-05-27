import type { IpcRenderer } from 'electron';
import type { IpcChannels, IpcManifest } from '@shared/ipc/ipc.manifest.js';
import type { GpuPolicyPayload, LoginItemSetResponse, ShellOpenExternalResponse } from '@shared/ipc/preload-api.contract.js';
import { createManifestInvokeMethods } from '../subscription.factory.js';
import {
  getPreloadResponsePolicyFailure,
  mapPreloadResponsePolicyResult,
  requirePreloadInvokeMetadata,
  requirePreloadResponsePolicy,
  validatePreloadInvokeArguments,
  type PreloadInvokeManifestEntry,
  type PreloadInvokeMetadata
} from '../validators.js';

type InvokeOnlyIpcRenderer = Pick<IpcRenderer, 'invoke'>;
type InvokeManifestEntry = PreloadInvokeManifestEntry & { request?: readonly string[] };
type BaseInvokeFactoryContext = { ipcRenderer: InvokeOnlyIpcRenderer; channels: IpcChannels; manifest?: IpcManifest };
type ShellPreloadAPI = NonNullable<Window['shellAPI']>;
type MetricsPreloadAPI = NonNullable<Window['metricsAPI']>;
type GpuPreloadAPI = NonNullable<Window['gpuAPI']>;
type LoginItemPreloadAPI = NonNullable<Window['loginItemAPI']>;
type InvokeMethodOptions = { channel: string; ipcRenderer: InvokeOnlyIpcRenderer; metadata: PreloadInvokeMetadata; manifestEntry?: InvokeManifestEntry };
type ResponseFallbackOptions = { apiName: string; methodName: string; channel: string; ipcRenderer: InvokeOnlyIpcRenderer; metadata: PreloadInvokeMetadata };

function createInvokeMethod<TArgs extends unknown[], TResult>({ channel, ipcRenderer, metadata, manifestEntry }: InvokeMethodOptions): (...args: TArgs) => Promise<TResult> {
  const argumentCount = Array.isArray(manifestEntry?.request) ? manifestEntry.request.length : null;
  return (...args) => {
    const forwardedArgs = (argumentCount === null ? args : args.slice(0, argumentCount)) as TArgs;
    const failure = validatePreloadInvokeArguments<TResult>(metadata, forwardedArgs);
    if (failure) { console.warn(failure.invalidMessage); return Promise.resolve(failure.fallback); }
    return ipcRenderer.invoke(channel, ...forwardedArgs) as Promise<TResult>;
  };
}

function createResponseFallbackInvoker<TResult>({ apiName, methodName, channel, ipcRenderer, metadata }: ResponseFallbackOptions): () => Promise<TResult> {
  const policy = requirePreloadResponsePolicy<TResult>(metadata);
  return async () => {
    try {
      const result = await ipcRenderer.invoke(channel);
      const failure = getPreloadResponsePolicyFailure(policy, result);
      if (failure) { console.warn(failure.message, failure.detail); return policy.fallback; }
      return mapPreloadResponsePolicyResult<TResult>(policy, result);
    } catch (error) {
      console.warn(`${apiName}.${methodName}: IPC error:`, error);
      return policy.fallback;
    }
  };
}

function createLoginItemInvoker({ apiName, methodName, ipcRenderer, channel, manifestEntry }: { apiName: 'loginItemAPI'; methodName: 'set'; ipcRenderer: InvokeOnlyIpcRenderer; channel: string; manifestEntry: InvokeManifestEntry }): LoginItemPreloadAPI['set'] {
  return createInvokeMethod<[boolean], LoginItemSetResponse>({ channel, ipcRenderer, metadata: requirePreloadInvokeMetadata(apiName, methodName, manifestEntry), manifestEntry });
}

function createShellPreloadAPI({ ipcRenderer, channels, manifest }: BaseInvokeFactoryContext): ShellPreloadAPI {
  return createManifestInvokeMethods({
    apiName: 'shellAPI',
    ipcRenderer,
    channels,
    manifest,
    methodFactories: {
      openExternal: ({ channel, manifestEntry }) => createInvokeMethod<[string], ShellOpenExternalResponse>({ channel, ipcRenderer, metadata: requirePreloadInvokeMetadata('shellAPI', 'openExternal', manifestEntry), manifestEntry })
    }
  });
}

const createMetricsPreloadAPI = ({ ipcRenderer, channels, manifest }: BaseInvokeFactoryContext): MetricsPreloadAPI => createManifestInvokeMethods({ apiName: 'metricsAPI', ipcRenderer, channels, manifest });

function createGpuPreloadAPI({ ipcRenderer, channels, manifest }: BaseInvokeFactoryContext): GpuPreloadAPI {
  return createManifestInvokeMethods({
    apiName: 'gpuAPI',
    ipcRenderer,
    channels,
    manifest,
    methodFactories: {
      getPolicy: ({ channel, manifestEntry }) => createResponseFallbackInvoker<GpuPolicyPayload>({ apiName: 'gpuAPI', methodName: 'getPolicy', channel, ipcRenderer, metadata: requirePreloadInvokeMetadata('gpuAPI', 'getPolicy', manifestEntry) })
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
      get: ({ channel, manifestEntry }) => createResponseFallbackInvoker({ apiName: 'loginItemAPI', methodName: 'get', channel, ipcRenderer, metadata: requirePreloadInvokeMetadata('loginItemAPI', 'get', manifestEntry) }),
      set: ({ channel, manifestEntry }) => createLoginItemInvoker({ apiName: 'loginItemAPI', methodName: 'set', ipcRenderer, channel, manifestEntry })
    }
  });
}

export { createShellPreloadAPI, createMetricsPreloadAPI, createGpuPreloadAPI, createLoginItemPreloadAPI };
