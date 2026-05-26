import { createManifestInvokeSet, createManifestSubscriptionMethods } from '../subscription.factory.js';

function createWindowPreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const invokeSet = createManifestInvokeSet('windowAPI', channels).requireMethod, setFullScreenChannel = invokeSet('setFullScreen'), isFullScreenChannel = invokeSet('isFullScreen');
  const subscriptions = createManifestSubscriptionMethods({ apiName: 'windowAPI', ipcRenderer, registry: listenerRegistry, maxListeners, validateCallback: isValidCallback });

  return {
    ...subscriptions.methods,

    setFullScreen: (enabled) => ipcRenderer.invoke(setFullScreenChannel, enabled),

    isFullScreen: () => ipcRenderer.invoke(isFullScreenChannel),

    dispose: subscriptions.dispose
  };
}

export {
  createWindowPreloadAPI
};
