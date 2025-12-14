/**
 * AcquisitionContext
 *
 * Immutable context that holds device identity for stream acquisition.
 * Preserves device targeting throughout the entire acquisition lifecycle,
 * ensuring device ID cannot be accidentally lost during constraint simplification
 * or fallback operations.
 */
export class AcquisitionContext {
  #deviceId;
  #groupId;
  #profile;
  #createdAt;

  /**
   * Create an acquisition context
   * @param {Object} params - Context parameters
   * @param {string} params.deviceId - The target device ID (required)
   * @param {string|null} params.groupId - Optional group ID for device grouping
   * @param {Object} params.profile - Device profile with audio/video configurations
   */
  constructor({ deviceId, groupId = null, profile = {} }) {
    if (!deviceId) {
      throw new Error('AcquisitionContext requires deviceId');
    }

    this.#deviceId = deviceId;
    this.#groupId = groupId;
    this.#profile = Object.freeze({ ...profile });
    this.#createdAt = Date.now();

    // Make the instance immutable
    Object.freeze(this);
  }

  /**
   * Get the target device ID
   * @returns {string}
   */
  get deviceId() {
    return this.#deviceId;
  }

  /**
   * Get the group ID (if any)
   * @returns {string|null}
   */
  get groupId() {
    return this.#groupId;
  }

  /**
   * Get the frozen device profile
   * @returns {Object}
   */
  get profile() {
    return this.#profile;
  }

  /**
   * Get creation timestamp
   * @returns {number}
   */
  get createdAt() {
    return this.#createdAt;
  }

  /**
   * Get video device constraint for getUserMedia
   * Always returns exact constraint to ensure precise device targeting
   * @returns {{ exact: string }}
   */
  getDeviceConstraint() {
    return { exact: this.#deviceId };
  }

  /**
   * Get audio device constraint for getUserMedia
   * Uses groupId if available (for USB composite devices where audio/video have different deviceIds)
   * Falls back to deviceId if no groupId is set
   * @returns {{ exact: string } | { groupId: string }}
   */
  getAudioDeviceConstraint() {
    if (this.#groupId) {
      // Use groupId for audio - allows matching audio device in same USB composite device
      return { groupId: this.#groupId };
    }
    // Fallback to deviceId if no groupId (may not work for separate audio/video devices)
    return { exact: this.#deviceId };
  }

  /**
   * Check if context has audio profile
   * @returns {boolean}
   */
  hasAudioProfile() {
    return Boolean(this.#profile.audio);
  }

  /**
   * Check if context has video profile
   * @returns {boolean}
   */
  hasVideoProfile() {
    return Boolean(this.#profile.video);
  }
}
