import {
  createSubscription,
  createSubscriptionDisposer
} from '../subscription.factory.js';

function createWindowPreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback
}) {
  const subscriptions = [
    {
      methodName: 'onEnterFullscreen',
      channel: channels.WINDOW.ENTER_FULLSCREEN,
      registryKey: 'window.onEnterFullscreen'
    },
    {
      methodName: 'onLeaveFullscreen',
      channel: channels.WINDOW.LEAVE_FULLSCREEN,
      registryKey: 'window.onLeaveFullscreen'
    },
    {
      methodName: 'onResized',
      channel: channels.WINDOW.RESIZED,
      registryKey: 'window.onResized'
    }
  ];
  const [enterFullscreenSubscription, leaveFullscreenSubscription, resizedSubscription] = subscriptions;
  const subscribe = (subscription, callback) =>
    createSubscription({
      apiName: 'windowAPI',
      ipcRenderer,
      registry: listenerRegistry,
      maxListeners,
      validateCallback: isValidCallback,
      dispatchPayload: false,
      ...subscription
    })(callback);
  const disposeSubscriptions = createSubscriptionDisposer({
    ipcRenderer,
    registry: listenerRegistry,
    subscriptions
  });

  return {
    onEnterFullscreen: (callback) => subscribe(enterFullscreenSubscription, callback),

    onLeaveFullscreen: (callback) => subscribe(leaveFullscreenSubscription, callback),

    onResized: (callback) => subscribe(resizedSubscription, callback),

    setFullScreen: (enabled) => ipcRenderer.invoke(channels.WINDOW.SET_FULLSCREEN, enabled),

    isFullScreen: () => ipcRenderer.invoke(channels.WINDOW.IS_FULLSCREEN),

    dispose: disposeSubscriptions
  };
}

export {
  createWindowPreloadAPI
};
