import type { IpcRenderer } from 'electron';
import type { IpcChannels } from '@shared/ipc/ipc.manifest.js';
import type { TranscodeCancelResponse, TranscodeStartResponse } from '@shared/ipc/preload-api.contract.js';
import { createManifestInvokeMethods, createManifestSubscriptionMethods } from '../subscription.factory.js';
import { createPayloadValidatorMetadata, requirePreloadInvokeMetadata, validatePreloadInvokeArguments, type PreloadInvokeManifestEntry } from '../validators.generated.js';

type TranscodePreloadAPI = NonNullable<Window['transcodeAPI']> & { dispose(): void };
type TranscodePreloadApiFactoryContext = { ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>; channels: IpcChannels; listenerRegistry: Map<string, Set<(...args: unknown[]) => void>>; maxListeners: number; isValidCallback: (callback: unknown) => boolean };

function createStartInvoker({ ipcRenderer, channel, manifestEntry }: Pick<TranscodePreloadApiFactoryContext, 'ipcRenderer'> & { channel: string; manifestEntry: PreloadInvokeManifestEntry }): TranscodePreloadAPI['start'] {
  const metadata = requirePreloadInvokeMetadata('transcodeAPI', 'start', manifestEntry);
  return (arrayBuffer, format, outputFilename, options = {}) => {
    const failure = validatePreloadInvokeArguments<TranscodeStartResponse>(metadata, [arrayBuffer, format, outputFilename, options]);
    if (failure) { console.warn(failure.invalidMessage); return Promise.resolve(failure.fallback); }
    return ipcRenderer.invoke(channel, { inputBuffer: arrayBuffer, format, outputFilename: typeof outputFilename === 'string' ? outputFilename : undefined, inputArgs: options?.inputArgs, interrupted: Boolean(options?.interrupted) });
  };
}

function createCancelInvoker(ipcRenderer: Pick<IpcRenderer, 'invoke'>, channel: string, manifestEntry: PreloadInvokeManifestEntry): TranscodePreloadAPI['cancel'] {
  const metadata = requirePreloadInvokeMetadata('transcodeAPI', 'cancel', manifestEntry);
  return (jobId) => {
    const failure = validatePreloadInvokeArguments<TranscodeCancelResponse>(metadata, [jobId]);
    if (failure) { console.warn(failure.invalidMessage); return Promise.resolve(failure.fallback); }
    return ipcRenderer.invoke(channel, { jobId });
  };
}

function createTranscodePreloadAPI({ ipcRenderer, channels, listenerRegistry, maxListeners, isValidCallback }: TranscodePreloadApiFactoryContext): TranscodePreloadAPI {
  const invokes = createManifestInvokeMethods({
    apiName: 'transcodeAPI',
    ipcRenderer,
    channels,
    methodFactories: {
      start: ({ channel, manifestEntry }) => createStartInvoker({ ipcRenderer, channel, manifestEntry }),
      cancel: ({ channel, manifestEntry }) => createCancelInvoker(ipcRenderer, channel, manifestEntry)
    }
  });
  const subscriptions = createManifestSubscriptionMethods({ apiName: 'transcodeAPI', ipcRenderer, registry: listenerRegistry, maxListeners, validateCallback: isValidCallback, metadataByPayload: createPayloadValidatorMetadata('transcodeAPI') });
  return {
    ...invokes,
    ...subscriptions.methods,
    dispose: subscriptions.dispose
  } satisfies TranscodePreloadAPI;
}

export { createTranscodePreloadAPI };
