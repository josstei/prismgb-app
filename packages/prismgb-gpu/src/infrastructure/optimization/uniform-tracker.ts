export interface UniformTrackerStats {
  trackedUniforms: number;
  checks: number;
  skips: number;
  writes: number;
  skipRate: string;
}

export class UniformTracker {
  private readonly hashes = new Map<string, number>();
  private checks = 0;
  private skips = 0;
  private writes = 0;
  private hashView: Uint8Array | null = null;
  private hashViewBuffer: ArrayBufferLike | null = null;

  private hashFloat32Array(data: Float32Array): number {
    let hash = 2166136261;

    let view: Uint8Array;
    if (
      this.hashViewBuffer === data.buffer &&
      this.hashView &&
      this.hashView.byteOffset === data.byteOffset &&
      this.hashView.byteLength === data.byteLength
    ) {
      view = this.hashView;
    } else {
      view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this.hashView = view;
      this.hashViewBuffer = data.buffer;
    }

    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  hasChanged(name: string, data: Float32Array): boolean {
    this.checks++;
    const newHash = this.hashFloat32Array(data);
    const oldHash = this.hashes.get(name);

    if (oldHash === newHash) {
      this.skips++;
      return false;
    }

    this.hashes.set(name, newHash);
    this.writes++;
    return true;
  }

  invalidate(name: string): void {
    this.hashes.delete(name);
  }

  invalidateAll(): void {
    this.hashes.clear();
    this.hashView = null;
    this.hashViewBuffer = null;
  }

  getStats(): UniformTrackerStats {
    return {
      trackedUniforms: this.hashes.size,
      checks: this.checks,
      skips: this.skips,
      writes: this.writes,
      skipRate: this.checks > 0 ? ((this.skips / this.checks) * 100).toFixed(1) : '0',
    };
  }

  resetStats(): void {
    this.checks = 0;
    this.skips = 0;
    this.writes = 0;
  }
}
