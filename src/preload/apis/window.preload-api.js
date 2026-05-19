import { createSubscription } from '../subscription.factory.js';

function createWindowPreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const listenerKeys = {
    onEnterFullscreen: 'window.onEnterFullscreen',
    onLeaveFullscreen: 'window.onLeaveFullscreen',
    onResized: 'window.onResized'
  };

  const disposeListenersForKey = (channel, registryKey) => {
    const listeners = listenerRegistry.get(registryKey);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      ipcRenderer.removeListener(channel, listener);
    }
    listeners.clear();
  };

  return {
    onEnterFullscreen: (callback) =>
      createSubscription({
        apiName: 'windowAPI',
        methodName: 'onEnterFullscreen',
        channel: channels.WINDOW.ENTER_FULLSCREEN,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onEnterFullscreen,
        maxListeners,
        validateCallback: isValidCallback,
        dispatchPayload: false
      })(callback),

    onLeaveFullscreen: (callback) =>
      createSubscription({
        apiName: 'windowAPI',
        methodName: 'onLeaveFullscreen',
        channel: channels.WINDOW.LEAVE_FULLSCREEN,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onLeaveFullscreen,
        maxListeners,
        validateCallback: isValidCallback,
        dispatchPayload: false
      })(callback),

    onResized: (callback) =>
      createSubscription({
        apiName: 'windowAPI',
        methodName: 'onResized',
        channel: channels.WINDOW.RESIZED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onResized,
        maxListeners,
        validateCallback: isValidCallback,
        dispatchPayload: false
      })(callback),

    setFullScreen: (enabled) => ipcRenderer.invoke(channels.WINDOW.SET_FULLSCREEN, enabled),

    isFullScreen: () => ipcRenderer.invoke(channels.WINDOW.IS_FULLSCREEN),

    dispose: () => {
      disposeListenersForKey(channels.WINDOW.ENTER_FULLSCREEN, listenerKeys.onEnterFullscreen);
      disposeListenersForKey(channels.WINDOW.LEAVE_FULLSCREEN, listenerKeys.onLeaveFullscreen);
      disposeListenersForKey(channels.WINDOW.RESIZED, listenerKeys.onResized);
    }
  };
}

export {
  createWindowPreloadAPI
};
