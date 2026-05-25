import { applyRequiredSubscriptionMetadata, createManifestInvokeSet, createManifestSubscriptionSet, createSubscription, createSubscriptionDisposer, requireSubscriptionMethod } from '../subscription.factory.js';

function createUpdatePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback,
  isValidUpdateInfo,
  isValidProgress,
  isValidError
}) {
  const localValidators = {
    onAvailable: {
      validatePayload: isValidUpdateInfo,
      invalidPayloadMessage: 'updateAPI.onAvailable: Invalid update info received'
    },
    onNotAvailable: {
      validatePayload: isValidUpdateInfo,
      invalidPayloadMessage: 'updateAPI.onNotAvailable: Invalid update info received'
    },
    onProgress: {
      validatePayload: isValidProgress,
      invalidPayloadMessage: 'updateAPI.onProgress: Invalid progress received'
    },
    onDownloaded: {
      validatePayload: isValidUpdateInfo,
      invalidPayloadMessage: 'updateAPI.onDownloaded: Invalid update info received'
    },
    onError: {
      validatePayload: isValidError,
      invalidPayloadMessage: 'updateAPI.onError: Invalid error received'
    }
  };
  const { subscriptions: manifestSubscriptions } = createManifestSubscriptionSet('updateAPI');
  const invokeSet = createManifestInvokeSet('updateAPI', channels).requireMethod, getStatusChannel = invokeSet('getStatus'), checkForUpdatesChannel = invokeSet('checkForUpdates'), downloadUpdateChannel = invokeSet('downloadUpdate'), installUpdateChannel = invokeSet('installUpdate');
  const subscriptions = applyRequiredSubscriptionMetadata('updateAPI', manifestSubscriptions, localValidators);
  const subscriptionsByMethod = Object.fromEntries(
    subscriptions.map((subscription) => [subscription.methodName, subscription])
  );
  const subscribe = (methodName, callback) =>
    createSubscription({
      ipcRenderer,
      registry: listenerRegistry,
      maxListeners,
      validateCallback: isValidCallback,
      ...requireSubscriptionMethod('updateAPI', subscriptionsByMethod, methodName)
    })(callback);
  const disposeSubscriptions = createSubscriptionDisposer({
    ipcRenderer,
    registry: listenerRegistry,
    subscriptions
  });

  return {
    getStatus: () => ipcRenderer.invoke(getStatusChannel),
    checkForUpdates: () => ipcRenderer.invoke(checkForUpdatesChannel),
    downloadUpdate: () => ipcRenderer.invoke(downloadUpdateChannel),
    installUpdate: () => ipcRenderer.invoke(installUpdateChannel),

    onAvailable: (callback) => subscribe('onAvailable', callback),

    onNotAvailable: (callback) => subscribe('onNotAvailable', callback),

    onProgress: (callback) => subscribe('onProgress', callback),

    onDownloaded: (callback) => subscribe('onDownloaded', callback),

    onError: (callback) => subscribe('onError', callback),

    dispose: disposeSubscriptions
  };
}

export {
  createUpdatePreloadAPI
};
