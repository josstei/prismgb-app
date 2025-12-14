/**
 * GPU Rendering Optimization Utilities
 *
 * Performance optimization classes for the render worker.
 * These utilities reduce per-frame overhead through caching,
 * pooling, and change tracking.
 */

/**
 * BindGroupCache - Caches GPU bind groups to avoid per-frame recreation
 *
 * Bind group creation is expensive (GPU driver calls). Since bind group
 * entries rarely change (only uniform buffer contents change), we can
 * cache and reuse them.
 */
export class BindGroupCache {
  constructor() {
    this._cache = new Map();
    this._version = 0;
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Generate cache key for bind group
   * @param {string} pipelineLabel - Pipeline identifier
   * @param {string} textureLabel - Input texture label
   * @returns {string} Cache key
   */
  _generateKey(pipelineLabel, textureLabel) {
    return `${pipelineLabel}:${textureLabel}:v${this._version}`;
  }

  /**
   * Get or create bind group
   * @param {GPUDevice} device
   * @param {GPURenderPipeline} pipeline
   * @param {GPUBuffer} uniformBuffer
   * @param {GPUTexture} inputTexture
   * @param {GPUSampler} sampler
   * @returns {GPUBindGroup}
   */
  getOrCreate(device, pipeline, uniformBuffer, inputTexture, sampler) {
    const key = this._generateKey(pipeline.label, inputTexture.label);

    if (!this._cache.has(key)) {
      const bindGroup = device.createBindGroup({
        label: `Cached ${pipeline.label} BindGroup`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: inputTexture.createView() },
          { binding: 2, resource: sampler }
        ]
      });
      this._cache.set(key, bindGroup);
      this._misses++;
      return bindGroup;
    }

    this._hits++;
    return this._cache.get(key);
  }

  /**
   * Invalidate cache (call on resize/texture recreation)
   */
  invalidate() {
    this._cache.clear();
    this._version++;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this._hits + this._misses;
    return {
      size: this._cache.size,
      version: this._version,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? (this._hits / total * 100).toFixed(1) : '0'
    };
  }

  /**
   * Reset statistics (for benchmarking)
   */
  resetStats() {
    this._hits = 0;
    this._misses = 0;
  }
}

/**
 * TypedArrayPool - Pre-allocates and reuses TypedArrays to eliminate GC pressure
 *
 * Uses round-robin allocation to support triple-buffered rendering scenarios.
 */
export class TypedArrayPool {
  constructor(poolDepth = 3, prewarmSizes = [4, 6, 8, 16, 32]) {
    this._poolDepth = poolDepth;
    this._float32Pools = new Map();
    this._allocations = 0;
    this._reuses = 0;

    // Pre-warm pools with common sizes
    prewarmSizes.forEach(size => this._ensurePool(size));
  }

  /**
   * Ensure a pool exists for the given size
   * @private
   */
  _ensurePool(size) {
    if (!this._float32Pools.has(size)) {
      const arrays = [];
      for (let i = 0; i < this._poolDepth; i++) {
        arrays.push(new Float32Array(size));
      }
      this._float32Pools.set(size, { arrays, index: 0 });
      this._allocations += this._poolDepth;
    }
  }

  /**
   * Get a Float32Array from the pool
   * @param {number} size - Required array length
   * @returns {Float32Array} Pooled array
   */
  getFloat32(size) {
    this._ensurePool(size);

    const pool = this._float32Pools.get(size);
    const array = pool.arrays[pool.index];
    pool.index = (pool.index + 1) % this._poolDepth;
    this._reuses++;

    return array;
  }

  /**
   * Get a Float32Array and populate it with values
   * @param {number[]} values - Values to set
   * @returns {Float32Array} Pooled array with values set
   */
  getFloat32WithValues(values) {
    const array = this.getFloat32(values.length);
    array.set(values);
    return array;
  }

  /**
   * Get pool statistics
   */
  getStats() {
    let totalArrays = 0;
    let totalBytes = 0;

    this._float32Pools.forEach((pool, size) => {
      totalArrays += pool.arrays.length;
      totalBytes += size * 4 * pool.arrays.length; // 4 bytes per float32
    });

    return {
      poolCount: this._float32Pools.size,
      totalArrays,
      totalBytes,
      totalKB: (totalBytes / 1024).toFixed(2),
      allocations: this._allocations,
      reuses: this._reuses,
      reuseRatio: this._allocations > 0 ? (this._reuses / this._allocations).toFixed(1) : '0'
    };
  }

  /**
   * Reset statistics (for benchmarking)
   */
  resetStats() {
    this._allocations = 0;
    this._reuses = 0;
  }
}

/**
 * UniformTracker - Tracks changes to uniform values to avoid redundant GPU writes
 *
 * Uses FNV-1a hashing for fast change detection.
 */
export class UniformTracker {
  constructor() {
    this._hashes = new Map();
    this._checks = 0;
    this._skips = 0;
    this._writes = 0;
  }

  /**
   * FNV-1a hash for Float32Array
   * @param {Float32Array} data
   * @returns {number} 32-bit hash
   */
  _hashFloat32Array(data) {
    let hash = 2166136261; // FNV offset basis
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = Math.imul(hash, 16777619); // FNV prime
    }

    return hash >>> 0; // Ensure unsigned
  }

  /**
   * Check if uniform data has changed
   * @param {string} name - Uniform buffer name
   * @param {Float32Array} data - New data to check
   * @returns {boolean} True if data changed and should be uploaded
   */
  hasChanged(name, data) {
    this._checks++;
    const newHash = this._hashFloat32Array(data);
    const oldHash = this._hashes.get(name);

    if (oldHash === newHash) {
      this._skips++;
      return false;
    }

    this._hashes.set(name, newHash);
    this._writes++;
    return true;
  }

  /**
   * Force invalidation of a specific uniform
   * @param {string} name - Uniform buffer name
   */
  invalidate(name) {
    this._hashes.delete(name);
  }

  /**
   * Invalidate all tracked uniforms
   */
  invalidateAll() {
    this._hashes.clear();
  }

  /**
   * Get tracking statistics
   */
  getStats() {
    return {
      trackedUniforms: this._hashes.size,
      checks: this._checks,
      skips: this._skips,
      writes: this._writes,
      skipRate: this._checks > 0 ? (this._skips / this._checks * 100).toFixed(1) : '0'
    };
  }

  /**
   * Reset statistics (for benchmarking)
   */
  resetStats() {
    this._checks = 0;
    this._skips = 0;
    this._writes = 0;
  }
}

/**
 * CaptureBufferManager - Lazy capture buffer to avoid per-frame ImageBitmap creation
 *
 * Only captures frames when explicitly requested, reducing overhead from
 * ~0.5-1ms per frame to only when screenshots are needed.
 */
export class CaptureBufferManager {
  constructor() {
    this._captureRequested = false;
    this._capturedFrame = null;
    this._canvas = null;
    this._captureCount = 0;
    this._lazyCaptures = 0;
  }

  initialize(canvasRef) {
    this._canvas = canvasRef;
  }

  /**
   * Mark that a capture is requested - next frame will be buffered
   */
  requestCapture() {
    this._captureRequested = true;
  }

  /**
   * Called after each frame render - only captures if previously requested
   * @returns {Promise<void>}
   */
  async onFrameRendered() {
    if (!this._captureRequested || !this._canvas) {
      return;
    }

    // Close previous capture if exists
    if (this._capturedFrame) {
      this._capturedFrame.close();
    }

    // Capture current frame
    this._capturedFrame = await createImageBitmap(this._canvas);
    this._captureRequested = false;
    this._lazyCaptures++;
  }

  /**
   * Check if a captured frame is ready
   * @returns {boolean}
   */
  hasCapturedFrame() {
    return this._capturedFrame !== null;
  }

  /**
   * Get the captured frame (transfers ownership)
   * @returns {ImageBitmap|null}
   */
  getCapturedFrame() {
    const frame = this._capturedFrame;
    this._capturedFrame = null;
    if (frame) this._captureCount++;
    return frame;
  }

  /**
   * Get capture statistics
   */
  getStats() {
    return {
      captureCount: this._captureCount,
      lazyCaptures: this._lazyCaptures,
      hasPendingCapture: this._captureRequested,
      hasBufferedFrame: this._capturedFrame !== null
    };
  }

  hasPendingCapture() {
    return this._captureRequested;
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this._capturedFrame) {
      this._capturedFrame.close();
      this._capturedFrame = null;
    }
    this._canvas = null;
    this._captureRequested = false;
  }
}

/**
 * ShaderProgram - WebGL2 shader program with cached uniform locations
 *
 * Eliminates per-frame getUniformLocation string lookups.
 */
export class ShaderProgram {
  constructor(gl, vertexSource, fragmentSource, label = 'ShaderProgram') {
    this.gl = gl;
    this.label = label;
    this.program = this._compile(vertexSource, fragmentSource);
    this.uniformLocations = new Map();
    this._uniformCalls = 0;
    this._cacheHits = 0;

    this._cacheUniformLocations();
  }

  _compile(vertexSource, fragmentSource) {
    const gl = this.gl;

    const vertexShader = this._compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`[${this.label}] Shader link error: ${error}`);
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`[${this.label}] Shader compile error: ${error}`);
    }

    return shader;
  }

  _cacheUniformLocations() {
    const gl = this.gl;
    const numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);

    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(this.program, i);
      const location = gl.getUniformLocation(this.program, info.name);
      this.uniformLocations.set(info.name, location);
    }
  }

  use() {
    this.gl.useProgram(this.program);
  }

  getUniformLocation(name) {
    this._uniformCalls++;
    if (this.uniformLocations.has(name)) {
      this._cacheHits++;
    }
    return this.uniformLocations.get(name) ?? null;
  }

  setUniform1i(name, value) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform1i(loc, value);
  }

  setUniform1f(name, value) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform1f(loc, value);
  }

  setUniform2f(name, x, y) {
    const loc = this.getUniformLocation(name);
    if (loc !== null) this.gl.uniform2f(loc, x, y);
  }

  /**
   * Get shader program statistics
   */
  getStats() {
    return {
      cachedLocations: this.uniformLocations.size,
      uniformCalls: this._uniformCalls,
      cacheHits: this._cacheHits,
      hitRate: this._uniformCalls > 0 ? (this._cacheHits / this._uniformCalls * 100).toFixed(1) : '0'
    };
  }

  destroy() {
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
    this.uniformLocations.clear();
  }
}

/**
 * PerformanceMetrics - Accurate CPU and memory measurement utility
 *
 * Provides detailed performance metrics using the Performance API.
 * Tracks frame timing, memory usage, and optimization effectiveness.
 */
export class PerformanceMetrics {
  constructor() {
    this._frameTimings = [];
    this._maxSamples = 60; // 1 second at 60fps
    this._lastReportTime = performance.now();
    this._reportIntervalMs = 1000;

    // Optimization tracking
    this._bindGroupCacheHits = 0;
    this._bindGroupCacheMisses = 0;
    this._uniformWritesSkipped = 0;
    this._uniformWritesPerformed = 0;

    // Phase timing (microsecond precision)
    this._phaseTimes = {
      upload: [],
      render: [],
      capture: [],
      total: []
    };
  }

  /**
   * Start timing a phase
   * @returns {number} Start timestamp
   */
  startPhase() {
    return performance.now();
  }

  /**
   * End timing a phase and record it
   * @param {string} phase - Phase name (upload, render, capture, total)
   * @param {number} startTime - Start timestamp from startPhase()
   */
  endPhase(phase, startTime) {
    const duration = performance.now() - startTime;
    if (this._phaseTimes[phase]) {
      this._phaseTimes[phase].push(duration);
      if (this._phaseTimes[phase].length > this._maxSamples) {
        this._phaseTimes[phase].shift();
      }
    }
  }

  /**
   * Record a cache hit/miss for bind groups
   */
  recordBindGroupCacheHit() {
    this._bindGroupCacheHits++;
  }

  recordBindGroupCacheMiss() {
    this._bindGroupCacheMisses++;
  }

  /**
   * Record uniform write skip/perform
   */
  recordUniformSkipped() {
    this._uniformWritesSkipped++;
  }

  recordUniformWritten() {
    this._uniformWritesPerformed++;
  }

  /**
   * Get memory usage if available (Chrome/Chromium only)
   * @returns {Object|null} Memory info or null if unavailable
   */
  getMemoryUsage() {
    // performance.memory is Chrome-specific and non-standard
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
        totalMB: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)
      };
    }
    return null;
  }

  /**
   * Calculate statistics for a timing array
   * @private
   */
  _calcStats(timings) {
    if (timings.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0 };
    }

    const sorted = [...timings].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[p95Index] || sorted[sorted.length - 1]
    };
  }

  /**
   * Check if it's time to report and return metrics if so
   * @returns {Object|null} Metrics report or null if not time yet
   */
  shouldReport() {
    const now = performance.now();
    if (now - this._lastReportTime < this._reportIntervalMs) {
      return null;
    }

    this._lastReportTime = now;
    return this.getReport();
  }

  /**
   * Get full performance report
   * @returns {Object} Performance metrics
   */
  getReport() {
    const memory = this.getMemoryUsage();

    const report = {
      timing: {
        upload: this._calcStats(this._phaseTimes.upload),
        render: this._calcStats(this._phaseTimes.render),
        capture: this._calcStats(this._phaseTimes.capture),
        total: this._calcStats(this._phaseTimes.total)
      },
      optimization: {
        bindGroupCache: {
          hits: this._bindGroupCacheHits,
          misses: this._bindGroupCacheMisses,
          hitRate: this._bindGroupCacheHits + this._bindGroupCacheMisses > 0
            ? (this._bindGroupCacheHits / (this._bindGroupCacheHits + this._bindGroupCacheMisses) * 100).toFixed(1)
            : 0
        },
        uniformTracking: {
          skipped: this._uniformWritesSkipped,
          written: this._uniformWritesPerformed,
          skipRate: this._uniformWritesSkipped + this._uniformWritesPerformed > 0
            ? (this._uniformWritesSkipped / (this._uniformWritesSkipped + this._uniformWritesPerformed) * 100).toFixed(1)
            : 0
        }
      },
      memory: memory
    };

    // Reset counters for next interval
    this._bindGroupCacheHits = 0;
    this._bindGroupCacheMisses = 0;
    this._uniformWritesSkipped = 0;
    this._uniformWritesPerformed = 0;

    return report;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this._frameTimings = [];
    Object.keys(this._phaseTimes).forEach(key => {
      this._phaseTimes[key] = [];
    });
    this._bindGroupCacheHits = 0;
    this._bindGroupCacheMisses = 0;
    this._uniformWritesSkipped = 0;
    this._uniformWritesPerformed = 0;
  }
}
