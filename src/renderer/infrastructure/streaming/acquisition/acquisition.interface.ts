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
  async acquireStream(constraints, _options = {}): Promise<MediaStream> {
    throw new Error('acquireStream() must be implemented');
  }

  /**
   * Release a media stream and stop all tracks
   * @param {MediaStream} _stream - Stream to release
   * @returns {Promise<void>}
   */
  async releaseStream(_stream): Promise<void> {
    throw new Error('releaseStream() must be implemented');
  }

  /**
   * Get information about a stream
   * @param {MediaStream} _stream - Stream to inspect
   * @returns {Object} Stream information
   */
  getStreamInfo(_stream): Record<string, unknown> {
    throw new Error('getStreamInfo() must be implemented');
  }

  /**
   * Check if a stream is active
   * @param {MediaStream} _stream - Stream to check
   * @returns {boolean} Whether stream is active
   */
  isStreamActive(_stream): boolean {
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
  build(context, _detailLevel = 'full', _options = {}): MediaStreamConstraints {
    throw new Error('build() must be implemented');
  }
}
