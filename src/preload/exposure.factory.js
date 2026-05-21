import IpcManifest from '@shared/ipc/ipc.manifest.json';

function assertFunction(value, apiName, methodName) {
  if (typeof value !== 'function') {
    throw new Error(`Preload API ${apiName}.${methodName} is not implemented`);
  }
}

export function createPreloadExposureMap(apiImplementations, manifest = IpcManifest) {
  return Object.fromEntries(
    manifest.namespaces.map((namespace) => {
      const api = apiImplementations[namespace.apiName];
      if (!api) {
        throw new Error(`Preload API ${namespace.apiName} is not implemented`);
      }

      const exposedApi = Object.fromEntries(
        namespace.exposedMethods.map((methodName) => {
          const implementation = api[methodName];
          assertFunction(implementation, namespace.apiName, methodName);
          return [methodName, implementation];
        })
      );

      return [namespace.apiName, exposedApi];
    })
  );
}

export function exposePreloadApis(contextBridge, apiImplementations, manifest = IpcManifest) {
  const exposureMap = createPreloadExposureMap(apiImplementations, manifest);

  for (const [apiName, api] of Object.entries(exposureMap)) {
    contextBridge.exposeInMainWorld(apiName, api);
  }

  return exposureMap;
}
