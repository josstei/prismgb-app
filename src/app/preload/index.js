const { contextBridge, ipcRenderer } = require('electron');

/**
 * IPC Channel names - imported from single source of truth
 */
import IPC_CHANNELS from '@infrastructure/ipc/channels.json';

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
  disconnected: new Set()
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
 * Expose APIs to renderer process
 * All APIs are grouped under window.deviceAPI
 */
contextBridge.exposeInMainWorld('deviceAPI', {
  // Device APIs
  getDeviceStatus: deviceAPI.getStatus,
  onDeviceConnected: deviceAPI.onConnected,
  onDeviceDisconnected: deviceAPI.onDisconnected,
  removeDeviceListeners: deviceAPI.removeListeners,
  // Shell APIs
  openExternal: shellAPI.openExternal
});

