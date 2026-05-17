/**
 * GPU Rendering Optimization Utilities
 *
 * Worker-local utilities for caching, pooling, and change tracking. These keep
 * benchmark statistics that are not part of the current @prismgb/gpu public API.
 */

export type BindGroupCacheStats = {
  size: number;
  version: number;
  hits: number;
  misses: number;
  hitRate: string;
};

export class BindGroupCache {
  private readonly _cache = new Map<string, GPUBindGroup>();
  private _version = 0;
  private _hits = 0;
  private _misses = 0;

  private _generateKey(pipelineLabel: string, textureLabel: string): string {
    return `${pipelineLabel}:${textureLabel}:v${this._version}`;
  }

  private _getLabel(value: object, fallback: string): string {
    if ('label' in value && typeof value.label === 'string' && value.label.length > 0) {
      return value.label;
    }

    return fallback;
  }

  getOrCreate(
    device: GPUDevice | null,
    pipeline: GPURenderPipeline | null,
    uniformBuffer: GPUBuffer | null,
    inputTexture: GPUTexture | null,
    sampler: GPUSampler | null
  ): GPUBindGroup {
    if (!device || !pipeline || !uniformBuffer || !inputTexture || !sampler) {
      throw new Error('BindGroupCache: cannot create bind group with missing GPU resources');
    }

    const pipelineLabel = this._getLabel(pipeline, 'pipeline');
    const textureLabel = this._getLabel(inputTexture, 'texture');
    const key = this._generateKey(pipelineLabel, textureLabel);
    const cached = this._cache.get(key);

    if (cached) {
      this._hits++;
      return cached;
    }

    const bindGroup = device.createBindGroup({
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

  invalidate(): void {
    this._cache.clear();
    this._version++;
  }

  getStats(): BindGroupCacheStats {
    const total = this._hits + this._misses;
    return {
      size: this._cache.size,
      version: this._version,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? ((this._hits / total) * 100).toFixed(1) : '0'
    };
  }

  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
  }
}

type Float32Pool = {
  arrays: Float32Array[];
  index: number;
};

export type TypedArrayPoolStats = {
  poolCount: number;
  totalArrays: number;
  totalBytes: number;
  totalKB: string;
  allocations: number;
  reuses: number;
  reuseRatio: string;
};

export class TypedArrayPool {
  static readonly MAX_POOL_TYPES = 20;

  private readonly _poolDepth: number;
  private readonly _float32Pools = new Map<number, Float32Pool>();
  private _allocations = 0;
  private _reuses = 0;
  private _prewarmCount: number;

  constructor(poolDepth = 3, prewarmSizes: readonly number[] = [4, 6, 8, 16, 32]) {
    if (!Number.isInteger(poolDepth) || poolDepth <= 0) {
      throw new Error('TypedArrayPool: poolDepth must be a positive integer');
    }

    this._poolDepth = poolDepth;
    this._prewarmCount = prewarmSizes.length;

    for (const size of prewarmSizes) {
      this._ensurePool(size);
    }

    this._prewarmCount = this._float32Pools.size;
  }

  private _ensurePool(size: number): void {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error(`TypedArrayPool: size must be a positive integer. Received: ${size}`);
    }

    if (this._float32Pools.has(size)) {
      return;
    }

    const dynamicPools = this._float32Pools.size - this._prewarmCount;
    if (dynamicPools >= TypedArrayPool.MAX_POOL_TYPES) {
      throw new Error(
        `TypedArrayPool: exceeded max pool types (${TypedArrayPool.MAX_POOL_TYPES}). ` +
        `Requested size: ${size}. Consider adding to prewarmSizes if this is expected.`
      );
    }

    const arrays: Float32Array[] = [];
    for (let i = 0; i < this._poolDepth; i += 1) {
      arrays.push(new Float32Array(size));
    }
    this._float32Pools.set(size, { arrays, index: 0 });
    this._allocations += this._poolDepth;
  }

  getFloat32(size: number): Float32Array {
    this._ensurePool(size);

    const pool = this._float32Pools.get(size);
    if (!pool) {
      throw new Error(`TypedArrayPool: pool missing after initialization for size ${size}`);
    }

    const array = pool.arrays[pool.index];
    if (!array) {
      throw new Error(`TypedArrayPool: array missing at index ${pool.index} for size ${size}`);
    }

    pool.index = (pool.index + 1) % this._poolDepth;
    this._reuses++;
    return array;
  }

  getFloat32WithValues(values: ArrayLike<number>): Float32Array {
    const array = this.getFloat32(values.length);
    array.set(values);
    return array;
  }

  getStats(): TypedArrayPoolStats {
    let totalArrays = 0;
    let totalBytes = 0;

    for (const [size, pool] of this._float32Pools) {
      totalArrays += pool.arrays.length;
      totalBytes += size * Float32Array.BYTES_PER_ELEMENT * pool.arrays.length;
    }

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

  resetStats(): void {
    this._allocations = 0;
    this._reuses = 0;
  }
}

export type UniformTrackerStats = {
  trackedUniforms: number;
  checks: number;
  skips: number;
  writes: number;
  skipRate: string;
};

export class UniformTracker {
  private readonly _hashes = new Map<string, number>();
  private _checks = 0;
  private _skips = 0;
  private _writes = 0;
  private _hashView: Uint8Array | null = null;
  private _hashViewBuffer: ArrayBufferLike | null = null;

  private _hashFloat32Array(data: Float32Array): number {
    let hash = 2166136261;

    let view: Uint8Array;
    if (
      this._hashViewBuffer === data.buffer &&
      this._hashView &&
      this._hashView.byteOffset === data.byteOffset &&
      this._hashView.byteLength === data.byteLength
    ) {
      view = this._hashView;
    } else {
      view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this._hashView = view;
      this._hashViewBuffer = data.buffer;
    }

    for (const byte of view) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  hasChanged(name: string, data: Float32Array): boolean {
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

  invalidate(name: string): void {
    this._hashes.delete(name);
  }

  invalidateAll(): void {
    this._hashes.clear();
  }

  getStats(): UniformTrackerStats {
    return {
      trackedUniforms: this._hashes.size,
      checks: this._checks,
      skips: this._skips,
      writes: this._writes,
      skipRate: this._checks > 0 ? ((this._skips / this._checks) * 100).toFixed(1) : '0'
    };
  }

  resetStats(): void {
    this._checks = 0;
    this._skips = 0;
    this._writes = 0;
  }
}

export type CaptureBufferStats = {
  captureCount: number;
  lazyCaptures: number;
};

export class CaptureBufferManager {
  private _captureRequested = false;
  private _capturedFrame: ImageBitmap | null = null;
  private _canvas: OffscreenCanvas | null = null;
  private _captureCount = 0;
  private _lazyCaptures = 0;

  initialize(canvasRef: OffscreenCanvas): void {
    this._canvas = canvasRef;
  }

  requestCapture(): void {
    this._captureRequested = true;
  }

  async onFrameRendered(): Promise<void> {
    if (!this._captureRequested || !this._canvas) {
      return;
    }

    if (this._capturedFrame) {
      this._capturedFrame.close();
    }

    this._capturedFrame = await createImageBitmap(this._canvas);
    this._captureRequested = false;
    this._lazyCaptures++;
  }

  hasCapturedFrame(): boolean {
    return this._capturedFrame !== null;
  }

  getCapturedFrame(): ImageBitmap | null {
    const frame = this._capturedFrame;
    this._capturedFrame = null;
    if (frame) {
      this._captureCount++;
    }
    return frame;
  }

  hasPendingCapture(): boolean {
    return this._captureRequested;
  }

  getStats(): CaptureBufferStats {
    return {
      captureCount: this._captureCount,
      lazyCaptures: this._lazyCaptures
    };
  }

  destroy(): void {
    if (this._capturedFrame) {
      this._capturedFrame.close();
      this._capturedFrame = null;
    }
    this._canvas = null;
    this._captureRequested = false;
  }
}

export class ShaderProgram {
  readonly gl: WebGL2RenderingContext;
  readonly label: string;
  program: WebGLProgram | null;
  readonly uniformLocations = new Map<string, WebGLUniformLocation | null>();
  private _uniformCalls = 0;
  private _cacheHits = 0;

  constructor(
    gl: WebGL2RenderingContext | null,
    vertexSource: string,
    fragmentSource: string,
    label = 'ShaderProgram'
  ) {
    if (!gl) {
      throw new Error(`[${label}] WebGL2 context is not available`);
    }

    this.gl = gl;
    this.label = label;
    this.program = this._compile(vertexSource, fragmentSource);
    this._cacheUniformLocations();
  }

  private _requireProgram(): WebGLProgram {
    if (!this.program) {
      throw new Error(`[${this.label}] Shader program has been destroyed`);
    }
    return this.program;
  }

  private _compile(vertexSource: string, fragmentSource: string): WebGLProgram {
    const vertexShader = this._compileShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this._compileShader(this.gl.FRAGMENT_SHADER, fragmentSource);
    const program = this.gl.createProgram();

    if (!program) {
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      throw new Error(`[${this.label}] Failed to create shader program`);
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      throw new Error(`[${this.label}] Shader link error: ${error}`);
    }

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);
    return program;
  }

  private _compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error(`[${this.label}] Failed to create shader`);
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`[${this.label}] Shader compile error: ${error}`);
    }

    return shader;
  }

  private _cacheUniformLocations(): void {
    const program = this._requireProgram();
    const numUniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);

    if (typeof numUniforms !== 'number') {
      throw new Error(`[${this.label}] Invalid active uniform count`);
    }

    for (let i = 0; i < numUniforms; i += 1) {
      const info = this.gl.getActiveUniform(program, i);
      if (!info) {
        continue;
      }
      const location = this.gl.getUniformLocation(program, info.name);
      this.uniformLocations.set(info.name, location);
    }
  }

  use(): void {
    this.gl.useProgram(this._requireProgram());
  }

  getUniformLocation(name: string): WebGLUniformLocation | null {
    this._uniformCalls++;
    if (this.uniformLocations.has(name)) {
      this._cacheHits++;
    }
    return this.uniformLocations.get(name) ?? null;
  }

  setUniform1i(name: string, value: number): void {
    const loc = this.getUniformLocation(name);
    if (loc !== null) {
      this.gl.uniform1i(loc, value);
    }
  }

  setUniform1f(name: string, value: number): void {
    const loc = this.getUniformLocation(name);
    if (loc !== null) {
      this.gl.uniform1f(loc, value);
    }
  }

  setUniform2f(name: string, x: number, y: number): void {
    const loc = this.getUniformLocation(name);
    if (loc !== null) {
      this.gl.uniform2f(loc, x, y);
    }
  }

  destroy(): void {
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
    this.uniformLocations.clear();
  }
}
