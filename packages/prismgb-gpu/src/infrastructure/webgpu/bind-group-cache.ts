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

  /** Flushes all cached bind groups. Call on resize or texture recreation. */
  invalidate(): void {
    this.cache.clear();
    this.version++;
  }
}
