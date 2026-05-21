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
import { exposePreloadApis } from '@preload/exposure.factory.js';

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
  deviceAPI.dispose();
  windowAPI.dispose();
  updateAPI.dispose();
  transcodeAPI.dispose();
});

exposePreloadApis(contextBridge, {
  deviceAPI,
  shellAPI,
  windowAPI,
  updateAPI,
  metricsAPI,
  gpuAPI,
  loginItemAPI,
  transcodeAPI
});
