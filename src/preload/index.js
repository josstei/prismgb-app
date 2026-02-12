const { contextBridge, ipcRenderer } = require('electron');

import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import { MAX_LISTENERS_PER_CHANNEL, createListenerRegistry } from '@preload/listener-registry.js';
import {
  isValidCallback,
  isValidExternalUrl,
  isValidUpdateInfo,
  isValidProgress,
  isValidError,
  isValidTranscodeProgress,
  isValidTranscodeResult,
  isValidTranscodeParams,
  isValidFfmpegArgs,
  isValidGpuPolicy
} from '@preload/validators.js';
import { createDevicePreloadAPI } from '@preload/apis/device.preload-api.js';
import { createWindowPreloadAPI } from '@preload/apis/window.preload-api.js';
import { createUpdatePreloadAPI } from '@preload/apis/update.preload-api.js';
import { createTranscodePreloadAPI } from '@preload/apis/transcode.preload-api.js';

const listenerRegistry = createListenerRegistry();

const deviceAPI = createDevicePreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS,
  listenerRegistry,
  maxListeners: MAX_LISTENERS_PER_CHANNEL,
  isValidCallback
});

const shellAPI = {
  openExternal: (url) => {
    if (!isValidExternalUrl(url)) {
      console.warn('shellAPI.openExternal: Invalid URL provided');
      return Promise.resolve({ success: false, error: 'Invalid URL' });
    }
    return ipcRenderer.invoke(IPC_CHANNELS.SHELL.OPEN_EXTERNAL, url);
  }
};

const windowAPI = createWindowPreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS,
  listenerRegistry,
  maxListeners: MAX_LISTENERS_PER_CHANNEL,
  isValidCallback
});

const updateAPI = createUpdatePreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS,
  listenerRegistry,
  maxListeners: MAX_LISTENERS_PER_CHANNEL,
  isValidCallback,
  isValidUpdateInfo,
  isValidProgress,
  isValidError
});

const metricsAPI = {
  getProcessMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.PERFORMANCE.GET_METRICS)
};

const gpuAPI = {
  getPolicy: async () => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.GPU.GET_POLICY);
      if (!result.success) {
        console.warn('gpuAPI.getPolicy: Failed to get policy:', result.error);
        return { skipWebGPU: false, reason: null };
      }
      if (!isValidGpuPolicy(result)) {
        console.warn('gpuAPI.getPolicy: Invalid policy received');
        return { skipWebGPU: false, reason: null };
      }
      return { skipWebGPU: result.skipWebGPU, reason: result.reason };
    } catch (error) {
      console.warn('gpuAPI.getPolicy: IPC error:', error);
      return { skipWebGPU: false, reason: null };
    }
  }
};

const transcodeAPI = createTranscodePreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS,
  listenerRegistry,
  maxListeners: MAX_LISTENERS_PER_CHANNEL,
  isValidCallback,
  isValidError,
  isValidTranscodeProgress,
  isValidTranscodeResult,
  isValidTranscodeParams,
  isValidFfmpegArgs
});

window.addEventListener('beforeunload', () => {
  deviceAPI.removeListeners();
  windowAPI.removeListeners();
  updateAPI.removeListeners();
  transcodeAPI.removeListeners();
});

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

contextBridge.exposeInMainWorld('gpuAPI', {
  getPolicy: gpuAPI.getPolicy
});

contextBridge.exposeInMainWorld('transcodeAPI', {
  start: transcodeAPI.start,
  cancel: transcodeAPI.cancel,
  getStatus: transcodeAPI.getStatus,
  onProgress: transcodeAPI.onProgress,
  onCompleted: transcodeAPI.onCompleted,
  onError: transcodeAPI.onError,
  onCancelled: transcodeAPI.onCancelled,
  removeListeners: transcodeAPI.removeListeners
});
