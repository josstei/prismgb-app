import { describe, it, expect, vi } from 'vitest';
import { IPC_CHANNELS as channels, IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';
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
import { createListenerRegistry, MAX_LISTENERS_PER_CHANNEL } from '@preload/listener-registry.js';
import {
  applyRequiredSubscriptionMetadata,
  createManifestInvokeMethods,
  createManifestInvokeSet,
  createManifestSubscriptionSet
} from '@preload/subscription.factory.js';
import {
  isValidCallback,
  isValidError,
  isValidProgress,
  isValidTranscodeParams,
  isValidTranscodeProgress,
  isValidTranscodeResult,
  isValidFfmpegArgs,
  isValidUpdateInfo
} from '@preload/validators.generated.js';
import { createMockIpcRenderer } from '../../support/mocks/preload-api-globals.js';
function createAPIWithRegistry(factory, ipcRenderer, options = {}) {
  return factory({
    ipcRenderer,
    channels,
    listenerRegistry: createListenerRegistry(),
    maxListeners: MAX_LISTENERS_PER_CHANNEL,
    ...options
  });
}
const cloneManifest = () => JSON.parse(JSON.stringify(IpcContractManifest));
describe('Preload API invoke contract baselines', () => {
  it('forwards device status invoke call to device:get-status with no args', async () => {
    const expectedResponse = { success: true, connected: true, device: { deviceName: 'Chromatic USB' } };
    const ipcRenderer = createMockIpcRenderer({
      [channels.DEVICE.GET_STATUS]: expectedResponse
    });
    const deviceAPI = createAPIWithRegistry(createDevicePreloadAPI, ipcRenderer, { isValidCallback });
    const status = await deviceAPI.getDeviceStatus();
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.DEVICE.GET_STATUS);
    expect(status).toEqual(expectedResponse);
    expect(status).toEqual(expect.objectContaining({ connected: expect.any(Boolean) }));
  });
  it('fails fast when required invoke metadata is missing from the IPC manifest', () => {
    const invalidManifest = JSON.parse(JSON.stringify(IpcContractManifest));
    const deviceNamespace = invalidManifest.namespaces.find((entry) => entry.apiName === 'deviceAPI');
    deviceNamespace.invoke = [];
    expect(() => createManifestInvokeSet('deviceAPI', channels, invalidManifest).requireMethod('getDeviceStatus')).toThrow(/deviceAPI\.getDeviceStatus/);
  });
  it('forwards window invoke calls to the expected channels', async () => {
    const expectedPolicyResponse = { success: true };
    const expectedFullscreenResponse = { success: true };
    const expectedFullscreenState = { success: true, isFullscreen: true };
    const ipcRenderer = createMockIpcRenderer({
      [channels.WINDOW.SET_FULLSCREEN]: expectedPolicyResponse,
      [channels.WINDOW.IS_FULLSCREEN]: expectedFullscreenState
    });
    const windowAPI = createAPIWithRegistry(createWindowPreloadAPI, ipcRenderer, { isValidCallback });
    const setFullscreenResult = await windowAPI.setFullScreen(true);
    const isFullScreenResult = await windowAPI.isFullScreen();
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, channels.WINDOW.SET_FULLSCREEN, true);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, channels.WINDOW.IS_FULLSCREEN);
    expect(setFullscreenResult).toEqual(expectedPolicyResponse);
    expect(setFullscreenResult.success).toBe(true);
    expect(isFullScreenResult).toEqual(expectedFullscreenState);
  });
  it('forwards update invoke calls and preserves update contract-shaped responses', async () => {
    const expectedGetStatus = {
      success: true,
      state: 'idle',
      updateInfo: null,
      downloadProgress: null
    };
    const expectedCheck = { success: true, updateAvailable: false, skipped: false };
    const expectedDownload = { success: true };
    const expectedInstall = { success: true };
    const ipcRenderer = createMockIpcRenderer({
      [channels.UPDATE.GET_STATUS]: expectedGetStatus,
      [channels.UPDATE.CHECK]: expectedCheck,
      [channels.UPDATE.DOWNLOAD]: expectedDownload,
      [channels.UPDATE.INSTALL]: expectedInstall
    });
    const updateAPI = createAPIWithRegistry(
      createUpdatePreloadAPI,
      ipcRenderer,
      { isValidCallback, isValidUpdateInfo, isValidProgress, isValidError }
    );
    const getStatusResult = await updateAPI.getStatus();
    const checkResult = await updateAPI.checkForUpdates();
    const downloadResult = await updateAPI.downloadUpdate();
    const installResult = await updateAPI.installUpdate();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.GET_STATUS);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.CHECK);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.DOWNLOAD);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.INSTALL);
    expect(getStatusResult).toEqual(expectedGetStatus);
    expect(checkResult).toEqual(expectedCheck);
    expect(downloadResult).toEqual(expectedDownload);
    expect(installResult).toEqual(expectedInstall);
  });
  it('forwards transcode start payloads and forwards status responses', async () => {
    const inputBuffer = new ArrayBuffer(4);
    const startResponse = {
      success: true,
      jobId: 'job-1',
      filePath: '/tmp/job-1.mp4'
    };
    const statusResponse = {
      success: true,
      jobs: [
        {
          id: 'job-1',
          state: 'running',
          progress: 0,
          outputPath: '/tmp/job-1.mp4',
          error: null,
          startTime: 1712345678000
        }
      ]
    };
    const ipcRenderer = createMockIpcRenderer({
      [channels.TRANSCODE.START]: startResponse,
      [channels.TRANSCODE.CANCEL]: { success: true },
      [channels.TRANSCODE.GET_STATUS]: statusResponse
    });
    const transcodeAPI = createAPIWithRegistry(
      createTranscodePreloadAPI,
      ipcRenderer,
      {
        isValidCallback,
        isValidError,
        isValidTranscodeProgress,
        isValidTranscodeResult,
        isValidTranscodeParams,
        isValidFfmpegArgs
      }
    );
    const startResult = await transcodeAPI.start(
      inputBuffer,
      'mp4',
      'job-1.mp4',
      {
        inputArgs: ['-hide_banner'],
        interrupted: true
      }
    );
    const cancelResult = await transcodeAPI.cancel('job-1');
    const statusResult = await transcodeAPI.getStatus();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      channels.TRANSCODE.START,
      {
        inputBuffer,
        format: 'mp4',
        outputFilename: 'job-1.mp4',
        inputArgs: ['-hide_banner'],
        interrupted: true
      }
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.TRANSCODE.CANCEL, { jobId: 'job-1' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.TRANSCODE.GET_STATUS);
    expect(startResult).toEqual(startResponse);
    expect(cancelResult).toEqual({ success: true });
    expect(statusResult).toEqual(statusResponse);
    expect(Array.isArray(statusResult.jobs)).toBe(true);
  });
  it('forwards transcode.getStatus without an obsolete jobId argument', async () => {
    const ipcRenderer = createMockIpcRenderer({
      [channels.TRANSCODE.GET_STATUS]: { success: true }
    });
    const transcodeAPI = createAPIWithRegistry(
      createTranscodePreloadAPI,
      ipcRenderer,
      {
        isValidCallback,
        isValidError,
        isValidTranscodeProgress,
        isValidTranscodeResult,
        isValidTranscodeParams,
        isValidFfmpegArgs
      }
    );
    await transcodeAPI.getStatus();
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.TRANSCODE.GET_STATUS);
    expect(ipcRenderer.invoke.mock.calls[0]).toHaveLength(1);
  });
  it('validates transcode formats from shared transcode config', () => {
    for (const format of Object.keys(TRANSCODE_CONFIG.formats)) {
      expect(isValidTranscodeParams(new ArrayBuffer(1), format)).toBe(true);
      expect(isValidTranscodeParams(new ArrayBuffer(1), format.toUpperCase())).toBe(true);
    }
    expect(isValidTranscodeParams(new ArrayBuffer(1), 'avi')).toBe(false);
  });
});
describe('Preload inline API contract baselines', () => {
  it('forwards shell, metrics, GPU, and login item invokes', async () => {
    const metricsResponse = { success: true, timestamp: 1712345678000, processCount: 1, processes: [] };
    const manifest = cloneManifest();
    [
      ['shellAPI', 'openExternal'],
      ['metricsAPI', 'getProcessMetrics'],
      ['gpuAPI', 'getPolicy'],
      ['loginItemAPI', 'get'],
      ['loginItemAPI', 'set']
    ].forEach(([apiName, publicMethodName]) => {
      const entry = manifest.namespaces.find((namespace) => namespace.apiName === apiName).invoke.find((invoke) => (invoke.factoryMethod || invoke.method) === publicMethodName);
      entry.method = `${publicMethodName}Internal`;
      entry.factoryMethod = publicMethodName;
    });
    const ipcRenderer = createMockIpcRenderer({
      [channels.SHELL.OPEN_EXTERNAL]: { success: true },
      [channels.PERFORMANCE.GET_METRICS]: metricsResponse,
      [channels.GPU.GET_POLICY]: { success: true, skipWebGPU: true, reason: 'compat-test' },
      [channels.LOGIN_ITEM.GET]: { success: true, enabled: true },
      [channels.LOGIN_ITEM.SET]: { success: true }
    });
    const shellAPI = createShellPreloadAPI({
      ipcRenderer,
      channels,
      manifest,
      isValidExternalUrl: (url) => /^https?:\/\//.test(url)
    });
    const metricsAPI = createMetricsPreloadAPI({ ipcRenderer, channels, manifest });
    const gpuAPI = createGpuPreloadAPI({ ipcRenderer, channels, manifest, isValidGpuPolicy: () => true });
    const loginItemAPI = createLoginItemPreloadAPI({ ipcRenderer, channels, manifest });
    await expect(shellAPI.openExternal('https://example.com', 'ignored-extra')).resolves.toEqual({ success: true });
    await expect(metricsAPI.getProcessMetrics()).resolves.toEqual(metricsResponse);
    await expect(gpuAPI.getPolicy()).resolves.toEqual({
      skipWebGPU: true,
      reason: 'compat-test'
    });
    await expect(loginItemAPI.get()).resolves.toEqual({ success: true, enabled: true });
    await expect(loginItemAPI.set(true, 'ignored-extra')).resolves.toEqual({ success: true });
    expect(ipcRenderer.invoke.mock.calls).toEqual([[channels.SHELL.OPEN_EXTERNAL, 'https://example.com'], [channels.PERFORMANCE.GET_METRICS], [channels.GPU.GET_POLICY], [channels.LOGIN_ITEM.GET], [channels.LOGIN_ITEM.SET, true]]);
  });
  it('captures inline API validation and fallback responses', async () => {
    const ipcRenderer = createMockIpcRenderer({
      [channels.GPU.GET_POLICY]: { success: false, error: 'not available' }
    });
    const shellAPI = createShellPreloadAPI({
      ipcRenderer,
      channels,
      isValidExternalUrl: () => false
    });
    const gpuAPI = createGpuPreloadAPI({ ipcRenderer, channels, isValidGpuPolicy: () => false });
    const loginItemAPI = createLoginItemPreloadAPI({ ipcRenderer, channels });
    await expect(shellAPI.openExternal('file:///tmp/test')).resolves.toEqual({
      success: false,
      error: 'Invalid URL'
    });
    await expect(gpuAPI.getPolicy()).resolves.toEqual({
      skipWebGPU: false,
      reason: null
    });
    await expect(loginItemAPI.set('yes')).resolves.toEqual({
      success: false,
      error: 'Invalid parameter'
    });
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith(channels.SHELL.OPEN_EXTERNAL, expect.anything());
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.GPU.GET_POLICY);
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith(channels.LOGIN_ITEM.SET, expect.anything());
  });
});
describe('Preload subscription API parity', () => {
  const registryKeyFor = (apiName, methodName) => createManifestSubscriptionSet(apiName).byMethod[methodName].registryKey;
  function createAPIAndRegistry(factory, ipcRenderer, options = {}) {
    const listenerRegistry = createListenerRegistry();
    return {
      listenerRegistry,
      api: factory({
        ipcRenderer,
        channels,
        listenerRegistry,
        maxListeners: MAX_LISTENERS_PER_CHANNEL,
        ...options
      })
    };
  }
  it('derives migrated subscription descriptors from IPC manifest metadata', () => {
    for (const apiName of ['deviceAPI', 'windowAPI', 'updateAPI', 'transcodeAPI']) {
      const manifestNamespace = IpcContractManifest.namespaces.find((entry) => entry.apiName === apiName);
      const manifestSubscriptions = manifestNamespace?.subscriptions || [];
      expect(createManifestSubscriptionSet(apiName).subscriptions.map(({ methodName, channel, registryKey }) => [methodName, channel, registryKey])).toEqual(manifestSubscriptions.map((entry) => { const methodName = entry.factoryMethod || entry.method; return [methodName, entry.channel, `${manifestNamespace.registryNamespace}.${methodName}`]; }));
    }
    [
      [(manifest) => { delete manifest.namespaces.find((entry) => entry.apiName === 'deviceAPI').registryNamespace; }, /registry namespace/],
      [(manifest) => { manifest.namespaces.find((entry) => entry.apiName === 'deviceAPI').registryNamespace = ' '; }, /non-empty string/],
      [(manifest) => { const subscription = manifest.namespaces.find((entry) => entry.apiName === 'deviceAPI').subscriptions[0]; subscription.method = ' '; subscription.factoryMethod = ' '; }, /method name/]
    ].forEach(([mutateManifest, expectedError]) => {
      const invalidManifest = cloneManifest();
      mutateManifest(invalidManifest);
      expect(() => createManifestSubscriptionSet('deviceAPI', invalidManifest)).toThrow(expectedError);
    });
    const duplicateRegistryKeyManifest = cloneManifest(), windowNamespace = duplicateRegistryKeyManifest.namespaces.find((entry) => entry.apiName === 'windowAPI');
    windowNamespace.registryNamespace = 'device'; windowNamespace.subscriptions[0].factoryMethod = 'onDeviceConnected';
    expect(() => createManifestSubscriptionSet('deviceAPI', duplicateRegistryKeyManifest)).toThrow(/registry key collision/);
    const missingSubscriptionManifest = cloneManifest(); missingSubscriptionManifest.namespaces.find((entry) => entry.apiName === 'deviceAPI').subscriptions = [];
    expect(() => createManifestSubscriptionSet('deviceAPI', missingSubscriptionManifest).requireMethod('onDeviceConnected')).toThrow(/deviceAPI\.onDeviceConnected/);
    expect(() => applyRequiredSubscriptionMetadata('updateAPI', [{ methodName: 'onFuture' }], {})).toThrow(/updateAPI\.onFuture/);
  });
  it('derives migrated invoke descriptors from IPC manifest metadata', () => {
    for (const apiName of ['deviceAPI', 'windowAPI', 'updateAPI', 'transcodeAPI']) {
      const manifestNamespace = IpcContractManifest.namespaces.find((entry) => entry.apiName === apiName);
      const manifestInvoke = manifestNamespace?.invoke || [];
      expect(createManifestInvokeSet(apiName, channels).byMethod).toEqual(Object.fromEntries(manifestInvoke.map((entry) => [entry.factoryMethod || entry.method, channels[manifestNamespace.namespace][entry.channelKey]])));
    }
  });
  it('generates invoke methods with manifest request arity and checked custom factories', async () => {
    const ipcRenderer = createMockIpcRenderer({ [channels.WINDOW.SET_FULLSCREEN]: { success: true } });
    const methods = createManifestInvokeMethods({ apiName: 'windowAPI', ipcRenderer, channels }); await methods.setFullScreen(true, 'ignored-extra'); await methods.isFullScreen('ignored-extra');
    expect(ipcRenderer.invoke.mock.calls).toEqual([[channels.WINDOW.SET_FULLSCREEN, true], [channels.WINDOW.IS_FULLSCREEN]]);
    expect(() => createManifestInvokeMethods({ apiName: 'windowAPI', ipcRenderer, channels, methodFactories: { setFullscreen: () => vi.fn() } })).toThrow(/windowAPI\.setFullscreen/);
  });
  it('derives invoke descriptors from factoryMethod when public and internal method names diverge', () => {
    const syntheticManifest = cloneManifest();
    const windowNamespace = syntheticManifest.namespaces.find((entry) => entry.apiName === 'windowAPI');
    windowNamespace.invoke[0].method = 'setWindowFullscreenInternal';
    windowNamespace.invoke[0].factoryMethod = 'setFullScreen';
    const invokeSet = createManifestInvokeSet('windowAPI', channels, syntheticManifest);
    expect(invokeSet.requireMethod('setFullScreen')).toBe(channels.WINDOW.SET_FULLSCREEN);
    expect(() => invokeSet.requireMethod('setWindowFullscreenInternal')).toThrow(/windowAPI\.setWindowFullscreenInternal/);
  });
  it('fails fast when derived invoke method keys collide', () => {
    const duplicateInvokeKeyManifest = cloneManifest();
    const deviceNamespace = duplicateInvokeKeyManifest.namespaces.find((entry) => entry.apiName === 'deviceAPI');
    deviceNamespace.invoke.push({
      ...deviceNamespace.invoke[0],
      method: 'getDeviceStatusInternalDuplicate',
      factoryMethod: 'getDeviceStatus'
    });
    expect(() => createManifestInvokeSet('deviceAPI', channels, duplicateInvokeKeyManifest)).toThrow(/invoke key collision/);
  });
  it('registers listener registry entries as map-backed sets', () => {
    const ipcRenderer = createMockIpcRenderer();
    const { api, listenerRegistry } = createAPIAndRegistry(createWindowPreloadAPI, ipcRenderer, {
      isValidCallback
    });
    const callback = vi.fn();
    const unsubscribe = api.onResized(callback);
    const resizedRegistryKey = registryKeyFor('windowAPI', 'onResized');
    expect(listenerRegistry).toBeInstanceOf(Map);
    expect(listenerRegistry.has(resizedRegistryKey)).toBe(true);
    expect(listenerRegistry.get(resizedRegistryKey).size).toBe(1);
    unsubscribe();
    expect(listenerRegistry.get(resizedRegistryKey).size).toBe(0);
  });
  it('rejects invalid callbacks for subscription registration', () => {
    const callbackCases = [
      {
        factory: createDevicePreloadAPI,
        method: 'onDeviceConnected',
        options: { isValidCallback },
        message: 'deviceAPI.onDeviceConnected: Invalid callback provided'
      },
      {
        factory: createWindowPreloadAPI,
        method: 'onResized',
        options: { isValidCallback },
        message: 'windowAPI.onResized: Invalid callback provided'
      },
      {
        factory: createUpdatePreloadAPI,
        method: 'onProgress',
        options: {
          isValidCallback,
          isValidUpdateInfo,
          isValidProgress,
          isValidError
        },
        message: 'updateAPI.onProgress: Invalid callback provided'
      },
      {
        factory: createTranscodePreloadAPI,
        method: 'onError',
        options: {
          isValidCallback,
          isValidError,
          isValidTranscodeProgress,
          isValidTranscodeResult,
          isValidTranscodeParams,
          isValidFfmpegArgs
        },
        message: 'transcodeAPI.onError: Invalid callback provided'
      }
    ];
    callbackCases.forEach((entry) => {
      const ipcRenderer = createMockIpcRenderer();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { api } = createAPIAndRegistry(entry.factory, ipcRenderer, entry.options);
      const result = api[entry.method]('not a function');
      expect(typeof result).toBe('function');
      expect(consoleSpy).toHaveBeenCalledWith(entry.message);
      expect(typeof api[entry.method](vi.fn())).toBe('function');
      consoleSpy.mockRestore();
    });
  });
  it('enforces listener limits per registry key', () => {
    const ipcRenderer = createMockIpcRenderer();
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = createAPIAndRegistry(createTranscodePreloadAPI, ipcRenderer, {
      isValidCallback,
      isValidError,
      isValidTranscodeProgress,
      isValidTranscodeResult,
      isValidTranscodeParams,
      isValidFfmpegArgs
    });
    for (let index = 0; index < MAX_LISTENERS_PER_CHANNEL; index += 1) {
      api.onError(vi.fn());
    }
    api.onError(vi.fn());
    expect(consoleSpy).toHaveBeenCalledWith('transcodeAPI.onError: Maximum listener limit reached');
    expect(ipcRenderer.on).toHaveBeenCalledTimes(MAX_LISTENERS_PER_CHANNEL);
    consoleSpy.mockRestore();
  });
  it('validates subscription payloads before callback', () => {
    const ipcRenderer = createMockIpcRenderer();
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = createAPIAndRegistry(createUpdatePreloadAPI, ipcRenderer, {
      isValidCallback,
      isValidUpdateInfo,
      isValidProgress,
      isValidError
    });
    const progressCallback = vi.fn();
    const errorCallback = vi.fn();
    api.onProgress(progressCallback);
    api.onError(errorCallback);
    ipcRenderer.emit(channels.UPDATE.PROGRESS, { percent: 'bad' });
    ipcRenderer.emit(channels.UPDATE.ERROR, null);
    expect(progressCallback).not.toHaveBeenCalled();
    expect(errorCallback).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('updateAPI.onProgress: Invalid progress received');
    expect(consoleSpy).toHaveBeenCalledWith('updateAPI.onError: Invalid error received');
    progressCallback.mockClear();
    errorCallback.mockClear();
    consoleSpy.mockClear();
    ipcRenderer.emit(channels.UPDATE.PROGRESS, { percent: 22 });
    ipcRenderer.emit(channels.UPDATE.ERROR, { code: 'x' });
    expect(progressCallback).toHaveBeenCalledWith({ percent: 22 });
    expect(errorCallback).toHaveBeenCalledWith({ code: 'x' });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
  it('supports unsubscribe and internal disposal by namespace', () => {
    const ipcRenderer = createMockIpcRenderer();
    const { api, listenerRegistry } = createAPIAndRegistry(createDevicePreloadAPI, ipcRenderer, {
      isValidCallback
    });
    const connectedCallback = vi.fn(), disconnectedCallback = vi.fn();
    const connectedRegistryKey = registryKeyFor('deviceAPI', 'onDeviceConnected');
    const disconnectedRegistryKey = registryKeyFor('deviceAPI', 'onDeviceDisconnected');
    const unsubConnected = api.onDeviceConnected(connectedCallback);
    const unsubDisconnected = api.onDeviceDisconnected(disconnectedCallback);
    ipcRenderer.emit(channels.DEVICE.CONNECTED, { deviceName: 'Chromatic USB' });
    ipcRenderer.emit(channels.DEVICE.DISCONNECTED, { deviceName: 'Chromatic USB' });
    expect(connectedCallback).toHaveBeenCalledTimes(1);
    expect(disconnectedCallback).toHaveBeenCalledTimes(1);
    expect(listenerRegistry.get(connectedRegistryKey).size).toBe(1);
    expect(listenerRegistry.get(disconnectedRegistryKey).size).toBe(1);
    unsubConnected();
    ipcRenderer.emit(channels.DEVICE.CONNECTED, { deviceName: 'Chromatic USB' });
    expect(connectedCallback).toHaveBeenCalledTimes(1);
    expect(listenerRegistry.get(connectedRegistryKey).size).toBe(0);
    api.dispose();
    expect(listenerRegistry.get(connectedRegistryKey).size).toBe(0);
    expect(listenerRegistry.get(disconnectedRegistryKey).size).toBe(0);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      channels.DEVICE.DISCONNECTED,
      expect.any(Function)
    );
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      channels.DEVICE.CONNECTED,
      expect.any(Function)
    );
    ipcRenderer.emit(channels.DEVICE.DISCONNECTED, { deviceName: 'Chromatic USB' });
    expect(disconnectedCallback).toHaveBeenCalledTimes(1);
    unsubDisconnected();
    ipcRenderer.emit(channels.DEVICE.DISCONNECTED, { deviceName: 'Chromatic USB' });
    expect(disconnectedCallback).toHaveBeenCalledTimes(1);
  });
  it('keeps window event callbacks payload mapping behavior stable', () => {
    const ipcRenderer = createMockIpcRenderer();
    const { api } = createAPIAndRegistry(createWindowPreloadAPI, ipcRenderer, {
      isValidCallback
    });
    const callback = vi.fn();
    api.onEnterFullscreen(callback);
    ipcRenderer.emit(channels.WINDOW.ENTER_FULLSCREEN, { ignored: true });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]).toHaveLength(0);
  });
});
