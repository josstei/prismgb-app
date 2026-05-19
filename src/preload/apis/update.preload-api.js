import { createSubscription } from '../subscription.factory.js';

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
  const listenerKeys = {
    onAvailable: 'update.onAvailable',
    onNotAvailable: 'update.onNotAvailable',
    onProgress: 'update.onProgress',
    onDownloaded: 'update.onDownloaded',
    onError: 'update.onError'
  };

  const removeListenersForKey = (channel, registryKey) => {
    const listeners = listenerRegistry.get(registryKey);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      ipcRenderer.removeListener(channel, listener);
    }
    listeners.clear();
  };

  return {
    getStatus: () => ipcRenderer.invoke(channels.UPDATE.GET_STATUS),
    checkForUpdates: () => ipcRenderer.invoke(channels.UPDATE.CHECK),
    downloadUpdate: () => ipcRenderer.invoke(channels.UPDATE.DOWNLOAD),
    installUpdate: () => ipcRenderer.invoke(channels.UPDATE.INSTALL),

    onAvailable: (callback) =>
      createSubscription({
        apiName: 'updateAPI',
        methodName: 'onAvailable',
        channel: channels.UPDATE.AVAILABLE,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onAvailable,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidUpdateInfo,
        invalidPayloadMessage: 'updateAPI.onAvailable: Invalid update info received'
      })(callback),

    onNotAvailable: (callback) =>
      createSubscription({
        apiName: 'updateAPI',
        methodName: 'onNotAvailable',
        channel: channels.UPDATE.NOT_AVAILABLE,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onNotAvailable,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidUpdateInfo,
        invalidPayloadMessage: 'updateAPI.onNotAvailable: Invalid update info received'
      })(callback),

    onProgress: (callback) =>
      createSubscription({
        apiName: 'updateAPI',
        methodName: 'onProgress',
        channel: channels.UPDATE.PROGRESS,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onProgress,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidProgress,
        invalidPayloadMessage: 'updateAPI.onProgress: Invalid progress received'
      })(callback),

    onDownloaded: (callback) =>
      createSubscription({
        apiName: 'updateAPI',
        methodName: 'onDownloaded',
        channel: channels.UPDATE.DOWNLOADED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onDownloaded,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidUpdateInfo,
        invalidPayloadMessage: 'updateAPI.onDownloaded: Invalid update info received'
      })(callback),

    onError: (callback) =>
      createSubscription({
        apiName: 'updateAPI',
        methodName: 'onError',
        channel: channels.UPDATE.ERROR,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onError,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidError,
        invalidPayloadMessage: 'updateAPI.onError: Invalid error received'
      })(callback),

    removeListeners: () => {
      removeListenersForKey(channels.UPDATE.AVAILABLE, listenerKeys.onAvailable);
      removeListenersForKey(channels.UPDATE.NOT_AVAILABLE, listenerKeys.onNotAvailable);
      removeListenersForKey(channels.UPDATE.PROGRESS, listenerKeys.onProgress);
      removeListenersForKey(channels.UPDATE.DOWNLOADED, listenerKeys.onDownloaded);
      removeListenersForKey(channels.UPDATE.ERROR, listenerKeys.onError);
    }
  };
}

export {
  createUpdatePreloadAPI
};
