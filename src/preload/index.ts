import type { IpcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcChannels } from '@shared/ipc/ipc.manifest.js';
import IpcManifest from '@shared/ipc/ipc.manifest.json';
import { MAX_LISTENERS_PER_CHANNEL, createListenerRegistry } from '@preload/listener-registry.js';
import {
  isValidCallback,
  isValidExternalUrl,
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

type ElectronPreloadRuntime = { contextBridge: typeof import('electron')['contextBridge']; ipcRenderer: IpcRenderer };
type PreloadIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>;
type PreloadApiFactoryContext = {
  ipcRenderer: PreloadIpcRenderer;
  channels: IpcChannels;
  listenerRegistry: ReturnType<typeof createListenerRegistry>;
  maxListeners: number;
  isValidCallback: typeof isValidCallback;
  isValidExternalUrl: typeof isValidExternalUrl;
  isValidTranscodeParams: typeof isValidTranscodeParams;
  isValidFfmpegArgs: typeof isValidFfmpegArgs;
  isValidGpuPolicy: typeof isValidGpuPolicy;
};
type DisposablePreloadAPI = object & { dispose?: () => void };
type PreloadApiFactory = (context: PreloadApiFactoryContext) => DisposablePreloadAPI;
type PreloadApiImplementations = Record<string, DisposablePreloadAPI>;

const { contextBridge, ipcRenderer } = require('electron') as ElectronPreloadRuntime;
const listenerRegistry = createListenerRegistry();

const apiFactoryContext: PreloadApiFactoryContext = {
  ipcRenderer,
  channels: IPC_CHANNELS,
  listenerRegistry,
  maxListeners: MAX_LISTENERS_PER_CHANNEL,
  isValidCallback,
  isValidExternalUrl,
  isValidTranscodeParams,
  isValidFfmpegArgs,
  isValidGpuPolicy
};

const preloadApiFactories = {
  deviceAPI: createDevicePreloadAPI,
  shellAPI: createShellPreloadAPI,
  windowAPI: createWindowPreloadAPI,
  updateAPI: createUpdatePreloadAPI,
  metricsAPI: createMetricsPreloadAPI,
  gpuAPI: createGpuPreloadAPI,
  loginItemAPI: createLoginItemPreloadAPI,
  transcodeAPI: createTranscodePreloadAPI
} satisfies Record<string, PreloadApiFactory>;
type PreloadApiFactoryName = keyof typeof preloadApiFactories;

function getPreloadApiFactory(apiName: string): PreloadApiFactory {
  if (!Object.prototype.hasOwnProperty.call(preloadApiFactories, apiName)) {
    throw new Error(`Preload API factory not found for ${apiName}`);
  }
  return preloadApiFactories[apiName as PreloadApiFactoryName];
}

function createApiImplementationEntry({ apiName }: { apiName: string }): [string, DisposablePreloadAPI] {
  return [apiName, getPreloadApiFactory(apiName)(apiFactoryContext)];
}

const apiImplementations: PreloadApiImplementations = Object.fromEntries(
  IpcManifest.namespaces.map(createApiImplementationEntry)
);

window.addEventListener('beforeunload', () => {
  for (const api of Object.values(apiImplementations)) api.dispose?.();
});

exposePreloadApis(contextBridge, apiImplementations);
