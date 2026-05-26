import {
  IpcContractManifest,
  type IpcManifest,
  type IpcNamespaceManifest
} from '@shared/ipc/ipc.manifest.js';

type MaybeUnsubscribe = (() => void) | null | undefined;

export interface RendererPreloadBridgeDescriptor<TMethod extends string = string> {
  readonly apiName: string;
  readonly methods: readonly TMethod[];
}

// CODEBASE_RENDERER_PRELOAD_BRIDGE_DESCRIPTORS:START
export const RendererPreloadBridgeDescriptors = {
  deviceAPI: { apiName: 'deviceAPI', methods: ['onDeviceConnected', 'onDeviceDisconnected'] },
  windowAPI: { apiName: 'windowAPI', methods: ['onEnterFullscreen', 'onLeaveFullscreen', 'onResized'] },
  updateAPI: { apiName: 'updateAPI', methods: ['onAvailable', 'onNotAvailable', 'onProgress', 'onDownloaded', 'onError'] },
  transcodeAPI: { apiName: 'transcodeAPI', methods: ['onProgress', 'onCompleted', 'onError', 'onCancelled'] }
} as const satisfies Record<string, RendererPreloadBridgeDescriptor>;
// CODEBASE_RENDERER_PRELOAD_BRIDGE_DESCRIPTORS:END

export type RendererPreloadBridgeApiName = keyof typeof RendererPreloadBridgeDescriptors;

interface PreloadEventBridgeLogger {
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

interface PreloadEventSubscriptionDescriptor<TApi> {
  id: string;
  subscribe(api: TApi): MaybeUnsubscribe;
}

interface PreloadEventBridgeOptions<TApi> {
  api: TApi;
  bridgeName: string;
  subscriptions: readonly PreloadEventSubscriptionDescriptor<TApi>[];
  logger?: PreloadEventBridgeLogger;
}

type ManifestSubscriptionEntry = NonNullable<IpcNamespaceManifest['subscriptions']>[number];
type ManifestPreloadEventHandler = (...args: never[]) => void;
type ManifestPreloadEventHandlers<TMethod extends string = string> = Readonly<Record<TMethod, ManifestPreloadEventHandler>>;

interface ManifestPreloadEventBridgeOptions<TApi, TMethod extends string = string> {
  api: TApi;
  descriptor: RendererPreloadBridgeDescriptor<TMethod>;
  bridgeName: string;
  handlers: ManifestPreloadEventHandlers<TMethod>;
  manifest?: IpcManifest;
  logger?: PreloadEventBridgeLogger;
}

export interface PreloadEventBridge {
  readonly size: number;
  dispose(): void;
}

const normalizeTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const derivePublicMethodName = (entry: ManifestSubscriptionEntry): string =>
  normalizeTrimmedString(('factoryMethod' in entry ? entry.factoryMethod : '') || entry.method);

function requireManifestNamespace(apiName: string, manifest: IpcManifest): IpcNamespaceManifest {
  const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName);
  if (!namespace) {
    throw new Error(`IPC manifest namespace not found for preload API "${apiName}"`);
  }
  return namespace;
}

function collectDescriptorSubscriptions({
  apiName,
  bridgeName,
  descriptorMethods,
  namespace
}: {
  apiName: string;
  bridgeName: string;
  descriptorMethods: readonly string[];
  namespace: IpcNamespaceManifest;
}): ManifestSubscriptionEntry[] {
  const byMethod = new Map((namespace.subscriptions || []).map((subscription) => [derivePublicMethodName(subscription), subscription]));
  const subscriptions = descriptorMethods.map((methodName) => {
    const subscription = byMethod.get(methodName);
    if (!subscription) {
      throw new Error(`${bridgeName}: descriptor subscription "${apiName}.${methodName}" is not in IPC manifest`);
    }
    byMethod.delete(methodName);
    return subscription;
  });
  if (byMethod.size > 0) {
    throw new Error(`${bridgeName}: IPC manifest subscriptions missing from descriptor for "${apiName}": ${[...byMethod.keys()].join(', ')}`);
  }
  return subscriptions;
}

function createManifestSubscriptionDescriptor<TApi>({
  api,
  apiName,
  bridgeName,
  handlers,
  subscription
}: {
  api: TApi;
  apiName: string;
  bridgeName: string;
  handlers: ManifestPreloadEventHandlers;
  subscription: ManifestSubscriptionEntry;
}): PreloadEventSubscriptionDescriptor<TApi> {
  const methodName = derivePublicMethodName(subscription);
  if (!methodName) {
    throw new Error(`${bridgeName}: invalid manifest subscription method for "${apiName}"`);
  }

  const subscribeMethod = (api as Record<string, unknown>)[methodName];
  if (typeof subscribeMethod !== 'function') {
    throw new Error(`${bridgeName}: preload API method "${apiName}.${methodName}" is not available`);
  }

  const handler = handlers[methodName];
  if (typeof handler !== 'function') {
    throw new Error(`${bridgeName}: preload event handler missing for "${apiName}.${methodName}"`);
  }

  return {
    id: methodName,
    subscribe: (preloadApi) =>
      ((preloadApi as Record<string, unknown>)[methodName] as (callback: (...args: unknown[]) => void) => MaybeUnsubscribe)(handler as (...args: unknown[]) => void)
  };
}

export function createPreloadEventBridge<TApi>({
  api,
  bridgeName,
  subscriptions,
  logger
}: PreloadEventBridgeOptions<TApi>): PreloadEventBridge {
  const unsubscribers: Array<() => void> = [];
  let disposed = false;

  for (const subscription of subscriptions) {
    const unsubscribe = subscription.subscribe(api);
    if (typeof unsubscribe !== 'function') {
      logger?.warn?.(`${bridgeName}: subscription "${subscription.id}" did not return an unsubscribe function`);
      continue;
    }
    unsubscribers.push(unsubscribe);
  }

  return {
    get size() {
      return unsubscribers.length;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;

      const cleanup = [...unsubscribers].reverse();
      unsubscribers.length = 0;

      for (const unsubscribe of cleanup) {
        try {
          unsubscribe();
        } catch (error) {
          logger?.error?.(`${bridgeName}: failed to unsubscribe preload event`, error);
        }
      }
    }
  };
}

export function createManifestPreloadEventBridge<TApi, TMethod extends string>({
  api,
  descriptor,
  bridgeName,
  handlers,
  manifest = IpcContractManifest,
  logger
}: ManifestPreloadEventBridgeOptions<TApi, TMethod>): PreloadEventBridge {
  const { apiName, methods } = descriptor;
  const namespace = requireManifestNamespace(apiName, manifest);
  const subscriptions = collectDescriptorSubscriptions({ apiName, bridgeName, descriptorMethods: methods, namespace }).map((subscription) =>
    createManifestSubscriptionDescriptor({ api, apiName, bridgeName, handlers, subscription })
  );
  return createPreloadEventBridge({ api, bridgeName, subscriptions, logger });
}
