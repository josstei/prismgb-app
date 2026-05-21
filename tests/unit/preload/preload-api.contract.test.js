import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
import { createPreloadExposureMap, exposePreloadApis } from '@preload/exposure.factory.js';

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

function readPreloadTypeSource() {
  const typePath = path.resolve(process.cwd(), 'src/types/preload-api.d.ts');
  return fs.readFileSync(typePath, 'utf8');
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

  it('keeps preload declaration contract typed (no Promise<unknown>)', () => {
    const typeSource = readPreloadTypeSource();

    expect(typeSource).toContain("from '@shared/ipc/preload-api.contract.js'");
    expect(typeSource).not.toContain('Promise<unknown>');
    expect(typeSource).not.toMatch(/callback:\s*\([^)]*unknown/);
  });
});
