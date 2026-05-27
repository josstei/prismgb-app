import type { IpcRenderer } from 'electron';
import IpcManifest from '@shared/ipc/ipc.manifest.json';
import type { IpcChannels } from '@shared/ipc/ipc.manifest.js';
import { requirePreloadInvokeMetadata, validatePreloadInvokeArguments, type PreloadInvokeMetadata } from './validators.generated.js';

type Unsubscribe = () => void;
type RegisteredListener = (...args: unknown[]) => void;
type GeneratedMethod = (...args: never[]) => unknown;
type InvokeIpcRenderer = Pick<IpcRenderer, 'invoke'>;
type PreloadIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>;

// CODEBASE_PRELOAD_METHOD_CONTRACT:START
const preloadApiNames = ['deviceAPI', 'shellAPI', 'windowAPI', 'updateAPI', 'metricsAPI', 'gpuAPI', 'loginItemAPI', 'transcodeAPI'] as const satisfies readonly (Extract<keyof Window, `${string}API`>)[];
export type PreloadApiName = (typeof preloadApiNames)[number];
type ApiSurface<TApiName extends PreloadApiName> = NonNullable<Window[TApiName]>;
type ApiMethodName<TApiName extends PreloadApiName> = Extract<keyof ApiSurface<TApiName>, string>;
type InvokeMethodName<TApiName extends PreloadApiName> = Exclude<ApiMethodName<TApiName>, `on${string}`>;
type SubscriptionMethodName<TApiName extends PreloadApiName> = Extract<ApiMethodName<TApiName>, `on${string}`>;
type InvokeApiName = { [TApiName in PreloadApiName]: InvokeMethodName<TApiName> extends never ? never : TApiName }[PreloadApiName];
type SubscriptionApiName = { [TApiName in PreloadApiName]: SubscriptionMethodName<TApiName> extends never ? never : TApiName }[PreloadApiName];
type InvokeMethods<TApiName extends InvokeApiName> = Pick<ApiSurface<TApiName>, InvokeMethodName<TApiName>>;
type SubscriptionMethods<TApiName extends SubscriptionApiName> = Pick<ApiSurface<TApiName>, SubscriptionMethodName<TApiName>>;
type InvokeFactoryContext = { apiName: string; methodName: string; channel: string; ipcRenderer: InvokeIpcRenderer; manifestEntry: ManifestInvokeEntry };
type InvokeMethodFactory<TMethod extends GeneratedMethod = GeneratedMethod> = (context: InvokeFactoryContext) => TMethod;
type InvokeMethodFactories<TApiName extends InvokeApiName> = Partial<{ [TMethodName in keyof InvokeMethods<TApiName>]: InvokeMethodFactory<Extract<InvokeMethods<TApiName>[TMethodName], GeneratedMethod>> }>;
const invokeMethodNamesByApi = {
  deviceAPI: ['getDeviceStatus'],
  shellAPI: ['openExternal'],
  windowAPI: ['setFullScreen', 'isFullScreen'],
  updateAPI: ['getStatus', 'checkForUpdates', 'downloadUpdate', 'installUpdate'],
  metricsAPI: ['getProcessMetrics'],
  gpuAPI: ['getPolicy'],
  loginItemAPI: ['get', 'set'],
  transcodeAPI: ['start', 'cancel', 'getStatus']
} as const satisfies { readonly [TApiName in InvokeApiName]: readonly InvokeMethodName<TApiName>[] };
const subscriptionMethodNamesByApi = {
  deviceAPI: ['onDeviceConnected', 'onDeviceDisconnected'],
  windowAPI: ['onEnterFullscreen', 'onLeaveFullscreen', 'onResized'],
  updateAPI: ['onAvailable', 'onNotAvailable', 'onProgress', 'onDownloaded', 'onError'],
  transcodeAPI: ['onProgress', 'onCompleted', 'onError', 'onCancelled']
} as const satisfies { readonly [TApiName in SubscriptionApiName]: readonly SubscriptionMethodName<TApiName>[] };
type MissingInvokeMethodName = { [TApiName in InvokeApiName]: `${TApiName}.${Exclude<InvokeMethodName<TApiName>, (typeof invokeMethodNamesByApi)[TApiName][number]>}` }[InvokeApiName];
type MissingSubscriptionMethodName = { [TApiName in SubscriptionApiName]: `${TApiName}.${Exclude<SubscriptionMethodName<TApiName>, (typeof subscriptionMethodNamesByApi)[TApiName][number]>}` }[SubscriptionApiName];
type AssertNoMissingGeneratedMethods<TMissing extends never> = TMissing;
export type PreloadMethodContractIsComplete = [AssertNoMissingGeneratedMethods<MissingInvokeMethodName>, AssertNoMissingGeneratedMethods<MissingSubscriptionMethodName>];
// CODEBASE_PRELOAD_METHOD_CONTRACT:END

type PayloadValidatorMetadata = { validatePayload?: (payload: unknown) => boolean; invalidPayloadLabel?: string; invalidPayloadMessage?: string; invalidCallbackMessage?: string; listenerLimitMessage?: string; mapPayload?: (payload: unknown, event: unknown) => unknown; dispatchPayload?: boolean };

interface ManifestInvokeEntry { method: string; factoryMethod?: string; channelKey: string; channel: string; request?: readonly string[]; preload?: PreloadInvokeMetadata; }
interface ManifestSubscriptionEntry { method: string; factoryMethod?: string; channelKey: string; channel: string; payload?: string; }
interface ManifestNamespace { apiName: string; namespace: string; registryNamespace?: string; invoke?: readonly ManifestInvokeEntry[]; subscriptions?: readonly ManifestSubscriptionEntry[]; }
interface ManifestShape { namespaces: readonly ManifestNamespace[]; }
type DerivedManifestSubscription = ManifestSubscriptionEntry & { apiName: string; methodName: string; registryNamespace: string; registryKey: string };
type ManifestSubscription = Omit<DerivedManifestSubscription, 'registryNamespace'> & PayloadValidatorMetadata & { dispatchPayload?: boolean };

function assertManifestMethodSet(apiName: string, kind: 'invoke' | 'subscription', byMethod: Record<string, unknown>, expectedMethods: readonly string[]): void {
  const actual = Object.keys(byMethod), actualSet = new Set(actual), expectedSet = new Set(expectedMethods), missing = expectedMethods.filter((methodName) => !actualSet.has(methodName)), extra = actual.filter((methodName) => !expectedSet.has(methodName));
  if (missing.length || extra.length) throw new Error(`IPC manifest ${kind} methods for ${apiName} do not match generated preload contract: ${[missing.length ? `missing ${missing.join(', ')}` : '', extra.length ? `extra ${extra.join(', ')}` : ''].filter(Boolean).join('; ')}`);
}

function requireListenerRegistry(registryInput: unknown): Map<string, Set<RegisteredListener>> {
  if (!(registryInput instanceof Map)) throw new TypeError('Preload listener registry must be a Map');
  return registryInput as Map<string, Set<RegisteredListener>>;
}

function getListenerSet(registry: Map<string, Set<RegisteredListener>>, key: string): Set<RegisteredListener> {
  const listenerRegistry = requireListenerRegistry(registry);
  if (typeof key !== 'string' || key.length === 0) throw new TypeError('Preload listener registry key must be a non-empty string');
  const listeners = listenerRegistry.get(key);
  if (listeners instanceof Set) return listeners;
  const newListeners = new Set<RegisteredListener>(); listenerRegistry.set(key, newListeners); return newListeners;
}

function createSubscriptionDisposer({ ipcRenderer, registry, subscriptions }: { ipcRenderer: PreloadIpcRenderer; registry: Map<string, Set<RegisteredListener>>; subscriptions: readonly ManifestSubscription[] }): Unsubscribe {
  const listenerRegistry = requireListenerRegistry(registry);
  return () => {
    for (const { channel, registryKey } of subscriptions) {
      const listeners = listenerRegistry.get(registryKey);
      if (!(listeners instanceof Set)) continue;
      for (const listener of listeners) ipcRenderer.removeListener(channel, listener);
      listeners.clear();
    }
  };
}

const normalizeTrimmedString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
function isPreloadApiName(apiName: string): apiName is PreloadApiName { return (preloadApiNames as readonly string[]).includes(apiName); }
function requireManifestNamespace(apiName: string, manifest: ManifestShape = IpcManifest): ManifestNamespace { if (!isPreloadApiName(apiName)) throw new Error(`Preload API "${apiName}" is not in the generated preload contract`); const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName); if (!namespace) throw new Error(`IPC manifest namespace not found for preload API "${apiName}"`); return namespace; }
function deriveManifestSubscriptions(manifest: ManifestShape): DerivedManifestSubscription[] {
  const subscriptions = (manifest.namespaces || []).flatMap((namespace) => (namespace.subscriptions || []).map((entry) => {
    const registryNamespace = normalizeTrimmedString(namespace.registryNamespace), methodName = normalizeTrimmedString(entry.factoryMethod || entry.method);
    return { ...entry, apiName: namespace.apiName, methodName, registryNamespace, registryKey: `${registryNamespace}.${methodName}` };
  }));
  const byRegistryKey = new Map<string, DerivedManifestSubscription>();
  for (const subscription of subscriptions) {
    if (!subscription.registryNamespace) throw new Error(`IPC manifest registry namespace must be a non-empty string for preload API "${subscription.apiName}"`);
    if (!subscription.methodName) throw new Error(`IPC manifest subscription method name must be a non-empty string for preload API "${subscription.apiName}"`);
    const existing = byRegistryKey.get(subscription.registryKey);
    if (existing) throw new Error(`IPC manifest subscription registry key collision for "${subscription.registryKey}" between "${existing.apiName}.${existing.methodName}" and "${subscription.apiName}.${subscription.methodName}"`);
    byRegistryKey.set(subscription.registryKey, subscription);
  }
  return subscriptions;
}

function requireInvokeMethod(apiName: string, byMethod: Record<string, string>, methodName: string): string { const channel = byMethod[methodName]; if (!channel) throw new Error(`IPC manifest invoke channel not found for ${apiName}.${methodName}`); return channel; }
function createManifestInvokeSet(apiName: string, channels: IpcChannels, manifest: ManifestShape = IpcManifest) {
  const namespace = requireManifestNamespace(apiName, manifest), channelNamespace = channels?.[namespace.namespace as keyof IpcChannels] as Record<string, string> | undefined;
  if (!channelNamespace || typeof channelNamespace !== 'object') throw new Error(`IPC channel namespace not found for preload API "${apiName}"`);
  const byMethod: Record<string, string> = {}, metadataByMethod: Record<string, ManifestInvokeEntry> = {};
  for (const entry of namespace.invoke || []) {
    const methodName = normalizeTrimmedString(entry.factoryMethod || entry.method), channel = channelNamespace[entry.channelKey];
    if (!methodName) throw new Error(`IPC manifest invoke method name must be a non-empty string for preload API "${apiName}"`);
    if (!channel) throw new Error(`IPC channel key "${entry.channelKey}" not found for ${apiName}.${methodName}`);
    if (Object.prototype.hasOwnProperty.call(byMethod, methodName)) throw new Error(`IPC manifest invoke key collision for "${apiName}.${methodName}" between "${byMethod[methodName]}" and "${channel}"`);
    byMethod[methodName] = channel; metadataByMethod[methodName] = entry;
  }
  return { byMethod, metadataByMethod, requireMethod: (methodName: string) => requireInvokeMethod(apiName, byMethod, methodName) };
}

function createDefaultInvokeMethod({ apiName, methodName, ipcRenderer, channel, manifestEntry }: InvokeFactoryContext): GeneratedMethod {
  const argumentCount = Array.isArray(manifestEntry?.request) ? manifestEntry.request.length : 0;
  const metadata = manifestEntry.preload ? requirePreloadInvokeMetadata(apiName, methodName, manifestEntry) : null;
  return ((...args: unknown[]) => {
    const forwardedArgs = args.slice(0, argumentCount);
    const failure = metadata ? validatePreloadInvokeArguments(metadata, forwardedArgs) : null;
    if (failure) { console.warn(failure.invalidMessage); return Promise.resolve(failure.fallback); }
    return ipcRenderer.invoke(channel, ...forwardedArgs);
  }) as GeneratedMethod;
}

function createManifestInvokeMethods<TApiName extends InvokeApiName>({ apiName, ipcRenderer, channels, manifest = IpcManifest, methodFactories = {} as InvokeMethodFactories<TApiName> }: { apiName: TApiName; ipcRenderer: InvokeIpcRenderer; channels: IpcChannels; manifest?: ManifestShape; methodFactories?: InvokeMethodFactories<TApiName> }): InvokeMethods<TApiName> {
  const { byMethod, metadataByMethod } = createManifestInvokeSet(apiName, channels, manifest), factories = methodFactories as Record<string, InvokeMethodFactory | undefined>;
  assertManifestMethodSet(apiName, 'invoke', byMethod, invokeMethodNamesByApi[apiName]);
  for (const methodName of Object.keys(factories)) if (!Object.prototype.hasOwnProperty.call(byMethod, methodName)) throw new Error(`IPC manifest invoke method not found for ${apiName}.${methodName}`);
  return Object.fromEntries(Object.entries(byMethod).map(([methodName, channel]) => [methodName, (factories[methodName] || createDefaultInvokeMethod)({ apiName, methodName, channel, ipcRenderer, manifestEntry: metadataByMethod[methodName] })])) as InvokeMethods<TApiName>;
}

function createManifestSubscriptionSet(apiName: string, manifest: ManifestShape = IpcManifest) {
  requireManifestNamespace(apiName, manifest);
  const subscriptions = deriveManifestSubscriptions(manifest).filter((subscription) => subscription.apiName === apiName).map(({ registryNamespace: _registryNamespace, ...subscription }) => subscription);
  const byMethod = Object.fromEntries(subscriptions.map((subscription) => [subscription.methodName, subscription])) as Record<string, ManifestSubscription>;
  return { subscriptions, byMethod, requireMethod: (methodName: string) => requireSubscriptionMethod(apiName, byMethod, methodName) };
}

function requireSubscriptionMethod(apiName: string, byMethod: Record<string, ManifestSubscription>, methodName: string): ManifestSubscription { const subscription = byMethod[methodName]; if (!subscription) throw new Error(`IPC manifest subscription not found for ${apiName}.${methodName}`); return subscription; }
function applyRequiredSubscriptionMetadata(apiName: string, subscriptions: readonly ManifestSubscription[], metadataByMethod: Record<string, PayloadValidatorMetadata>): ManifestSubscription[] { return subscriptions.map((subscription) => { const metadata = metadataByMethod[subscription.methodName]; if (!metadata) throw new Error(`Preload subscription metadata missing for ${apiName}.${subscription.methodName}`); return { ...subscription, ...metadata }; }); }
function applyPayloadSubscriptionMetadata(apiName: string, subscriptions: readonly ManifestSubscription[], metadataByPayload: Record<string, PayloadValidatorMetadata>): ManifestSubscription[] {
  const payloadTypes = new Set(subscriptions.map((subscription) => subscription.payload));
  for (const payloadType of Object.keys(metadataByPayload)) if (!payloadTypes.has(payloadType)) throw new Error(`Preload subscription payload metadata not used for ${apiName}.${payloadType}`);
  return subscriptions.map((subscription) => {
    const metadata = subscription.payload ? metadataByPayload[subscription.payload] : undefined;
    return metadata ? { ...subscription, ...metadata, invalidPayloadMessage: `${apiName}.${subscription.methodName}: Invalid ${metadata.invalidPayloadLabel || 'payload'} received` } : subscription;
  });
}

function createManifestSubscriptionMethods<TApiName extends SubscriptionApiName>({ apiName, ipcRenderer, registry, maxListeners, validateCallback, metadataByMethod = {}, metadataByPayload = {}, manifest = IpcManifest }: { apiName: TApiName; ipcRenderer: PreloadIpcRenderer; registry: Map<string, Set<RegisteredListener>>; maxListeners: number; validateCallback: (callback: unknown) => boolean; metadataByMethod?: Record<string, PayloadValidatorMetadata>; metadataByPayload?: Record<string, PayloadValidatorMetadata>; manifest?: ManifestShape }): { methods: SubscriptionMethods<TApiName>; dispose: Unsubscribe } {
  const { subscriptions: manifestSubscriptions } = createManifestSubscriptionSet(apiName, manifest);
  assertManifestMethodSet(apiName, 'subscription', Object.fromEntries(manifestSubscriptions.map((subscription) => [subscription.methodName, subscription])), subscriptionMethodNamesByApi[apiName]);
  const payloadSubscriptions = Object.keys(metadataByPayload).length ? applyPayloadSubscriptionMetadata(apiName, manifestSubscriptions, metadataByPayload) : manifestSubscriptions;
  const subscriptions = (Object.keys(metadataByMethod).length ? applyRequiredSubscriptionMetadata(apiName, payloadSubscriptions, metadataByMethod) : payloadSubscriptions).map((subscription) => ({ dispatchPayload: subscription.payload !== 'void', ...subscription }));
  return {
    methods: Object.fromEntries(subscriptions.map((subscription) => [subscription.methodName, createSubscription({ ipcRenderer, registry, maxListeners, validateCallback, ...subscription })])) as SubscriptionMethods<TApiName>,
    dispose: createSubscriptionDisposer({ ipcRenderer, registry, subscriptions })
  };
}

function createSubscription({
  apiName,
  methodName,
  channel,
  ipcRenderer,
  registry,
  registryKey,
  maxListeners,
  validateCallback,
  validatePayload,
  dispatchPayload = true,
  mapPayload = (payload: unknown) => payload,
  invalidCallbackMessage = `${apiName}.${methodName}: Invalid callback provided`,
  listenerLimitMessage = `${apiName}.${methodName}: Maximum listener limit reached`,
  invalidPayloadMessage = `${apiName}.${methodName}: Invalid payload received`
}: ManifestSubscription & { ipcRenderer: PreloadIpcRenderer; registry: Map<string, Set<RegisteredListener>>; maxListeners: number; validateCallback: (callback: unknown) => boolean }): GeneratedMethod {
  return ((callback: (payload?: unknown) => void) => {
    if (!validateCallback(callback)) { console.warn(invalidCallbackMessage); return () => {}; }
    const listenerSet = getListenerSet(registry, registryKey);
    if (listenerSet.size >= maxListeners) { console.warn(listenerLimitMessage); return () => {}; }
    const listener: RegisteredListener = (event: unknown, payload?: unknown) => {
      if (validatePayload && !validatePayload(payload)) { console.warn(invalidPayloadMessage); return; }
      if (dispatchPayload) { callback(mapPayload(payload, event)); return; }
      callback();
    };
    listenerSet.add(listener); ipcRenderer.on(channel, listener);
    return () => { ipcRenderer.removeListener(channel, listener); listenerSet.delete(listener); };
  }) as GeneratedMethod;
}

export { applyRequiredSubscriptionMetadata, createManifestInvokeMethods, createManifestInvokeSet, createManifestSubscriptionMethods, createManifestSubscriptionSet, createSubscription, createSubscriptionDisposer, requireSubscriptionMethod };
