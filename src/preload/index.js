const { contextBridge, ipcRenderer } = require('electron');

import IPC_CHANNELS from '@shared/ipc/channels.json';
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
import {
  createShellPreloadAPI,
  createMetricsPreloadAPI,
  createGpuPreloadAPI,
  createLoginItemPreloadAPI
} from '@preload/apis/inline.preload-api.js';

const listenerRegistry = createListenerRegistry();

const deviceAPI = createDevicePreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS,
  listenerRegistry,
  maxListeners: MAX_LISTENERS_PER_CHANNEL,
  isValidCallback
});

const shellAPI = createShellPreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS,
  isValidExternalUrl
});

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

const metricsAPI = createMetricsPreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS
});

const gpuAPI = createGpuPreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS,
  isValidGpuPolicy
});

const loginItemAPI = createLoginItemPreloadAPI({
  ipcRenderer,
  channels: IPC_CHANNELS
});

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

contextBridge.exposeInMainWorld('loginItemAPI', {
  get: loginItemAPI.get,
  set: loginItemAPI.set
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
