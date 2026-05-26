import { createManifestInvokeSet, createManifestSubscriptionMethods } from '../subscription.factory.js';

function createDevicePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const getDeviceStatusChannel = createManifestInvokeSet('deviceAPI', channels).requireMethod('getDeviceStatus');
  const subscriptions = createManifestSubscriptionMethods({ apiName: 'deviceAPI', ipcRenderer, registry: listenerRegistry, maxListeners, validateCallback: isValidCallback });

  return {
    getDeviceStatus: () => ipcRenderer.invoke(getDeviceStatusChannel),

    ...subscriptions.methods,
    dispose: subscriptions.dispose
  };
}

export {
  createDevicePreloadAPI
};
