/**
 * Tracks uniform buffer changes via FNV-1a hashing to skip redundant GPU writes.
 *
 * Computes a 32-bit FNV-1a hash of the raw Float32Array bytes and compares
 * against the previously stored hash. Returns false when data is unchanged,
 * allowing callers to skip the `writeBuffer` call entirely. Hash collisions
 * are theoretically possible but negligible in practice for small uniform
 * buffers (4-32 floats).
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

  /** Returns true if the data differs from the last check for this name. */
  hasChanged(name: string, data: Float32Array): boolean {
    const newHash = this.hashFloat32Array(data);
    const oldHash = this.hashes.get(name);

    if (oldHash === newHash) {
      return false;
    }

    this.hashes.set(name, newHash);
    return true;
  }

  /** Clears all stored hashes, forcing the next check to report changed. */
  invalidateAll(): void {
    this.hashes.clear();
  }
}
