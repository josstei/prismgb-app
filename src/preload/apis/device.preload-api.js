function createDevicePreloadAPI({ ipcRenderer, channels, listenerRegistry, maxListeners, isValidCallback }) {
  return {
    getStatus: () => ipcRenderer.invoke(channels.DEVICE.GET_STATUS),

    onConnected: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('deviceAPI.onConnected: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.connected.size >= maxListeners) {
        console.warn('deviceAPI.onConnected: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, device) => callback(device);
      listenerRegistry.connected.add(listener);
      ipcRenderer.on(channels.DEVICE.CONNECTED, listener);

      return () => {
        ipcRenderer.removeListener(channels.DEVICE.CONNECTED, listener);
        listenerRegistry.connected.delete(listener);
      };
    },

    onDisconnected: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('deviceAPI.onDisconnected: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.disconnected.size >= maxListeners) {
        console.warn('deviceAPI.onDisconnected: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, device) => callback(device);
      listenerRegistry.disconnected.add(listener);
      ipcRenderer.on(channels.DEVICE.DISCONNECTED, listener);

      return () => {
        ipcRenderer.removeListener(channels.DEVICE.DISCONNECTED, listener);
        listenerRegistry.disconnected.delete(listener);
      };
    },

    removeListeners: () => {
      ipcRenderer.removeAllListeners(channels.DEVICE.CONNECTED);
      ipcRenderer.removeAllListeners(channels.DEVICE.DISCONNECTED);
      listenerRegistry.connected.clear();
      listenerRegistry.disconnected.clear();
    }
  };
}

export {
  createDevicePreloadAPI
};
