const MAX_LISTENERS_PER_CHANNEL = 10;

function createListenerRegistry() {
  return {
    connected: new Set(),
    disconnected: new Set(),
    enterFullscreen: new Set(),
    leaveFullscreen: new Set(),
    resized: new Set(),
    updateAvailable: new Set(),
    updateNotAvailable: new Set(),
    updateProgress: new Set(),
    updateDownloaded: new Set(),
    updateError: new Set(),
    transcodeProgress: new Set(),
    transcodeCompleted: new Set(),
    transcodeError: new Set(),
    transcodeCancelled: new Set()
  };
}

export {
  MAX_LISTENERS_PER_CHANNEL,
  createListenerRegistry
};
