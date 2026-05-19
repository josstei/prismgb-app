import { createSubscription } from '../subscription.factory.js';

function createDevicePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const listenerKeys = {
    onConnected: 'device.onConnected',
    onDisconnected: 'device.onDisconnected'
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
    getStatus: () => ipcRenderer.invoke(channels.DEVICE.GET_STATUS),

    onConnected: (callback) =>
      createSubscription({
        apiName: 'deviceAPI',
        methodName: 'onConnected',
        channel: channels.DEVICE.CONNECTED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onConnected,
        maxListeners,
        validateCallback: isValidCallback
      })(callback),

    onDisconnected: (callback) =>
      createSubscription({
        apiName: 'deviceAPI',
        methodName: 'onDisconnected',
        channel: channels.DEVICE.DISCONNECTED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onDisconnected,
        maxListeners,
        validateCallback: isValidCallback
      })(callback),

    dispose: () => {
      disposeListenersForKey(channels.DEVICE.CONNECTED, listenerKeys.onConnected);
      disposeListenersForKey(channels.DEVICE.DISCONNECTED, listenerKeys.onDisconnected);
    }
  };
}

export {
  createDevicePreloadAPI
};
