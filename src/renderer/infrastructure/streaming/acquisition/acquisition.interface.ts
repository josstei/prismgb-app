import type { AcquisitionContextLike, AcquisitionOptions } from './acquisition.types';

/**
 * Interface for managing MediaStream lifecycle
 * Provides consistent stream acquisition, release, and tracking
 */
export class IStreamLifecycle {

  /**
   * Acquire a media stream with given constraints
   * @param {Object} constraints - MediaStreamConstraints
   * @param {Object} _options - Additional acquisition options
   * @returns {Promise<MediaStream>} Acquired stream
   */
  async acquireStream(_constraints: MediaStreamConstraints, _options: Record<string, unknown> = {}): Promise<MediaStream> {
    throw new Error('acquireStream() must be implemented');
  }

  /**
   * Release a media stream and stop all tracks
   * @param {MediaStream} _stream - Stream to release
   * @returns {Promise<void>}
   */
  async releaseStream(_stream: MediaStream): Promise<void> {
    throw new Error('releaseStream() must be implemented');
  }

  /**
   * Get information about a stream
   * @param {MediaStream} _stream - Stream to inspect
   * @returns {Object} Stream information
   */
  getStreamInfo(_stream: MediaStream): Record<string, unknown> | null {
    throw new Error('getStreamInfo() must be implemented');
  }

  /**
   * Check if a stream is active
   * @param {MediaStream} _stream - Stream to check
   * @returns {boolean} Whether stream is active
   */
  isStreamActive(_stream: MediaStream): boolean {
    throw new Error('isStreamActive() must be implemented');
  }

  /**
   * Get all currently tracked streams
   * @returns {Array<MediaStream>} Active streams
   */
  getActiveStreams(): MediaStream[] {
    throw new Error('getActiveStreams() must be implemented');
  }

  /**
   * Release all active streams
   * @returns {Promise<void>}
   */
  async releaseAll(): Promise<void> {
    throw new Error('releaseAll() must be implemented');
  }
}

/**
 * Interface for building media constraints for WebRTC streams
 * Implementations build constraints from AcquisitionContext with device targeting
 * always preserved - no code path should produce `audio: true` or `video: true`
 */
export class IConstraintBuilder {

  /**
   * Build media constraints from acquisition context
   * @param {AcquisitionContext} context - Immutable acquisition context with device identity
   * @param {string} _detailLevel - 'full' | 'simple' | 'minimal'
   * @param {Object} _options - Additional options (audio/video toggles)
   * @returns {MediaStreamConstraints} WebRTC constraints with device targeting preserved
   */
  build(_context: AcquisitionContextLike, _detailLevel = 'full', _options: AcquisitionOptions = {}): MediaStreamConstraints {
    throw new Error('build() must be implemented');
  }
}
