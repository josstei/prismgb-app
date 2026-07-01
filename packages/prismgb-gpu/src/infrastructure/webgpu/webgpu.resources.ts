/**
 * Caches WebGPU bind groups to avoid expensive per-frame recreation.
 *
 * Bind group creation involves GPU driver calls. Since bind group entries
 * rarely change, caching and reusing them significantly reduces per-frame
 * overhead. Call {@link BindGroupCache.invalidate} on resize or texture
 * recreation to flush stale entries.
 */
export class BindGroupCache {
  private readonly cache = new Map<string, GPUBindGroup>();
  private version = 0;

  private generateKey(pipelineLabel: string, textureLabel: string): string {
    return `${pipelineLabel}:${textureLabel}:v${this.version}`;
  }

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
      return cached;
    }

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

  invalidate(): void {
    this.cache.clear();
    this.version++;
  }
}

/**
 * Tracks uniform buffer changes via FNV-1a hashing to skip redundant GPU writes.
 */
export class UniformTracker {
  private readonly hashes = new Map<string, number>();

  private hashFloat32Array(data: Float32Array): number {
    let hash = 2166136261;
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  hasChanged(name: string, data: Float32Array): boolean {
    const newHash = this.hashFloat32Array(data);
    const oldHash = this.hashes.get(name);

    if (oldHash === newHash) {
      return false;
    }

    this.hashes.set(name, newHash);
    return true;
  }

  invalidateAll(): void {
    this.hashes.clear();
  }
}
