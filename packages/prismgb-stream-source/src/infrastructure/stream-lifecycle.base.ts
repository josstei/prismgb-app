import type { LoggerLike } from '@prismgb/core';

import { IStreamLifecycle } from '../domain/acquisition.interface';

type MediaServiceLike = {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
};

/**
 * Base implementation of stream lifecycle management
 */
export class BaseStreamLifecycle extends IStreamLifecycle {
  logger: LoggerLike | null;
  mediaService: MediaServiceLike | null;
  activeStreams: Set<MediaStream>;

  /**
   * @param {Object} logger - Optional logger instance
   * @param {Object} mediaService - Optional media service (BrowserMediaAdapter or compatible)
   */
  constructor(logger: LoggerLike | null = null, mediaService: MediaServiceLike | null = null) {
    super();
    this.logger = logger;
    this.mediaService = mediaService;
    this.activeStreams = new Set();
  }

  /**
   * Acquire a media stream
   */
  async acquireStream(constraints: MediaStreamConstraints, _options: Record<string, unknown> = {}) {
    try {
      this._log('debug', 'Acquiring stream with constraints:', constraints);

      // Use injected mediaService if available, fallback to direct navigator access
      const stream = this.mediaService
        ? await this.mediaService.getUserMedia(constraints)
        : await navigator.mediaDevices.getUserMedia(constraints);

      // Validate stream has tracks before tracking
      if (!stream || !stream.getTracks || stream.getTracks().length === 0) {
        throw new Error('Invalid stream: no tracks available');
      }

      // Validate stream is active
      if (!stream.active) {
        this._log('warn', 'Acquired stream is not active');
      }

      this.activeStreams.add(stream);
      this._log('info', 'Stream acquired successfully', {
        id: stream.id,
        tracks: stream.getTracks().length,
        active: stream.active
      });

      return stream;
    } catch (error) {
      const err = error as { name?: string; message?: string };
      const errLabel = `${err.name || 'Error'}: ${err.message || 'Unknown error'}`;
      const constraintsStr = this._safeStringify(constraints);
      const supportedStr = this._safeStringify(
        this.mediaService
          ? 'Using injected mediaService'
          : navigator.mediaDevices?.getSupportedConstraints?.()
      );
      this._log('error', `Failed to acquire stream - ${errLabel} | constraints=${constraintsStr} | supported=${supportedStr}`);
      throw error;
    }
  }

  /**
   * Release a stream and stop all tracks
   * Uses per-track try-catch to ensure all tracks are attempted even if one fails
   */
  async releaseStream(stream: MediaStream) {
    if (!stream) {
      this._log('warn', 'Attempted to release null stream');
      return;
    }

    const tracks = stream.getTracks();
    const errors = [];

    for (const track of tracks) {
      try {
        track.stop();
        this._log('debug', 'Stopped track:', track.kind, track.label);
      } catch (error) {
        this._log('error', `Error stopping track ${track.kind}:`, error);
        errors.push({ track: track.kind, error });
      }
    }

    this.activeStreams.delete(stream);

    if (errors.length > 0) {
      this._log('warn', `Stream released with ${errors.length} track error(s)`);
    } else {
      this._log('info', 'Stream released successfully');
    }
  }

  /**
   * Get stream information
   */
  getStreamInfo(stream: MediaStream) {
    if (!stream) return null;

    interface TrackInfo {
      kind: string;
      label: string;
      enabled: boolean;
      muted: boolean;
      readyState: string;
      settings: MediaTrackSettings;
    }

    const info: { id: string; active: boolean; tracks: TrackInfo[] } = {
      id: stream.id,
      active: stream.active,
      tracks: []
    };

    stream.getTracks().forEach((track: MediaStreamTrack) => {
      const settings = track.getSettings();
      info.tracks.push({
        kind: track.kind,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings
      });
    });

    return info;
  }

  /**
   * Check if a specific stream is currently active
   * @param {MediaStream} stream - The stream to check
   * @returns {boolean} True if stream is active
   */
  isStreamActive(stream: MediaStream) {
    return this.activeStreams.has(stream);
  }

  /**
   * Get all currently active streams
   * @returns {MediaStream[]} Array of active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams);
  }

  /**
   * Release all active streams
   * @returns {Promise<void>}
   */
  async releaseAll() {
    const streams = Array.from(this.activeStreams);
    if (streams.length === 0) return;

    const results = await Promise.allSettled(
      streams.map(stream => this.releaseStream(stream))
    );

    if (results.some(result => result.status === 'rejected')) {
      this._log('warn', 'One or more streams failed to release');
    }
  }

  _log(level: keyof LoggerLike, message: string, ...args: unknown[]) {
    if (this.logger?.[level]) {
      this.logger[level](message, ...args);
    }
  }

  _safeStringify(obj: unknown) {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }
}
