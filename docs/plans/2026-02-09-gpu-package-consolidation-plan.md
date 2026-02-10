# @prismgb/gpu Package Consolidation - Implementation Plan

## Replacement Note (2026-02-10)

This plan is superseded by:
- `docs/plans/2026-02-10-gpu-package-consolidation-plan-v2.md`
- `docs/plans/2026-02-10-gpu-package-consolidation-design-v2.md`

### Diff Summary (Why Replaced)

- Worker `INIT` flow in this version assumes `payload.canvas` is always present, which breaks re-init after `RELEASE` where config-only `INIT` is used by `GpuWorkerManager`.
- Capture flow in this version regresses behavior by not preserving buffered "next rendered frame" semantics (`REQUEST_CAPTURE` -> frame buffer -> `CAPTURE` retrieval).
- Phase 2 includes contradictory tests/implementations (notably TypedArrayPool and ShaderProgramCache examples), making the plan non-executable as written.
- The plan allows committing intentionally broken type states in early phases, which undermines CI and rollback safety.
- v2 keeps protocol/capture invariants explicit and enforces green validation gates at every phase.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all GPU rendering code into `@prismgb/gpu`, eliminating duplicated shaders, engines, and optimization utilities between the package and the app's worker directory.

**Architecture:** The package absorbs production-hardened rendering engines from the app's workers while adding proper interfaces (state machine, error classification, callbacks). The app's worker becomes a thin ~80-line message router that delegates to package pipeline classes. Domain vs. integration boundary: package owns GPU logic, app owns worker lifecycle.

**Tech Stack:** TypeScript, WebGPU, WebGL2, Canvas2D, Vite `?raw` shader imports, Vitest

**Design Document:** `docs/plans/2026-02-09-gpu-package-consolidation-design.md`

---

## Dependency Graph

```
Phase 1 (Domain interfaces) ─┬──→ Phase 2 (Optimization utilities)
                              │         └──→ Phase 3 (Pipeline rewrite)
                              └──→ Phase 3
Phase 3 ─┬──→ Phase 4 (Package tests)
          └──→ Phase 5 (App worker simplification)
Phase 5 ──→ Phase 6 (Duplicate cleanup)
Phase 6 ──→ Phase 7 (Validation)
```

**Git tags:** `pre-pipeline-rewrite` (before Phase 3), `pre-worker-migration` (before Phase 5)

---

## Phase 1: Domain Layer Enhancements

**Risk:** LOW — Pure types and interfaces, no behavior changes

All paths relative to: `packages/prismgb-gpu/src/`

---

### Task 1.1: Add PipelineState and IPipelineError

**Files:**
- Create: `packages/prismgb-gpu/src/domain/pipeline/pipeline-state.type.ts`
- Create: `packages/prismgb-gpu/src/domain/pipeline/pipeline-error.interface.ts`

**Step 1: Create pipeline-state.type.ts**

```typescript
export type PipelineState = 'uninitialized' | 'ready' | 'suspended' | 'error' | 'disposed';
```

Write to: `packages/prismgb-gpu/src/domain/pipeline/pipeline-state.type.ts`

**Step 2: Create pipeline-error.interface.ts**

```typescript
import type { IAdapterInfo } from './adapter-info.interface';

export type PipelineErrorCode = 'DEVICE_LOST' | 'SHADER_ERROR' | 'GPU_ERROR' | 'CONTEXT_LOST';

export interface IPipelineError {
  readonly code: PipelineErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly adapterInfo?: IAdapterInfo;
}
```

Write to: `packages/prismgb-gpu/src/domain/pipeline/pipeline-error.interface.ts`

**Step 3: Run typecheck**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`
Expected: May fail on missing IAdapterInfo — that's fine, created in next task.

---

### Task 1.2: Add IAdapterInfo and IPipelineCallbacks

**Files:**
- Create: `packages/prismgb-gpu/src/domain/pipeline/adapter-info.interface.ts`
- Create: `packages/prismgb-gpu/src/domain/pipeline/pipeline-callbacks.interface.ts`

**Step 1: Create adapter-info.interface.ts**

```typescript
import type { RenderAPI } from './pipeline-config.interface';

export interface IAdapterInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
  readonly api: RenderAPI;
}
```

Write to: `packages/prismgb-gpu/src/domain/pipeline/adapter-info.interface.ts`

**Step 2: Create pipeline-callbacks.interface.ts**

```typescript
import type { PipelineState } from './pipeline-state.type';
import type { IPipelineError } from './pipeline-error.interface';
import type { IPipelineStats } from './pipeline-stats.interface';

export interface IPipelineCallbacks {
  onError?: (error: IPipelineError) => void;
  onStats?: (stats: IPipelineStats) => void;
  onStateChange?: (from: PipelineState, to: PipelineState) => void;
}
```

Write to: `packages/prismgb-gpu/src/domain/pipeline/pipeline-callbacks.interface.ts`

**Step 3: Run typecheck**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`
Expected: PASS (all referenced types now exist)

---

### Task 1.3: Add IShaderLoader interface

**Files:**
- Create: `packages/prismgb-gpu/src/domain/shaders/shader-loader.interface.ts`

**Step 1: Create shader-loader.interface.ts**

```typescript
export type ShaderStage =
  | 'pixel-upscale'
  | 'unsharp-mask'
  | 'color-elevation'
  | 'crt-lcd'
  | 'common-vertex';

export interface IShaderLoader {
  load(stage: ShaderStage): string;
}
```

Write to: `packages/prismgb-gpu/src/domain/shaders/shader-loader.interface.ts`

**Step 2: Update shaders barrel**

Modify: `packages/prismgb-gpu/src/domain/shaders/index.ts`

Add export:
```typescript
export type { IShaderLoader, ShaderStage } from './shader-loader.interface';
```

---

### Task 1.4: Add ICaptureProvider and IPresetProvider interfaces

**Files:**
- Create: `packages/prismgb-gpu/src/domain/pipeline/capture-provider.interface.ts`
- Create: `packages/prismgb-gpu/src/domain/presets/preset-provider.interface.ts`

**Step 1: Create capture-provider.interface.ts**

```typescript
export interface ICaptureProvider {
  requestCapture(): void;
  hasPendingCapture(): boolean;
  captureFrame(): Promise<ImageBitmap>;
  dispose(): void;
}
```

Write to: `packages/prismgb-gpu/src/domain/pipeline/capture-provider.interface.ts`

**Step 2: Create preset-provider.interface.ts**

```typescript
import type { IPreset } from './preset.interface';

export interface PresetUIEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface IPresetProvider {
  get(id: string): IPreset | undefined;
  getDefault(): IPreset;
  getAll(): IPreset[];
  getForUI(): PresetUIEntry[];
}
```

Write to: `packages/prismgb-gpu/src/domain/presets/preset-provider.interface.ts`

**Step 3: Update PresetRegistryImpl to implement IPresetProvider**

Modify: `packages/prismgb-gpu/src/domain/presets/preset-registry.ts`

Add import and `implements`:
```typescript
import type { IPresetProvider, PresetUIEntry } from './preset-provider.interface';

class PresetRegistryImpl implements IPresetProvider {
```

Update `getForUI()` return type:
```typescript
getForUI(): PresetUIEntry[] {
```

---

### Task 1.5: Rewrite IPipeline interface with state machine

**Files:**
- Modify: `packages/prismgb-gpu/src/domain/pipeline/pipeline.interface.ts`
- Modify: `packages/prismgb-gpu/src/domain/pipeline/pipeline-config.interface.ts`

**Step 1: Rewrite pipeline-config.interface.ts**

Replace the full content of `packages/prismgb-gpu/src/domain/pipeline/pipeline-config.interface.ts`:

```typescript
import type { IPreset } from '../presets/preset.interface';
import type { IShaderLoader } from '../shaders/shader-loader.interface';
import type { ICaptureProvider } from './capture-provider.interface';
import type { IPipelineCallbacks } from './pipeline-callbacks.interface';

export type RenderAPI = 'webgpu' | 'webgl2' | 'canvas2d';

export interface IPipelineConfig {
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
}

export interface IPipelineOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly config: IPipelineConfig;
  readonly preset?: IPreset;
  readonly shaderLoader?: IShaderLoader;
  readonly captureProvider?: ICaptureProvider;
  readonly callbacks?: IPipelineCallbacks;
}
```

**Step 2: Rewrite pipeline.interface.ts**

Replace the full content of `packages/prismgb-gpu/src/domain/pipeline/pipeline.interface.ts`:

```typescript
import type { FrameSource } from '../frame/frame-source.interface';
import type { PipelineUniforms } from '../shaders/shader-uniforms.types';
import type { IPipelineStats } from './pipeline-stats.interface';
import type { IPipelineError } from './pipeline-error.interface';
import type { IPipelineOptions, RenderAPI } from './pipeline-config.interface';
import type { PipelineState } from './pipeline-state.type';
import type { IAdapterInfo } from './adapter-info.interface';

export interface IPipeline {
  initialize(options: IPipelineOptions): Promise<void>;
  suspend(): void;
  resume(): Promise<void>;
  dispose(): void;

  renderFrame(source: FrameSource, uniforms: PipelineUniforms): void;
  resize(width: number, height: number): void;

  readonly state: PipelineState;
  readonly api: RenderAPI;
  readonly lastError: IPipelineError | null;

  getStats(): IPipelineStats;
  getAdapterInfo(): IAdapterInfo | null;
}
```

---

### Task 1.6: Update IPipelineStats and IPipelineCapabilities

**Files:**
- Modify: `packages/prismgb-gpu/src/domain/pipeline/pipeline-stats.interface.ts`
- Modify: `packages/prismgb-gpu/src/domain/pipeline/pipeline-capabilities.interface.ts`

**Step 1: Update pipeline-stats.interface.ts**

Replace content:

```typescript
export interface IPipelineStats {
  readonly fps: number;
  readonly frameTime: number;
  readonly framesRendered: number;
  readonly framesDropped: number;
  readonly gpuMemoryBytes?: number;
}
```

**Step 2: Update pipeline-capabilities.interface.ts**

Add `webgpuFeatures` field after `webgl2Info`:

```typescript
  webgpuFeatures?: string[];
```

---

### Task 1.7: Remove dead IFrameProvider, update FrameSource

**Files:**
- Modify: `packages/prismgb-gpu/src/domain/frame/frame-source.interface.ts`

**Step 1: Remove IFrameProvider, keep FrameSource**

Replace content of `packages/prismgb-gpu/src/domain/frame/frame-source.interface.ts`:

```typescript
export type FrameSource = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas | VideoFrame;
```

**Step 2: Update frame barrel if needed**

Check `packages/prismgb-gpu/src/domain/frame/index.ts` and remove `IFrameProvider` export if present.

---

### Task 1.8: Update pipeline barrel exports

**Files:**
- Modify: `packages/prismgb-gpu/src/domain/pipeline/index.ts`

**Step 1: Add exports for all new types**

Replace content of `packages/prismgb-gpu/src/domain/pipeline/index.ts`:

```typescript
export type { IPipeline } from './pipeline.interface';
export type { IPipelineConfig, IPipelineOptions, RenderAPI } from './pipeline-config.interface';
export type { IPipelineCapabilities, WebGPULimits, WebGL2Info } from './pipeline-capabilities.interface';
export type { IPipelineStats } from './pipeline-stats.interface';
export type { IPipelineError, PipelineErrorCode } from './pipeline-error.interface';
export type { IPipelineCallbacks } from './pipeline-callbacks.interface';
export type { PipelineState } from './pipeline-state.type';
export type { IAdapterInfo } from './adapter-info.interface';
export type { ICaptureProvider } from './capture-provider.interface';
```

---

### Task 1.9: Update presets barrel exports

**Files:**
- Modify: `packages/prismgb-gpu/src/domain/presets/index.ts`

**Step 1: Add IPresetProvider export**

Add to `packages/prismgb-gpu/src/domain/presets/index.ts`:

```typescript
export type { IPresetProvider, PresetUIEntry } from './preset-provider.interface';
```

---

### Task 1.10: Add UniformContext to application layer

**Files:**
- Create: `packages/prismgb-gpu/src/application/uniform-context.ts`

**Step 1: Create uniform-context.ts**

```typescript
import type { IPreset } from '../domain/presets';
import type { PipelineUniforms } from '../domain/shaders';
import { buildUniforms } from './uniform-builder';

export class UniformContext {
  private _preset: IPreset;
  private _nativeWidth: number;
  private _nativeHeight: number;
  private _targetWidth: number;
  private _targetHeight: number;
  private _brightness: number;
  private _cachedUniforms: PipelineUniforms;
  private _dirty = true;

  constructor(
    preset: IPreset,
    nativeWidth: number,
    nativeHeight: number,
    targetWidth: number,
    targetHeight: number,
    brightness = 1.0
  ) {
    this._preset = preset;
    this._nativeWidth = nativeWidth;
    this._nativeHeight = nativeHeight;
    this._targetWidth = targetWidth;
    this._targetHeight = targetHeight;
    this._brightness = brightness;
    this._cachedUniforms = this._build();
    this._dirty = false;
  }

  update(changes: {
    targetWidth?: number;
    targetHeight?: number;
    brightness?: number;
    preset?: IPreset;
  }): boolean {
    let changed = false;

    if (changes.preset !== undefined && changes.preset !== this._preset) {
      this._preset = changes.preset;
      changed = true;
    }
    if (changes.targetWidth !== undefined && changes.targetWidth !== this._targetWidth) {
      this._targetWidth = changes.targetWidth;
      changed = true;
    }
    if (changes.targetHeight !== undefined && changes.targetHeight !== this._targetHeight) {
      this._targetHeight = changes.targetHeight;
      changed = true;
    }
    if (changes.brightness !== undefined && changes.brightness !== this._brightness) {
      this._brightness = changes.brightness;
      changed = true;
    }

    if (changed) {
      this._dirty = true;
    }

    return changed;
  }

  getUniforms(): PipelineUniforms {
    if (this._dirty) {
      this._cachedUniforms = this._build();
      this._dirty = false;
    }
    return this._cachedUniforms;
  }

  private _build(): PipelineUniforms {
    return buildUniforms({
      preset: this._preset,
      nativeWidth: this._nativeWidth,
      nativeHeight: this._nativeHeight,
      outputWidth: this._targetWidth,
      outputHeight: this._targetHeight,
      brightness: this._brightness,
    });
  }
}
```

Write to: `packages/prismgb-gpu/src/application/uniform-context.ts`

**Step 2: Update application barrel**

Modify: `packages/prismgb-gpu/src/application/index.ts`

Replace content:

```typescript
export { detectCapabilities } from './capability-detector';
export { buildUniforms, calculateScaleFactor, type UniformBuildContext } from './uniform-builder';
export { UniformContext } from './uniform-context';
```

---

### Task 1.11: Update package public API (index.ts)

**Files:**
- Modify: `packages/prismgb-gpu/src/index.ts`

**Step 1: Replace content of index.ts**

```typescript
// =============================================================================
// @prismgb/gpu - GPU Rendering Pipeline Package
// =============================================================================
// This is the PUBLIC API. Only exports listed here are available to consumers.
// Internal implementation details are not exposed.
// =============================================================================

// Domain Types — Pipeline
export type {
  IPipeline,
  IPipelineConfig,
  IPipelineOptions,
  IPipelineCapabilities,
  IPipelineStats,
  IPipelineError,
  PipelineErrorCode,
  IPipelineCallbacks,
  PipelineState,
  IAdapterInfo,
  ICaptureProvider,
  RenderAPI,
  WebGPULimits,
  WebGL2Info
} from './domain/pipeline';

// Domain Types — Presets
export type {
  IPreset,
  IPresetProvider,
  PresetUIEntry,
  UpscaleConfig,
  UnsharpConfig,
  ColorConfig,
  CRTConfig
} from './domain/presets';

// Domain Types — Shaders
export type {
  PipelineUniforms,
  UpscaleUniforms,
  UnsharpUniforms,
  ColorUniforms,
  CRTUniforms,
  IShaderLoader,
  ShaderStage
} from './domain/shaders';

// Domain Types — Frame
export type { FrameSource } from './domain/frame';

// Preset Registry
export { PresetRegistry } from './domain/presets';

// Application Services
export { detectCapabilities } from './application/capability-detector';
export { buildUniforms, calculateScaleFactor } from './application/uniform-builder';
export type { UniformBuildContext } from './application/uniform-builder';
export { UniformContext } from './application/uniform-context';

// Pipeline Factory
export { createPipeline, type CreatePipelineOptions } from './factories';

// Register all built-in presets on import
import './domain/presets/presets/true-color.preset';
import './domain/presets/presets/vibrant.preset';
import './domain/presets/presets/hi-def.preset';
import './domain/presets/presets/vintage.preset';
import './domain/presets/presets/pixel.preset';
import './domain/presets/presets/performance.preset';
```

---

### Task 1.12: Fix compilation and commit Phase 1

**Step 1: Run typecheck**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`

Expected: Compilation errors in `base-pipeline.ts` and pipeline implementations because `IPipeline` interface changed. This is expected — Phase 3 will rewrite these files. For now, the infrastructure layer will have type errors.

**Step 2: Run existing tests (should still pass — tests don't import changed interfaces directly)**

Run: `cd packages/prismgb-gpu && npx vitest run`

Expected: All existing tests pass (they test PresetRegistry, buildUniforms, detectCapabilities — none affected by IPipeline changes).

**Step 3: Commit**

```bash
git add packages/prismgb-gpu/src/
git commit -m "refactor(gpu): add pipeline state machine, error classification, and new interfaces

Add PipelineState, IPipelineError, IPipelineCallbacks, IAdapterInfo,
IShaderLoader, ICaptureProvider, IPresetProvider, UniformContext.
Rewrite IPipeline interface with suspend/resume lifecycle.
Remove dead IFrameProvider interface."
```

---

## Phase 2: Optimization Utilities

**Risk:** MEDIUM — Extract from app workers into package, upgrade existing

All source comes from: `src/renderer/infrastructure/rendering/workers/optimization.utils.ts`
All targets go to: `packages/prismgb-gpu/src/infrastructure/optimization/`

---

### Task 2.1: Create TypedArrayPool

**Files:**
- Create: `packages/prismgb-gpu/src/infrastructure/optimization/typed-array-pool.ts`

**Step 1: Write the failing test**

Create: `packages/prismgb-gpu/tests/unit/infrastructure/optimization/typed-array-pool.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TypedArrayPool } from '@/infrastructure/optimization/typed-array-pool';

describe('TypedArrayPool', () => {
  let pool: TypedArrayPool;

  beforeEach(() => {
    pool = new TypedArrayPool();
  });

  it('should return a Float32Array of requested size', () => {
    const arr = pool.getFloat32(4);
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(4);
  });

  it('should reuse arrays from the pool', () => {
    const first = pool.getFloat32(4);
    const second = pool.getFloat32(4);
    expect(first.buffer).toBe(second.buffer);
  });

  it('should fill array with provided values', () => {
    const arr = pool.getFloat32WithValues([1.0, 2.0, 3.0]);
    expect(arr[0]).toBe(1.0);
    expect(arr[1]).toBe(2.0);
    expect(arr[2]).toBe(3.0);
  });

  it('should enforce maximum pool types limit', () => {
    for (let i = 1; i <= 21; i++) {
      pool.getFloat32(i);
    }
    const stats = pool.getStats();
    expect(stats.poolCount).toBeLessThanOrEqual(20);
  });

  it('should track reuse statistics', () => {
    pool.getFloat32(4);
    pool.getFloat32(4);
    pool.getFloat32(4);
    const stats = pool.getStats();
    expect(stats.reuses).toBeGreaterThan(0);
  });

  it('should prewarm common sizes', () => {
    pool.prewarm([4, 8, 16]);
    const stats = pool.getStats();
    expect(stats.poolCount).toBeGreaterThanOrEqual(3);
  });

  it('should reset all pools', () => {
    pool.getFloat32(4);
    pool.getFloat32(8);
    pool.reset();
    const stats = pool.getStats();
    expect(stats.poolCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/optimization/typed-array-pool.test.ts`
Expected: FAIL — module not found

**Step 3: Implement TypedArrayPool**

Extract from `src/renderer/infrastructure/rendering/workers/optimization.utils.ts` lines 107-216. Write to `packages/prismgb-gpu/src/infrastructure/optimization/typed-array-pool.ts`:

```typescript
const MAX_POOL_TYPES = 20;
const ARRAYS_PER_SIZE = 3;

export interface TypedArrayPoolStats {
  readonly poolCount: number;
  readonly totalArrays: number;
  readonly totalBytes: number;
  readonly allocations: number;
  readonly reuses: number;
}

export class TypedArrayPool {
  private readonly pools = new Map<number, Float32Array[]>();
  private readonly indices = new Map<number, number>();
  private _allocations = 0;
  private _reuses = 0;

  getFloat32(size: number): Float32Array {
    let pool = this.pools.get(size);

    if (!pool) {
      if (this.pools.size >= MAX_POOL_TYPES) {
        return new Float32Array(size);
      }
      pool = [];
      for (let i = 0; i < ARRAYS_PER_SIZE; i++) {
        pool.push(new Float32Array(size));
      }
      this.pools.set(size, pool);
      this.indices.set(size, 0);
      this._allocations += ARRAYS_PER_SIZE;
    }

    const index = this.indices.get(size)!;
    const arr = pool[index];
    this.indices.set(size, (index + 1) % pool.length);
    this._reuses++;
    return arr;
  }

  getFloat32WithValues(values: number[]): Float32Array {
    const arr = this.getFloat32(values.length);
    arr.set(values);
    return arr;
  }

  prewarm(sizes: number[]): void {
    for (const size of sizes) {
      this.getFloat32(size);
    }
  }

  getStats(): TypedArrayPoolStats {
    let totalArrays = 0;
    let totalBytes = 0;
    for (const pool of this.pools.values()) {
      totalArrays += pool.length;
      totalBytes += pool.reduce((sum, arr) => sum + arr.byteLength, 0);
    }
    return {
      poolCount: this.pools.size,
      totalArrays,
      totalBytes,
      allocations: this._allocations,
      reuses: this._reuses,
    };
  }

  reset(): void {
    this.pools.clear();
    this.indices.clear();
    this._allocations = 0;
    this._reuses = 0;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/optimization/typed-array-pool.test.ts`
Expected: PASS

---

### Task 2.2: Upgrade UniformTracker with cached views

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/webgpu/uniform-tracker.ts` (move to `optimization/`)
- Create: `packages/prismgb-gpu/src/infrastructure/optimization/uniform-tracker.ts`

**Step 1: Write the failing test**

Create: `packages/prismgb-gpu/tests/unit/infrastructure/optimization/uniform-tracker.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UniformTracker } from '@/infrastructure/optimization/uniform-tracker';

describe('UniformTracker', () => {
  let tracker: UniformTracker;

  beforeEach(() => {
    tracker = new UniformTracker();
  });

  it('should report change on first check', () => {
    const data = new Float32Array([1.0, 2.0, 3.0]);
    expect(tracker.hasChanged('test', data)).toBe(true);
  });

  it('should report no change for identical data', () => {
    const data = new Float32Array([1.0, 2.0, 3.0]);
    tracker.hasChanged('test', data);
    expect(tracker.hasChanged('test', data)).toBe(false);
  });

  it('should report change for different data', () => {
    const data1 = new Float32Array([1.0, 2.0, 3.0]);
    const data2 = new Float32Array([1.0, 2.0, 4.0]);
    tracker.hasChanged('test', data1);
    expect(tracker.hasChanged('test', data2)).toBe(true);
  });

  it('should invalidate all tracked uniforms', () => {
    const data = new Float32Array([1.0, 2.0, 3.0]);
    tracker.hasChanged('a', data);
    tracker.hasChanged('b', data);
    tracker.invalidateAll();
    expect(tracker.hasChanged('a', data)).toBe(true);
    expect(tracker.hasChanged('b', data)).toBe(true);
  });

  it('should track statistics', () => {
    const data = new Float32Array([1.0]);
    tracker.hasChanged('test', data);
    tracker.hasChanged('test', data);
    tracker.hasChanged('test', data);
    const stats = tracker.getStats();
    expect(stats.checks).toBe(3);
    expect(stats.skips).toBe(2);
    expect(stats.writes).toBe(1);
  });

  it('should reuse Uint8Array view for same buffer', () => {
    const data = new Float32Array([1.0, 2.0]);
    tracker.hasChanged('test', data);
    tracker.hasChanged('test', data);
    const stats = tracker.getStats();
    expect(stats.checks).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/optimization/uniform-tracker.test.ts`
Expected: FAIL

**Step 3: Create upgraded UniformTracker**

Write to `packages/prismgb-gpu/src/infrastructure/optimization/uniform-tracker.ts`:

```typescript
export interface UniformTrackerStats {
  readonly trackedUniforms: number;
  readonly checks: number;
  readonly skips: number;
  readonly writes: number;
}

export class UniformTracker {
  private readonly hashes = new Map<string, number>();
  private _hashViewBuffer: ArrayBuffer | null = null;
  private _hashView: Uint8Array | null = null;
  private _checks = 0;
  private _skips = 0;
  private _writes = 0;

  hasChanged(name: string, data: Float32Array): boolean {
    this._checks++;
    const hash = this._fnv1a(data);
    const prev = this.hashes.get(name);

    if (prev === hash) {
      this._skips++;
      return false;
    }

    this.hashes.set(name, hash);
    this._writes++;
    return true;
  }

  invalidateAll(): void {
    this.hashes.clear();
    this._hashViewBuffer = null;
    this._hashView = null;
  }

  getStats(): UniformTrackerStats {
    return {
      trackedUniforms: this.hashes.size,
      checks: this._checks,
      skips: this._skips,
      writes: this._writes,
    };
  }

  private _fnv1a(data: Float32Array): number {
    let view: Uint8Array;

    if (data.buffer === this._hashViewBuffer) {
      view = this._hashView!;
    } else {
      view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this._hashViewBuffer = data.buffer;
      this._hashView = view;
    }

    let hash = 0x811c9dc5;
    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/optimization/uniform-tracker.test.ts`
Expected: PASS

---

### Task 2.3: Create ShaderProgramCache (WebGL2 optimization)

**Files:**
- Create: `packages/prismgb-gpu/src/infrastructure/optimization/shader-program-cache.ts`

**Step 1: Write the failing test**

Create: `packages/prismgb-gpu/tests/unit/infrastructure/optimization/shader-program-cache.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShaderProgramCache } from '@/infrastructure/optimization/shader-program-cache';

describe('ShaderProgramCache', () => {
  let cache: ShaderProgramCache;
  let mockGl: any;

  beforeEach(() => {
    mockGl = {
      getUniformLocation: vi.fn().mockReturnValue({ fake: true }),
      uniform1i: vi.fn(),
      uniform1f: vi.fn(),
      uniform2f: vi.fn(),
    };
    cache = new ShaderProgramCache(mockGl);
  });

  it('should cache uniform locations on first lookup', () => {
    cache.getLocation('u_brightness');
    cache.getLocation('u_brightness');
    expect(mockGl.getUniformLocation).toHaveBeenCalledTimes(1);
  });

  it('should return null for unknown uniforms', () => {
    mockGl.getUniformLocation.mockReturnValue(null);
    const loc = cache.getLocation('u_missing');
    expect(loc).toBeNull();
  });

  it('should track cache hit statistics', () => {
    cache.getLocation('u_brightness');
    cache.getLocation('u_brightness');
    cache.getLocation('u_brightness');
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
  });

  it('should clear cache', () => {
    cache.getLocation('u_brightness');
    cache.clear();
    cache.getLocation('u_brightness');
    expect(mockGl.getUniformLocation).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Implement ShaderProgramCache**

Write to `packages/prismgb-gpu/src/infrastructure/optimization/shader-program-cache.ts`:

```typescript
export interface ShaderProgramCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly cachedLocations: number;
}

export class ShaderProgramCache {
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private _hits = 0;
  private _misses = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  setProgram(program: WebGLProgram): void {
    this.program = program;
    this.locations.clear();
    this._hits = 0;
    this._misses = 0;
  }

  getLocation(name: string): WebGLUniformLocation | null {
    if (this.locations.has(name)) {
      this._hits++;
      return this.locations.get(name)!;
    }

    this._misses++;
    const location = this.program
      ? this.gl.getUniformLocation(this.program, name)
      : null;
    this.locations.set(name, location);
    return location;
  }

  clear(): void {
    this.locations.clear();
    this._hits = 0;
    this._misses = 0;
  }

  getStats(): ShaderProgramCacheStats {
    return {
      hits: this._hits,
      misses: this._misses,
      cachedLocations: this.locations.size,
    };
  }
}
```

**Step 3: Run test**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/optimization/shader-program-cache.test.ts`
Expected: PASS

---

### Task 2.4: Create CaptureBuffer

**Files:**
- Create: `packages/prismgb-gpu/src/infrastructure/capture/capture-buffer.ts`

**Step 1: Write the failing test**

Create: `packages/prismgb-gpu/tests/unit/infrastructure/capture/capture-buffer.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CaptureBuffer } from '@/infrastructure/capture/capture-buffer';

describe('CaptureBuffer', () => {
  let captureBuffer: CaptureBuffer;
  let mockCanvas: any;

  beforeEach(() => {
    mockCanvas = {
      width: 640,
      height: 576,
      transferToImageBitmap: vi.fn().mockReturnValue({ close: vi.fn() }),
    };
    captureBuffer = new CaptureBuffer(mockCanvas);
  });

  it('should not have pending capture initially', () => {
    expect(captureBuffer.hasPendingCapture()).toBe(false);
  });

  it('should have pending capture after requestCapture', () => {
    captureBuffer.requestCapture();
    expect(captureBuffer.hasPendingCapture()).toBe(true);
  });

  it('should clear pending state after captureFrame', async () => {
    captureBuffer.requestCapture();
    await captureBuffer.captureFrame();
    expect(captureBuffer.hasPendingCapture()).toBe(false);
  });

  it('should call transferToImageBitmap on capture', async () => {
    captureBuffer.requestCapture();
    await captureBuffer.captureFrame();
    expect(mockCanvas.transferToImageBitmap).toHaveBeenCalled();
  });

  it('should dispose cleanly', () => {
    captureBuffer.dispose();
    expect(captureBuffer.hasPendingCapture()).toBe(false);
  });
});
```

**Step 2: Implement CaptureBuffer**

Write to `packages/prismgb-gpu/src/infrastructure/capture/capture-buffer.ts`:

```typescript
import type { ICaptureProvider } from '../../domain/pipeline/capture-provider.interface';

export class CaptureBuffer implements ICaptureProvider {
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private _pendingCapture = false;
  private _disposed = false;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
  }

  requestCapture(): void {
    if (!this._disposed) {
      this._pendingCapture = true;
    }
  }

  hasPendingCapture(): boolean {
    return this._pendingCapture;
  }

  async captureFrame(): Promise<ImageBitmap> {
    this._pendingCapture = false;

    if ('transferToImageBitmap' in this.canvas) {
      return (this.canvas as OffscreenCanvas).transferToImageBitmap();
    }

    return createImageBitmap(this.canvas);
  }

  dispose(): void {
    this._disposed = true;
    this._pendingCapture = false;
  }
}
```

**Step 3: Create capture barrel**

Write to `packages/prismgb-gpu/src/infrastructure/capture/index.ts`:

```typescript
export { CaptureBuffer } from './capture-buffer';
```

**Step 4: Run test**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/capture/capture-buffer.test.ts`
Expected: PASS

---

### Task 2.5: Create optimization barrel and commit Phase 2

**Files:**
- Create: `packages/prismgb-gpu/src/infrastructure/optimization/index.ts`

**Step 1: Create optimization barrel (internal use only)**

Write to `packages/prismgb-gpu/src/infrastructure/optimization/index.ts`:

```typescript
export { TypedArrayPool, type TypedArrayPoolStats } from './typed-array-pool';
export { UniformTracker, type UniformTrackerStats } from './uniform-tracker';
export { ShaderProgramCache, type ShaderProgramCacheStats } from './shader-program-cache';
```

**Step 2: Run all new Phase 2 tests**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/optimization/ packages/prismgb-gpu/src/infrastructure/capture/ packages/prismgb-gpu/tests/unit/infrastructure/
git commit -m "feat(gpu): add optimization utilities and capture buffer

Extract TypedArrayPool, UniformTracker (with cached views), and
ShaderProgramCache from app workers into package. Add CaptureBuffer
implementing ICaptureProvider for lazy frame capture."
```

---

## Phase 3: Pipeline Rewrite

**Risk:** HIGH — Core rendering logic, must preserve exact rendering output

**Strategy:** Start from worker engine implementations (battle-tested), layer on package architecture.

**Git tag before starting:** `git tag pre-pipeline-rewrite`

---

### Task 3.1: Rewrite BasePipeline with state machine

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/base-pipeline.ts`

**Step 1: Write the failing test**

Create: `packages/prismgb-gpu/tests/unit/infrastructure/base-pipeline.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { BasePipeline } from '@/infrastructure/base-pipeline';
import type { IPipelineOptions } from '@/domain/pipeline';
import type { FrameSource } from '@/domain/frame';
import type { PipelineUniforms } from '@/domain/shaders';
import type { IAdapterInfo } from '@/domain/pipeline';

class TestPipeline extends BasePipeline {
  readonly api = 'canvas2d' as const;

  protected async onInitialize(): Promise<void> {}
  protected onRenderFrame(_source: FrameSource, _uniforms: PipelineUniforms): void {}
  protected onResize(): void {}
  protected onSuspend(): void {}
  protected async onResume(): Promise<void> {}
  protected onDispose(): void {}

  getAdapterInfo(): IAdapterInfo | null { return null; }
}

describe('BasePipeline', () => {
  const makeOptions = (): IPipelineOptions => ({
    canvas: { width: 640, height: 576 } as any,
    config: { nativeWidth: 160, nativeHeight: 144, targetWidth: 640, targetHeight: 576 },
  });

  it('should start in uninitialized state', () => {
    const p = new TestPipeline();
    expect(p.state).toBe('uninitialized');
  });

  it('should transition to ready after initialize', async () => {
    const p = new TestPipeline();
    await p.initialize(makeOptions());
    expect(p.state).toBe('ready');
  });

  it('should transition to suspended on suspend', async () => {
    const p = new TestPipeline();
    await p.initialize(makeOptions());
    p.suspend();
    expect(p.state).toBe('suspended');
  });

  it('should transition back to ready on resume', async () => {
    const p = new TestPipeline();
    await p.initialize(makeOptions());
    p.suspend();
    await p.resume();
    expect(p.state).toBe('ready');
  });

  it('should transition to disposed on dispose', async () => {
    const p = new TestPipeline();
    await p.initialize(makeOptions());
    p.dispose();
    expect(p.state).toBe('disposed');
  });

  it('should throw on renderFrame when not ready', () => {
    const p = new TestPipeline();
    expect(() => p.renderFrame({} as any, {} as any)).toThrow();
  });

  it('should fire onStateChange callback', async () => {
    const onStateChange = vi.fn();
    const p = new TestPipeline();
    await p.initialize({ ...makeOptions(), callbacks: { onStateChange } });
    expect(onStateChange).toHaveBeenCalledWith('uninitialized', 'ready');
  });

  it('should fire onError callback on error', async () => {
    const onError = vi.fn();

    class ErrorPipeline extends TestPipeline {
      triggerError() {
        this.handleError({
          code: 'GPU_ERROR',
          message: 'test error',
          recoverable: true,
        });
      }
    }

    const p = new ErrorPipeline();
    await p.initialize({ ...makeOptions(), callbacks: { onError } });
    p.triggerError();
    expect(onError).toHaveBeenCalled();
    expect(p.state).toBe('error');
  });

  it('should track stats with rolling window', async () => {
    const p = new TestPipeline();
    await p.initialize(makeOptions());
    const stats = p.getStats();
    expect(stats.framesRendered).toBe(0);
    expect(stats.fps).toBe(0);
  });
});
```

**Step 2: Rewrite base-pipeline.ts**

Replace full content of `packages/prismgb-gpu/src/infrastructure/base-pipeline.ts`:

```typescript
import type { IPipeline, IPipelineOptions, IPipelineStats, IPipelineError, IPipelineCallbacks, PipelineState, IPipelineConfig } from '../domain/pipeline';
import type { FrameSource } from '../domain/frame';
import type { PipelineUniforms } from '../domain/shaders';
import type { RenderAPI } from '../domain/pipeline';

export abstract class BasePipeline implements IPipeline {
  protected canvas!: HTMLCanvasElement | OffscreenCanvas;
  protected config!: IPipelineConfig;
  protected callbacks?: IPipelineCallbacks;

  private _state: PipelineState = 'uninitialized';
  private _lastError: IPipelineError | null = null;
  private _framesRendered = 0;
  private _framesDropped = 0;
  private _frameCount = 0;
  private _totalFrameTime = 0;
  private _lastStatsTime = 0;
  private _currentFps = 0;
  private _currentFrameTime = 0;

  abstract readonly api: RenderAPI;

  get state(): PipelineState {
    return this._state;
  }

  get lastError(): IPipelineError | null {
    return this._lastError;
  }

  async initialize(options: IPipelineOptions): Promise<void> {
    this.assertState('uninitialized');
    this.canvas = options.canvas;
    this.config = options.config;
    this.callbacks = options.callbacks;
    this._lastStatsTime = performance.now();
    await this.onInitialize(options);
    this.transitionTo('ready');
  }

  renderFrame(source: FrameSource, uniforms: PipelineUniforms): void {
    this.assertState('ready');
    const start = performance.now();
    this.onRenderFrame(source, uniforms);
    const frameTime = performance.now() - start;
    this._framesRendered++;
    this.updateRollingStats(frameTime);
  }

  resize(width: number, height: number): void {
    this.assertState('ready');
    this.canvas.width = width;
    this.canvas.height = height;
    this.onResize();
  }

  suspend(): void {
    this.assertState('ready');
    this.onSuspend();
    this.transitionTo('suspended');
  }

  async resume(): Promise<void> {
    if (this._state !== 'suspended' && this._state !== 'error') {
      throw new Error(`Cannot resume from state '${this._state}'`);
    }
    if (this._state === 'error' && this._lastError && !this._lastError.recoverable) {
      throw new Error(`Cannot resume from non-recoverable error: ${this._lastError.message}`);
    }
    await this.onResume();
    this._lastError = null;
    this.transitionTo('ready');
  }

  dispose(): void {
    if (this._state === 'disposed') return;
    this.onDispose();
    this.transitionTo('disposed');
  }

  getStats(): IPipelineStats {
    return {
      fps: this._currentFps,
      frameTime: this._currentFrameTime,
      framesRendered: this._framesRendered,
      framesDropped: this._framesDropped,
    };
  }

  protected transitionTo(newState: PipelineState): void {
    const oldState = this._state;
    this._state = newState;
    this.callbacks?.onStateChange?.(oldState, newState);
  }

  protected handleError(error: IPipelineError): void {
    this._lastError = error;
    this.transitionTo('error');
    this.callbacks?.onError?.(error);
  }

  protected incrementDroppedFrames(): void {
    this._framesDropped++;
  }

  protected assertState(...expected: PipelineState[]): void {
    if (!expected.includes(this._state)) {
      throw new Error(`Invalid state '${this._state}', expected one of: ${expected.join(', ')}`);
    }
  }

  private updateRollingStats(frameTime: number): void {
    this._frameCount++;
    this._totalFrameTime += frameTime;

    const now = performance.now();
    if (now - this._lastStatsTime >= 1000) {
      this._currentFps = this._frameCount;
      this._currentFrameTime = this._totalFrameTime / this._frameCount;
      this._frameCount = 0;
      this._totalFrameTime = 0;
      this._lastStatsTime = now;

      this.callbacks?.onStats?.(this.getStats());
    }
  }

  protected abstract onInitialize(options: IPipelineOptions): Promise<void>;
  protected abstract onRenderFrame(source: FrameSource, uniforms: PipelineUniforms): void;
  protected abstract onResize(): void;
  protected abstract onSuspend(): void;
  protected abstract onResume(): Promise<void>;
  protected abstract onDispose(): void;
}
```

**Step 3: Run test**

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/infrastructure/base-pipeline.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/base-pipeline.ts packages/prismgb-gpu/tests/unit/infrastructure/base-pipeline.test.ts
git commit -m "refactor(gpu): rewrite BasePipeline with state machine and rolling stats

Replace boolean flags with PipelineState enum. Add suspend/resume lifecycle,
error classification with handleError(), rolling 1-second stats window,
and IPipelineCallbacks dispatch."
```

---

### Task 3.2: Rewrite WebGPUPipeline

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/webgpu/webgpu-pipeline.ts`

This is the largest single task. The pipeline must:
1. Extend new BasePipeline (implement onInitialize, onRenderFrame, etc.)
2. Integrate TypedArrayPool, upgraded UniformTracker, BindGroupCache from optimization/
3. Add device.onuncapturederror handler
4. Add adapter info capture
5. Add suspend/resume (release textures, preserve shaders)
6. Accept injectable IShaderLoader
7. Preserve exact same rendering output (4-pass chain unchanged)

**Source:** Merge `webgpu-renderer.engine.ts` (665 lines, worker) with existing `webgpu-pipeline.ts` (537 lines, package). Take worker's optimizations + package's interface structure.

**Step 1: Rewrite webgpu-pipeline.ts**

This file is too large to inline fully in the plan. The engineer should:
1. Read both source files side-by-side
2. Start from the worker's `WebGPURenderer` as the base implementation
3. Wrap it in BasePipeline's lifecycle (onInitialize/onRenderFrame/onSuspend/onResume/onDispose)
4. Replace worker's raw optimization utils with package's extracted classes
5. Add IShaderLoader injection (default: existing ViteShaderLoader)
6. Add error classification via handleError()
7. Add adapter info via getAdapterInfo()

Key method mapping:
- Worker `initialize()` → `onInitialize(options)`
- Worker `uploadFrame()` + `render()` → `onRenderFrame(source, uniforms)`
- Worker `resize()` → `onResize()`
- Worker resource cleanup → `onSuspend()`
- Worker re-init → `onResume()`
- Worker `destroy()` → `onDispose()`

**Step 2: Run typecheck**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`
Expected: PASS (or errors in other pipeline files — fix in next tasks)

**Step 3: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/webgpu/
git commit -m "refactor(gpu): rewrite WebGPUPipeline with production features

Merge worker engine optimizations into package pipeline:
TypedArrayPool, cached UniformTracker, BindGroupCache,
device.onuncapturederror, adapter info, suspend/resume,
injectable IShaderLoader, error classification."
```

---

### Task 3.3: Rewrite WebGL2Pipeline

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/webgl2/webgl2-pipeline.ts`

Same pattern as WebGPU. Source from `webgl2-renderer.engine.ts` (275 lines).

Key additions:
1. ShaderProgramCache integration (from optimization/)
2. State machine via BasePipeline
3. WebGL context lost/restored events → error classification
4. Suspend: release framebuffers + textures, keep programs
5. Resume: recreate framebuffers + textures

**Step 1: Rewrite webgl2-pipeline.ts following same pattern as Task 3.2**

**Step 2: Run typecheck**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/webgl2/
git commit -m "refactor(gpu): rewrite WebGL2Pipeline with ShaderProgramCache and state machine"
```

---

### Task 3.4: Update Canvas2DPipeline

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/canvas2d/canvas2d-pipeline.ts`

Minimal changes — add state machine methods.

**Step 1: Rewrite canvas2d-pipeline.ts to extend new BasePipeline**

```typescript
import { BasePipeline } from '../base-pipeline';
import type { IPipelineOptions } from '../../domain/pipeline';
import type { FrameSource } from '../../domain/frame';
import type { PipelineUniforms } from '../../domain/shaders';
import type { IAdapterInfo, RenderAPI } from '../../domain/pipeline';

export class Canvas2DPipeline extends BasePipeline {
  readonly api: RenderAPI = 'canvas2d';
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  protected async onInitialize(options: IPipelineOptions): Promise<void> {
    this.ctx = this.canvas.getContext('2d', { desynchronized: true }) as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error('Failed to get Canvas2D context');
    }

    (this.ctx as any).imageSmoothingEnabled = false;
  }

  protected onRenderFrame(source: FrameSource, _uniforms: PipelineUniforms): void {
    if (!this.ctx) return;
    this.ctx.drawImage(
      source as CanvasImageSource,
      0, 0,
      this.canvas.width,
      this.canvas.height
    );
  }

  protected onResize(): void {}

  protected onSuspend(): void {
    this.ctx = null;
  }

  protected async onResume(): Promise<void> {
    this.ctx = this.canvas.getContext('2d', { desynchronized: true }) as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  }

  protected onDispose(): void {
    this.ctx = null;
  }

  getAdapterInfo(): IAdapterInfo | null {
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/canvas2d/
git commit -m "refactor(gpu): update Canvas2DPipeline for new BasePipeline interface"
```

---

### Task 3.5: Update infrastructure barrel and createPipeline factory

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/index.ts`
- Modify: `packages/prismgb-gpu/src/factories/pipeline.factory.ts`

**Step 1: Update infrastructure barrel**

Replace `packages/prismgb-gpu/src/infrastructure/index.ts`:

```typescript
export { BasePipeline } from './base-pipeline';
export { Canvas2DPipeline } from './canvas2d';
export { WebGL2Pipeline } from './webgl2';
export { WebGPUPipeline } from './webgpu';
export { CaptureBuffer } from './capture';
```

**Step 2: Update createPipeline factory**

The factory needs to adapt to the new `IPipelineOptions` signature. Update `packages/prismgb-gpu/src/factories/pipeline.factory.ts` to:
1. Accept `CreatePipelineOptions` that includes canvas, config, preset, preferredAPI
2. Call `pipeline.initialize(options)` with the new interface
3. Maintain the same fallback chain: WebGPU → WebGL2 → Canvas2D

**Step 3: Update package index.ts to also export pipeline classes and CaptureBuffer**

Add to `packages/prismgb-gpu/src/index.ts`:

```typescript
// Pipeline Classes (for custom integration — e.g., worker usage)
export { WebGPUPipeline } from './infrastructure/webgpu';
export { WebGL2Pipeline } from './infrastructure/webgl2';
export { Canvas2DPipeline } from './infrastructure/canvas2d';

// Capture
export { CaptureBuffer } from './infrastructure/capture';
```

**Step 4: Run typecheck**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`
Expected: PASS

**Step 5: Run all package tests**

Run: `cd packages/prismgb-gpu && npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/prismgb-gpu/src/
git commit -m "refactor(gpu): update infrastructure barrel, factory, and public exports

Add WebGPUPipeline, WebGL2Pipeline, Canvas2DPipeline, CaptureBuffer
to public API. Update createPipeline factory for new IPipelineOptions."
```

---

## Phase 4: Package Tests

**Risk:** MEDIUM — Test new code from Phases 1-3

---

### Task 4.1: Add UniformContext tests

**Files:**
- Create: `packages/prismgb-gpu/tests/unit/application/uniform-context.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { UniformContext } from '@/application/uniform-context';
import { PresetRegistry } from '@/domain/presets';

describe('UniformContext', () => {
  const preset = PresetRegistry.getDefault();

  it('should build uniforms on construction', () => {
    const ctx = new UniformContext(preset, 160, 144, 640, 576);
    const uniforms = ctx.getUniforms();
    expect(uniforms.upscale.inputSize).toEqual([160, 144]);
    expect(uniforms.upscale.scaleFactor).toBe(4);
  });

  it('should return false when nothing changed', () => {
    const ctx = new UniformContext(preset, 160, 144, 640, 576);
    expect(ctx.update({})).toBe(false);
  });

  it('should return true and rebuild when brightness changes', () => {
    const ctx = new UniformContext(preset, 160, 144, 640, 576);
    const before = ctx.getUniforms();
    expect(ctx.update({ brightness: 0.5 })).toBe(true);
    const after = ctx.getUniforms();
    expect(after.color.brightness).not.toBe(before.color.brightness);
  });

  it('should return true and rebuild when preset changes', () => {
    const ctx = new UniformContext(preset, 160, 144, 640, 576);
    const vibrant = PresetRegistry.get('vibrant')!;
    expect(ctx.update({ preset: vibrant })).toBe(true);
  });

  it('should cache uniforms until update', () => {
    const ctx = new UniformContext(preset, 160, 144, 640, 576);
    const first = ctx.getUniforms();
    const second = ctx.getUniforms();
    expect(first).toBe(second);
  });

  it('should invalidate cache after update', () => {
    const ctx = new UniformContext(preset, 160, 144, 640, 576);
    const first = ctx.getUniforms();
    ctx.update({ brightness: 0.8 });
    const second = ctx.getUniforms();
    expect(first).not.toBe(second);
  });
});
```

Run: `cd packages/prismgb-gpu && npx vitest run tests/unit/application/uniform-context.test.ts`
Expected: PASS

---

### Task 4.2: Run full package test suite and commit Phase 4

**Step 1: Run all package tests**

Run: `cd packages/prismgb-gpu && npx vitest run`
Expected: All PASS

**Step 2: Commit**

```bash
git add packages/prismgb-gpu/tests/
git commit -m "test(gpu): add tests for state machine, optimization utilities, UniformContext, CaptureBuffer"
```

---

## Phase 5: App Worker Simplification

**Risk:** HIGH — Changes the actual rendering path

**Git tag before starting:** `git tag pre-worker-migration`

---

### Task 5.1: Rewrite render.worker.ts

**Files:**
- Modify: `src/renderer/infrastructure/rendering/workers/render.worker.ts`

**Step 1: Rewrite render.worker.ts as thin message router**

Replace full content of `src/renderer/infrastructure/rendering/workers/render.worker.ts`:

```typescript
import { WebGPUPipeline, WebGL2Pipeline, CaptureBuffer } from '@prismgb/gpu';
import type { IPipeline, IPipelineError, IPipelineStats } from '@prismgb/gpu';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerResponse,
  isValidWorkerMessage,
} from './worker-protocol.config';

let pipeline: IPipeline | null = null;
let captureBuffer: CaptureBuffer | null = null;

self.onmessage = async (event: MessageEvent) => {
  if (!isValidWorkerMessage(event.data)) return;

  const { type, payload } = event.data;

  switch (type) {
    case WorkerMessageType.INIT: {
      const PipelineClass = payload.config.api === 'webgpu' ? WebGPUPipeline : WebGL2Pipeline;
      pipeline = new PipelineClass();

      await pipeline.initialize({
        canvas: payload.canvas,
        config: {
          nativeWidth: payload.config.nativeWidth,
          nativeHeight: payload.config.nativeHeight,
          targetWidth: payload.config.targetWidth,
          targetHeight: payload.config.targetHeight,
        },
        callbacks: {
          onError: (error: IPipelineError) => {
            self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
              message: error.message,
              code: error.code,
              adapterInfo: error.adapterInfo ?? null,
            }));
          },
          onStats: (stats: IPipelineStats) => {
            self.postMessage(createWorkerResponse(WorkerResponseType.STATS, {
              fps: stats.fps,
              frameTime: stats.frameTime.toFixed(2),
            }));
          },
        },
      });

      captureBuffer = new CaptureBuffer(payload.canvas);
      self.postMessage(createWorkerResponse(WorkerResponseType.READY, { api: pipeline.api }));
      break;
    }

    case WorkerMessageType.FRAME: {
      if (!pipeline || pipeline.state !== 'ready') break;

      pipeline.renderFrame(payload.imageBitmap, payload.uniforms);

      if (captureBuffer?.hasPendingCapture()) {
        await captureBuffer.captureFrame();
      }

      self.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED));
      payload.imageBitmap.close();
      break;
    }

    case WorkerMessageType.RESIZE: {
      if (!pipeline || pipeline.state !== 'ready') break;
      pipeline.resize(payload.width, payload.height);
      break;
    }

    case WorkerMessageType.REQUEST_CAPTURE: {
      captureBuffer?.requestCapture();
      self.postMessage(createWorkerResponse(WorkerResponseType.CAPTURE_REQUESTED));
      break;
    }

    case WorkerMessageType.CAPTURE: {
      if (!captureBuffer) break;
      const bitmap = await captureBuffer.captureFrame();
      self.postMessage(
        createWorkerResponse(WorkerResponseType.CAPTURE_READY, { bitmap }),
        { transfer: [bitmap] } as any,
      );
      break;
    }

    case WorkerMessageType.RELEASE: {
      if (pipeline && pipeline.state === 'ready') {
        pipeline.suspend();
      }
      self.postMessage(createWorkerResponse(WorkerResponseType.RELEASED));
      break;
    }

    case WorkerMessageType.DESTROY: {
      pipeline?.dispose();
      captureBuffer?.dispose();
      pipeline = null;
      captureBuffer = null;
      self.postMessage(createWorkerResponse(WorkerResponseType.DESTROYED));
      break;
    }
  }
};
```

**Step 2: Verify worker compiles**

Run: `npm run lint`
Expected: PASS (or warnings only)

---

### Task 5.2: Delete worker engine files

**Files:**
- Delete: `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts`
- Delete: `src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts`
- Delete: `src/renderer/infrastructure/rendering/workers/optimization.utils.ts`
- Delete: `src/renderer/infrastructure/rendering/workers/engine.types.ts`

**Step 1: Delete files**

```bash
git rm src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts
git rm src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts
git rm src/renderer/infrastructure/rendering/workers/optimization.utils.ts
git rm src/renderer/infrastructure/rendering/workers/engine.types.ts
```

**Step 2: Verify remaining workers/ directory**

```bash
ls src/renderer/infrastructure/rendering/workers/
```

Expected: Only `render.worker.ts` and `worker-protocol.config.ts`

**Step 3: Run tests**

Run: `npm run test:run`

Expected: Some tests may fail if they import deleted files. Fix test imports in next task.

---

### Task 5.3: Update tests that reference deleted files

**Files:**
- Check: `tests/performance/gpu-optimization.benchmark.test.js` (imports from optimization.utils.ts)
- Check: Any other tests importing worker engine files

**Step 1: Update gpu-optimization.benchmark.test.js**

This test imports `TypedArrayPool`, `UniformTracker`, `BindGroupCache` from the worker's `optimization.utils.ts`. Update imports to use `@prismgb/gpu` internal paths or the package's test exports.

Since these classes are internal to the package, and the benchmark tests live in the app, they should import from the package's test infrastructure or be moved to the package's test directory.

**Approach:** Move GPU optimization benchmarks to `packages/prismgb-gpu/tests/performance/` since they test package internals.

**Step 2: Run full test suite**

Run: `npm run test:run`
Expected: All PASS

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor(gpu): simplify render worker to use @prismgb/gpu pipelines

Replace 1,770 lines of worker rendering code with ~80-line message router
that delegates to package pipeline classes. Delete webgpu-renderer.engine.ts,
webgl2-renderer.engine.ts, optimization.utils.ts, engine.types.ts."
```

---

## Phase 6: Duplicate Cleanup

**Risk:** LOW — Removing duplicates, not changing behavior

---

### Task 6.1: Delete duplicate shader files

**Files:**
- Delete: `src/renderer/infrastructure/rendering/shaders/webgl2/common.vert.glsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgl2/pixel-upscale.frag.glsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgl2/unsharp-mask.frag.glsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgl2/color-elevation.frag.glsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgl2/crt-lcd.frag.glsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgpu/pixel-upscale.wgsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgpu/unsharp-mask.wgsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgpu/color-elevation.wgsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/webgpu/crt-lcd.wgsl`
- Delete: `src/renderer/infrastructure/rendering/shaders/` (entire directory)

**Step 1: Verify no app code imports these shaders**

Search for imports from `rendering/shaders/` in app code. After Phase 5, the worker no longer imports shaders directly — the package pipelines handle shader loading internally.

**Step 2: Delete shader directory**

```bash
git rm -r src/renderer/infrastructure/rendering/shaders/
```

**Step 3: Commit**

```bash
git commit -m "chore(gpu): delete duplicate shader files from app

Shaders are now owned exclusively by @prismgb/gpu package.
Removes 9 duplicate shader files (5 GLSL, 4 WGSL)."
```

---

### Task 6.2: Simplify gpu-renderer.service.ts with UniformContext

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`

**Step 1: Replace manual uniform caching with UniformContext**

Import `UniformContext` from `@prismgb/gpu` and replace the `_getCachedUniforms()` method and associated cache fields.

Before (approximate):
```typescript
private _cachedUniforms = null;
private _cachedPresetId = null;
private _cachedScaleFactor = null;
// ... etc

_getCachedUniforms() {
  if (this._cachedPresetId === this._currentPresetId && ...) {
    return this._cachedUniforms;
  }
  this._cachedUniforms = buildUniforms({...});
  // ... update cached fields
  return this._cachedUniforms;
}
```

After:
```typescript
import { UniformContext } from '@prismgb/gpu';

// In initialize():
this._uniformContext = new UniformContext(preset, NATIVE_WIDTH, NATIVE_HEIGHT, targetWidth, targetHeight, brightness);

// In renderFrame():
const uniforms = this._uniformContext.getUniforms();

// In setPreset():
this._uniformContext.update({ preset });

// In setBrightness():
this._uniformContext.update({ brightness });

// In resize():
this._uniformContext.update({ targetWidth, targetHeight });
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts
git commit -m "refactor(streaming): simplify gpu-renderer.service with UniformContext

Replace ~30 lines of manual uniform caching with @prismgb/gpu UniformContext."
```

---

## Phase 7: Validation

**Risk:** N/A — Verification only

---

### Task 7.1: Full validation suite

**Step 1: Package tests**

Run: `cd packages/prismgb-gpu && npx vitest run`
Expected: All PASS

**Step 2: App tests**

Run: `npm run test:run`
Expected: All tests PASS (2885+ tests)

**Step 3: Lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Type check (package)**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`
Expected: No errors

**Step 5: Build**

Run: `npm run build`
Expected: Build succeeds for current platform

**Step 6: Dev mode verification**

Run: `npm run dev`

Manual verification checklist:
- [ ] Stream starts with Chromatic device
- [ ] All 5 presets render correctly (true-color, vibrant, hi-def, vintage, pixel)
- [ ] Preset switching works
- [ ] Brightness adjustment works
- [ ] Resize/fullscreen works
- [ ] Screenshots capture with shader effects applied
- [ ] Recording works
- [ ] Tab hide/show recovers rendering
- [ ] Performance mode fallback works

**Step 7: Commit final state**

```bash
git add -A
git commit -m "test(gpu): verify full consolidation — all tests passing"
```

---

## Summary

| Phase | Tasks | Risk | Estimated lines changed |
|-------|-------|------|------------------------|
| 1: Domain interfaces | 12 tasks | LOW | ~300 added |
| 2: Optimization utilities | 5 tasks | MEDIUM | ~400 added |
| 3: Pipeline rewrite | 5 tasks | HIGH | ~1,500 rewritten |
| 4: Package tests | 2 tasks | MEDIUM | ~200 added |
| 5: App worker simplification | 3 tasks | HIGH | ~1,770 deleted, ~80 rewritten |
| 6: Duplicate cleanup | 2 tasks | LOW | ~30 simplified, 9 files deleted |
| 7: Validation | 1 task | N/A | Verification only |

**Total commits:** ~12
**Net code change:** ~1,700 lines deleted from app, ~500 lines added to package
