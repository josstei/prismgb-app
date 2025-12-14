/**
 * Browser APIs Service - Abstraction for window/document APIs
 *
 * Provides a testable interface for browser-specific APIs.
 * Allows mocking in tests and centralizes browser API access.
 */
export class BrowserAPIsService {
  /**
   * Request animation frame
   * @param {FrameRequestCallback} callback - Animation callback
   * @returns {number} Animation frame handle
   */
  requestAnimationFrame(callback) {
    return window.requestAnimationFrame(callback);
  }
}
