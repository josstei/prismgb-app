import {
  createSubscription,
  createSubscriptionDisposer
} from '../subscription.factory.js';

function createDevicePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const subscriptions = [
    {
      methodName: 'onDeviceConnected',
      channel: channels.DEVICE.CONNECTED,
      registryKey: 'device.onDeviceConnected'
    },
    {
      methodName: 'onDeviceDisconnected',
      channel: channels.DEVICE.DISCONNECTED,
      registryKey: 'device.onDeviceDisconnected'
    }
  ];
  const [connectedSubscription, disconnectedSubscription] = subscriptions;
  const subscribe = (subscription, callback) =>
    createSubscription({
      apiName: 'deviceAPI',
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
    getDeviceStatus: () => ipcRenderer.invoke(channels.DEVICE.GET_STATUS),

    onDeviceConnected: (callback) => subscribe(connectedSubscription, callback),

    onDeviceDisconnected: (callback) => subscribe(disconnectedSubscription, callback),

    dispose: disposeSubscriptions
  };
}

export {
  createDevicePreloadAPI
};
