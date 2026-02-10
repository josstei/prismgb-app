# @prismgb/gpu Package Consolidation Design

**Date**: 2026-02-09
**Status**: Proposed
**Branch**: TBD (feature/gpu-package-consolidation)

## Problem Statement

The `@prismgb/gpu` package was extracted with the intent of owning the full GPU rendering pipeline, but the extraction is incomplete. The package currently has a **split identity**:

- **Properly integrated**: PresetRegistry, buildUniforms(), detectCapabilities() — used by 4 app source files
- **Orphaned**: Full pipeline implementations (WebGPUPipeline, WebGL2Pipeline, Canvas2DPipeline), createPipeline() factory, all shader files — never consumed by the app

Meanwhile, the app maintains its own independent rendering implementations in `src/renderer/infrastructure/rendering/workers/` that are **more production-hardened** than the package versions. Shader files are **byte-for-byte duplicated** in both locations.

### Current State

| Component | Package | App Workers | Status |
|-----------|---------|-------------|--------|
| PresetRegistry | Yes (used) | No | Properly decomposed |
| buildUniforms() | Yes (used) | No | Properly decomposed |
| detectCapabilities() | Yes (used) | No | Properly decomposed |
| WebGPU rendering engine | Yes (unused) | Yes (production) | **Duplicated** |
| WebGL2 rendering engine | Yes (unused) | Yes (production) | **Duplicated** |
| Shader files (9 total) | Yes (unused) | Yes (production) | **Byte-for-byte duplicate** |
| BindGroupCache | Yes (basic) | Yes (with stats) | **Duplicated, workers ahead** |
| UniformTracker | Yes (basic) | Yes (cached views) | **Duplicated, workers ahead** |
| TypedArrayPool | No | Yes | **Missing from package** |
| ShaderProgramCache | No | Yes | **Missing from package** |
| CaptureBufferManager | No | Yes | **Missing from package** |
| Pipeline state machine | No | Partial (RELEASE) | **Missing from package** |
| Error classification | No | Yes (device lost, GPU error) | **Missing from package** |
| Adapter info reporting | No | Yes | **Missing from package** |
| createPipeline() factory | Yes (unused) | No | **Orphaned** |

### Worker Optimizations Missing from Package

1. **TypedArrayPool**: Pre-allocated Float32Array pools with round-robin allocation, eliminating GC pressure at 60fps
2. **Cached Uint8Array views**: UniformTracker reuses views across frames instead of allocating per-frame
3. **ShaderProgramCache**: WebGL2 uniform location caching, eliminates per-frame string lookups
4. **Rolling 1-second stats window**: Smoother FPS reporting vs. package's per-frame instant calculation
5. **device.onuncapturederror**: Catches shader/pipeline compilation errors
6. **Adapter info reporting**: GPU vendor, architecture, device diagnostics
7. **Error recovery**: RELEASE command for resource cleanup without pipeline destruction

## Design Goals

1. **Single source of truth**: All GPU rendering code lives in `@prismgb/gpu`
2. **Production-ready**: Package pipelines include all worker optimizations
3. **Clean interfaces**: Proper abstractions at all boundaries
4. **Worker-compatible**: Pipelines work in both main-thread and worker contexts
5. **Extensible**: Interface-driven design for future expansion
6. **Pattern-setting**: Establish decomposition pattern for future packages (`@prismgb/devices`, etc.)

## Package Boundary Pattern

The decomposition follows a **domain vs. integration** boundary:

**Package owns** (GPU domain logic):
- Rendering pipelines (WebGPU, WebGL2, Canvas2D)
- Shader source files
- Performance optimizations (TypedArrayPool, BindGroupCache, UniformTracker, ShaderProgramCache)
- Presets, uniform building, capability detection
- Frame capture from canvas
- Pipeline statistics, error classification, adapter diagnostics

**App owns** (integration logic):
- Worker creation/lifecycle (`render.worker.ts` as message router)
- OffscreenCanvas transfer choreography
- Worker message protocol (WorkerMessageType, WorkerResponseType)
- Render loop timing (requestVideoFrameCallback)
- GpuWorkerManager, GpuRendererService (app orchestration)

This pattern generalizes for future packages:
- `@prismgb/devices`: Device profiles, USB identifiers, capability matching
- App: Electron USB bridges, IPC handlers, device lifecycle orchestration

## Target Package Structure

```
packages/prismgb-gpu/src/
├── index.ts                            # Public API barrel
│
├── domain/                             # Zero dependencies — pure contracts
│   ├── index.ts
│   ├── pipeline/
│   │   ├── index.ts
│   │   ├── pipeline.interface.ts       # IPipeline (core contract)
│   │   ├── pipeline-config.interface.ts # IPipelineConfig, IPipelineOptions
│   │   ├── pipeline-capabilities.interface.ts # IPipelineCapabilities
│   │   ├── pipeline-stats.interface.ts  # IPipelineStats
│   │   ├── pipeline-error.interface.ts  # IPipelineError, PipelineErrorCode
│   │   ├── pipeline-callbacks.interface.ts # IPipelineCallbacks
│   │   ├── pipeline-state.type.ts      # PipelineState
│   │   └── adapter-info.interface.ts   # IAdapterInfo
│   ├── frame/
│   │   ├── index.ts
│   │   └── frame-source.type.ts        # FrameSource type (IFrameProvider removed)
│   ├── presets/
│   │   ├── index.ts
│   │   ├── preset.interface.ts         # IPreset, config subtypes
│   │   ├── preset-provider.interface.ts # IPresetProvider (read-only access)
│   │   ├── preset-registry.ts          # PresetRegistry (implements IPresetProvider)
│   │   └── presets/                    # 6 built-in presets
│   └── shaders/
│       ├── index.ts
│       ├── shader-uniforms.types.ts    # PipelineUniforms, per-pass uniform types
│       └── shader-loader.interface.ts  # IShaderLoader
│
├── application/                        # Depends on domain/ only
│   ├── index.ts
│   ├── capability-detector.ts          # detectCapabilities()
│   ├── uniform-builder.ts             # buildUniforms(), calculateScaleFactor()
│   └── uniform-context.ts             # UniformContext (caching helper)
│
└── infrastructure/                     # Depends on domain/ + application/
    ├── index.ts
    ├── pipelines/                      # IPipeline implementations
    │   ├── base-pipeline.ts            # Abstract base: state machine, stats, errors
    │   ├── webgpu/
    │   │   ├── index.ts
    │   │   ├── webgpu-pipeline.ts      # Production WebGPU (merged from workers)
    │   │   ├── webgpu-shader-loader.ts # ViteShaderLoader for WGSL
    │   │   └── shaders/               # 4 WGSL shader files (single source of truth)
    │   │       ├── pixel-upscale.wgsl
    │   │       ├── unsharp-mask.wgsl
    │   │       ├── color-elevation.wgsl
    │   │       └── crt-lcd.wgsl
    │   ├── webgl2/
    │   │   ├── index.ts
    │   │   ├── webgl2-pipeline.ts      # Production WebGL2 (merged from workers)
    │   │   ├── webgl2-shader-loader.ts # ViteShaderLoader for GLSL
    │   │   └── shaders/               # 5 GLSL shader files (single source of truth)
    │   │       ├── common.vert.glsl
    │   │       ├── pixel-upscale.frag.glsl
    │   │       ├── unsharp-mask.frag.glsl
    │   │       ├── color-elevation.frag.glsl
    │   │       └── crt-lcd.frag.glsl
    │   └── canvas2d/
    │       ├── index.ts
    │       └── canvas2d-pipeline.ts    # Minimal fallback
    ├── optimization/                   # Internal utilities (NOT exported)
    │   ├── bind-group-cache.ts         # WebGPU bind group caching (merged)
    │   ├── uniform-tracker.ts          # FNV-1a hashing + cached views (merged)
    │   ├── typed-array-pool.ts         # Pre-allocated Float32Arrays (from workers)
    │   └── shader-program-cache.ts     # WebGL2 uniform location caching (from workers)
    ├── capture/
    │   ├── index.ts
    │   ├── capture-provider.interface.ts # ICaptureProvider
    │   └── capture-buffer.ts           # CaptureBuffer (from workers' CaptureBufferManager)
    └── pipeline.factory.ts            # createPipeline() with fallback chain
```

## Public API Surface

### Tiered exports

```typescript
// === Tier 1: Factory (most consumers start here) ===
export { createPipeline } from './infrastructure/pipeline.factory';
export type { CreatePipelineOptions } from './infrastructure/pipeline.factory';

// === Tier 2: Application Services ===
export { PresetRegistry } from './domain/presets';
export { detectCapabilities } from './application/capability-detector';
export { buildUniforms, calculateScaleFactor } from './application/uniform-builder';
export { UniformContext } from './application/uniform-context';

// === Tier 3: Pipeline Classes (for custom integration) ===
export { WebGPUPipeline } from './infrastructure/pipelines/webgpu';
export { WebGL2Pipeline } from './infrastructure/pipelines/webgl2';
export { Canvas2DPipeline } from './infrastructure/pipelines/canvas2d';

// === Tier 4: Utilities ===
export { CaptureBuffer } from './infrastructure/capture';

// === Interfaces (contracts) ===
export type { IPipeline, IPipelineConfig, IPipelineOptions };
export type { IPipelineCapabilities, WebGPULimits, WebGL2Info };
export type { IPipelineStats };
export type { IPipelineError, PipelineErrorCode };
export type { IPipelineCallbacks };
export type { PipelineState };
export type { IAdapterInfo };
export type { IPreset, IPresetProvider, UpscaleConfig, UnsharpConfig, ColorConfig, CRTConfig };
export type { PipelineUniforms, UpscaleUniforms, UnsharpUniforms, ColorUniforms, CRTUniforms };
export type { FrameSource };
export type { IShaderLoader };
export type { ICaptureProvider };
export type { RenderAPI };
```

### NOT exported (internal implementation details)

- `BasePipeline` — abstract base, not for external use
- `BindGroupCache`, `UniformTracker`, `TypedArrayPool`, `ShaderProgramCache` — optimization internals
- `ViteShaderLoader` implementations — internal to each pipeline

## Core Interfaces

### IPipeline (core contract)

```typescript
type PipelineState = 'uninitialized' | 'ready' | 'suspended' | 'error' | 'disposed';

interface IPipeline {
  // Lifecycle
  initialize(options: IPipelineOptions): Promise<void>;
  suspend(): void;
  resume(): Promise<void>;
  dispose(): void;

  // Rendering
  // NOTE: Pipeline does NOT take ownership of source.
  // Caller is responsible for cleanup (e.g., ImageBitmap.close()).
  renderFrame(source: FrameSource, uniforms: PipelineUniforms): void;
  resize(width: number, height: number): void;

  // State
  readonly state: PipelineState;
  readonly api: RenderAPI;
  readonly lastError: IPipelineError | null;

  // Diagnostics
  getStats(): IPipelineStats;
  getAdapterInfo(): IAdapterInfo | null;
}
```

### IPipelineOptions

```typescript
interface IPipelineOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  config: IPipelineConfig;
  shaderLoader?: IShaderLoader;
  captureProvider?: ICaptureProvider;
  callbacks?: IPipelineCallbacks;
}
```

### IPipelineError

```typescript
type PipelineErrorCode = 'DEVICE_LOST' | 'SHADER_ERROR' | 'GPU_ERROR' | 'CONTEXT_LOST';

interface IPipelineError {
  code: PipelineErrorCode;
  message: string;
  recoverable: boolean;
  adapterInfo?: IAdapterInfo;
}
```

### IPipelineCallbacks

```typescript
interface IPipelineCallbacks {
  onError?: (error: IPipelineError) => void;
  onStats?: (stats: IPipelineStats) => void;
  onStateChange?: (from: PipelineState, to: PipelineState) => void;
}
```

### IPipelineStats

```typescript
interface IPipelineStats {
  fps: number;
  frameTime: number;
  framesRendered: number;
  framesDropped: number;
  gpuMemoryBytes?: number;
}
```

### IPipelineCapabilities

```typescript
interface IPipelineCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  transferControlToOffscreen: boolean;
  preferredAPI: RenderAPI;
  maxTextureSize: number;
  webgpuLimits?: WebGPULimits;
  webgl2Info?: WebGL2Info;
  webgpuFeatures?: GPUFeatureName[];
}
```

### IShaderLoader

```typescript
interface IShaderLoader {
  load(shaderId: string): string;
}
```

### ICaptureProvider

```typescript
interface ICaptureProvider {
  requestCapture(): void;
  hasPendingCapture(): boolean;
  captureFrame(): Promise<ImageBitmap>;
  dispose(): void;
}
```

### IPresetProvider

```typescript
interface IPresetProvider {
  get(id: string): IPreset | undefined;
  getDefault(): IPreset;
  getAll(): IPreset[];
  getForUI(): PresetUIEntry[];
}
```

### IAdapterInfo

```typescript
interface IAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  api: RenderAPI;
}
```

### Pipeline State Machine

```
State transitions:
  uninitialized ──initialize()──→ ready
  ready ──suspend()──→ suspended
  ready ──[error]──→ error
  ready ──dispose()──→ disposed
  suspended ──resume()──→ ready
  suspended ──dispose()──→ disposed
  error ──resume()──→ ready  (if error.recoverable)
  error ──dispose()──→ disposed
```

Key design decisions:
- `suspend()` releases GPU resources (textures, buffers) but preserves shader modules and device
- `resume()` re-acquires resources (~10ms vs ~100ms for full init)
- Canvas replacement requires `dispose()` + new pipeline instance (no canvas swap on resume)
- State assertions on all operations prevent invalid usage

### UniformContext (application-layer helper)

```typescript
class UniformContext {
  constructor(preset: IPreset, nativeWidth: number, nativeHeight: number);

  update(changes: {
    targetWidth?: number;
    targetHeight?: number;
    brightness?: number;
    preset?: IPreset;
  }): boolean;  // returns true if uniforms changed

  getUniforms(): PipelineUniforms;
}
```

Eliminates manual caching in consumers. The app's `gpu-renderer.service.ts` replaces ~30 lines of cache management.

## App Impact

### Files deleted (moved to package)

| File | Lines | Replacement |
|------|-------|-------------|
| `rendering/shaders/webgl2/*.glsl` (5 files) | - | Package shaders |
| `rendering/shaders/webgpu/*.wgsl` (4 files) | - | Package shaders |
| `rendering/shaders/` directory | - | Empty |
| `workers/webgpu-renderer.engine.ts` | ~650 | `@prismgb/gpu` WebGPUPipeline |
| `workers/webgl2-renderer.engine.ts` | ~550 | `@prismgb/gpu` WebGL2Pipeline |
| `workers/optimization.utils.ts` | ~530 | `@prismgb/gpu` optimization/ classes |
| `workers/engine.types.ts` | ~40 | `@prismgb/gpu` domain types |

**Total deletion**: ~1,770 lines + 9 shader files

### Files rewritten

**`render.worker.ts`** (~200 lines → ~80 lines):
Thin message router that delegates to `@prismgb/gpu` pipeline classes.

```typescript
import { WebGPUPipeline, WebGL2Pipeline, CaptureBuffer } from '@prismgb/gpu';
import type { IPipeline, IPipelineError, IPipelineStats } from '@prismgb/gpu';
import { WorkerMessageType, WorkerResponseType } from './worker-protocol.config';

let pipeline: IPipeline;
let captureBuffer: CaptureBuffer;

self.onmessage = async ({ data: { type, payload } }) => {
  switch (type) {
    case WorkerMessageType.INIT: {
      const PipelineClass = payload.api === 'webgpu' ? WebGPUPipeline : WebGL2Pipeline;
      pipeline = new PipelineClass();
      await pipeline.initialize({
        canvas: payload.canvas,
        config: payload.config,
        callbacks: {
          onError: (error: IPipelineError) =>
            self.postMessage({ type: WorkerResponseType.ERROR, payload: error }),
          onStats: (stats: IPipelineStats) =>
            self.postMessage({ type: WorkerResponseType.STATS, payload: stats }),
        },
      });
      captureBuffer = new CaptureBuffer(payload.canvas);
      self.postMessage({ type: WorkerResponseType.READY, payload: { api: pipeline.api } });
      break;
    }

    case WorkerMessageType.FRAME: {
      if (!pipeline || pipeline.state !== 'ready') break;
      pipeline.renderFrame(payload.imageBitmap, payload.uniforms);
      if (captureBuffer?.hasPendingCapture()) await captureBuffer.captureFrame();
      self.postMessage({ type: WorkerResponseType.FRAME_RENDERED });
      payload.imageBitmap.close();
      break;
    }

    case WorkerMessageType.RESIZE:
      pipeline?.resize(payload.width, payload.height);
      break;

    case WorkerMessageType.REQUEST_CAPTURE:
      captureBuffer?.requestCapture();
      break;

    case WorkerMessageType.CAPTURE: {
      const bitmap = await captureBuffer.captureFrame();
      self.postMessage(
        { type: WorkerResponseType.CAPTURE_READY, payload: { bitmap } },
        { transfer: [bitmap] }
      );
      break;
    }

    case WorkerMessageType.RELEASE:
      pipeline?.suspend();
      break;

    case WorkerMessageType.DESTROY:
      pipeline?.dispose();
      captureBuffer?.dispose();
      pipeline = null;
      captureBuffer = null;
      break;
  }
};
```

### Files unchanged

| File | Reason |
|------|--------|
| `worker-protocol.config.ts` | Message contract unchanged |
| `gpu-worker-manager.ts` | Same protocol, same messages |
| `gpu-render-loop.service.ts` | requestVideoFrameCallback loop untouched |
| `render-pipeline.service.ts` | Strategy selection untouched |
| `capability-detector.utils.ts` | Still wraps detectCapabilities() |
| All UI components, orchestrators, container | No rendering internals |

### Files simplified

| File | Change |
|------|--------|
| `gpu-renderer.service.ts` | Replace ~30 lines of uniform cache with UniformContext |

### Net impact

| Metric | Before | After |
|--------|--------|-------|
| App rendering code | ~2,020 lines (6 files) | ~130 lines (2 files) |
| Package pipeline code | ~1,200 lines (unused) | ~2,200 lines (production) |
| Duplicate shader files | 18 (9+9) | 9 (package only) |
| @prismgb/gpu imports in app | 4 source files | 5 source files (+worker) |

## Migration Strategy

### Dependency Graph

```
Phase 1 (Domain interfaces)
    ├──→ Phase 2 (Optimization utilities)
    │        └──→ Phase 3 (Pipeline rewrite) ←──┘
    │                  ├──→ Phase 4 (Package tests)
    │                  └──→ Phase 5 (App worker simplification)
    │                            └──→ Phase 6 (Duplicate cleanup)
    │                                      └──→ Phase 7 (Validation)
    └──→ Phase 3
```

### Phase 1: Domain Layer Enhancements

**Risk**: LOW | **Scope**: Pure types and interfaces

| Change | Details |
|--------|---------|
| Add `PipelineState` type | `'uninitialized' \| 'ready' \| 'suspended' \| 'error' \| 'disposed'` |
| Add `IPipelineError` | Error code, message, recoverability, adapter info |
| Add `IPipelineCallbacks` | `onError`, `onStats`, `onStateChange` |
| Add `IShaderLoader` | `load(shaderId): string` |
| Add `ICaptureProvider` | `requestCapture()`, `hasPendingCapture()`, `captureFrame()`, `dispose()` |
| Add `IPresetProvider` | Read-only preset access |
| Add `IAdapterInfo` | Vendor, architecture, device, description, API |
| Update `IPipeline` | State machine, suspend/resume, error, callbacks, adapter info |
| Update `IPipelineStats` | Add `gpuMemoryBytes` |
| Update `IPipelineCapabilities` | Add `webgpuFeatures` |
| Remove `IFrameProvider` | Dead code (unused by any consumer) |
| Add `UniformContext` | Application-layer uniform caching helper |

**Files**: ~12 modified/created in domain/ and application/

### Phase 2: Optimization Utilities

**Risk**: MEDIUM | **Scope**: Extract from workers, upgrade existing

| Class | Source | Enhancements |
|-------|--------|-------------|
| `BindGroupCache` | Package existing + workers | Merge cache stats tracking |
| `UniformTracker` | Package existing + workers | Add cached Uint8Array views |
| `TypedArrayPool` | Workers only (new to package) | Pre-allocated Float32Array pools |
| `ShaderProgramCache` | Workers only (new to package) | WebGL2 uniform location caching |

**Source**: `src/renderer/infrastructure/rendering/workers/optimization.utils.ts` (~530 lines)
**Target**: `packages/prismgb-gpu/src/infrastructure/optimization/` (4 focused classes)

### Phase 3: Pipeline Rewrite (HIGH RISK)

**Risk**: HIGH | **Scope**: Core rendering logic

**Strategy**: Start from worker engine implementations (battle-tested), layer on package architecture (interfaces, state machine, injectable dependencies).

#### WebGPUPipeline Merge Steps

**Step 3.1: Scaffold new pipeline class**

Map worker methods to IPipeline interface:

| Worker method | IPipeline method | Notes |
|---------------|------------------|-------|
| `initialize(canvas, config)` | `initialize(options: IPipelineOptions)` | Options bag |
| `render(uniforms)` | `renderFrame(source, uniforms)` | Combined |
| `uploadFrame(bitmap)` | Internal (called from renderFrame) | Not separate |
| `resize(w, h)` | `resize(w, h)` | Direct |
| `destroy()` | `dispose()` | Naming |
| N/A | `suspend()` | NEW |
| N/A | `resume()` | NEW |

**Step 3.2: Integrate state machine**

BasePipeline owns state transitions with `assertState()` guards and `transitionTo()` method. Each pipeline operation validates state before proceeding.

**Step 3.3: Integrate optimization utilities**

Lift and shift — APIs stay the same because we extracted the worker's implementations:

| Worker code | Package replacement |
|-------------|-------------------|
| `this.typedArrayPool.getFloat32WithValues([...])` | Same API, extracted class |
| `this.uniformTracker.hasChanged('upscale', data)` | Same API, upgraded class |
| `this.bindGroupCache.getOrCreate(key, factory)` | Same API, extracted class |

**Step 3.4: Inject IShaderLoader**

Replace hardcoded `?raw` imports with injectable loader. Default `ViteShaderLoader` preserves current behavior.

**Step 3.5: Add error classification**

Translate worker's error handling to IPipelineError with codes:

| Error source | Code | Recoverable |
|-------------|------|-------------|
| `device.lost` | `DEVICE_LOST` | Yes |
| `device.onuncapturederror` | `GPU_ERROR` | Yes |
| Shader compilation failure | `SHADER_ERROR` | No |
| WebGL context lost | `CONTEXT_LOST` | Yes |

BasePipeline.transitionTo('error', error) handles state update + callback dispatch.

**Step 3.6: Add suspend/resume**

```
suspend():
  - Release: intermediate textures, source texture, render pipelines, bind group cache
  - Preserve: device, context, shader modules (expensive to recreate)
  - Transition: ready → suspended

resume():
  - Re-acquire: textures, pipelines
  - Invalidate: uniform tracker, bind group cache
  - Transition: suspended → ready
```

Resume is fast (~10ms) because shader modules and device are preserved.

**Step 3.7: Add adapter info**

Capture GPU adapter info during initialization, expose via `getAdapterInfo()`.

#### WebGL2Pipeline Merge

Same pattern with WebGL2-specific concerns:
- ShaderProgramCache replaces per-frame uniform location lookups
- WebGL context lost/restored events mapped to state machine
- Suspend releases framebuffers + textures, keeps compiled programs

#### Canvas2DPipeline Update

Minimal: add state machine consistency, stats. No optimization utilities needed.

#### Validation Checkpoints

| After | Check |
|-------|-------|
| Step 3.1 | Package compiles, existing tests pass |
| Step 3.2 | State machine unit tests pass |
| Step 3.3 | Optimization tests pass |
| Step 3.5 | Error classification tests pass |
| Step 3.6 | Lifecycle tests pass |
| All | Full package `npm run test:run` |

### Phase 4: Package Tests

**Risk**: MEDIUM

| Test area | Coverage |
|-----------|----------|
| State machine | All valid transitions, invalid transition rejection |
| Error classification | Each error code, recoverability flag |
| Callbacks | onError, onStats, onStateChange fire correctly |
| UniformContext | Caching, change detection, preset switching |
| TypedArrayPool | Pool reuse, size limits, warmup sizes |
| ShaderProgramCache | Location caching, cache hit tracking |
| CaptureBuffer | Lazy capture, pending state, frame retrieval, dispose |
| Existing tests | All current preset/capability/uniform tests still pass |

### Phase 5: App Worker Simplification (HIGH RISK)

**Risk**: HIGH | **Scope**: Replace 1,770 lines with 80 lines

**Key insight**: The worker protocol (WorkerMessageType/WorkerResponseType) does NOT change. The GpuWorkerManager sends the same messages and receives the same responses. Only the worker's internal implementation changes.

#### Step-by-step rewrite

**Step 5.1**: Replace engine imports with `@prismgb/gpu` imports

**Step 5.2**: Rewrite INIT handler (~40 lines → ~20 lines)
- Instantiate WebGPUPipeline or WebGL2Pipeline
- Pass callbacks that translate to postMessage
- Stats accumulation is now internal to pipeline

**Step 5.3**: Rewrite FRAME handler (~30 lines → ~10 lines)
- Delegate to `pipeline.renderFrame()`
- Check captureBuffer.hasPendingCapture()
- Close ImageBitmap after rendering

**Step 5.4**: Rewrite RESIZE handler (trivial rename)

**Step 5.5**: Rewrite RELEASE handler
- `pipeline.suspend()` replaces manual resource cleanup

**Step 5.6**: Rewrite CAPTURE handlers (nearly identical API)

**Step 5.7**: Rewrite DESTROY handler
- `pipeline.dispose()` + `captureBuffer.dispose()`

#### Files deleted

| File | Lines |
|------|-------|
| `webgpu-renderer.engine.ts` | ~650 |
| `webgl2-renderer.engine.ts` | ~550 |
| `optimization.utils.ts` | ~530 |
| `engine.types.ts` | ~40 |

#### Validation Checkpoints

| After | Check |
|-------|-------|
| Step 5.1 | Worker compiles |
| Step 5.2 | `npm run dev` — pipeline initializes, READY message sent |
| Step 5.3 | Frames render on screen |
| Step 5.5 | Tab hide/show preserves rendering |
| Step 5.6 | Screenshots work |
| All | `npm run test:run` — all tests pass |
| All | Manual: start stream, switch presets, resize, screenshot, record, stop |

### Phase 6: Duplicate Cleanup

**Risk**: LOW

| Change | Details |
|--------|---------|
| Delete `rendering/shaders/webgl2/*.glsl` (5) | Shaders live in package |
| Delete `rendering/shaders/webgpu/*.wgsl` (4) | Shaders live in package |
| Delete `rendering/shaders/` directory | Empty |
| Simplify `gpu-renderer.service.ts` | Use UniformContext |
| Update `capability-detector.utils.ts` | Import updated types |

### Phase 7: Validation

| Check | Command |
|-------|---------|
| Package tests | `cd packages/prismgb-gpu && npm run test:run` |
| App tests | `npm run test:run` (2789 tests) |
| Lint | `npm run lint` |
| Type check (package) | `cd packages/prismgb-gpu && npm run typecheck` |
| Build | `npm run build` |
| Manual | Dev mode rendering, all presets, resize, capture, recording |
| Performance | Frame time comparison before/after |

## Execution Strategy

| Stage | Phases | Type | Agent | Risk |
|-------|--------|------|-------|------|
| 1 | Phase 1 | Subagent | Sonnet | LOW |
| 2 | Phase 2 | Subagent | Sonnet | MEDIUM |
| 3 | Phase 3 | Sequential (ME) | - | HIGH |
| 4 | Phase 4 | Subagent | Sonnet | MEDIUM |
| 5 | Phase 5 + 6 | Sequential (ME) | - | HIGH |
| 6 | Phase 7 | Sequential (ME) | - | Validation |

### Git Strategy

- Commit after each phase
- Tag before Phase 3: `git tag pre-pipeline-rewrite`
- Tag before Phase 5: `git tag pre-worker-migration`
- Feature branch: `feature/gpu-package-consolidation`

### Rollback Points

| Tag | Rollback to |
|-----|------------|
| `pre-pipeline-rewrite` | Before Phase 3 (package pipelines untouched) |
| `pre-worker-migration` | Before Phase 5 (app workers untouched, package upgraded) |

## Lock-in Assessment

| Concern | Risk | Mitigation |
|---------|------|------------|
| Vite `?raw` shader imports | Low | IShaderLoader interface, isolated to 2 loader files |
| IPipeline interface contract | None | This IS the abstraction |
| Singleton PresetRegistry | Low | Implements IPresetProvider, can be swapped |
| BasePipeline inheritance | Low | Shared lifecycle logic, pipelines can bypass |
| Canvas type union | None | Standard Web API (HTMLCanvasElement \| OffscreenCanvas) |

## Future Extensibility Vectors

These are documented for future consideration but NOT implemented in this consolidation:

1. **Pluggable render pass system**: The 4-pass chain (upscale → unsharp → color → CRT) could become a configurable pass registry with `IRenderPass` interface. Requires render graph implementation.

2. **Shader source exports**: For non-Vite consumers, export pre-inlined shader strings as package exports. Relevant if package is published to npm.

3. **WebGPU compute shaders**: Some passes could be implemented as compute shaders for better parallelism. The IShaderLoader and pass system would need compute stage support.

4. **Multi-canvas rendering**: Rendering to multiple canvases from a single pipeline (e.g., main view + PiP). Would require canvas management abstraction.
