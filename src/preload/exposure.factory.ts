import { IpcContractManifest } from '@prismgb/ipc';
import type { IpcManifest } from '@prismgb/ipc';

type ExposedPreloadMethod = (...args: unknown[]) => unknown;
type PreloadApiImplementation = object;
type PreloadApiSurface = Record<string, ExposedPreloadMethod>;
type PreloadApiImplementations = Record<string, PreloadApiImplementation | undefined>;
type PreloadExposureMap = Record<string, PreloadApiSurface>;
type PreloadManifest = IpcManifest;
type ContextBridgeLike = { exposeInMainWorld(apiKey: string, api: PreloadApiSurface): void };
function assertFunction(
  value: unknown,
  apiName: string,
  methodName: string
): asserts value is ExposedPreloadMethod {
  if (typeof value !== 'function') {
    throw new Error(`Preload API ${apiName}.${methodName} is not implemented`);
  }
}

export function createPreloadExposureMap(
  apiImplementations: PreloadApiImplementations,
  manifest: PreloadManifest = IpcContractManifest
): PreloadExposureMap {
  return Object.fromEntries(
    manifest.namespaces.map((namespace) => {
      const api = apiImplementations[namespace.apiName];
      if (!api) {
        throw new Error(`Preload API ${namespace.apiName} is not implemented`);
      }

      const exposedApi = Object.fromEntries(
        namespace.exposedMethods.map((methodName) => {
          const implementation = (api as Record<string, unknown>)[methodName];
          assertFunction(implementation, namespace.apiName, methodName);
          return [methodName, implementation];
        })
      ) as PreloadApiSurface;

      return [namespace.apiName, exposedApi];
    })
  );
}

export function exposePreloadApis(
  contextBridge: ContextBridgeLike,
  apiImplementations: PreloadApiImplementations,
  manifest: PreloadManifest = IpcContractManifest
): PreloadExposureMap {
  const exposureMap = createPreloadExposureMap(apiImplementations, manifest);

  for (const [apiName, api] of Object.entries(exposureMap)) {
    contextBridge.exposeInMainWorld(apiName, api);
  }

  return exposureMap;
}
