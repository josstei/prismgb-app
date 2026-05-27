import { afterEach, describe, it, expect, vi } from 'vitest';
import { IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
import { createPreloadExposureMap, exposePreloadApis } from '@preload/exposure.factory.js';
import { clearPreloadApi, createMockIpcRenderer, createPreloadApiMock, createPreloadApiMocks, resetPreloadApis, setPreloadApi } from '../../support/mocks/preload-api-globals.js';
import { installMissingWindowMock, installWindowPropertyMock } from '../../support/mocks/browser-api.installers.js';
import { installTargetProperty } from '../../support/mocks/runtime-property.installers.js';
import { createContextBridgeMock, createProcessMetricsApiMock } from '../../factories/index.js';

function createApiImplementations(overrides = {}) {
  return Object.fromEntries(
    IpcContractManifest.namespaces.map((namespace) => [
      namespace.apiName,
      {
        ...Object.fromEntries(
          namespace.exposedMethods.map((methodName) => [methodName, vi.fn()])
        ),
        ...(overrides[namespace.apiName] || {})
      }
    ])
  );
}

function getManifestExposureShape() {
  return Object.fromEntries(
    IpcContractManifest.namespaces.map((namespace) => [
      namespace.apiName,
      namespace.exposedMethods
    ])
  );
}

describe('Preload API contract', () => {
  it('derives the preload exposure shape from the IPC manifest', () => {
    const apiImplementations = createApiImplementations();
    const exposureMap = createPreloadExposureMap(apiImplementations);

    expect(Object.keys(exposureMap)).toEqual(
      IpcContractManifest.namespaces.map((namespace) => namespace.apiName)
    );
    expect(Object.fromEntries(
      Object.entries(exposureMap).map(([apiName, exposedApi]) => [
        apiName,
        Object.keys(exposedApi)
      ])
    )).toEqual(getManifestExposureShape());

    for (const namespace of IpcContractManifest.namespaces) {
      for (const methodName of namespace.exposedMethods) {
        expect(exposureMap[namespace.apiName][methodName]).toBe(
          apiImplementations[namespace.apiName][methodName]
        );
      }
    }
  });

  it('fails fast when the manifest references an unimplemented preload method', () => {
    const apiImplementations = createApiImplementations({
      deviceAPI: { onDeviceDisconnected: undefined }
    });

    expect(() => createPreloadExposureMap(apiImplementations)).toThrow(
      'Preload API deviceAPI.onDeviceDisconnected is not implemented'
    );
  });

  it('exposes every manifest-owned preload API through contextBridge', () => {
    const contextBridge = createContextBridgeMock();
    const apiImplementations = createApiImplementations();

    exposePreloadApis(contextBridge, apiImplementations);

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(
      IpcContractManifest.namespaces.length
    );
    expect(contextBridge.exposeInMainWorld.mock.calls.map(([apiName]) => apiName)).toEqual(
      IpcContractManifest.namespaces.map((namespace) => namespace.apiName)
    );

    for (const [apiName, exposedApi] of contextBridge.exposeInMainWorld.mock.calls) {
      expect(Object.keys(exposedApi)).toEqual(getManifestExposureShape()[apiName]);
    }
  });

});

describe('preload-api-globals test helper', () => {
  afterEach(() => resetPreloadApis());

  it('rejects APIs and methods outside the IPC manifest', () => {
    expect(() => createPreloadApiMock('missingAPI')).toThrow(/missingAPI/);
    expect(() => createPreloadApiMock('updateAPI', { typo: vi.fn() })).toThrow(/updateAPI\.typo/);
    expect(() => createPreloadApiMocks({ missingAPI: {} })).toThrow(/missingAPI/);
    expect(() => setPreloadApi('missingAPI', {})).toThrow(/missingAPI/);
    expect(() => clearPreloadApi('missingAPI')).toThrow(/missingAPI/);
  });

  it('derives helper method keys from IPC manifest exposed methods', () => {
    for (const namespace of IpcContractManifest.namespaces) expect(Object.keys(createPreloadApiMock(namespace.apiName)).sort()).toEqual([...namespace.exposedMethods].sort());
  });

  it('uses factoryMethod as the public key when synthetic manifest entries diverge from internal methods', () => {
    const syntheticManifest = {
      namespaces: [
        {
          apiName: 'deviceAPI',
          namespace: 'DEVICE',
          registryNamespace: 'device',
          exposedMethods: ['getDeviceStatus', 'onDeviceConnected'],
          invoke: [{ method: 'getDeviceStatusInternal', factoryMethod: 'getDeviceStatus', channel: 'device:get-status', channelKey: 'GET_STATUS' }],
          subscriptions: [{ method: 'onDeviceConnectedInternal', factoryMethod: 'onDeviceConnected', channel: 'device:connected', payload: 'DeviceInfoPayload' }]
        }
      ]
    };
    const mock = createPreloadApiMock('deviceAPI', {}, syntheticManifest);

    expect(Object.keys(mock).sort()).toEqual(['getDeviceStatus', 'onDeviceConnected']);
    expect(typeof mock.getDeviceStatus).toBe('function');
    expect(typeof mock.onDeviceConnected).toBe('function');
  });

  it('generates subscription mock bodies with isolated listeners and unsubscribe closures', () => {
    const mock = createPreloadApiMock('deviceAPI');
    const callback = vi.fn();

    const unsubscribeFirst = mock.onDeviceConnected(callback);
    mock.onDeviceConnected(callback);
    mock.onDeviceConnected.emit({ id: 'chromatic' });
    unsubscribeFirst();
    mock.onDeviceConnected.emit({ id: 'remaining' });

    expect(Object.keys(mock).sort()).toEqual(getManifestExposureShape().deviceAPI.slice().sort());
    expect(mock.onDeviceConnected.listenerCount()).toBe(1);
    expect(mock.onDeviceConnected.getUnsubscribers()).toContain(unsubscribeFirst);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('honors void-payload subscriptions when emitting generated preload mocks', () => {
    const mock = createPreloadApiMock('windowAPI');
    const callback = vi.fn();

    mock.onResized(callback);
    mock.onResized.emit({ impossible: true });

    expect(callback).toHaveBeenCalledWith();
  });

  it('keeps canonical ipcRenderer mock override and listener behavior stable', async () => {
    const zeroArgOverride = vi.fn(() => ({ success: false }));
    const ipcRenderer = createMockIpcRenderer({ 'zero:arg': zeroArgOverride, 'object:arg': { ok: true } });
    const callback = vi.fn(), removedCallback = vi.fn();

    ipcRenderer.on('event:ready', callback);
    ipcRenderer.on('event:ready', removedCallback);
    ipcRenderer.removeListener('event:ready', removedCallback);
    ipcRenderer.emit('event:ready', 'payload');

    expect(await ipcRenderer.invoke('zero:arg')).toEqual({ success: false });
    expect(await ipcRenderer.invoke('object:arg')).toEqual({ ok: true });
    expect(zeroArgOverride).toHaveBeenCalledWith('zero:arg', undefined);
    expect(callback).toHaveBeenCalledWith({}, 'payload');
    expect(removedCallback).not.toHaveBeenCalled();
  });

  it('restores descriptor-backed preload globals on clear', () => {
    const existingMetricsAPI = createProcessMetricsApiMock();
    const existingGlobalAPI = createProcessMetricsApiMock();
    const windowHandle = installTargetProperty(globalThis, 'window', {});
    const globalAPIHandle = installTargetProperty(globalThis, 'metricsAPI', existingGlobalAPI);
    const existingWindowAPI = installWindowPropertyMock('metricsAPI', existingMetricsAPI);
    const mockMetricsAPI = createPreloadApiMock('metricsAPI');

    try {
      setPreloadApi('metricsAPI', mockMetricsAPI);
      expect(window.metricsAPI).toBe(mockMetricsAPI);
      expect(globalThis.metricsAPI).toBe(mockMetricsAPI);

      clearPreloadApi('metricsAPI');
      expect(window.metricsAPI).toBe(existingMetricsAPI);
      expect(globalThis.metricsAPI).toBe(existingGlobalAPI);
    } finally {
      clearPreloadApi('metricsAPI');
      existingWindowAPI.cleanup();
      globalAPIHandle.cleanup();
      windowHandle.cleanup();
    }
  });

  it('cleans up synthetic window globals and rolls back partial installs', () => {
    const missingWindow = installMissingWindowMock();
    const defineProperty = Object.defineProperty.bind(Object);

    try {
      const mockMetricsAPI = createPreloadApiMock('metricsAPI');
      setPreloadApi('metricsAPI', mockMetricsAPI);
      expect(globalThis.window.metricsAPI).toBe(mockMetricsAPI);

      resetPreloadApis();
      expect(globalThis.window).toBeUndefined();

      const definePropertySpy = vi.spyOn(Object, 'defineProperty')
        .mockImplementation((target, key, descriptor) => {
          if (target === globalThis && key === 'metricsAPI') throw new TypeError('blocked global metricsAPI install');
          return defineProperty(target, key, descriptor);
        });
      try {
        expect(() => setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI'))).toThrow('blocked global metricsAPI install');
        expect(globalThis.window).toBeUndefined();
        expect(globalThis.metricsAPI).toBeUndefined();
        expect(() => clearPreloadApi('metricsAPI')).not.toThrow();
      } finally {
        definePropertySpy.mockRestore();
      }
    } finally {
      resetPreloadApis();
      missingWindow.cleanup();
    }
  });
});
