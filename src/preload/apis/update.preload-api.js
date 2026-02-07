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
  return {
    getStatus: () => ipcRenderer.invoke(channels.UPDATE.GET_STATUS),
    checkForUpdates: () => ipcRenderer.invoke(channels.UPDATE.CHECK),
    downloadUpdate: () => ipcRenderer.invoke(channels.UPDATE.DOWNLOAD),
    installUpdate: () => ipcRenderer.invoke(channels.UPDATE.INSTALL),

    onAvailable: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('updateAPI.onAvailable: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.updateAvailable.size >= maxListeners) {
        console.warn('updateAPI.onAvailable: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, info) => {
        if (!isValidUpdateInfo(info)) {
          console.warn('updateAPI.onAvailable: Invalid update info received');
          return;
        }
        callback(info);
      };
      listenerRegistry.updateAvailable.add(listener);
      ipcRenderer.on(channels.UPDATE.AVAILABLE, listener);

      return () => {
        ipcRenderer.removeListener(channels.UPDATE.AVAILABLE, listener);
        listenerRegistry.updateAvailable.delete(listener);
      };
    },

    onNotAvailable: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('updateAPI.onNotAvailable: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.updateNotAvailable.size >= maxListeners) {
        console.warn('updateAPI.onNotAvailable: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, info) => {
        if (!isValidUpdateInfo(info)) {
          console.warn('updateAPI.onNotAvailable: Invalid update info received');
          return;
        }
        callback(info);
      };
      listenerRegistry.updateNotAvailable.add(listener);
      ipcRenderer.on(channels.UPDATE.NOT_AVAILABLE, listener);

      return () => {
        ipcRenderer.removeListener(channels.UPDATE.NOT_AVAILABLE, listener);
        listenerRegistry.updateNotAvailable.delete(listener);
      };
    },

    onProgress: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('updateAPI.onProgress: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.updateProgress.size >= maxListeners) {
        console.warn('updateAPI.onProgress: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, progress) => {
        if (!isValidProgress(progress)) {
          console.warn('updateAPI.onProgress: Invalid progress received');
          return;
        }
        callback(progress);
      };
      listenerRegistry.updateProgress.add(listener);
      ipcRenderer.on(channels.UPDATE.PROGRESS, listener);

      return () => {
        ipcRenderer.removeListener(channels.UPDATE.PROGRESS, listener);
        listenerRegistry.updateProgress.delete(listener);
      };
    },

    onDownloaded: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('updateAPI.onDownloaded: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.updateDownloaded.size >= maxListeners) {
        console.warn('updateAPI.onDownloaded: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, info) => {
        if (!isValidUpdateInfo(info)) {
          console.warn('updateAPI.onDownloaded: Invalid update info received');
          return;
        }
        callback(info);
      };
      listenerRegistry.updateDownloaded.add(listener);
      ipcRenderer.on(channels.UPDATE.DOWNLOADED, listener);

      return () => {
        ipcRenderer.removeListener(channels.UPDATE.DOWNLOADED, listener);
        listenerRegistry.updateDownloaded.delete(listener);
      };
    },

    onError: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('updateAPI.onError: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.updateError.size >= maxListeners) {
        console.warn('updateAPI.onError: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, error) => {
        if (!isValidError(error)) {
          console.warn('updateAPI.onError: Invalid error received');
          return;
        }
        callback(error);
      };
      listenerRegistry.updateError.add(listener);
      ipcRenderer.on(channels.UPDATE.ERROR, listener);

      return () => {
        ipcRenderer.removeListener(channels.UPDATE.ERROR, listener);
        listenerRegistry.updateError.delete(listener);
      };
    },

    removeListeners: () => {
      ipcRenderer.removeAllListeners(channels.UPDATE.AVAILABLE);
      ipcRenderer.removeAllListeners(channels.UPDATE.NOT_AVAILABLE);
      ipcRenderer.removeAllListeners(channels.UPDATE.PROGRESS);
      ipcRenderer.removeAllListeners(channels.UPDATE.DOWNLOADED);
      ipcRenderer.removeAllListeners(channels.UPDATE.ERROR);
      listenerRegistry.updateAvailable.clear();
      listenerRegistry.updateNotAvailable.clear();
      listenerRegistry.updateProgress.clear();
      listenerRegistry.updateDownloaded.clear();
      listenerRegistry.updateError.clear();
    }
  };
}

export {
  createUpdatePreloadAPI
};
