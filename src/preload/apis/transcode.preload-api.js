import {
  createSubscription,
  createSubscriptionDisposer
} from '../subscription.factory.js';

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
  const subscriptions = [
    {
      methodName: 'onProgress',
      channel: channels.TRANSCODE.PROGRESS,
      registryKey: 'transcode.onProgress',
      validatePayload: isValidTranscodeProgress,
      invalidPayloadMessage: 'transcodeAPI.onProgress: Invalid progress received'
    },
    {
      methodName: 'onCompleted',
      channel: channels.TRANSCODE.COMPLETED,
      registryKey: 'transcode.onCompleted',
      validatePayload: isValidTranscodeResult,
      invalidPayloadMessage: 'transcodeAPI.onCompleted: Invalid result received'
    },
    {
      methodName: 'onError',
      channel: channels.TRANSCODE.ERROR,
      registryKey: 'transcode.onError',
      validatePayload: isValidError,
      invalidPayloadMessage: 'transcodeAPI.onError: Invalid error received'
    },
    {
      methodName: 'onCancelled',
      channel: channels.TRANSCODE.CANCELLED,
      registryKey: 'transcode.onCancelled',
      validatePayload: isValidCancelledData,
      invalidPayloadMessage: 'transcodeAPI.onCancelled: Invalid data received'
    }
  ];
  const [
    progressSubscription,
    completedSubscription,
    errorSubscription,
    cancelledSubscription
  ] = subscriptions;
  const subscribe = (subscription, callback) =>
    createSubscription({
      apiName: 'transcodeAPI',
      ipcRenderer,
      registry: listenerRegistry,
      maxListeners,
      validateCallback: isValidCallback,
      ...subscription
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
      return ipcRenderer.invoke(channels.TRANSCODE.START, {
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
      return ipcRenderer.invoke(channels.TRANSCODE.CANCEL, { jobId });
    },

    getStatus: () => ipcRenderer.invoke(channels.TRANSCODE.GET_STATUS),

    onProgress: (callback) => subscribe(progressSubscription, callback),

    onCompleted: (callback) => subscribe(completedSubscription, callback),

    onError: (callback) => subscribe(errorSubscription, callback),

    onCancelled: (callback) => subscribe(cancelledSubscription, callback),

    dispose: disposeSubscriptions
  };
}

export {
  createTranscodePreloadAPI
};
