function createWindowPreloadAPI({ ipcRenderer, channels, listenerRegistry, maxListeners, isValidCallback }) {
  return {
    onEnterFullscreen: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('windowAPI.onEnterFullscreen: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.enterFullscreen.size >= maxListeners) {
        console.warn('windowAPI.onEnterFullscreen: Maximum listener limit reached');
        return () => {};
      }

      const listener = () => callback();
      listenerRegistry.enterFullscreen.add(listener);
      ipcRenderer.on(channels.WINDOW.ENTER_FULLSCREEN, listener);

      return () => {
        ipcRenderer.removeListener(channels.WINDOW.ENTER_FULLSCREEN, listener);
        listenerRegistry.enterFullscreen.delete(listener);
      };
    },

    onLeaveFullscreen: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('windowAPI.onLeaveFullscreen: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.leaveFullscreen.size >= maxListeners) {
        console.warn('windowAPI.onLeaveFullscreen: Maximum listener limit reached');
        return () => {};
      }

      const listener = () => callback();
      listenerRegistry.leaveFullscreen.add(listener);
      ipcRenderer.on(channels.WINDOW.LEAVE_FULLSCREEN, listener);

      return () => {
        ipcRenderer.removeListener(channels.WINDOW.LEAVE_FULLSCREEN, listener);
        listenerRegistry.leaveFullscreen.delete(listener);
      };
    },

    onResized: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('windowAPI.onResized: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.resized.size >= maxListeners) {
        console.warn('windowAPI.onResized: Maximum listener limit reached');
        return () => {};
      }

      const listener = () => callback();
      listenerRegistry.resized.add(listener);
      ipcRenderer.on(channels.WINDOW.RESIZED, listener);

      return () => {
        ipcRenderer.removeListener(channels.WINDOW.RESIZED, listener);
        listenerRegistry.resized.delete(listener);
      };
    },

    setFullScreen: (enabled) => ipcRenderer.invoke(channels.WINDOW.SET_FULLSCREEN, enabled),

    isFullScreen: () => ipcRenderer.invoke(channels.WINDOW.IS_FULLSCREEN),

    removeListeners: () => {
      ipcRenderer.removeAllListeners(channels.WINDOW.ENTER_FULLSCREEN);
      ipcRenderer.removeAllListeners(channels.WINDOW.LEAVE_FULLSCREEN);
      ipcRenderer.removeAllListeners(channels.WINDOW.RESIZED);
      listenerRegistry.enterFullscreen.clear();
      listenerRegistry.leaveFullscreen.clear();
      listenerRegistry.resized.clear();
    }
  };
}

export {
  createWindowPreloadAPI
};
