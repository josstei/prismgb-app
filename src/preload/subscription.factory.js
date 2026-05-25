import IpcManifest from '@shared/ipc/ipc.manifest.json';

function requireListenerRegistry(registryInput) { if (!(registryInput instanceof Map)) throw new TypeError('Preload listener registry must be a Map'); return registryInput; }

function getListenerSet(registry, key) {
  const listenerRegistry = requireListenerRegistry(registry);

  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Preload listener registry key must be a non-empty string');
  }

  const listeners = listenerRegistry.get(key);
  if (listeners instanceof Set) return listeners;
  const newListeners = new Set(); listenerRegistry.set(key, newListeners); return newListeners;
}

function createSubscriptionDisposer({ ipcRenderer, registry, subscriptions }) {
  const listenerRegistry = requireListenerRegistry(registry);

  return () => {
    for (const { channel, registryKey } of subscriptions) {
      const listeners = listenerRegistry.get(registryKey);
      if (!(listeners instanceof Set)) {
        continue;
      }

      for (const listener of listeners) {
        ipcRenderer.removeListener(channel, listener);
      }
      listeners.clear();
    }
  };
}

const normalizeTrimmedString = (value) => typeof value === 'string' ? value.trim() : '';
function requireManifestNamespace(apiName, manifest = IpcManifest) { const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName); if (!namespace) throw new Error(`IPC manifest namespace not found for preload API "${apiName}"`); return namespace; }
function deriveManifestSubscriptions(manifest) {
  const subscriptions = (manifest.namespaces || []).flatMap((namespace) => (namespace.subscriptions || []).map((entry) => {
    const registryNamespace = normalizeTrimmedString(namespace.registryNamespace);
    const methodName = normalizeTrimmedString(entry.factoryMethod || entry.method);
    return {
      ...entry,
      apiName: namespace.apiName,
      methodName,
      registryNamespace,
      registryKey: `${registryNamespace}.${methodName}`
    };
  }));
  const byRegistryKey = new Map();
  for (const subscription of subscriptions) {
    if (!subscription.registryNamespace) {
      throw new Error(`IPC manifest registry namespace must be a non-empty string for preload API "${subscription.apiName}"`);
    }
    if (!subscription.methodName) {
      throw new Error(`IPC manifest subscription method name must be a non-empty string for preload API "${subscription.apiName}"`);
    }

    const existing = byRegistryKey.get(subscription.registryKey);
    if (existing) {
      throw new Error(
        `IPC manifest subscription registry key collision for "${subscription.registryKey}" ` +
          `between "${existing.apiName}.${existing.methodName}" and "${subscription.apiName}.${subscription.methodName}"`
      );
    }
    byRegistryKey.set(subscription.registryKey, subscription);
  }
  return subscriptions;
}

function requireInvokeMethod(apiName, byMethod, methodName) { const channel = byMethod[methodName]; if (!channel) throw new Error(`IPC manifest invoke channel not found for ${apiName}.${methodName}`); return channel; }
function createManifestInvokeSet(apiName, channels, manifest = IpcManifest) {
  const namespace = requireManifestNamespace(apiName, manifest), channelNamespace = channels?.[namespace.namespace];
  if (!channelNamespace || typeof channelNamespace !== 'object') throw new Error(`IPC channel namespace not found for preload API "${apiName}"`);
  const byMethod = {};
  for (const entry of namespace.invoke || []) {
    const methodName = normalizeTrimmedString(entry.factoryMethod || entry.method), channel = channelNamespace[entry.channelKey];
    if (!methodName) throw new Error(`IPC manifest invoke method name must be a non-empty string for preload API "${apiName}"`);
    if (!channel) throw new Error(`IPC channel key "${entry.channelKey}" not found for ${apiName}.${methodName}`);
    if (Object.prototype.hasOwnProperty.call(byMethod, methodName)) throw new Error(`IPC manifest invoke key collision for "${apiName}.${methodName}" between "${byMethod[methodName]}" and "${channel}"`);
    byMethod[methodName] = channel;
  }
  return { byMethod, requireMethod: (methodName) => requireInvokeMethod(apiName, byMethod, methodName) };
}

function createManifestSubscriptionSet(apiName, manifest = IpcManifest) {
  requireManifestNamespace(apiName, manifest);

  const subscriptions = deriveManifestSubscriptions(manifest)
    .filter((subscription) => subscription.apiName === apiName)
    .map(({ registryNamespace: _registryNamespace, ...subscription }) => subscription);
  const byMethod = Object.fromEntries(subscriptions.map((subscription) => [subscription.methodName, subscription]));
  return { subscriptions, byMethod, requireMethod: (methodName) => requireSubscriptionMethod(apiName, byMethod, methodName) };
}

function requireSubscriptionMethod(apiName, byMethod, methodName) { const subscription = byMethod[methodName]; if (!subscription) throw new Error(`IPC manifest subscription not found for ${apiName}.${methodName}`); return subscription; }
function applyRequiredSubscriptionMetadata(apiName, subscriptions, metadataByMethod) { return subscriptions.map((subscription) => { const metadata = metadataByMethod[subscription.methodName]; if (!metadata) throw new Error(`Preload subscription metadata missing for ${apiName}.${subscription.methodName}`); return { ...subscription, ...metadata }; }); }

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
  mapPayload = (payload) => payload,
  invalidCallbackMessage = `${apiName}.${methodName}: Invalid callback provided`,
  listenerLimitMessage = `${apiName}.${methodName}: Maximum listener limit reached`,
  invalidPayloadMessage = `${apiName}.${methodName}: Invalid payload received`
}) {
  return (callback) => {
    if (!validateCallback(callback)) {
      console.warn(invalidCallbackMessage);
      return () => {};
    }

    const listenerSet = getListenerSet(registry, registryKey);

    if (listenerSet.size >= maxListeners) {
      console.warn(listenerLimitMessage);
      return () => {};
    }

    const listener = (event, payload) => {
      if (validatePayload && !validatePayload(payload)) {
        console.warn(invalidPayloadMessage);
        return;
      }
      if (dispatchPayload) {
        callback(mapPayload(payload, event));
        return;
      }

      callback();
    };

    listenerSet.add(listener);
    ipcRenderer.on(channel, listener);

    return () => {
      ipcRenderer.removeListener(channel, listener);
      listenerSet.delete(listener);
    };
  };
}

export { applyRequiredSubscriptionMetadata, createManifestInvokeSet, createManifestSubscriptionSet, createSubscription, createSubscriptionDisposer, requireSubscriptionMethod };
