import type { IpcRenderer } from 'electron';
import type { IpcChannels } from '@shared/ipc/ipc.manifest.js';
import { createManifestInvokeMethods, createManifestSubscriptionMethods } from '../subscription.factory.js';
import { createPayloadValidatorMetadata } from '../validators.js';

type UpdatePreloadAPI = NonNullable<Window['updateAPI']> & { dispose(): void };
type UpdatePreloadApiFactoryContext = { ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>; channels: IpcChannels; listenerRegistry: Map<string, Set<(...args: unknown[]) => void>>; maxListeners: number; isValidCallback: (callback: unknown) => boolean };

function createUpdatePreloadAPI({ ipcRenderer, channels, listenerRegistry, maxListeners, isValidCallback }: UpdatePreloadApiFactoryContext): UpdatePreloadAPI {
  const invokes = createManifestInvokeMethods({ apiName: 'updateAPI', ipcRenderer, channels });
  const subscriptions = createManifestSubscriptionMethods({ apiName: 'updateAPI', ipcRenderer, registry: listenerRegistry, maxListeners, validateCallback: isValidCallback, metadataByPayload: createPayloadValidatorMetadata('updateAPI') });
  return {
    ...invokes,
    ...subscriptions.methods,
    dispose: subscriptions.dispose
  } satisfies UpdatePreloadAPI;
}

export { createUpdatePreloadAPI };
