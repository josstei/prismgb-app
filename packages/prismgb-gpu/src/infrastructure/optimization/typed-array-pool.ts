export interface TypedArrayPoolStats {
  poolCount: number;
  totalArrays: number;
  totalBytes: number;
  totalKB: string;
  allocations: number;
  reuses: number;
  reuseRatio: string;
}

interface PoolEntry {
  arrays: Float32Array[];
  index: number;
}

export class TypedArrayPool {
  static readonly MAX_POOL_TYPES = 20;

  private readonly poolDepth: number;
  private readonly float32Pools: Map<number, PoolEntry>;
  private readonly prewarmCount: number;
  private allocations: number;
  private reuses: number;

  constructor(poolDepth = 3, prewarmSizes: number[] = [4, 6, 8, 16, 32]) {
    this.poolDepth = poolDepth;
    this.float32Pools = new Map();
    this.allocations = 0;
    this.reuses = 0;

    prewarmSizes.forEach(size => this.ensurePool(size));
    this.prewarmCount = this.float32Pools.size;
  }

  private ensurePool(size: number): void {
    if (!this.float32Pools.has(size)) {
      const dynamicPools = this.float32Pools.size - this.prewarmCount;
      if (dynamicPools >= TypedArrayPool.MAX_POOL_TYPES) {
        throw new Error(
          `TypedArrayPool: exceeded max pool types (${TypedArrayPool.MAX_POOL_TYPES}). ` +
          `Requested size: ${size}. Consider adding to prewarmSizes if this is expected.`
        );
      }

      const arrays: Float32Array[] = [];
      for (let i = 0; i < this.poolDepth; i++) {
        arrays.push(new Float32Array(size));
      }

      this.float32Pools.set(size, { arrays, index: 0 });
      this.allocations += this.poolDepth;
    }
  }

  getFloat32(size: number): Float32Array {
    this.ensurePool(size);
    const pool = this.float32Pools.get(size)!;
    const array = pool.arrays[pool.index];
    pool.index = (pool.index + 1) % this.poolDepth;
    this.reuses++;
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

    this.float32Pools.forEach((pool, size) => {
      totalArrays += pool.arrays.length;
      totalBytes += size * 4 * pool.arrays.length;
    });

    const reuseRatio = this.allocations > 0
      ? (this.reuses / this.allocations).toFixed(1)
      : '0';

    return {
      poolCount: this.float32Pools.size,
      totalArrays,
      totalBytes,
      totalKB: (totalBytes / 1024).toFixed(2),
      allocations: this.allocations,
      reuses: this.reuses,
      reuseRatio
    };
  }

  resetStats(): void {
    this.allocations = 0;
    this.reuses = 0;
  }
}
