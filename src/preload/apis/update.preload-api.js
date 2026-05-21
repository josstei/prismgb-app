import {
  createSubscription,
  createSubscriptionDisposer
} from '../subscription.factory.js';

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
  const subscriptions = [
    {
      methodName: 'onAvailable',
      channel: channels.UPDATE.AVAILABLE,
      registryKey: 'update.onAvailable',
      validatePayload: isValidUpdateInfo,
      invalidPayloadMessage: 'updateAPI.onAvailable: Invalid update info received'
    },
    {
      methodName: 'onNotAvailable',
      channel: channels.UPDATE.NOT_AVAILABLE,
      registryKey: 'update.onNotAvailable',
      validatePayload: isValidUpdateInfo,
      invalidPayloadMessage: 'updateAPI.onNotAvailable: Invalid update info received'
    },
    {
      methodName: 'onProgress',
      channel: channels.UPDATE.PROGRESS,
      registryKey: 'update.onProgress',
      validatePayload: isValidProgress,
      invalidPayloadMessage: 'updateAPI.onProgress: Invalid progress received'
    },
    {
      methodName: 'onDownloaded',
      channel: channels.UPDATE.DOWNLOADED,
      registryKey: 'update.onDownloaded',
      validatePayload: isValidUpdateInfo,
      invalidPayloadMessage: 'updateAPI.onDownloaded: Invalid update info received'
    },
    {
      methodName: 'onError',
      channel: channels.UPDATE.ERROR,
      registryKey: 'update.onError',
      validatePayload: isValidError,
      invalidPayloadMessage: 'updateAPI.onError: Invalid error received'
    }
  ];
  const [
    availableSubscription,
    notAvailableSubscription,
    progressSubscription,
    downloadedSubscription,
    errorSubscription
  ] = subscriptions;
  const subscribe = (subscription, callback) =>
    createSubscription({
      apiName: 'updateAPI',
      ipcRenderer,
      registry: listenerRegistry,
      maxListeners,
      validateCallback: isValidCallback,
      ...subscription
    })(callback);
  const disposeSubscriptions = createSubscriptionDisposer({
    ipcRenderer,
    registry: listenerRegistry,
    subscriptions
  });

  return {
    getStatus: () => ipcRenderer.invoke(channels.UPDATE.GET_STATUS),
    checkForUpdates: () => ipcRenderer.invoke(channels.UPDATE.CHECK),
    downloadUpdate: () => ipcRenderer.invoke(channels.UPDATE.DOWNLOAD),
    installUpdate: () => ipcRenderer.invoke(channels.UPDATE.INSTALL),

    onAvailable: (callback) => subscribe(availableSubscription, callback),

    onNotAvailable: (callback) => subscribe(notAvailableSubscription, callback),

    onProgress: (callback) => subscribe(progressSubscription, callback),

    onDownloaded: (callback) => subscribe(downloadedSubscription, callback),

    onError: (callback) => subscribe(errorSubscription, callback),

    dispose: disposeSubscriptions
  };
}

export {
  createUpdatePreloadAPI
};
