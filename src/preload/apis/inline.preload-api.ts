import type { IpcRenderer } from 'electron';
import type { IpcChannels, IpcManifest } from '@prismgb/ipc';
import type { GpuPolicyPayload } from '@prismgb/ipc';
import { createManifestInvokeMethods } from '../subscription.factory.js';
import {
  getPreloadResponsePolicyFailure,
  mapPreloadResponsePolicyResult,
  requirePreloadInvokeMetadata,
  requirePreloadResponsePolicy,
  type PreloadInvokeMetadata
} from '../validators.generated.js';

type InvokeOnlyIpcRenderer = Pick<IpcRenderer, 'invoke'>;
type BaseInvokeFactoryContext = { ipcRenderer: InvokeOnlyIpcRenderer; channels: IpcChannels; manifest?: IpcManifest };
type ShellPreloadAPI = NonNullable<Window['shellAPI']>;
type MetricsPreloadAPI = NonNullable<Window['metricsAPI']>;
type GpuPreloadAPI = NonNullable<Window['gpuAPI']>;
type LoginItemPreloadAPI = NonNullable<Window['loginItemAPI']>;
type ResponseFallbackOptions = { apiName: string; methodName: string; channel: string; ipcRenderer: InvokeOnlyIpcRenderer; metadata: PreloadInvokeMetadata };

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

const createShellPreloadAPI = ({ ipcRenderer, channels, manifest }: BaseInvokeFactoryContext): ShellPreloadAPI => createManifestInvokeMethods({ apiName: 'shellAPI', ipcRenderer, channels, manifest });

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
      get: ({ channel, manifestEntry }) => createResponseFallbackInvoker({ apiName: 'loginItemAPI', methodName: 'get', channel, ipcRenderer, metadata: requirePreloadInvokeMetadata('loginItemAPI', 'get', manifestEntry) })
    }
  });
}

export { createShellPreloadAPI, createMetricsPreloadAPI, createGpuPreloadAPI, createLoginItemPreloadAPI };
