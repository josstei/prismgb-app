import type { IpcRenderer } from 'electron';
import type { IpcChannels } from '@shared/ipc/ipc.manifest.js';
import { createManifestInvokeMethods, createManifestSubscriptionMethods } from '../subscription.factory.js';
import { createPayloadValidatorMetadata } from '../validators.js';

type TranscodePreloadAPI = NonNullable<Window['transcodeAPI']> & { dispose(): void };
type TranscodePreloadApiFactoryContext = { ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>; channels: IpcChannels; listenerRegistry: Map<string, Set<(...args: unknown[]) => void>>; maxListeners: number; isValidCallback: (callback: unknown) => boolean; isValidTranscodeParams: (buffer: unknown, format: unknown) => boolean; isValidFfmpegArgs: (args: unknown) => boolean };

function createStartInvoker({ ipcRenderer, channel, isValidTranscodeParams, isValidFfmpegArgs }: Pick<TranscodePreloadApiFactoryContext, 'ipcRenderer' | 'isValidTranscodeParams' | 'isValidFfmpegArgs'> & { channel: string }): TranscodePreloadAPI['start'] {
  return (arrayBuffer, format, outputFilename, options = {}) => {
    if (!isValidTranscodeParams(arrayBuffer, format)) { console.warn('transcodeAPI.start: Invalid parameters provided'); return Promise.resolve({ success: false, error: 'Invalid parameters' }); }
    if (options?.inputArgs && !isValidFfmpegArgs(options.inputArgs)) { console.warn('transcodeAPI.start: Invalid input arguments provided'); return Promise.resolve({ success: false, error: 'Invalid input arguments' }); }
    return ipcRenderer.invoke(channel, { inputBuffer: arrayBuffer, format, outputFilename: typeof outputFilename === 'string' ? outputFilename : undefined, inputArgs: options?.inputArgs, interrupted: Boolean(options?.interrupted) });
  };
}

function createCancelInvoker(ipcRenderer: Pick<IpcRenderer, 'invoke'>, channel: string): TranscodePreloadAPI['cancel'] {
  return (jobId) => {
    if (typeof jobId !== 'string' || jobId.length === 0) { console.warn('transcodeAPI.cancel: Invalid jobId provided'); return Promise.resolve({ success: false, error: 'Invalid jobId' }); }
    return ipcRenderer.invoke(channel, { jobId });
  };
}

function createTranscodePreloadAPI({ ipcRenderer, channels, listenerRegistry, maxListeners, isValidCallback, isValidTranscodeParams, isValidFfmpegArgs }: TranscodePreloadApiFactoryContext): TranscodePreloadAPI {
  const invokes = createManifestInvokeMethods({
    apiName: 'transcodeAPI',
    ipcRenderer,
    channels,
    methodFactories: {
      start: ({ channel }) => createStartInvoker({ ipcRenderer, channel, isValidTranscodeParams, isValidFfmpegArgs }),
      cancel: ({ channel }) => createCancelInvoker(ipcRenderer, channel)
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
