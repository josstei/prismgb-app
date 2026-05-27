import type {
  LoggerFactoryLike,
  LoggerLike
} from '@shared/interfaces/infrastructure.types.js';

type BufferedFrame = {
  frame: unknown;
  enqueueTime: number;
};

type GpuFrameBufferDependencies = {
  loggerFactory?: LoggerFactoryLike;
  bufferSize?: number;
};

export class GpuFrameBuffer {
  _logger: LoggerLike | undefined;
  _capacity: number;
  _queue: BufferedFrame[];
  _totalEnqueued: number;
  _totalDropped: number;
  _enqueueTimes: number[];

  constructor({ loggerFactory, bufferSize = 3 }: GpuFrameBufferDependencies = {}) {
    this._logger = loggerFactory?.create('GpuFrameBuffer');
    this._capacity = bufferSize;
    this._queue = [];

    this._totalEnqueued = 0;
    this._totalDropped = 0;
    this._enqueueTimes = [];
  }

  getCapacity(): number {
    return this._capacity;
  }

  getSize(): number {
    return this._queue.length;
  }

  enqueue(frame: unknown): boolean {
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

  dequeue(): unknown | null {
    const entry = this._queue.shift();
    if (!entry) {
      return null;
    }

    const latency = performance.now() - entry.enqueueTime;
    this._enqueueTimes.push(latency);

    if (this._enqueueTimes.length > 60) {
      this._enqueueTimes.shift();
    }

    return entry.frame;
  }

  isFull(): boolean {
    return this._queue.length >= this._capacity;
  }

  flush(): void {
    this._queue = [];
    this._logger?.debug('Frame buffer flushed');
  }

  getMetrics(): { queued: number; dropped: number; avgLatency: number } {
    const avgLatency = this._enqueueTimes.length > 0
      ? this._enqueueTimes.reduce((a, b) => a + b, 0) / this._enqueueTimes.length
      : 0;

    return {
      queued: this._queue.length,
      dropped: this._totalDropped,
      avgLatency: Math.round(avgLatency * 100) / 100
    };
  }

  resetMetrics(): void {
    this._totalDropped = 0;
    this._enqueueTimes = [];
    this._logger?.debug('Frame buffer metrics reset');
  }
}
