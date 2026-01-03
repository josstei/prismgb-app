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
 * Includes a safety limit on pool types to prevent unbounded memory growth.
 */
export class TypedArrayPool {
  /**
   * Maximum number of unique array sizes to pool (safety limit)
   * Pre-warmed sizes don't count toward this limit
   */
  static MAX_POOL_TYPES = 20;

  constructor(poolDepth = 3, prewarmSizes = [4, 6, 8, 16, 32]) {
    this._poolDepth = poolDepth;
    this._float32Pools = new Map();
    this._allocations = 0;
    this._reuses = 0;
    this._prewarmCount = prewarmSizes.length;

    // Pre-warm pools with common sizes
    prewarmSizes.forEach(size => this._ensurePool(size));

    // Track actual unique prewarmed pools (handles duplicates in prewarmSizes)
    this._prewarmCount = this._float32Pools.size;
  }

  /**
   * Ensure a pool exists for the given size
   * @private
   * @throws {Error} If pool type limit would be exceeded
   */
  _ensurePool(size) {
    if (!this._float32Pools.has(size)) {
      // Safety limit: prevent unbounded pool growth from unexpected sizes
      const dynamicPools = this._float32Pools.size - this._prewarmCount;
      if (dynamicPools >= TypedArrayPool.MAX_POOL_TYPES) {
        throw new Error(
          `TypedArrayPool: exceeded max pool types (${TypedArrayPool.MAX_POOL_TYPES}). ` +
          `Requested size: ${size}. Consider adding to prewarmSizes if this is expected.`
        );
      }

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
    // Cached view for hash computation to avoid per-frame Uint8Array allocation
    this._hashView = null;
    this._hashViewBuffer = null;
  }

  /**
   * FNV-1a hash for Float32Array
   * Uses cached Uint8Array view to avoid per-frame allocation
   * @param {Float32Array} data
   * @returns {number} 32-bit hash
   */
  _hashFloat32Array(data) {
    let hash = 2166136261; // FNV offset basis

    // Reuse cached view if buffer matches, otherwise create new view
    // This avoids creating a new Uint8Array every frame (GC pressure at 60fps)
    let view;
    if (this._hashViewBuffer === data.buffer && this._hashView &&
        this._hashView.byteOffset === data.byteOffset &&
        this._hashView.byteLength === data.byteLength) {
      view = this._hashView;
    } else {
      view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this._hashView = view;
      this._hashViewBuffer = data.buffer;
    }

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
