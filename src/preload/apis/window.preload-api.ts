import type { IpcRenderer } from 'electron';
import type { IpcChannels } from '@prismgb/ipc';
import { createManifestInvokeMethods, createManifestSubscriptionMethods } from '../subscription.factory.js';

type WindowPreloadAPI = NonNullable<Window['windowAPI']> & { dispose(): void };
type WindowPreloadApiFactoryContext = { ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>; channels: IpcChannels; listenerRegistry: Map<string, Set<(...args: unknown[]) => void>>; maxListeners: number; isValidCallback: (callback: unknown) => boolean };

function createWindowPreloadAPI({ ipcRenderer, channels, listenerRegistry, maxListeners, isValidCallback }: WindowPreloadApiFactoryContext): WindowPreloadAPI {
  const invokes = createManifestInvokeMethods({ apiName: 'windowAPI', ipcRenderer, channels });
  const subscriptions = createManifestSubscriptionMethods({ apiName: 'windowAPI', ipcRenderer, registry: listenerRegistry, maxListeners, validateCallback: isValidCallback });
  return {
    ...subscriptions.methods,
    ...invokes,
    dispose: subscriptions.dispose
  } satisfies WindowPreloadAPI;
}

export { createWindowPreloadAPI };
