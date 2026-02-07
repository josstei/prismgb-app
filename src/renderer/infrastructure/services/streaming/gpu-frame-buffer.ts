/**
 * GpuFrameBuffer
 *
 * Manages a triple-buffer queue for GPU frame rendering.
 * Prevents frame drops by throttling submission when the queue is full.
 * Tracks metrics for performance monitoring.
 */
import type { LoggerLike } from '@shared/interfaces/infrastructure.types.js';

export class GpuFrameBuffer {
  _logger: LoggerLike;
  _capacity: number;
  _queue: Array<{ frame: unknown; enqueueTime: number }>;
  _totalEnqueued: number;
  _totalDropped: number;
  _enqueueTimes: number[];

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

  /**
   * Add a frame to the queue
   * @param {Object} frame - Frame data { imageBitmap, uniforms }
   * @returns {boolean} True if enqueued, false if dropped due to full buffer
   */
  enqueue(frame) {
    if (this._queue.length >= this._capacity) {
      this._totalDropped++;
      return false;
    }

    this._queue.push({
      frame,
      enqueueTime: performance.now()
    });
    this._totalEnqueued++;
    return true;
  }

  /**
   * Remove and return the oldest frame from the queue
   * @returns {Object|null} Frame data or null if empty
   */
  dequeue() {
    const entry = this._queue.shift();
    if (!entry) {
      return null;
    }

    // Track latency for metrics
    const latency = performance.now() - entry.enqueueTime;
    this._enqueueTimes.push(latency);

    // Keep only last 60 samples for rolling average
    if (this._enqueueTimes.length > 60) {
      this._enqueueTimes.shift();
    }

    return entry.frame;
  }

  /**
   * Check if the buffer is full
   * @returns {boolean} True if at capacity
   */
  isFull() {
    return this._queue.length >= this._capacity;
  }

  /**
   * Clear all pending frames
   */
  flush() {
    this._queue = [];
    this._logger?.debug('Frame buffer flushed');
  }

  /**
   * Get buffer metrics for performance monitoring
   * @returns {{ queued: number, dropped: number, avgLatency: number }}
   */
  getMetrics() {
    const avgLatency = this._enqueueTimes.length > 0
      ? this._enqueueTimes.reduce((a, b) => a + b, 0) / this._enqueueTimes.length
      : 0;

    return {
      queued: this._queue.length,
      dropped: this._totalDropped,
      avgLatency: Math.round(avgLatency * 100) / 100
    };
  }

  /**
   * Reset metrics counters (useful for diagnostics reset)
   */
  resetMetrics() {
    this._totalDropped = 0;
    this._enqueueTimes = [];
    this._logger?.debug('Frame buffer metrics reset');
  }
}
