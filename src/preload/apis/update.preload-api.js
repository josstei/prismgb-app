import { createManifestInvokeSet, createManifestSubscriptionMethods } from '../subscription.factory.js';

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
  const invokeSet = createManifestInvokeSet('updateAPI', channels).requireMethod, getStatusChannel = invokeSet('getStatus'), checkForUpdatesChannel = invokeSet('checkForUpdates'), downloadUpdateChannel = invokeSet('downloadUpdate'), installUpdateChannel = invokeSet('installUpdate');
  const subscriptions = createManifestSubscriptionMethods({ apiName: 'updateAPI', ipcRenderer, registry: listenerRegistry, maxListeners, validateCallback: isValidCallback, metadataByMethod: localValidators });

  return {
    getStatus: () => ipcRenderer.invoke(getStatusChannel),
    checkForUpdates: () => ipcRenderer.invoke(checkForUpdatesChannel),
    downloadUpdate: () => ipcRenderer.invoke(downloadUpdateChannel),
    installUpdate: () => ipcRenderer.invoke(installUpdateChannel),

    ...subscriptions.methods,
    dispose: subscriptions.dispose
  };
}

export {
  createUpdatePreloadAPI
};
