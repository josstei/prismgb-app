/**
 * Stream Track Monitor
 *
 * Monitors a MediaStream's video track and invokes a callback when the track ends
 * (e.g., due to device disconnection or physical switch-off).
 */
export class StreamTrackMonitor {
  private videoTrack: MediaStreamTrack | null = null;
  private trackEndedHandler: (() => void) | null = null;

  constructor(
    private readonly logger: {
      debug(message: string, ...args: unknown[]): void;
      warn(message: string, ...args: unknown[]): void;
    }
  ) {}

  /**
   * Start monitoring the video track of the given stream
   */
  start(stream: MediaStream, onEnded: () => void): void {
    this.stop();

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      return;
    }

    this.videoTrack = videoTrack;
    this.trackEndedHandler = () => {
      this.logger.warn('Video track ended - device may have been disconnected or powered off');
      onEnded();
    };

    this.videoTrack.addEventListener('ended', this.trackEndedHandler);
    this.logger.debug('Track monitoring set up for video track');
  }

  /**
   * Stop monitoring and clean up listeners
   */
  stop(): void {
    if (this.videoTrack && this.trackEndedHandler) {
      this.videoTrack.removeEventListener('ended', this.trackEndedHandler);
      this.logger.debug('Track monitoring removed');
    }
    this.videoTrack = null;
    this.trackEndedHandler = null;
  }
}
