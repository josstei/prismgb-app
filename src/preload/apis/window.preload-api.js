import { createManifestInvokeSet, createManifestSubscriptionSet, createSubscription, createSubscriptionDisposer } from '../subscription.factory.js';

function createWindowPreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const subscriptionSet = createManifestSubscriptionSet('windowAPI'), { subscriptions } = subscriptionSet;
  const invokeSet = createManifestInvokeSet('windowAPI', channels).requireMethod, setFullScreenChannel = invokeSet('setFullScreen'), isFullScreenChannel = invokeSet('isFullScreen');
  const subscribe = (methodName, callback) =>
    createSubscription({
      ipcRenderer,
      registry: listenerRegistry,
      maxListeners,
      validateCallback: isValidCallback,
      dispatchPayload: false,
      ...subscriptionSet.requireMethod(methodName)
    })(callback);
  const disposeSubscriptions = createSubscriptionDisposer({
    ipcRenderer,
    registry: listenerRegistry,
    subscriptions
  });

  return {
    onEnterFullscreen: (callback) => subscribe('onEnterFullscreen', callback),

    onLeaveFullscreen: (callback) => subscribe('onLeaveFullscreen', callback),

    onResized: (callback) => subscribe('onResized', callback),

    setFullScreen: (enabled) => ipcRenderer.invoke(setFullScreenChannel, enabled),

    isFullScreen: () => ipcRenderer.invoke(isFullScreenChannel),

    dispose: disposeSubscriptions
  };
}

export {
  createWindowPreloadAPI
};
