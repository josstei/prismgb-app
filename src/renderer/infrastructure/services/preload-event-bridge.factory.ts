import {
  IpcContractManifest,
  type IpcManifest,
  type IpcNamespaceManifest
} from '@shared/ipc/ipc.manifest.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventChannelValue } from '@shared/events/event-payloads.js';

type MaybeUnsubscribe = (() => void) | null | undefined;

type RendererPreloadBridgeLifecycle = 'add' | 'replace';
export type RendererPreloadBridgeLifecycleKey = symbol;

interface RendererPreloadBridgeDescriptorBase<TMethod extends string = string> {
  readonly apiName: string;
  readonly bridgeName: string;
  readonly events: RendererPreloadBridgeEventDescriptorMap<TMethod>;
  readonly methods: readonly TMethod[];
}

export type RendererPreloadBridgeDescriptor<TMethod extends string = string> =
  RendererPreloadBridgeDescriptorBase<TMethod> & (
    | { readonly lifecycle: 'add' }
    | { readonly lifecycle: 'replace'; readonly lifecycleKey: RendererPreloadBridgeLifecycleKey }
  );

type ManifestSubscriptionEntry = NonNullable<IpcNamespaceManifest['subscriptions']>[number];
type ManifestPreloadEventHandler = (...args: never[]) => void;
type ManifestPreloadEventHandlers<TMethod extends string = string> = Readonly<Record<TMethod, ManifestPreloadEventHandler>>;
type RendererPreloadBridgeEventDescriptorMap<TMethod extends string = string> = Partial<Readonly<Record<TMethod, EventChannelValue>>>;
type RendererPreloadBridgeMethodMapBase = Readonly<Record<string, string>>;
type RendererPreloadBridgeLifecycleMapBase<TMethodMap extends RendererPreloadBridgeMethodMapBase> = {
  readonly [TApiName in keyof TMethodMap & string]: RendererPreloadBridgeLifecycle;
};
type RendererPreloadBridgeDescriptorFor<
  TMethod extends string,
  TLifecycle extends RendererPreloadBridgeLifecycle
> = RendererPreloadBridgeDescriptorBase<TMethod> & (TLifecycle extends 'replace'
  ? { readonly lifecycle: 'replace'; readonly lifecycleKey: RendererPreloadBridgeLifecycleKey }
  : { readonly lifecycle: 'add' });
type RendererPreloadBridgeDescriptorMap<
  TMethodMap extends RendererPreloadBridgeMethodMapBase,
  TLifecycleMap extends RendererPreloadBridgeLifecycleMapBase<TMethodMap>
> = {
  readonly [TApiName in keyof TMethodMap & string]: RendererPreloadBridgeDescriptorFor<TMethodMap[TApiName], TLifecycleMap[TApiName]>;
};

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

interface ManifestPreloadEventBridgeOptions<TApi, TMethod extends string = string> {
  api: TApi;
  descriptor: RendererPreloadBridgeDescriptor<TMethod>;
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

function hasManifestSubscriptions(namespace: IpcNamespaceManifest): namespace is IpcNamespaceManifest & { subscriptions: readonly ManifestSubscriptionEntry[] } {
  return Array.isArray(namespace.subscriptions) && namespace.subscriptions.length > 0;
}

// CODEBASE_RENDERER_PRELOAD_BRIDGE_DESCRIPTORS:START
type RendererPreloadBridgeMethodMap = {
  readonly deviceAPI: 'onDeviceConnected' | 'onDeviceDisconnected';
  readonly windowAPI: 'onEnterFullscreen' | 'onLeaveFullscreen' | 'onResized';
  readonly updateAPI: 'onAvailable' | 'onNotAvailable' | 'onProgress' | 'onDownloaded' | 'onError';
  readonly transcodeAPI: 'onProgress' | 'onCompleted' | 'onError' | 'onCancelled';
};
type RendererPreloadBridgeLifecycleMap = {
  readonly deviceAPI: 'add';
  readonly windowAPI: 'replace';
  readonly updateAPI: 'replace';
  readonly transcodeAPI: 'replace';
};
type RendererPreloadBridgeReplaceApiName = { [TApiName in keyof RendererPreloadBridgeLifecycleMap]: RendererPreloadBridgeLifecycleMap[TApiName] extends 'replace' ? TApiName : never }[keyof RendererPreloadBridgeLifecycleMap] & string;
const rendererPreloadBridgeApiNames = ['deviceAPI', 'windowAPI', 'updateAPI', 'transcodeAPI'] as const satisfies readonly (keyof RendererPreloadBridgeMethodMap)[];
const rendererPreloadBridgeMethodNames = {
  deviceAPI: ['onDeviceConnected', 'onDeviceDisconnected'],
  windowAPI: ['onEnterFullscreen', 'onLeaveFullscreen', 'onResized'],
  updateAPI: ['onAvailable', 'onNotAvailable', 'onProgress', 'onDownloaded', 'onError'],
  transcodeAPI: ['onProgress', 'onCompleted', 'onError', 'onCancelled']
} as const satisfies { readonly [TApiName in keyof RendererPreloadBridgeMethodMap]: readonly RendererPreloadBridgeMethodMap[TApiName][] };
const rendererPreloadBridgeEventChannels = {
  deviceAPI: {},
  windowAPI: { onResized: EventChannels.UI.WINDOW_RESIZED },
  updateAPI: { onAvailable: EventChannels.UPDATE.AVAILABLE, onNotAvailable: EventChannels.UPDATE.NOT_AVAILABLE, onProgress: EventChannels.UPDATE.PROGRESS, onDownloaded: EventChannels.UPDATE.DOWNLOADED, onError: EventChannels.UPDATE.ERROR },
  transcodeAPI: { onProgress: EventChannels.TRANSCODE.PROGRESS, onCompleted: EventChannels.TRANSCODE.COMPLETED, onError: EventChannels.TRANSCODE.ERROR, onCancelled: EventChannels.TRANSCODE.CANCELLED }
} as const satisfies { readonly [TApiName in keyof RendererPreloadBridgeMethodMap]: RendererPreloadBridgeEventDescriptorMap<RendererPreloadBridgeMethodMap[TApiName]> };
const rendererPreloadBridgeLifecycleKeyNames = {
  windowAPI: 'settingsFullscreenPreloadBridgeLifecycle',
  updateAPI: 'updatePreloadBridgeLifecycle',
  transcodeAPI: 'transcodePreloadBridgeLifecycle'
} as const satisfies { readonly [TApiName in RendererPreloadBridgeReplaceApiName]: string };
const rendererPreloadBridgeLifecycleKeys = {
  windowAPI: Symbol(rendererPreloadBridgeLifecycleKeyNames.windowAPI),
  updateAPI: Symbol(rendererPreloadBridgeLifecycleKeyNames.updateAPI),
  transcodeAPI: Symbol(rendererPreloadBridgeLifecycleKeyNames.transcodeAPI)
} as const satisfies { readonly [TApiName in RendererPreloadBridgeReplaceApiName]: RendererPreloadBridgeLifecycleKey };
export type RendererPreloadBridgeApiName = keyof RendererPreloadBridgeMethodMap & string;

function assertManifestMethodsMatchDescriptor(apiName: string, manifestMethods: readonly string[], descriptorMethods: readonly string[]): void {
  const missing = descriptorMethods.filter((method) => !manifestMethods.includes(method));
  const extra = manifestMethods.filter((method) => !descriptorMethods.includes(method));
  if (missing.length || extra.length) {
    throw new Error(`IPC manifest subscriptions for renderer preload bridge API "${apiName}" do not match descriptor: ${[missing.length ? `missing ${missing.join(', ')}` : '', extra.length ? `extra ${extra.join(', ')}` : ''].filter(Boolean).join('; ')}`);
  }
}

function assertRendererPreloadBridgeDescriptorManifestParity(
  manifest: IpcManifest = IpcContractManifest
): void {
  for (const apiName of rendererPreloadBridgeApiNames) {
    const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName);
    if (!namespace || !hasManifestSubscriptions(namespace)) {
      throw new Error(`IPC manifest subscriptions not found for renderer preload bridge API "${apiName}"`);
    }
    const descriptorMethods = rendererPreloadBridgeMethodNames[apiName];
    assertManifestMethodsMatchDescriptor(apiName, [...namespace.subscriptions].map(derivePublicMethodName), descriptorMethods);
  }
}

function requireManifestRendererBridgeMetadata(apiName: string, namespace: IpcNamespaceManifest): NonNullable<IpcNamespaceManifest['rendererBridge']> {
  const metadata = namespace.rendererBridge;
  if (!metadata || typeof metadata.bridgeName !== 'string' || typeof metadata.lifecycle !== 'string') {
    throw new Error(`IPC manifest renderer bridge metadata missing for "${apiName}"`);
  }
  if (metadata.lifecycle === 'replace' && typeof metadata.lifecycleKey !== 'string') {
    throw new Error(`IPC manifest renderer bridge lifecycleKey missing for "${apiName}"`);
  }
  return metadata;
}

assertRendererPreloadBridgeDescriptorManifestParity();

export const RendererPreloadBridgeDescriptors = {
  deviceAPI: { apiName: 'deviceAPI', methods: rendererPreloadBridgeMethodNames.deviceAPI, events: rendererPreloadBridgeEventChannels.deviceAPI, bridgeName: 'DeviceIpcAdapter', lifecycle: 'add' },
  windowAPI: { apiName: 'windowAPI', methods: rendererPreloadBridgeMethodNames.windowAPI, events: rendererPreloadBridgeEventChannels.windowAPI, bridgeName: 'SettingsFullscreenService', lifecycle: 'replace', lifecycleKey: rendererPreloadBridgeLifecycleKeys.windowAPI },
  updateAPI: { apiName: 'updateAPI', methods: rendererPreloadBridgeMethodNames.updateAPI, events: rendererPreloadBridgeEventChannels.updateAPI, bridgeName: 'UpdateService', lifecycle: 'replace', lifecycleKey: rendererPreloadBridgeLifecycleKeys.updateAPI },
  transcodeAPI: { apiName: 'transcodeAPI', methods: rendererPreloadBridgeMethodNames.transcodeAPI, events: rendererPreloadBridgeEventChannels.transcodeAPI, bridgeName: 'TranscodeService', lifecycle: 'replace', lifecycleKey: rendererPreloadBridgeLifecycleKeys.transcodeAPI }
} as const satisfies RendererPreloadBridgeDescriptorMap<RendererPreloadBridgeMethodMap, RendererPreloadBridgeLifecycleMap>;

function assertRendererPreloadBridgeMetadataManifestParity(
  manifest: IpcManifest = IpcContractManifest,
  descriptors: RendererPreloadBridgeDescriptorMap<RendererPreloadBridgeMethodMap, RendererPreloadBridgeLifecycleMap> = RendererPreloadBridgeDescriptors
): void {
  for (const apiName of rendererPreloadBridgeApiNames) {
    const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName);
    if (!namespace) {
      throw new Error(`IPC manifest namespace not found for renderer preload bridge API "${apiName}"`);
    }
    const metadata = requireManifestRendererBridgeMetadata(apiName, namespace);
    const descriptor = descriptors[apiName];
    const descriptorLifecycleKey = descriptor.lifecycle === 'replace'
      ? rendererPreloadBridgeLifecycleKeyNames[apiName as RendererPreloadBridgeReplaceApiName]
      : undefined;
    const manifestLifecycleKey = metadata.lifecycle === 'replace' ? metadata.lifecycleKey : undefined;
    if (metadata.bridgeName !== descriptor.bridgeName || metadata.lifecycle !== descriptor.lifecycle || manifestLifecycleKey !== descriptorLifecycleKey) {
      throw new Error(`IPC manifest renderer bridge metadata for "${apiName}" does not match generated descriptor`);
    }
  }
}

assertRendererPreloadBridgeMetadataManifestParity();
// CODEBASE_RENDERER_PRELOAD_BRIDGE_DESCRIPTORS:END

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
  handlers,
  manifest = IpcContractManifest,
  logger
}: ManifestPreloadEventBridgeOptions<TApi, TMethod>): PreloadEventBridge {
  const { apiName, bridgeName, methods } = descriptor;
  const namespace = requireManifestNamespace(apiName, manifest);
  const subscriptions = collectDescriptorSubscriptions({ apiName, bridgeName, descriptorMethods: methods, namespace }).map((subscription) =>
    createManifestSubscriptionDescriptor({ api, apiName, bridgeName, handlers, subscription })
  );
  return createPreloadEventBridge({ api, bridgeName, subscriptions, logger });
}

export function createRendererPreloadEventBridge<TApi, TMethod extends string>(
  options: ManifestPreloadEventBridgeOptions<TApi, TMethod>
): PreloadEventBridge {
  return createManifestPreloadEventBridge(options);
}
