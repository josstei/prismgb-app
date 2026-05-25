import { afterEach, describe, it, expect, vi } from 'vitest';
import { IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
import { createPreloadExposureMap, exposePreloadApis } from '@preload/exposure.factory.js';
import { clearPreloadApi, createPreloadApiMock, createPreloadApiMocks, resetPreloadApis, setPreloadApi } from '../../support/mocks/preload-api-globals.js';

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
    const contextBridge = { exposeInMainWorld: vi.fn() };
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
});
