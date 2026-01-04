const { contextBridge, ipcRenderer } = require('electron');

/**
 * IPC Channel names - imported from single source of truth
 */
import IPC_CHANNELS from '@shared/ipc/channels.json';

/**
 * Preload script - exposes safe APIs to renderer process
 *
 * This script runs in a privileged context and bridges the gap between
 * the main process and renderer process while maintaining security.
 */

/**
 * Maximum number of listeners per channel to prevent memory leaks
 */
const MAX_LISTENERS_PER_CHANNEL = 10;

/**
 * Track registered listeners to prevent duplicates and enforce limits
 */
const listenerRegistry = {
  connected: new Set(),
  disconnected: new Set(),
  enterFullscreen: new Set(),
  leaveFullscreen: new Set(),
  resized: new Set(),
  updateAvailable: new Set(),
  updateNotAvailable: new Set(),
  updateProgress: new Set(),
  updateDownloaded: new Set(),
  updateError: new Set()
};

/**
 * Validate that a callback is a function
 * @param {*} callback - Value to validate
 * @returns {boolean} True if valid function
 */
function isValidCallback(callback) {
  return typeof callback === 'function';
}

/**
 * Validate URL for external opening
 * @param {*} url - URL to validate
 * @returns {boolean} True if valid URL with allowed protocol
 */
function isValidExternalUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidUpdateInfo(info) {
  if (!info || typeof info !== 'object') return false;
  if (info.version !== undefined && typeof info.version !== 'string') return false;
  return true;
}

function isValidProgress(progress) {
  if (!progress || typeof progress !== 'object') return false;
  if (progress.percent !== undefined && typeof progress.percent !== 'number') return false;
  return true;
}

function isValidError(error) {
  if (!error || typeof error !== 'object') return false;
  return true;
}

/**
 * Device API
 * Handles communication with connected device
 */
const deviceAPI = {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE.GET_STATUS),

  onConnected: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('deviceAPI.onConnected: Invalid callback provided');
      return () => {};
    }

    // Enforce listener limit
    if (listenerRegistry.connected.size >= MAX_LISTENERS_PER_CHANNEL) {
      console.warn('deviceAPI.onConnected: Maximum listener limit reached');
      return () => {};
    }

    const listener = (event, device) => callback(device);
    listenerRegistry.connected.add(listener);
    ipcRenderer.on(IPC_CHANNELS.DEVICE.CONNECTED, listener);

    // Return unsubscribe function for proper cleanup
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DEVICE.CONNECTED, listener);
      listenerRegistry.connected.delete(listener);
    };
  },

  onDisconnected: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('deviceAPI.onDisconnected: Invalid callback provided');
      return () => {};
    }

    // Enforce listener limit
    if (listenerRegistry.disconnected.size >= MAX_LISTENERS_PER_CHANNEL) {
      console.warn('deviceAPI.onDisconnected: Maximum listener limit reached');
      return () => {};
    }

    const listener = (event, device) => callback(device);
    listenerRegistry.disconnected.add(listener);
    ipcRenderer.on(IPC_CHANNELS.DEVICE.DISCONNECTED, listener);

    // Return unsubscribe function for proper cleanup
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DEVICE.DISCONNECTED, listener);
      listenerRegistry.disconnected.delete(listener);
    };
  },

  removeListeners: () => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.DEVICE.CONNECTED);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.DEVICE.DISCONNECTED);
    listenerRegistry.connected.clear();
    listenerRegistry.disconnected.clear();
  }
};

/**
 * Shell API
 * Handles shell operations like opening external URLs
 */
const shellAPI = {
  openExternal: (url) => {
    if (!isValidExternalUrl(url)) {
      console.warn('shellAPI.openExternal: Invalid URL provided');
      return Promise.resolve({ success: false, error: 'Invalid URL' });
    }
    return ipcRenderer.invoke(IPC_CHANNELS.SHELL.OPEN_EXTERNAL, url);
  }
};

/**
 * Window API
 * Handles native window events like fullscreen
 */
const windowAPI = {
  onEnterFullscreen: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('windowAPI.onEnterFullscreen: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.enterFullscreen.size >= MAX_LISTENERS_PER_CHANNEL) {
      console.warn('windowAPI.onEnterFullscreen: Maximum listener limit reached');
      return () => {};
    }

    const listener = () => callback();
    listenerRegistry.enterFullscreen.add(listener);
    ipcRenderer.on(IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN, listener);
      listenerRegistry.enterFullscreen.delete(listener);
    };
  },

  onLeaveFullscreen: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('windowAPI.onLeaveFullscreen: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.leaveFullscreen.size >= MAX_LISTENERS_PER_CHANNEL) {
      console.warn('windowAPI.onLeaveFullscreen: Maximum listener limit reached');
      return () => {};
    }

    const listener = () => callback();
    listenerRegistry.leaveFullscreen.add(listener);
    ipcRenderer.on(IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN, listener);
      listenerRegistry.leaveFullscreen.delete(listener);
    };
  },

  onResized: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('windowAPI.onResized: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.resized.size >= MAX_LISTENERS_PER_CHANNEL) {
      console.warn('windowAPI.onResized: Maximum listener limit reached');
      return () => {};
    }

    const listener = () => callback();
    listenerRegistry.resized.add(listener);
    ipcRenderer.on(IPC_CHANNELS.WINDOW.RESIZED, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW.RESIZED, listener);
      listenerRegistry.resized.delete(listener);
    };
  },

  setFullScreen: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.SET_FULLSCREEN, enabled),

  isFullScreen: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_FULLSCREEN),

  removeListeners: () => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.WINDOW.RESIZED);
    listenerRegistry.enterFullscreen.clear();
    listenerRegistry.leaveFullscreen.clear();
    listenerRegistry.resized.clear();
  }
};

/**
 * Update API
 * Handles auto-update functionality
 */
const updateAPI = {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE.GET_STATUS),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE.CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE.DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE.INSTALL),

  onAvailable: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('updateAPI.onAvailable: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.updateAvailable.size >= MAX_LISTENERS_PER_CHANNEL) {
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
    ipcRenderer.on(IPC_CHANNELS.UPDATE.AVAILABLE, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.UPDATE.AVAILABLE, listener);
      listenerRegistry.updateAvailable.delete(listener);
    };
  },

  onNotAvailable: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('updateAPI.onNotAvailable: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.updateNotAvailable.size >= MAX_LISTENERS_PER_CHANNEL) {
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
    ipcRenderer.on(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, listener);
      listenerRegistry.updateNotAvailable.delete(listener);
    };
  },

  onProgress: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('updateAPI.onProgress: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.updateProgress.size >= MAX_LISTENERS_PER_CHANNEL) {
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
    ipcRenderer.on(IPC_CHANNELS.UPDATE.PROGRESS, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.UPDATE.PROGRESS, listener);
      listenerRegistry.updateProgress.delete(listener);
    };
  },

  onDownloaded: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('updateAPI.onDownloaded: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.updateDownloaded.size >= MAX_LISTENERS_PER_CHANNEL) {
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
    ipcRenderer.on(IPC_CHANNELS.UPDATE.DOWNLOADED, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.UPDATE.DOWNLOADED, listener);
      listenerRegistry.updateDownloaded.delete(listener);
    };
  },

  onError: (callback) => {
    if (!isValidCallback(callback)) {
      console.warn('updateAPI.onError: Invalid callback provided');
      return () => {};
    }

    if (listenerRegistry.updateError.size >= MAX_LISTENERS_PER_CHANNEL) {
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
    ipcRenderer.on(IPC_CHANNELS.UPDATE.ERROR, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.UPDATE.ERROR, listener);
      listenerRegistry.updateError.delete(listener);
    };
  },

  removeListeners: () => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE.AVAILABLE);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE.NOT_AVAILABLE);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE.PROGRESS);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE.DOWNLOADED);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE.ERROR);
    listenerRegistry.updateAvailable.clear();
    listenerRegistry.updateNotAvailable.clear();
    listenerRegistry.updateProgress.clear();
    listenerRegistry.updateDownloaded.clear();
    listenerRegistry.updateError.clear();
  }
};

/**
 * Metrics API
 * Handles process metrics snapshots from main process
 */
const metricsAPI = {
  getProcessMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.PERFORMANCE.GET_METRICS)
};

/**
 * Expose APIs to renderer process
 */
contextBridge.exposeInMainWorld('deviceAPI', {
  getDeviceStatus: deviceAPI.getStatus,
  onDeviceConnected: deviceAPI.onConnected,
  onDeviceDisconnected: deviceAPI.onDisconnected,
  removeDeviceListeners: deviceAPI.removeListeners
});

contextBridge.exposeInMainWorld('shellAPI', {
  openExternal: shellAPI.openExternal
});

contextBridge.exposeInMainWorld('windowAPI', {
  onEnterFullscreen: windowAPI.onEnterFullscreen,
  onLeaveFullscreen: windowAPI.onLeaveFullscreen,
  onResized: windowAPI.onResized,
  setFullScreen: windowAPI.setFullScreen,
  isFullScreen: windowAPI.isFullScreen,
  removeListeners: windowAPI.removeListeners
});

contextBridge.exposeInMainWorld('updateAPI', {
  getStatus: updateAPI.getStatus,
  checkForUpdates: updateAPI.checkForUpdates,
  downloadUpdate: updateAPI.downloadUpdate,
  installUpdate: updateAPI.installUpdate,
  onAvailable: updateAPI.onAvailable,
  onNotAvailable: updateAPI.onNotAvailable,
  onProgress: updateAPI.onProgress,
  onDownloaded: updateAPI.onDownloaded,
  onError: updateAPI.onError,
  removeListeners: updateAPI.removeListeners
});

contextBridge.exposeInMainWorld('metricsAPI', {
  getProcessMetrics: metricsAPI.getProcessMetrics
});
