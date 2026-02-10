export interface BindGroupCacheStats {
  readonly size: number;
  readonly version: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: string;
}

/**
 * Caches WebGPU bind groups to avoid expensive per-frame recreation.
 *
 * Bind group creation involves GPU driver calls. Since bind group entries
 * rarely change (only uniform buffer contents change via writeBuffer),
 * caching and reusing them significantly reduces per-frame overhead.
 *
 * Assumes a fixed bind group layout: binding 0 (uniform buffer),
 * binding 1 (texture view), binding 2 (sampler). Call {@link invalidate}
 * on resize or texture recreation to flush stale entries.
 */
export class BindGroupCache {
  private readonly cache = new Map<string, GPUBindGroup>();
  private version = 0;
  private _hits = 0;
  private _misses = 0;

  private generateKey(pipelineLabel: string, textureLabel: string): string {
    return `${pipelineLabel}:${textureLabel}:v${this.version}`;
  }

  /** Returns a cached bind group or creates and caches a new one. */
  getOrCreate(
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    uniformBuffer: GPUBuffer,
    inputTexture: GPUTexture,
    sampler: GPUSampler
  ): GPUBindGroup {
    const key = this.generateKey(pipeline.label, inputTexture.label);
    const cached = this.cache.get(key);

    if (cached) {
      this._hits++;
      return cached;
    }

    this._misses++;
    const bindGroup = device.createBindGroup({
      label: `Cached ${pipeline.label} BindGroup`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: inputTexture.createView() },
        { binding: 2, resource: sampler }
      ]
    });

    this.cache.set(key, bindGroup);
    return bindGroup;
  }

  /** Flushes all cached bind groups. Call on resize or texture recreation. */
  invalidate(): void {
    this.cache.clear();
    this.version++;
  }

  getStats(): BindGroupCacheStats {
    const total = this._hits + this._misses;
    const hitRate = total === 0 ? 0 : (this._hits / total) * 100;

    return {
      size: this.cache.size,
      version: this.version,
      hits: this._hits,
      misses: this._misses,
      hitRate: `${hitRate.toFixed(2)}%`
    };
  }

  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
  }
}
