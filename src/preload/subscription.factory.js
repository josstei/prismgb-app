function requireListenerRegistry(registryInput) {
  if (!(registryInput instanceof Map)) {
    throw new TypeError('Preload listener registry must be a Map');
  }

  return registryInput;
}

function getListenerSet(registry, key) {
  const listenerRegistry = requireListenerRegistry(registry);

  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Preload listener registry key must be a non-empty string');
  }

  const listeners = listenerRegistry.get(key);
  if (listeners instanceof Set) {
    return listeners;
  }

  const newListeners = new Set();
  listenerRegistry.set(key, newListeners);
  return newListeners;
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

export {
  createSubscription,
  createSubscriptionDisposer
};
