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

    onProgress: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('transcodeAPI.onProgress: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.transcodeProgress.size >= maxListeners) {
        console.warn('transcodeAPI.onProgress: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, progress) => {
        if (!isValidTranscodeProgress(progress)) {
          console.warn('transcodeAPI.onProgress: Invalid progress received');
          return;
        }
        callback(progress);
      };
      listenerRegistry.transcodeProgress.add(listener);
      ipcRenderer.on(channels.TRANSCODE.PROGRESS, listener);

      return () => {
        ipcRenderer.removeListener(channels.TRANSCODE.PROGRESS, listener);
        listenerRegistry.transcodeProgress.delete(listener);
      };
    },

    onCompleted: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('transcodeAPI.onCompleted: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.transcodeCompleted.size >= maxListeners) {
        console.warn('transcodeAPI.onCompleted: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, result) => {
        if (!isValidTranscodeResult(result)) {
          console.warn('transcodeAPI.onCompleted: Invalid result received');
          return;
        }
        callback(result);
      };
      listenerRegistry.transcodeCompleted.add(listener);
      ipcRenderer.on(channels.TRANSCODE.COMPLETED, listener);

      return () => {
        ipcRenderer.removeListener(channels.TRANSCODE.COMPLETED, listener);
        listenerRegistry.transcodeCompleted.delete(listener);
      };
    },

    onError: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('transcodeAPI.onError: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.transcodeError.size >= maxListeners) {
        console.warn('transcodeAPI.onError: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, error) => {
        if (!isValidError(error)) {
          console.warn('transcodeAPI.onError: Invalid error received');
          return;
        }
        callback(error);
      };
      listenerRegistry.transcodeError.add(listener);
      ipcRenderer.on(channels.TRANSCODE.ERROR, listener);

      return () => {
        ipcRenderer.removeListener(channels.TRANSCODE.ERROR, listener);
        listenerRegistry.transcodeError.delete(listener);
      };
    },

    onCancelled: (callback) => {
      if (!isValidCallback(callback)) {
        console.warn('transcodeAPI.onCancelled: Invalid callback provided');
        return () => {};
      }

      if (listenerRegistry.transcodeCancelled.size >= maxListeners) {
        console.warn('transcodeAPI.onCancelled: Maximum listener limit reached');
        return () => {};
      }

      const listener = (event, data) => {
        if (!data || typeof data !== 'object') {
          console.warn('transcodeAPI.onCancelled: Invalid data received');
          return;
        }
        callback(data);
      };
      listenerRegistry.transcodeCancelled.add(listener);
      ipcRenderer.on(channels.TRANSCODE.CANCELLED, listener);

      return () => {
        ipcRenderer.removeListener(channels.TRANSCODE.CANCELLED, listener);
        listenerRegistry.transcodeCancelled.delete(listener);
      };
    },

    removeListeners: () => {
      ipcRenderer.removeAllListeners(channels.TRANSCODE.PROGRESS);
      ipcRenderer.removeAllListeners(channels.TRANSCODE.COMPLETED);
      ipcRenderer.removeAllListeners(channels.TRANSCODE.ERROR);
      ipcRenderer.removeAllListeners(channels.TRANSCODE.CANCELLED);
      listenerRegistry.transcodeProgress.clear();
      listenerRegistry.transcodeCompleted.clear();
      listenerRegistry.transcodeError.clear();
      listenerRegistry.transcodeCancelled.clear();
    }
  };
}

export {
  createTranscodePreloadAPI
};
