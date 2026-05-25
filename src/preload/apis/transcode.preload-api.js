import { applyRequiredSubscriptionMetadata, createManifestInvokeSet, createManifestSubscriptionSet, createSubscription, createSubscriptionDisposer, requireSubscriptionMethod } from '../subscription.factory.js';

function createTranscodePreloadAPI({
  ipcRenderer,
  channels,
  listenerRegistry,
  maxListeners,
  isValidCallback,
  isValidError,
  isValidTranscodeProgress,
  isValidTranscodeResult,
  isValidTranscodeParams,
  isValidFfmpegArgs
}) {
  const isValidCancelledData = (data) => data && typeof data === 'object';
  const localValidators = {
    onProgress: {
      validatePayload: isValidTranscodeProgress,
      invalidPayloadMessage: 'transcodeAPI.onProgress: Invalid progress received'
    },
    onCompleted: {
      validatePayload: isValidTranscodeResult,
      invalidPayloadMessage: 'transcodeAPI.onCompleted: Invalid result received'
    },
    onError: {
      validatePayload: isValidError,
      invalidPayloadMessage: 'transcodeAPI.onError: Invalid error received'
    },
    onCancelled: {
      validatePayload: isValidCancelledData,
      invalidPayloadMessage: 'transcodeAPI.onCancelled: Invalid data received'
    }
  };
  const { subscriptions: manifestSubscriptions } = createManifestSubscriptionSet('transcodeAPI');
  const invokeSet = createManifestInvokeSet('transcodeAPI', channels).requireMethod, startChannel = invokeSet('start'), cancelChannel = invokeSet('cancel'), getStatusChannel = invokeSet('getStatus');
  const subscriptions = applyRequiredSubscriptionMetadata('transcodeAPI', manifestSubscriptions, localValidators);
  const subscriptionsByMethod = Object.fromEntries(
    subscriptions.map((subscription) => [subscription.methodName, subscription])
  );
  const subscribe = (methodName, callback) =>
    createSubscription({
      ipcRenderer,
      registry: listenerRegistry,
      maxListeners,
      validateCallback: isValidCallback,
      ...requireSubscriptionMethod('transcodeAPI', subscriptionsByMethod, methodName)
    })(callback);
  const disposeSubscriptions = createSubscriptionDisposer({
    ipcRenderer,
    registry: listenerRegistry,
    subscriptions
  });

  return {
    start: (arrayBuffer, format, outputFilename, options = {}) => {
      if (!isValidTranscodeParams(arrayBuffer, format)) {
        console.warn('transcodeAPI.start: Invalid parameters provided');
        return Promise.resolve({ success: false, error: 'Invalid parameters' });
      }
      if (options?.inputArgs && !isValidFfmpegArgs(options.inputArgs)) {
        console.warn('transcodeAPI.start: Invalid input arguments provided');
        return Promise.resolve({ success: false, error: 'Invalid input arguments' });
      }
      return ipcRenderer.invoke(startChannel, {
        inputBuffer: arrayBuffer,
        format,
        outputFilename: typeof outputFilename === 'string' ? outputFilename : undefined,
        inputArgs: options?.inputArgs,
        interrupted: Boolean(options?.interrupted)
      });
    },

    cancel: (jobId) => {
      if (typeof jobId !== 'string' || jobId.length === 0) {
        console.warn('transcodeAPI.cancel: Invalid jobId provided');
        return Promise.resolve({ success: false, error: 'Invalid jobId' });
      }
      return ipcRenderer.invoke(cancelChannel, { jobId });
    },

    getStatus: () => ipcRenderer.invoke(getStatusChannel),

    onProgress: (callback) => subscribe('onProgress', callback),

    onCompleted: (callback) => subscribe('onCompleted', callback),

    onError: (callback) => subscribe('onError', callback),

    onCancelled: (callback) => subscribe('onCancelled', callback),

    dispose: disposeSubscriptions
  };
}

export {
  createTranscodePreloadAPI
};
