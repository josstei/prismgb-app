import type { IpcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcChannels } from '@shared/ipc/ipc.manifest.js';
import IpcManifest from '@shared/ipc/ipc.manifest.json';
import type { PreloadApiName } from '@preload/subscription.factory.js';
import { MAX_LISTENERS_PER_CHANNEL, createListenerRegistry } from '@preload/listener-registry.js';
import { isValidCallback } from '@preload/validators.js';
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
};
type DisposablePreloadAPI = object & { dispose?: () => void };
type PreloadApiFactory = (context: PreloadApiFactoryContext) => DisposablePreloadAPI;
type PreloadApiImplementations = Record<PreloadApiName, DisposablePreloadAPI>;

const { contextBridge, ipcRenderer } = require('electron') as ElectronPreloadRuntime;
const listenerRegistry = createListenerRegistry();

const apiFactoryContext: PreloadApiFactoryContext = {
  ipcRenderer,
  channels: IPC_CHANNELS,
  listenerRegistry,
  maxListeners: MAX_LISTENERS_PER_CHANNEL,
  isValidCallback
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
} satisfies { readonly [TApiName in PreloadApiName]: PreloadApiFactory };
type PreloadApiFactoryName = keyof typeof preloadApiFactories;

function isPreloadApiFactoryName(apiName: string): apiName is PreloadApiFactoryName {
  return Object.prototype.hasOwnProperty.call(preloadApiFactories, apiName);
}

function getPreloadApiFactory(apiName: string): PreloadApiFactory {
  if (!isPreloadApiFactoryName(apiName)) {
    throw new Error(`Preload API factory not found for ${apiName}`);
  }
  return preloadApiFactories[apiName];
}

function createApiImplementationEntry({ apiName }: { apiName: string }): [string, DisposablePreloadAPI] {
  return [apiName, getPreloadApiFactory(apiName)(apiFactoryContext)];
}

const apiImplementations = Object.fromEntries(
  IpcManifest.namespaces.map(createApiImplementationEntry)
) as PreloadApiImplementations;

window.addEventListener('beforeunload', () => {
  for (const api of Object.values(apiImplementations)) api.dispose?.();
});

exposePreloadApis(contextBridge, apiImplementations);
