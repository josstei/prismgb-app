import type { IpcRenderer } from 'electron';
import type { DeviceInfoPayload, DeviceStatusPayload } from '@prismgb/ipc';
import type { IpcChannels } from '@prismgb/ipc';
import { createManifestInvokeMethods, createManifestSubscriptionMethods } from '../subscription.factory.js';
import { createPayloadValidatorMetadata } from '../validators.generated.js';

type Unsubscribe = () => void;
interface DevicePreloadAPI {
  getDeviceStatus(): Promise<DeviceStatusPayload>;
  onDeviceConnected(callback: (payload: DeviceInfoPayload) => void): Unsubscribe;
  onDeviceDisconnected(callback: (payload: DeviceInfoPayload | null | undefined) => void): Unsubscribe;
  dispose(): void;
}

interface DevicePreloadApiFactoryContext {
  ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>;
  channels: IpcChannels;
  listenerRegistry: Map<string, Set<(...args: unknown[]) => void>>;
  maxListeners: number;
  isValidCallback: (callback: unknown) => boolean;
}

function createDevicePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}: DevicePreloadApiFactoryContext): DevicePreloadAPI {
  const invokes = createManifestInvokeMethods({ apiName: 'deviceAPI', ipcRenderer, channels });
  const subscriptions = createManifestSubscriptionMethods({ apiName: 'deviceAPI', ipcRenderer, registry: listenerRegistry, maxListeners, validateCallback: isValidCallback, metadataByPayload: createPayloadValidatorMetadata('deviceAPI') });

  return {
    ...invokes,
    ...subscriptions.methods,
    dispose: subscriptions.dispose
  } satisfies DevicePreloadAPI;
}
export { createDevicePreloadAPI };
