function createSubscription({
  apiName,
  methodName,
  channel,
  ipcRenderer,
  registry,
  maxListeners,
  validateCallback,
  validatePayload,
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

    if (registry.size >= maxListeners) {
      console.warn(listenerLimitMessage);
      return () => {};
    }

    const listener = (event, payload) => {
      if (validatePayload && !validatePayload(payload)) {
        console.warn(invalidPayloadMessage);
        return;
      }
      callback(mapPayload(payload, event));
    };

    registry.add(listener);
    ipcRenderer.on(channel, listener);

    return () => {
      ipcRenderer.removeListener(channel, listener);
      registry.delete(listener);
    };
  };
}

export { createSubscription };

