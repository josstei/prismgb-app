import { IConstraintBuilder } from './interfaces.js';

/**
 * ConstraintBuilder
 *
 * Builds MediaStreamConstraints from AcquisitionContext and detail level.
 * Device targeting from context is ALWAYS preserved - no code path can
 * produce `audio: true` or `video: true` (which would lose device targeting).
 *
 * Detail levels:
 * - 'full': Complete constraints with all quality settings from profile
 * - 'simple': Basic constraints with essential processing flags
 * - 'minimal': Just device targeting, no quality settings
 */
export class ConstraintBuilder extends IConstraintBuilder {
  constructor(logger = null) {
    super();
    this.logger = logger;
  }

  /**
   * Build constraints from acquisition context
   * @param {AcquisitionContext} context - Immutable acquisition context with device identity
   * @param {string} detailLevel - 'full' | 'simple' | 'minimal'
   * @param {Object} options - Additional options
   * @param {boolean} options.audio - Enable audio (default: true if profile has audio)
   * @param {boolean} options.video - Enable video (default: true if profile has video)
   * @returns {MediaStreamConstraints}
   */
  build(context, detailLevel = 'full', options = {}) {
    const videoDeviceConstraint = context.getDeviceConstraint();
    const audioDeviceConstraint = options.audioDeviceId
      ? { exact: options.audioDeviceId }
      : context.getAudioDeviceConstraint();
    const profile = context.profile;

    const constraints = {
      audio: false,
      video: false
    };

    // Build audio constraints (respecting options.audio toggle)
    // Uses separate audio device constraint (groupId for composite USB devices)
    const wantsAudio = options.audio !== false;
    if (profile.audio && wantsAudio) {
      constraints.audio = this._buildAudio(profile.audio, audioDeviceConstraint, detailLevel);
    }

    // Build video constraints (respecting options.video toggle)
    const wantsVideo = options.video !== false;
    if (profile.video && wantsVideo) {
      constraints.video = this._buildVideo(profile.video, videoDeviceConstraint, detailLevel);
    }

    this._log('debug', `Built constraints (${detailLevel})`, constraints);
    return constraints;
  }

  /**
   * Build audio constraints with device targeting always included
   * @private
   */
  _buildAudio(audioConfig, deviceConstraint, detailLevel) {
    // Device targeting is ALWAYS included
    // Handle groupId separately - it should be at top level, not nested under deviceId
    // { deviceId: { groupId: xxx } } is INVALID per MediaTrackConstraints spec
    // { groupId: xxx } or { groupId: { exact: xxx } } is the valid format
    const base = deviceConstraint.groupId
      ? { groupId: deviceConstraint.groupId }
      : { deviceId: deviceConstraint };

    switch (detailLevel) {
      case 'minimal':
        // Just device targeting, no quality settings
        return base;

      case 'simple':
        // Device targeting + basic processing flags (disabled for raw audio)
        return {
          ...base,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        };

      case 'full':
      default:
        // Full quality constraints from profile
        return {
          ...base,
          ...audioConfig
        };
    }
  }

  /**
   * Build video constraints with device targeting always included
   * @private
   */
  _buildVideo(videoConfig, deviceConstraint, detailLevel) {
    // Device targeting is ALWAYS included
    const base = { deviceId: deviceConstraint };

    switch (detailLevel) {
      case 'minimal':
        // Just device targeting, no quality settings
        return base;

      case 'simple':
        // Device targeting + basic dimensions
        return {
          ...base,
          width: this._extractIdeal(videoConfig.width),
          height: this._extractIdeal(videoConfig.height)
        };

      case 'full':
      default:
        // Full quality constraints from profile
        return {
          ...base,
          ...videoConfig
        };
    }
  }

  /**
   * Extract ideal value from constraint property
   * Handles both { exact: X }, { ideal: X }, and plain X formats
   * @private
   */
  _extractIdeal(value) {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'object') {
      return value.ideal ?? value.exact ?? value;
    }
    return value;
  }

  /**
   * @private
   */
  _log(level, message, ...args) {
    if (this.logger?.[level]) {
      this.logger[level](message, ...args);
    }
  }
}
