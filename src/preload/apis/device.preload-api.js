import { createSubscription } from '../subscription.factory.js';

function createDevicePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const listenerKeys = {
    onDeviceConnected: 'device.onDeviceConnected',
    onDeviceDisconnected: 'device.onDeviceDisconnected'
  };

  const disposeListenersForKey = (channel, registryKey) => {
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
    getDeviceStatus: () => ipcRenderer.invoke(channels.DEVICE.GET_STATUS),

    onDeviceConnected: (callback) =>
      createSubscription({
        apiName: 'deviceAPI',
        methodName: 'onDeviceConnected',
        channel: channels.DEVICE.CONNECTED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onDeviceConnected,
        maxListeners,
        validateCallback: isValidCallback
      })(callback),

    onDeviceDisconnected: (callback) =>
      createSubscription({
        apiName: 'deviceAPI',
        methodName: 'onDeviceDisconnected',
        channel: channels.DEVICE.DISCONNECTED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onDeviceDisconnected,
        maxListeners,
        validateCallback: isValidCallback
      })(callback),

    dispose: () => {
      disposeListenersForKey(channels.DEVICE.CONNECTED, listenerKeys.onDeviceConnected);
      disposeListenersForKey(channels.DEVICE.DISCONNECTED, listenerKeys.onDeviceDisconnected);
    }
  };
}

export {
  createDevicePreloadAPI
};
