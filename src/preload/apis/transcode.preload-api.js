import { createSubscription } from '../subscription.factory.js';

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
  const listenerKeys = {
    onProgress: 'transcode.onProgress',
    onCompleted: 'transcode.onCompleted',
    onError: 'transcode.onError',
    onCancelled: 'transcode.onCancelled'
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

    onProgress: (callback) =>
      createSubscription({
        apiName: 'transcodeAPI',
        methodName: 'onProgress',
        channel: channels.TRANSCODE.PROGRESS,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onProgress,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidTranscodeProgress,
        invalidPayloadMessage: 'transcodeAPI.onProgress: Invalid progress received'
      })(callback),

    onCompleted: (callback) =>
      createSubscription({
        apiName: 'transcodeAPI',
        methodName: 'onCompleted',
        channel: channels.TRANSCODE.COMPLETED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onCompleted,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidTranscodeResult,
        invalidPayloadMessage: 'transcodeAPI.onCompleted: Invalid result received'
      })(callback),

    onError: (callback) =>
      createSubscription({
        apiName: 'transcodeAPI',
        methodName: 'onError',
        channel: channels.TRANSCODE.ERROR,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onError,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidError,
        invalidPayloadMessage: 'transcodeAPI.onError: Invalid error received'
      })(callback),

    onCancelled: (callback) =>
      createSubscription({
        apiName: 'transcodeAPI',
        methodName: 'onCancelled',
        channel: channels.TRANSCODE.CANCELLED,
        ipcRenderer,
        registry: listenerRegistry,
        registryKey: listenerKeys.onCancelled,
        maxListeners,
        validateCallback: isValidCallback,
        validatePayload: isValidCancelledData,
        invalidPayloadMessage: 'transcodeAPI.onCancelled: Invalid data received'
      })(callback),

    dispose: () => {
      disposeListenersForKey(channels.TRANSCODE.PROGRESS, listenerKeys.onProgress);
      disposeListenersForKey(channels.TRANSCODE.COMPLETED, listenerKeys.onCompleted);
      disposeListenersForKey(channels.TRANSCODE.ERROR, listenerKeys.onError);
      disposeListenersForKey(channels.TRANSCODE.CANCELLED, listenerKeys.onCancelled);
    }
  };
}

export {
  createTranscodePreloadAPI
};
