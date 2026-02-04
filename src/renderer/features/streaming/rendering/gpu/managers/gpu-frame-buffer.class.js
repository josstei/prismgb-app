/**
 * GpuFrameBuffer
 *
 * Manages a triple-buffer queue for GPU frame rendering.
 * Prevents frame drops by throttling submission when the queue is full.
 * Tracks metrics for performance monitoring.
 */
export class GpuFrameBuffer {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.loggerFactory - Logger factory
   * @param {number} [dependencies.bufferSize=3] - Maximum pending frames (triple buffering)
   */
  constructor({ loggerFactory, bufferSize = 3 }) {
    this._logger = loggerFactory?.create('GpuFrameBuffer');
    this._capacity = bufferSize;
    this._queue = [];

    // Metrics
    this._totalEnqueued = 0;
    this._totalDropped = 0;
    this._enqueueTimes = [];
  }

  /**
   * Get buffer capacity
   * @returns {number}
   */
  getCapacity() {
    return this._capacity;
  }

  /**
   * Get current queue size
   * @returns {number}
   */
  getSize() {
    return this._queue.length;
  }
}
