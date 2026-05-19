function getListenerSet(registry, key) {
  if (!registry) {
    return null;
  }

  if (typeof registry.get === 'function' && typeof registry.set === 'function') {
    if (key == null) {
      return null;
    }

    const listeners = registry.get(key);
    if (listeners instanceof Set) {
      return listeners;
    }

    const newListeners = new Set();
    registry.set(key, newListeners);
    return newListeners;
  }

  return registry;
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

    if (!listenerSet) {
      return () => {};
    }

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

export { createSubscription };
