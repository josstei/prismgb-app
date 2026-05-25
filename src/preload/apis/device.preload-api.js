import { createManifestInvokeSet, createManifestSubscriptionSet, createSubscription, createSubscriptionDisposer } from '../subscription.factory.js';

function createDevicePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const subscriptionSet = createManifestSubscriptionSet('deviceAPI'), { subscriptions } = subscriptionSet;
  const getDeviceStatusChannel = createManifestInvokeSet('deviceAPI', channels).requireMethod('getDeviceStatus');
  const subscribe = (methodName, callback) =>
    createSubscription({
      ipcRenderer,
      registry: listenerRegistry,
      maxListeners,
      validateCallback: isValidCallback,
      ...subscriptionSet.requireMethod(methodName)
    })(callback);
  const disposeSubscriptions = createSubscriptionDisposer({
    ipcRenderer,
    registry: listenerRegistry,
    subscriptions
  });

  return {
    getDeviceStatus: () => ipcRenderer.invoke(getDeviceStatusChannel),

    onDeviceConnected: (callback) => subscribe('onDeviceConnected', callback),

    onDeviceDisconnected: (callback) => subscribe('onDeviceDisconnected', callback),

    dispose: disposeSubscriptions
  };
}

export {
  createDevicePreloadAPI
};
