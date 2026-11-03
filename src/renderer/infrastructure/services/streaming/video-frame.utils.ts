/** Wait for actual frame delivery; the caller's abort signal owns this startup check. */
export async function waitForVideoFrame(
  video: HTMLVideoElement,
  signal: AbortSignal,
  timeoutMs = 4000
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    let frame: number | null = null;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (frame !== null) video.cancelVideoFrameCallback(frame);
      signal.removeEventListener('abort', abort);
      if (error === undefined) resolve(); else reject(error);
    };
    const abort = () => finish(signal.reason);
    const timeout = setTimeout(() => finish(new Error('No frames received: NO_FRAMES_RECEIVED')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    try {
      frame = video.requestVideoFrameCallback(() => finish());
    } catch (error) {
      finish(error);
    }
  });
}
