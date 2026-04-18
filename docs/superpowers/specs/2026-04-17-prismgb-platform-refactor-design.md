# PrismGB Platform Refactor — Design Spec

| Field | Value |
|---|---|
| **Status** | Draft (pending user approval) |
| **Date** | 2026-04-17 |
| **Owner** | josstei |
| **Scope** | Architectural refactor of PrismGB into a layered platform of decorator-driven, transport-abstracted packages. Functionality unchanged; internals rebuilt. |
| **Estimated effort** | 12–18 weeks (3–4.5 months) across 6 phases |
| **Output target** | `docs/superpowers/specs/2026-04-17-prismgb-platform-refactor-design.md` (this file) |
| **Implementation plan** | To be authored by `superpowers:writing-plans` after spec approval |

---

## 1. Executive Summary

PrismGB today has 168 TypeScript files, 71 JavaScript files, three Electron processes, two DI containers (Awilix in main, custom `ServiceContainer` in renderer), ~1,500 LOC of bespoke IPC plumbing, ~900 LOC of manual DI registration, byte-identical duplicate shaders across two locations, and 938 LOC of worker engines that re-implement classes already present in `@prismgb/gpu`.

This spec defines a refactor to a **3-tier layered platform**:
- **Tier 1**: 5 platform packages providing decorators, transport, runtime, contracts, and test infrastructure.
- **Tier 2**: 10 capability packages, each a self-contained module implementing a `PrismgbModule` contract.
- **Tier 3**: A drastically reduced `src/` containing only bootstrap (~180 LOC) and the presentation layer.

Cross-process boundaries collapse from manual IPC plumbing into typed RPC layers (`electron-trpc` for main↔renderer, `Comlink` for renderer↔worker). DI moves to `tsyringe` with reflect-metadata. Validation moves to `Zod`. Logging moves to `pino` (main) and `consola` (renderer). Build orchestration moves to Turborepo. Versioning moves to Changesets.

**Net result**: ~3,000–3,500 LOC removed, all duplication eliminated, and per-feature DX cost drops from "9 files in 4 directories across 3 processes" to "1 service class with 2 decorators." All decisions are licensed-clean for distribution (MIT/Apache 2.0 stack only).

## 2. Goals & Non-Goals

### Goals

| # | Goal |
|---|---|
| G1 | Eliminate the verified duplication between `@prismgb/gpu` and `src/renderer/infrastructure/rendering/` (shaders + worker engines). |
| G2 | Establish a single decorator-driven module convention every capability package implements identically. |
| G3 | Replace bespoke IPC plumbing (`channels.json`, `preload-api.contract.ts`, `preload/apis/`, `ipc/handlers/`, custom worker postMessage protocol) with typed RPC. |
| G4 | Replace stringly-typed event channels with a TypeScript-augmented typed `EventChannelMap`. |
| G5 | Reduce `src/` to bootstrap + presentation layer only; relocate all infrastructure into capability packages. |
| G6 | Achieve 100% TypeScript across the codebase (71 JS files migrated to TS as part of capability extraction). |
| G7 | Preserve all user-facing functionality. No behavior changes; internals only. |
| G8 | Enforce architectural rules statically (ESLint + layer-boundary script extended for package-level rules). |
| G9 | Ship a license-clean distribution (MIT/Apache 2.0 stack; CI gate fails on GPL/AGPL/LGPL/CDDL/EPL ingress). |
| G10 | Make the platform extensible: adding a new device, capability, event channel, RPC method, or worker function requires writing one service class with decorators, no central registration. |

### Non-Goals

| # | Non-Goal |
|---|---|
| NG1 | No user-facing feature changes. UI behavior, capture formats, supported devices, settings — all unchanged. |
| NG2 | No internationalization. Single-language product remains; architecture doesn't preclude later addition. |
| NG3 | No third-party plugin loader infrastructure (architecture supports it; no plugin discovery/signing/sandbox built). |
| NG4 | No telemetry SDK integration. Local logs preserved + manual support-bundle export. External telemetry is a future opt-in capability package. |
| NG5 | No CI performance gating yet. Performance metrics tracked as PR artifacts; gating deferred until post-refactor baselines stabilize. |
| NG6 | No theming/visual customization expansion beyond current state. |
| NG7 | No multi-window support, cloud sync, or companion mobile app. |
| NG8 | No GraphQL/REST API exposure. Internal-only RPC. |

## 3. Current State Assessment (Verified)

### 3.1 Workspace structure

`packages/`:
- `prismgb-gpu/` — only active package; exports types + `PresetRegistry` + `detectCapabilities` + `buildUniforms` + `createPipeline`. Internal `WebGL2Pipeline`/`WebGPUPipeline` classes exist but are not exported.
- `prismgb-chroma/`, `prismgb-core/`, `prismgb-devices/`, `prismgb-di/`, `prismgb-ipc/`, `prismgb-shader-compiler/`, `prismgb-shader-presets/`, `prismgb-stream-source/` — all empty scaffolding (`dist/` only, no `src/`, no `package.json`, not in `workspaces`). **All 8 will be removed in Phase 0**.

### 3.2 Verified duplication

| File pair | LOC | Verification |
|---|---|---|
| `packages/prismgb-gpu/src/infrastructure/{webgl2,webgpu}/shaders/*` ↔ `src/renderer/infrastructure/rendering/shaders/{webgl2,webgpu}/*` | 891 (renderer copy) | `diff` returns empty — byte-identical |
| `packages/prismgb-gpu/src/infrastructure/{webgl2,webgpu}/*-pipeline.ts` ↔ `src/renderer/infrastructure/rendering/workers/{webgl2,webgpu}-renderer.engine.ts` | 938 (renderer copy) | Different class names, parallel implementations of identical 4-pass pipeline logic |
| `src/main/infrastructure/events/event-bus.ts` (Node EventEmitter) ↔ `src/renderer/infrastructure/events/event-bus.class.js` (eventemitter3) | 177 (combined) | Same public API, small functional delta |
| `src/main/infrastructure/logging/logger.factory.ts` (Winston) ↔ `src/renderer/infrastructure/logging/logger.factory.js` (console wrapper) | 237 (combined) | Different impl, similar interface |

### 3.3 Boilerplate measured

| Source | LOC |
|---|---|
| Renderer DI registration (`src/renderer/application/di/register-*.ts`) | 932 |
| Main IPC handlers + registry (`src/main/ipc/`) | 628 |
| Preload bridges (`src/preload/`) | 756 |
| Worker protocol (`src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts`, `gpu-worker-manager.ts`) | ~230 |

**Total bespoke plumbing**: ~2,800 LOC.

### 3.4 Language mix

168 TypeScript files, 71 JavaScript files (~70% TS). Migration target: 100% TS by end of Phase 5.

### 3.5 Process model

Three-process Electron with strict separation:
- **Main**: Awilix container, Winston logger, Node EventEmitter EventBus.
- **Renderer**: custom `ServiceContainer`, console-wrapper logger, eventemitter3 EventBus.
- **Preload**: contextBridge wiring of multiple typed APIs (`window.deviceAPI`, `window.windowAPI`, etc.).

## 4. Target Architecture

### 4.1 Layered platform model

```
┌────────────────────────────────────────────────────────────────────┐
│  TIER 3 — APP SHELL                       src/                     │
│  Bootstrap only. ~50 LOC main + ~100 LOC renderer + ~30 preload.   │
│  Imports @prismgb/runtime, mounts UI, exits.                       │
├────────────────────────────────────────────────────────────────────┤
│  TIER 2 — CAPABILITY PACKAGES             packages/prismgb-*/      │
│  Self-contained features. Each implements PrismgbModule contract.  │
│                                                                    │
│  @prismgb/gpu        @prismgb/devices      @prismgb/streaming      │
│  @prismgb/capture    @prismgb/transcode    @prismgb/notes          │
│  @prismgb/settings   @prismgb/updates      @prismgb/window         │
│  @prismgb/performance                                              │
├────────────────────────────────────────────────────────────────────┤
│  TIER 1 — PLATFORM PACKAGES               packages/prismgb-*/      │
│  Foundation. Decorators, transport, runtime, contracts, testing.   │
│                                                                    │
│  @prismgb/core       @prismgb/transport    @prismgb/runtime        │
│  @prismgb/contracts  @prismgb/testing                              │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 Tier 1 — Platform packages

| Package | Responsibility | Stack |
|---|---|---|
| `@prismgb/core` | Decorator API (`@Injectable`, `@Service`, `@Module`, `@OnInit`, `@OnDestroy`, `@Subscribe`, `@Rpc`, `@WorkerMethod`, `@Push`, `@Inject`), typed `EventBus<EventChannelMap>`, `Logger` interface, `Channel<T>`, `PrismgbModule` interface, metadata helpers. | `tsyringe`, `reflect-metadata`, `mitt`, `zod`, `rxjs` (Subject only) |
| `@prismgb/transport` | electron-trpc adapter (main/preload/renderer), Comlink adapter (worker/renderer), `PrismgbError` error model with TS-augmented codes, router assembly from `@Rpc` metadata, observability publishers. | `electron-trpc`, `@trpc/server@11`, `@trpc/client@11`, `comlink` |
| `@prismgb/runtime` | `bootstrapMain()`, `bootstrapRenderer()`, `bootstrapWorker()`. Module loader uses Vite `import.meta.glob({ eager: true })` for build-time discovery. Lifecycle orchestration with topological ordering. | `@prismgb/core`, `@prismgb/transport` |
| `@prismgb/contracts` | Pure TypeScript types — DTOs, payloads, shared interfaces — used across processes. Zero runtime code. | (none) |
| `@prismgb/testing` | Test utilities: `createTestContainer`, `createTestTransport`, `fakeEventBus`, `fakeLogger`, `fakeWorkerProxy`, `bootModule`, lifecycle assertions, contract test generator. | `@prismgb/core`, `vitest` |

### 4.3 Tier 2 — Capability packages

10 packages. Each follows the **identical universal layout** (Section 5 details).

| Package | Surfaces | Owns |
|---|---|---|
| `@prismgb/gpu` | shared, renderer, worker | Pipelines, shaders, capability detection, presets, render loop, frame buffer |
| `@prismgb/devices` | shared, main, renderer | USB detection, profiles, registry, adapters, IPC bridge |
| `@prismgb/streaming` | shared, renderer | MediaStream acquisition, viewport, health, audio pipeline, render coordination |
| `@prismgb/capture` | shared, renderer | Screenshot, recording, GPU recording, capture-save |
| `@prismgb/transcode` | shared, main, renderer | FFmpeg process management, transcode service |
| `@prismgb/notes` | shared, renderer | Notes persistence, notes service |
| `@prismgb/settings` | shared, renderer | Settings, fullscreen, cinematic, presentation modes |
| `@prismgb/updates` | shared, main, renderer | electron-updater wrapper, update UI service |
| `@prismgb/window` | shared, main | BrowserWindow management, tray, gpu-policy, login-item |
| `@prismgb/performance` | shared, renderer | Animation, metrics, performance state |

### 4.4 Tier 3 — App shell

```
src/
├── main/
│   └── index.ts              # ~50 LOC: bootstrapMain({ env, productName, modules })
├── preload/
│   └── index.js              # ~30 LOC: exposeElectronTRPC()
└── renderer/
    ├── index.ts              # ~100 LOC: bootstrapRenderer + mount UI
    └── presentation/         # PURE UI layer
        ├── shell/
        ├── features/         # one folder per UI feature
        ├── primitives/
        ├── controller/
        └── styles/
```

Presentation stays in `src/` because it's app-specific and tightly coupled to PrismGB's visual identity. If a future second product is built on this platform, `presentation/` would be replaced wholesale.

### 4.5 Dependency graph (enforced)

```
                  ┌───────────────────────────────────┐
                  │     src/ (app shell + UI)         │
                  └──────┬──────────────┬─────────────┘
                         │              │
              ┌──────────▼─────┐  ┌─────▼─────────────────┐
              │ Capability pkg │  │ Capability pkg ...    │
              └────────┬───────┘  └─────────┬─────────────┘
                       │                    │
                       └──────┬─────────────┘
                              ▼
                ┌─────────────────────────────────┐
                │  @prismgb/runtime               │
                └──────┬─────────────────┬────────┘
                       ▼                 ▼
              ┌──────────────┐  ┌────────────────┐
              │ @prismgb/    │  │ @prismgb/      │
              │ transport    │  │ contracts      │
              └──────┬───────┘  └────────┬───────┘
                     ▼                   ▼
                  ┌───────────────────────────┐
                  │  @prismgb/core            │
                  └───────────────────────────┘

              ┌────────────────────────────┐
              │  @prismgb/testing          │  ← dev-only, used by all
              └────────────────────────────┘
```

**Enforced rules** (`scripts/check-layer-boundaries.js`):
- Capability packages import only from Tier 1 + their own internals.
- Capability packages **never** import from each other.
- `src/` may import from any package, but never directly from another package's internal subpath.
- Subpath exports enforce process boundaries: `@prismgb/devices/main` is unreachable from `src/renderer/`.

## 5. Universal Capability Package Layout

Every Tier 2 package follows identical structure so onboarding to one teaches all.

```
packages/prismgb-<name>/
├── package.json
│   "exports": {
│     ".":         "./dist/index.js",         # manifest only (PrismgbModule)
│     "./shared":  "./dist/shared/index.js",  # types, contracts, pure utils (UI-safe)
│     "./main":    "./dist/main/index.js",    # @Service({ runs: 'main' })
│     "./renderer":"./dist/renderer/index.js",# @Service({ runs: 'renderer' })
│     "./worker":  "./dist/worker/index.js"   # @WorkerMethod() classes
│   }
├── tsconfig.json                              # extends root, references upstream packages
├── vite.config.ts                             # library mode, multi-entry per surface
├── src/
│   ├── shared/
│   │   ├── domain/                            # types, interfaces
│   │   ├── application/                       # pure functions
│   │   ├── contracts/                         # event/error/RPC contract files
│   │   └── index.ts
│   ├── main/                                  # only if package has main-side code
│   │   ├── module.ts                          # @Module declaration
│   │   ├── services/
│   │   └── index.ts                           # exports MainModule
│   ├── renderer/                              # only if package has renderer-side code
│   │   ├── module.ts
│   │   ├── services/
│   │   └── index.ts
│   ├── worker/                                # only if package has worker-side code
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── index.ts                           # Comlink expose() entry
│   └── index.ts                               # exports manifest only — no runtime
└── tests/
    ├── unit/{shared,main,renderer,worker}/
    ├── contract/                              # auto-generated by @prismgb/testing
    └── integration/
```

### 5.1 Canonical example — `@prismgb/gpu` refined

```
packages/prismgb-gpu/
├── src/
│   ├── shared/
│   │   ├── domain/
│   │   │   ├── pipeline/                  # IPipeline, IPipelineCapabilities, IPipelineStats
│   │   │   ├── frame/                     # FrameSource, IFrameProvider
│   │   │   ├── shaders/                   # Shader uniform types
│   │   │   └── presets/                   # IPreset, PresetRegistry, built-in presets
│   │   ├── application/
│   │   │   └── uniform-builder.ts         # buildUniforms, calculateScaleFactor (pure)
│   │   └── contracts/
│   │       └── render-pipeline.contract.ts
│   ├── renderer/
│   │   ├── module.ts                      # @Module({ providers: [...] })
│   │   ├── services/
│   │   │   ├── gpu-renderer.service.ts        # @Service, owns Comlink worker proxy
│   │   │   ├── gpu-render-loop.service.ts     # @Service, requestVideoFrameCallback loop
│   │   │   ├── canvas-lifecycle.service.ts    # @Service, OffscreenCanvas transfer mgmt
│   │   │   ├── gpu-frame-buffer.ts            # frame queue
│   │   │   └── render-pipeline.service.ts     # coordination layer
│   │   └── application/
│   │       └── capability-detector.ts         # @Service wrapping shared detectCapabilities
│   ├── worker/
│   │   ├── index.ts                       # Comlink expose() entry
│   │   ├── application/
│   │   │   └── render-pipeline.service.ts # @WorkerMethod() class — Comlink target
│   │   ├── infrastructure/                # CANONICAL pipelines + shaders
│   │   │   ├── base-pipeline.ts
│   │   │   ├── webgl2/
│   │   │   │   ├── webgl2-pipeline.ts
│   │   │   │   ├── webgl2-shader-loader.ts
│   │   │   │   ├── shader-program.ts
│   │   │   │   └── shaders/{common.vert.glsl, pixel-upscale.frag.glsl, unsharp-mask.frag.glsl, color-elevation.frag.glsl, crt-lcd.frag.glsl}
│   │   │   ├── webgpu/
│   │   │   │   ├── webgpu-pipeline.ts
│   │   │   │   ├── webgpu-shader-loader.ts
│   │   │   │   ├── bind-group-cache.ts
│   │   │   │   ├── uniform-tracker.ts
│   │   │   │   └── shaders/{pixel-upscale.wgsl, unsharp-mask.wgsl, color-elevation.wgsl, crt-lcd.wgsl}
│   │   │   └── canvas2d/
│   │   │       └── canvas2d-pipeline.ts
│   │   └── factories/
│   │       └── pipeline.factory.ts
│   └── index.ts                           # PrismgbGpuModule manifest only
```

### 5.2 LOC delta from `@prismgb/gpu` consolidation

| Source | LOC | Disposition |
|---|---|---|
| `src/renderer/infrastructure/rendering/shaders/{webgl2,webgpu}/` | 891 | Deleted (canonical lives in `@prismgb/gpu/src/worker/infrastructure/*/shaders/`) |
| `src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts` | 274 | Replaced by `WebGL2Pipeline` |
| `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts` | 664 | Replaced by `WebGPUPipeline` |
| `src/renderer/infrastructure/rendering/workers/render.worker.ts` | ~80 | Replaced by `@prismgb/gpu/worker` Comlink entry |
| `src/renderer/infrastructure/rendering/workers/{engine.types.ts, optimization.utils.ts, worker-protocol.config.ts}` | ~260 | Moved or eliminated (Comlink replaces the protocol) |
| `src/renderer/infrastructure/rendering/capability-detector.utils.ts` | ~30 | Moved into `@prismgb/gpu/renderer/application/` |
| `src/renderer/infrastructure/services/streaming/gpu-*.service.ts` | ~480 | Moved into `@prismgb/gpu/renderer/services/` |
| `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts` | ~150 | **Eliminated** — Comlink replaces |
| `src/renderer/infrastructure/services/streaming/canvas-lifecycle.service.ts` | ~120 | Moved |
| `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts` | ~80 | Moved |
| `src/renderer/infrastructure/adapters/streaming/{gpu,canvas2d}-renderer.adapter.ts` | ~376 | Eliminated (direct DI) / moved |
| `src/renderer/infrastructure/factories/streaming-renderer.factory.ts` | ~100 | **Eliminated** — DI handles selection |
| Most of `src/renderer/application/di/register-streaming.ts` | ~10 of 13 | Replaced by `@Module` |
| **Total deleted from `src/`** | **~3,600 LOC** | |
| **Net into `@prismgb/gpu`** | **~2,200 LOC** (relocated) | |
| **Net deletion** | **~1,400 LOC** | All duplication eliminated |

## 6. Module Contract & Decorator API

### 6.1 `PrismgbModule` manifest

Every package's `src/index.ts` exports a manifest:

```typescript
import type { PrismgbModule } from '@prismgb/core';

export const PrismgbGpuModule: PrismgbModule = {
  name: '@prismgb/gpu',
  version: '1.0.0',
  surfaces: ['shared', 'renderer', 'worker'],

  main:     undefined,                                                  // omitted = no main code
  renderer: () => import('./renderer/module').then(m => m.default),
  worker:   () => import('./worker').then(m => m.default),

  events: { contract: './shared/contracts/events.contract' },
  rpc:    { contract: './shared/contracts/rpc.contract' },              // omit if no main↔renderer RPC
};

export default PrismgbGpuModule;
```

`@prismgb/runtime` reads the manifest, lazily loads only the surface relevant to the current process (renderer never imports `main/`, etc.).

### 6.2 Decorator API surface

**Class decorators**:
| Decorator | Purpose |
|---|---|
| `@Injectable()` | DI-resolvable (tsyringe primitive) |
| `@Singleton()` | Single instance per container |
| `@Service({ runs })` | PrismGB service with process scoping (`'main' \| 'renderer' \| 'worker'`) |
| `@Module({ providers, imports? })` | Module declaration |

**Method decorators**:
| Decorator | Purpose | Auto-cleanup |
|---|---|---|
| `@OnInit()` | Called after DI resolution, in dependency order, before app marks ready | n/a |
| `@OnDestroy()` | Called on shutdown, reverse dependency order | n/a |
| `@Subscribe('channel:name')` | Auto-subscribe to typed EventBus channel | ✅ |
| `@Rpc({ schema?, name? })` | Expose method as tRPC procedure (main-side); optional Zod schema for input | n/a |
| `@WorkerMethod()` | Mark method as Comlink-exposed (worker-side) | n/a |

**Property decorators**:
| Decorator | Purpose |
|---|---|
| `@Inject(token)` | Explicit DI token (when constructor parameter type isn't enough) |
| `@Push<T>()` | Property of type `Channel<T>` becomes a tRPC subscription endpoint |

### 6.3 Typed EventBus via TS module augmentation

```typescript
// @prismgb/core
export interface EventChannelMap {}   // empty placeholder

export class EventBus<TMap extends EventChannelMap = EventChannelMap> {
  publish<K extends keyof TMap>(channel: K, payload: TMap[K]): void;
  subscribe<K extends keyof TMap>(channel: K, handler: (p: TMap[K]) => void): () => void;
}
```

```typescript
// packages/prismgb-gpu/src/shared/contracts/events.contract.ts
import type { IPipelineCapabilities, RenderAPI } from '../domain/pipeline';

declare module '@prismgb/core' {
  interface EventChannelMap {
    'render:capability-detected': { caps: IPipelineCapabilities };
    'render:pipeline-ready':      { api: RenderAPI };
    'render:pipeline-error':      { message: string; code: string };
    'render:stats-update':        { fps: number; frameTimeMs: number };
    'render:canvas-expired':      void;
    'render:canvas-recreated':    void;
  }
}
export {};
```

Effect: `events.publish('render:pipeline-ready', { api: 'webgpu' })` is fully typed everywhere. No central registry to edit. No drift.

### 6.4 RPC pattern

```typescript
// packages/prismgb-devices/src/main/services/device.service.ts
@Service({ runs: 'main' })
@Injectable()
export class DeviceService {
  @Rpc()
  async listDevices(): Promise<DeviceInfo[]> { ... }

  @Rpc({ schema: z.object({ vendorId: z.number() }) })
  async listByVendor(input: { vendorId: number }): Promise<DeviceInfo[]> { ... }

  @Push<DeviceInfo>()
  deviceConnected = new Channel<DeviceInfo>();
}
```

```typescript
// packages/prismgb-devices/src/renderer/services/device-client.service.ts
@Service({ runs: 'renderer' })
@Injectable()
export class DeviceClientService {
  private proxy = rpc<DeviceService>('devices');   // typed tRPC client

  async listDevices() { return this.proxy.listDevices.query(); }
  watchConnections(handler: (d: DeviceInfo) => void) { return this.proxy.deviceConnected.subscribe(handler); }
}
```

`@prismgb/transport/main` walks all `@Rpc`-decorated methods at boot, builds a single tRPC router with package-namespaced sub-routers, exposes via `electron-trpc`. Renderer-side typed proxy auto-generated.

**Schema validation default: opt-in.** Bare `@Rpc()` skips runtime validation (parameter type is the type-only contract — fast path for trusted internal calls). `@Rpc({ schema })` enables Zod validation. Architecture allows per-package or per-route required-schema rules to be added later via ESLint without code changes.

### 6.5 Worker pattern

```typescript
// packages/prismgb-gpu/src/worker/application/render-pipeline.service.ts
@Injectable()
export class RenderPipeline {
  @WorkerMethod()
  async initialize(canvas: OffscreenCanvas, api: RenderAPI, config: PipelineConfig): Promise<void> { ... }

  @WorkerMethod()
  uploadFrame(bitmap: ImageBitmap): void { ... }

  @WorkerMethod()
  render(uniforms: RenderUniforms): void { ... }

  @WorkerMethod()
  destroy(): void { ... }
}

// packages/prismgb-gpu/src/worker/index.ts
import { exposeWorker } from '@prismgb/transport/worker';
import { RenderPipeline } from './application/render-pipeline.service';
exposeWorker(RenderPipeline);
export default RenderPipeline;   // type-only export for renderer typing
```

```typescript
// packages/prismgb-gpu/src/renderer/services/gpu-renderer.service.ts
import { wrapWorker, type WorkerProxy } from '@prismgb/transport/renderer';
import type RenderPipeline from '../../worker';

@Service({ runs: 'renderer' })
@Injectable()
export class GpuRendererService {
  private proxy: WorkerProxy<RenderPipeline> | null = null;

  @OnInit()
  async start() {
    this.proxy = wrapWorker<RenderPipeline>(
      new Worker(new URL('../../worker/index.ts', import.meta.url), { type: 'module' })
    );
  }

  @OnDestroy()
  async stop() {
    await this.proxy?.destroy();
    this.proxy = null;
  }
}
```

End-to-end typed. No custom worker postMessage protocol. No correlation IDs. Comlink handles transferables, errors, request matching.

### 6.6 Bootstrap flow (full app entry points)

```typescript
// src/main/index.ts (~50 LOC total)
import 'reflect-metadata';
import { bootstrapMain } from '@prismgb/runtime';

const modules = import.meta.glob('/packages/prismgb-*/dist/index.js', { eager: true });

await bootstrapMain({
  productName: 'PrismGB',
  modules,
  config: { logLevel: process.env.LOG_LEVEL ?? 'info' },
});
```

```typescript
// src/preload/index.js (~30 LOC total)
import { exposeElectronTRPC } from 'electron-trpc/preload';
exposeElectronTRPC();
```

```typescript
// src/renderer/index.ts (~100 LOC total)
import 'reflect-metadata';
import { bootstrapRenderer } from '@prismgb/runtime';
import { mountShell } from './presentation/shell';

const modules = import.meta.glob('/packages/prismgb-*/dist/index.js', { eager: true });
const container = await bootstrapRenderer({ modules });
await mountShell(document.getElementById('app')!, container);
```

### 6.7 Lifecycle ordering rules

**Startup (per process)**:
1. Walk modules → load matching surface (`main`/`renderer`/`worker`) lazily.
2. For each loaded `@Module`, recursively register `providers` and `imports` with tsyringe.
3. Build typed transport: assemble tRPC router from all `@Rpc` methods (main only); register `electron-trpc` handler.
4. Eagerly resolve every `@Service`-decorated class.
5. Compute dependency graph; call `@OnInit` methods in topological order (deepest dependencies first).
6. Subscribe all `@Subscribe`-decorated handlers.
7. Emit `runtime:ready`. Bootstrap returns.

**Shutdown**:
1. Emit `runtime:stopping`.
2. Cancel all `@Subscribe` subscriptions.
3. Call `@OnDestroy` methods in reverse topological order.
4. Dispose container; terminate workers.

**Error policy**: any `@OnInit` throw aborts startup; shell logs and exits with code 1. `@OnDestroy` errors logged but never block other destructors.

## 7. Cross-Process Transport Layer (`@prismgb/transport`)

### 7.1 Package layout

```
packages/prismgb-transport/
├── src/
│   ├── shared/
│   │   ├── errors/{prismgb-error.ts, error-codes.ts, error-serializer.ts}
│   │   ├── timeouts.config.ts
│   │   └── index.ts
│   ├── main/
│   │   ├── router-assembler.ts        # walks @Rpc metadata → tRPC router
│   │   ├── ipc-handler.ts             # electron-trpc createIPCHandler wrap
│   │   ├── subscription-broker.ts     # @Push channel → tRPC observable bridge
│   │   ├── window-registry.ts
│   │   └── index.ts
│   ├── preload/
│   │   └── index.ts                   # re-export exposeElectronTRPC
│   ├── renderer/
│   │   ├── client-factory.ts          # rpc<TService>(packageName) typed proxy
│   │   ├── worker-wrapper.ts          # wrapWorker<TService>(worker)
│   │   ├── error-deserializer.ts
│   │   └── index.ts
│   └── worker/
│       ├── expose.ts                  # exposeWorker(ServiceClass)
│       ├── error-handler.ts
│       └── index.ts
```

### 7.2 Unified error model

```typescript
export interface PrismgbErrorPayload {
  code: PrismgbErrorCode;
  message: string;
  context?: Record<string, unknown>;
  cause?: PrismgbErrorPayload;
  stack?: string;                  // stripped in production
}

export class PrismgbError extends Error {
  readonly code: PrismgbErrorCode;
  readonly context?: Record<string, unknown>;
  readonly cause?: PrismgbError;
  
  constructor(payload: PrismgbErrorPayload) { ... }
  static from(unknown: unknown): PrismgbError { ... }
  toJSON(): PrismgbErrorPayload { ... }
  static fromJSON(payload: PrismgbErrorPayload): PrismgbError { ... }
}
```

Codes extended per package via TS module augmentation:

```typescript
// packages/prismgb-devices/src/shared/contracts/errors.contract.ts
declare module '@prismgb/transport/shared' {
  interface PrismgbErrorCodeMap {
    DEVICE_PROFILE_REGISTRATION_FAILED: 'DEVICE_PROFILE_REGISTRATION_FAILED';
    DEVICE_USB_ENUMERATION_FAILED:      'DEVICE_USB_ENUMERATION_FAILED';
  }
}
```

Wire format: `PrismgbError.toJSON()` produces stable JSON. Both `electron-trpc` and Comlink convert via custom transfer handlers. Renderer code receives instances with correct prototype, code, context, and (in dev) chained stack.

### 7.3 Subscriptions / push channels

`@Push<T>()` → tRPC subscription (over electron-trpc) or Comlink callback marshalling (worker). Channels back by RxJS `Subject<T>` with `BufferedChannel<T>(maxBufferSize)` opt-in for high-frequency streams.

### 7.4 Transferables

```typescript
import { transfer } from '@prismgb/transport/renderer';
await pipeline.uploadFrame(transfer(bitmap, [bitmap]));
```

`transfer()` is `Comlink.transfer` re-exported.

### 7.5 Timeouts

| Operation | Default | Override |
|---|---|---|
| `@Rpc()` query/mutation | 30 s | `{ timeoutMs: number }` in decorator config |
| `@Push<T>()` subscription | none | n/a |
| `@WorkerMethod()` call | 60 s | `wrapWorker(worker, { defaultTimeoutMs })` |

### 7.6 Observability

Transport layer publishes to dedicated EventBus channels:

```typescript
declare module '@prismgb/core' {
  interface EventChannelMap {
    'transport:rpc-call':     { route: string; durationMs: number; success: boolean };
    'transport:rpc-error':    { route: string; code: PrismgbErrorCode; message: string };
    'transport:worker-call':  { method: string; durationMs: number; success: boolean };
    'transport:worker-error': { method: string; code: PrismgbErrorCode; message: string };
  }
}
```

Logger and (future) telemetry packages subscribe. Zero coupling.

### 7.7 Bundle impact

`@trpc/client` + `@trpc/server` (types only at client) + `electron-trpc/renderer` + `comlink` + `rxjs` (Subject, tree-shaken) ≈ **25 KB gzipped** for the entire cross-process layer. Replaces ~1,500 LOC of bespoke plumbing.

## 8. Build, Tooling, and Workspace Configuration

### 8.1 Workspace orchestration — Turborepo

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": ["tsconfig.base.json", "package.json"],
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**", "!dist/**/*.test.*"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint":      { "outputs": [] },
    "test":      { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:integration": { "dependsOn": ["^build"], "outputs": [] },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

### 8.2 TypeScript project references

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

Each package: `composite: true`, `references: [...]` to upstream packages. Root `tsconfig.json` references all. `npm run typecheck` becomes `tsc -b`.

### 8.3 Per-package build — Vite library mode (uniform)

```typescript
// packages/prismgb-gpu/vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        'index':    resolve(__dirname, 'src/index.ts'),
        'shared':   resolve(__dirname, 'src/shared/index.ts'),
        'renderer': resolve(__dirname, 'src/renderer/index.ts'),
        'worker':   resolve(__dirname, 'src/worker/index.ts'),
      },
      formats: ['es'],
      fileName: (_, name) => `${name}/index.js`,
    },
    rollupOptions: {
      external: [
        /^@prismgb\//, 'tsyringe', 'reflect-metadata', 'comlink', 'mitt',
        'rxjs', 'rxjs/operators', 'zod', '@trpc/server', '@trpc/client',
        'electron', /^node:/,
      ],
    },
  },
  worker: { format: 'es' },
  assetsInclude: ['**/*.glsl', '**/*.wgsl'],
});
```

### 8.4 Vitest workspace mode

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*',
  {
    extends: './vitest.config.base.ts',
    test: {
      name: 'app-shell',
      root: '.',
      include: ['tests/integration/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
      environment: 'happy-dom',
    },
  },
]);
```

### 8.5 Versioning — Changesets

```jsonc
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config@3/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [["@prismgb/core", "@prismgb/transport", "@prismgb/runtime"]],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Tier 1 packages **linked** (version together for contract coherence). Tier 2 capabilities version independently. All packages start `private: true`; lift per-package later.

### 8.6 Layer boundary enforcement

`scripts/check-layer-boundaries.js` extended with:

```javascript
const RULES = [
  // Tier 2 packages cannot import from each other
  { from: 'packages/prismgb-(?!core|transport|runtime|contracts|testing)/', cannotImport: '@prismgb/(?!core|transport|runtime|contracts|testing)' },
  
  // src/ cannot import from a package's internal paths
  { from: 'src/', cannotImport: '@prismgb/.*?/src/' },
  
  // Renderer process cannot import a package's main subpath
  { from: 'src/renderer/', cannotImport: '@prismgb/.*?/(?:main|worker)' },
  
  // Main process cannot import a package's renderer subpath
  { from: 'src/main/', cannotImport: '@prismgb/.*?/(?:renderer|worker)' },
  
  // Workers cannot import other-side code
  { from: 'packages/.*?/src/worker/', cannotImport: '@prismgb/.*?/(?:main|renderer)' },
];
```

Plus `eslint-plugin-import` with `import/no-restricted-paths` for lint-time enforcement.

### 8.7 License compliance CI

```yaml
- name: License Compliance
  run: npx license-checker --production --failOn "GPL;AGPL;LGPL;CDDL;EPL;OSL;SSPL"
```

Runs on every PR. Fails on any GPL-family license entering production deps. JSON artifact uploaded for audit.

### 8.8 Electron-builder integration

Workspace symlinks resolve transparently. Vite's electron-plugin bundles workspace package source into `dist/main/`, `dist/renderer/`, `dist/preload/`. Worker chunks in `dist/renderer/assets/`. Root `package.json` `build.files` unchanged in shape.

### 8.9 Dependency table

**Added** (production):

| Package | License | Purpose |
|---|---|---|
| `tsyringe` | MIT | DI container |
| `reflect-metadata` | Apache 2.0 | Decorator metadata |
| `@trpc/server@11` | MIT | tRPC router |
| `@trpc/client@11` | MIT | tRPC client |
| `electron-trpc` | MIT | electron tRPC adapter |
| `comlink` | Apache 2.0 | Worker RPC |
| `zod@4` | MIT | Schema validation |
| `mitt` | MIT | Typed event emitter |
| `rxjs` | Apache 2.0 | Observable Subject for push channels |
| `pino` | MIT | Structured logger (main) |
| `consola` | MIT | Pretty logger (renderer) |

**Added** (dev):

| Package | License | Purpose |
|---|---|---|
| `turbo` | MIT | Task orchestration |
| `@changesets/cli` | MIT | Versioning |
| `license-checker` | MIT | CI license audit |
| `eslint-plugin-import` | MIT | Layer boundary linting |
| `pixelmatch` (or `sharp`) | MIT/Apache 2.0 | Frame-equivalence test |

**Removed** (production):

| Package | Reason |
|---|---|
| `awilix` | Replaced by `tsyringe` |
| `eventemitter3` | Replaced by `mitt` |
| `joi` | Replaced by `zod` |
| `winston` | Replaced by `pino` |

**Bundle impact**: ~250–350 KB gzipped added (~1 MB unpacked). Negligible for desktop Electron app.

### 8.10 Dev experience commands

| Command | Behavior |
|---|---|
| `npm run dev` | Turbo dev: builds all packages in watch mode, starts Vite dev server, launches Electron with hot reload |
| `npm run build` | Turbo build: builds all packages, then app shell |
| `npm run typecheck` | `tsc -b` (project references, incremental) |
| `npm run lint` | Turbo lint: ESLint + layer boundary check across packages in parallel |
| `npm run test` | Turbo test: vitest across packages with caching |
| `npm run test:integration` | Cross-package integration tests in `tests/integration/` |
| `npm run test:e2e` | Playwright (unchanged) |
| `npm run test:hardware` | Manual hardware test runner (interactive) |
| `npm run regression:gpu:capture-baseline` | Capture frame-equivalence baseline (one-time before Phase 4f) |
| `npx changeset` | Add a changeset for current PR |
| `turbo run build --filter=@prismgb/gpu` | Build only GPU package and deps |

## 9. Migration Strategy & Sequencing

Seven phases (Phase 0 through Phase 6) over 12–18 weeks. Each phase ends in a complete, deployable, fully-tested state. Tagged rollback points at every phase boundary.

### 9.1 Phase 0 — Tooling foundation (~1–2 weeks, no app change)

- Add deps: `tsyringe`, `reflect-metadata`, `@trpc/server@11`, `@trpc/client@11`, `electron-trpc`, `comlink`, `zod@4`, `mitt`, `pino`, `consola`, `turborepo`, `@changesets/cli`, `license-checker`, `eslint-plugin-import`.
- Old deps stay during migration; removed in Phase 6.
- **Delete empty scaffolded packages**: `packages/prismgb-{chroma,core,devices,di,ipc,shader-compiler,shader-presets,stream-source}/`.
- Create `tsconfig.base.json` with strict + decorator settings.
- Create `vitest.workspace.ts`, `turbo.json`, `.changeset/config.json`.
- Wire `license-checker` into CI.
- Migrate root tooling (lint, typecheck, test) to use Turbo.

**Validation**: `npm install`, `npm run lint`, `npm run typecheck`, `npm run test` all pass with new tooling. License audit clean.

**Rollback**: `git revert` PR. No app code touched.

### 9.2 Phase 1 — Platform packages (~3–4 weeks, no app change)

Build Tier 1 in dependency order. Each is its own PR, fully tested, before next starts.

| Order | Package | Coverage target |
|---|---|---|
| 1.1 | `@prismgb/core` | 95% |
| 1.2 | `@prismgb/contracts` | n/a (types only) |
| 1.3 | `@prismgb/transport` | 95% |
| 1.4 | `@prismgb/runtime` | 95% |
| 1.5 | `@prismgb/testing` | self-test |

**Validation**: Tier 1 typechecks independently with `tsc -b`. App still builds and runs (Tier 1 is not yet imported by `src/`). License clean.

**Rollback**: per-package revert. App unaffected.

### 9.3 Phase 2 — Canary: `@prismgb/window` (~1–2 weeks, app-affecting)

First capability migration. Picked deliberately for **hardest transport patterns on bounded surface** (~600 LOC across 3 dirs).

**Deliverables**:
- Create `packages/prismgb-window/` per universal layout.
- Migrate (with TS conversion):
  - `src/main/infrastructure/window/window.service.ts` → `packages/prismgb-window/src/main/services/window.service.ts` with `@Service({ runs: 'main' })` + `@Rpc()` + `@Push<FullscreenState>()`.
  - `src/main/infrastructure/tray/tray.service.ts` → `packages/prismgb-window/src/main/services/tray.service.ts`.
  - `src/main/infrastructure/platform/login-item.service.ts` → `packages/prismgb-window/src/main/services/login-item.service.ts`.
  - `src/main/infrastructure/platform/gpu-policy.ts` → `packages/prismgb-window/src/main/services/gpu-policy.service.ts`.
  - Renderer-side window/login-item APIs → `packages/prismgb-window/src/renderer/services/`.
- Replace IPC channels with `@Rpc` methods. Delete preload bridges for window.
- Update `src/main/index.ts` and `src/renderer/index.ts` to bootstrap `@prismgb/window` via runtime.
- **Coexistence shim**: runtime exposes `bridge()` so old Awilix container can interop with new tsyringe container during Phases 2–4.
- Delete old code: `src/main/infrastructure/{window,tray,platform}/`, `src/preload/apis/window.preload-api.js`, `src/main/ipc/handlers/window.handler.ts`, window entries from `register-*.ts`/`channels.json`/`preload-api.contract.ts`.

**Validation gates**:
- `npm test` (unit + integration) green.
- `npm run test:e2e` green.
- **Manual verification on macOS, Windows, Linux**: window opens, fullscreen toggles, tray menu functional, login-item enable/disable works after restart.
- Architecture scorecard increases.

**Rollback**: tagged commit before merge. `git revert` PR if any validation fails.

**Failure mode**: if Phase 2 reveals platform design problems, **return to Phase 1 to refine Tier 1 before continuing**. Don't paper over.

### 9.4 Phase 3 — Platform refinement (~0.5–1 week, no app change)

Lessons from canary feed back into Tier 1. Common refinements expected:
- Decorator API ergonomics (e.g., `@Push` may need `{ replay: true }` option).
- Error code taxonomy (real codes added based on observed failure modes).
- Bootstrap timing fixes (e.g., distinct `@OnReady` lifecycle phase if needed).
- Transport observability tweaks.

**Validation**: same gates as Phase 2.

### 9.5 Phase 4 — Parallel capability migration (~4–8 weeks, app-affecting)

Once Tier 1 proven, remaining capabilities migrate in dependency-aware batches. Within a batch, capabilities migrate by separate agents in parallel (no shared file state).

**Dependency graph among capabilities**:
- Independent: `notes`, `settings`, `performance`, `updates`, `transcode`, `devices`.
- `streaming` depends on `devices`.
- `capture` depends on `streaming`.
- `gpu` independent but most complex.

**Batch plan**:

| Batch | Capabilities | Parallelizable? | Estimated weeks |
|---|---|---|---|
| 4a | `notes`, `settings`, `performance` | Yes (3 parallel) | 1.5 |
| 4b | `updates`, `transcode` | Yes (2 parallel) | 2 |
| 4c | `devices` | Sequential (HIGH risk) | 2 |
| 4d | `streaming` | Sequential (HIGH risk, depends on devices) | 2 |
| 4e | `capture` | Sequential (depends on streaming) | 1 |
| 4f | `gpu` | Sequential (HIGH risk, most complex) | 2–3 |

**Per-capability migration template** (every capability follows this):

1. Extract source files into `packages/prismgb-<name>/src/{shared,main,renderer,worker}/`.
2. Convert any moving `.js` to `.ts` simultaneously.
3. Apply decorators: `BaseService`/`BaseOrchestrator` → `@Injectable @Service @OnInit @OnDestroy`.
4. Replace IPC: old `ipcRenderer.invoke(...)`/`ipcMain.handle(...)` → `@Rpc()` + typed `rpc<TService>()` proxy.
5. Replace event channels: old string publish → typed publish via `EventChannelMap` augmentation.
6. Replace DI registration: delete entries from `register-*.ts` → `@Module` declaration.
7. Update tests: move to `packages/prismgb-<name>/tests/`. Use `@prismgb/testing` helpers.
8. Delete old `src/` code now in the package. `git diff` shows only deletions in `src/` and additions in `packages/`.
9. Validate: full test suite + scenario-specific manual verification (see risk table).
10. Merge as single PR per capability. Tagged commit. Update `MEMORY.md`.

**Risk-based validation**:

| Capability | Risk | Required validation beyond unit/integration |
|---|---|---|
| `notes` | LOW | Notes CRUD cycle |
| `settings` | LOW | All settings panels round-trip |
| `performance` | LOW | Performance metrics still emit |
| `updates` | MEDIUM | Manual update check flow (use staging release) |
| `transcode` | MEDIUM | Cycle WebM, MP4, MOV transcodes; cancel mid-transcode |
| `devices` | **HIGH** | **Hardware test**: 5× connect/disconnect, multi-device cycle, USB suspend/resume per platform |
| `streaming` | **HIGH** | **Hardware test**: 30-min continuous stream, 10× fullscreen toggle, 5× viewport resize |
| `capture` | MEDIUM | Screenshot, then GPU recording (≥30s), then transcode pipeline |
| `gpu` | **HIGH** | **Frame-equivalence test**: RMSE < threshold per preset; manual visual check |

### 9.6 Phase 5 — Shell collapse (~1–2 weeks, app-affecting)

Three sub-phases for risk management:
- **5a**: collapse preload (lowest risk).
- **5b**: collapse renderer infrastructure (medium).
- **5c**: collapse main infrastructure (highest).

**Deliverables**:
- `src/main/index.ts` reduced to ~50 LOC.
- `src/preload/index.js` reduced to ~30 LOC.
- `src/renderer/index.ts` reduced to ~100 LOC.
- Delete entirely: `src/main/{application,ipc,infrastructure}/`, `src/preload/apis/`, `src/renderer/{application,infrastructure}/`, most of `src/shared/` (except what genuinely shared between presentation and packages — most should move to `@prismgb/contracts`).
- `src/renderer/presentation/` is the only substantive remaining directory in `src/`.
- Delete the coexistence `bridge()` shim from `@prismgb/runtime`.

**Validation**: full test suite + Playwright + manual smoke test of every UI feature.

**Rollback**: per sub-phase.

### 9.7 Phase 6 — Final polish & docs (~1–2 weeks)

**Deliverables**:
- Audit/remove any remaining usage of `awilix`, `eventemitter3`, `joi`, `winston`, custom `RendererLogger`. Should already be gone.
- Update `docs/feature-map.md`, `docs/architecture-diagrams.md`, `docs/architecture-diagrams-onboarding.md`, `docs/naming-conventions.md`, `docs/ci-cd-workflows.md`, `CLAUDE.md` (project) to reflect new architecture.
- Add `docs/architecture-platform.md` covering platform packages.
- Run final `npm run architecture:scorecard` — 100% conformance.
- Final license audit, security audit, dependency audit.
- Bump all packages to `1.0.0`. First Changesets release.
- Tag `v2.0.0` of the app (major bump justified by architectural change).

### 9.8 TS migration policy — progressive

71 JS files convert to TS as their **owning capability** is migrated. No upfront one-shot conversion phase. Files in `src/presentation/` (which doesn't move into a package) convert to TS in Phase 6 as final polish.

Rationale: avoids two large refactors landing on the same files; rollback preserves any TS conversions; at end of Phase 5, `src/` is 100% TS by construction.

### 9.9 Coexistence shim (Phases 2–4 internal mechanism)

During capability migration, two DI containers coexist:
- **Old**: Awilix in main, custom `ServiceContainer` in renderer.
- **New**: tsyringe in both processes.

The runtime exports a `bridge()` helper that lets either container resolve services from the other. Bridge is **deleted in Phase 5** when no legacy code remains.

### 9.10 Worktree strategy

Use `superpowers:using-git-worktrees` for parallel batches in Phase 4. Each capability migration agent gets its own worktree → no cross-PR conflicts on `src/` deletions.

### 9.11 Timeline summary

| Scenario | Duration |
|---|---|
| Solo, no parallelization | 18 weeks (~4.5 months) |
| Solo, with subagent parallelization in Phase 4 | 14 weeks (~3.5 months) |
| Solo + you (testing on hardware in parallel) | 12 weeks (~3 months) |

Hardware testing for risky capabilities (devices, streaming, gpu) is the bottleneck.

## 10. Testing Strategy

### 10.1 Test taxonomy

| Category | Location | CI? |
|---|---|---|
| Unit | `packages/prismgb-*/tests/unit/` | Yes |
| Contract (auto-generated) | `packages/prismgb-*/tests/contract/` | Yes |
| Module integration | `packages/prismgb-*/tests/integration/` | Yes |
| Cross-package integration | `tests/integration/` | Yes |
| App-shell integration | `tests/integration/app-shell/` | Yes |
| E2E (Playwright) | `tests/e2e/` | Yes (per OS) |
| Hardware | `tests/hardware/` | No (manual) |
| Frame-equivalence (GPU) | `tests/regression/gpu-frame-equivalence/` | Conditional (PR labeled `gpu`) |
| Migration parity | `tests/migration/` | Phases 2–4 only; deleted in Phase 5 |

### 10.2 `@prismgb/testing` utilities

```typescript
createTestContainer({ providers, mocks })
createTestTransport({ services, packageNamespace })
fakeEventBus<TMap>()
fakeLogger()
fakeWorkerProxy<TService>(serviceClass)
bootModule(ModuleClass, { fixtures, mocks })
expectInitOrder(modules, expectedOrder)
expectDestroyOrder(modules, expectedOrder)
expectNoSubscriptionLeaks(eventBus)
useFakeTime()
```

### 10.3 Contract tests — auto-generated per package

For every package with `@Rpc`, `@Push`, or `@WorkerMethod` decorators, `@prismgb/testing` generates a contract test verifying:
- Every `@Rpc` method reachable end-to-end through `electron-trpc`'s in-process test transport.
- Input validation runs (if `@Rpc({ schema })`).
- Output type matches declared return.
- Every `@Push` channel subscribable; emitted payloads reach subscribers.
- Errors serialize as `PrismgbError` with full structure.
- Timeouts fire correctly.

### 10.4 Frame-equivalence harness (GPU)

**Step 1** (one-time before Phase 4f): `npm run regression:gpu:capture-baseline` runs against pre-migration build, captures rendered output for every preset across 60-frame fixture. Saved to `tests/regression/gpu-frame-equivalence/baseline/<preset>/frame-NNNN.png`. Committed to repo (~5 MB).

**Step 2** (during Phase 4f and any future GPU change): comparison test computes RMSE per pixel, compares against per-preset thresholds (true-color: 1.0, vintage: 1.5 (CRT effects have minor variance), pixel: 0.5, others: 1.0). Diffs saved when within 70% of threshold for human review.

Comparison via `pixelmatch` or `sharp`. Both license-clean.

### 10.5 Hardware test plan

Manual via `npm run test:hardware`. Interactive CLI scenarios per high-risk capability:

| Capability | Hardware cycles | Duration |
|---|---|---|
| `devices` | 5× connect/disconnect, 3× suspend/resume, multi-device cycle | 30 min |
| `streaming` | 30-min continuous stream, 10× fullscreen toggle, 5× viewport resize | 60 min |
| `capture` | 10× screenshot, 3× recording (≥30s each) | 20 min |
| `gpu` | All 6 presets, 5× preset switch during stream | 30 min |

Total per migration: ~2.5 hours focused testing.

### 10.6 Coverage targets

| Tier | Lines/Functions/Statements | Branches |
|---|---|---|
| Tier 1 platform | 95% | 90% |
| Tier 2 capabilities | 85% | 80% |
| App shell (`src/`) | 70% | 65% |
| Workspace overall | 85% | 80% |

Enforced via Vitest workspace mode → coverage merged → c8 → CI gate.

### 10.7 CI test matrix

| Job | Duration | Notes |
|---|---|---|
| `unit` | ~2 min | Parallel across packages |
| `contract` | ~1 min | Parallel across packages |
| `module-integration` | ~3 min | Parallel |
| `cross-pkg-integration` | ~2 min | |
| `app-shell-integration` | ~1 min | |
| `e2e` | ~10 min × 3 OS matrix | Playwright |
| `frame-equivalence` | ~5 min | Only on PRs labeled `gpu` |
| `bundle-size` | ~1 min | Tracked, not gated |
| `license` | ~30 s | Cached |
| `layer-boundaries` | ~10 s | |
| `typecheck` | ~30 s | tsc -b cached, incremental |
| `lint` | ~30 s | turbo cached |

Total wall-clock for typical PR: **~10–15 min** (dominated by E2E matrix).

## 11. Locked Decisions

### 11.1 Architecture

| Decision | Choice |
|---|---|
| Pattern (Hybrid C with module convention) | ✅ Locked Section 1 |
| Pattern A vs B (tRPC + Comlink vs Comlink everywhere) | **A** — tRPC main↔renderer, Comlink renderer↔worker |
| Library swaps (awilix, eventemitter3, joi, winston) | **Full swap** — replace all four |
| TS migration | **Progressive** during capability extraction |
| Plugin extensibility | **Future-proofing only** — architecture supports plugins; no plugin loader infrastructure built |
| Error telemetry | **Local logs + manual support-bundle export**; pluggable channel architecture leaves Sentry/external telemetry as future opt-in capability package |
| Performance budgets | **Track in CI as PR artifacts; don't gate yet**. Promote to gating later when baselines stable |
| Schema validation default | **Opt-in** via `@Rpc({ schema })`; bare `@Rpc()` skips. Architecture allows per-package or per-route required-schema rules later via ESLint without code changes |
| `@prismgb/chroma` | **Removed** — directory deleted in Phase 0; not part of migration |

### 11.2 Tooling

| Decision | Choice |
|---|---|
| Workspace tool | Turborepo |
| Build per-package | Vite library mode (uniform across all packages) |
| Test runner | Vitest workspace mode |
| Versioning | Changesets; Tier 1 linked, Tier 2 independent |
| Decorator support | `experimentalDecorators` + `emitDecoratorMetadata` |
| TS strictness | All strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax` |
| Module resolution | `bundler` |
| ESLint | Flat config, per-package overrides, `eslint-plugin-import` for boundary enforcement |
| Package privacy | All `private: true` initially |
| License denylist | GPL/AGPL/LGPL/CDDL/EPL/OSL/SSPL |

### 11.3 Defaults

| Decision | Choice |
|---|---|
| Logger output destinations | Pino → file (`app.getPath('logs')/combined.log` + `error.log`, max 5 MB × 5 files) + console (dev only); Consola → console (dev) + in-memory ring buffer (prod, exportable for support) |
| State persistence | Per-capability (no shared `@prismgb/persistence` package) |
| i18n | Out of scope |
| Crash recovery | Preserve current per-capability handling |
| Worker import syntax | `new Worker(new URL('./worker', import.meta.url), { type: 'module' })` |
| Module discovery | Vite `import.meta.glob({ eager: true })` for bundled packages |
| Auto-update freeze during Phase 4 | Defer operationally; recommend freeze during Phase 4f only |
| Doc structure | Preserve current; update content in Phase 6; add `docs/architecture-platform.md` |

## 12. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `electron-trpc` is small (~3k stars, 1 active maintainer); risk of unmaintained future | LOW-MED | MED | Wrapper is ~500 LOC; can fork or switch to raw `@trpc/server` + custom Electron adapter without architectural change |
| R2 | TypeScript `experimentalDecorators` is legacy; TC39 stage 3 decorators don't yet have DI library support | LOW | LOW | Industry standard for now; migration path exists when ecosystem catches up |
| R3 | `tsyringe` uses a global container by default; we need per-process containers | LOW | MED | `@prismgb/runtime` creates explicit `container` per process; ESLint rule prevents global use |
| R4 | Worker bundle dedup — both renderer and worker may include `@prismgb/core` | MED | LOW | Vite shared-chunks usually handle this; verify with bundle analyzer in Phase 1 |
| R5 | `emitDecoratorMetadata` produces extra code that tree-shakers may not remove | LOW | LOW | ~2-5% bundle overhead; acceptable |
| R6 | Frame-equivalence test could fail on visually-acceptable rendering differences | MED | MED | Per-preset RMSE thresholds; manual review for borderline cases; ability to re-baseline with reviewer approval |
| R7 | Coexistence shim during Phases 2–4 adds temporary complexity | MED | MED | Shim is ~150 LOC; tested via parity tests; deleted in Phase 5 |
| R8 | Hardware test gating means high-risk capabilities progress sequentially | HIGH | MED | Already reflected in timeline; canary in Phase 2 reveals platform issues before Batch 4c |
| R9 | Bundle size growth: ~250-350 KB gzipped from new deps | HIGH | LOW | Negligible for desktop Electron app; tracked via size-limit CI |
| R10 | Future Electron major version incompatibility with electron-trpc / Comlink | LOW | LOW | Ecosystem healthy; pin exactly + bump intentionally |
| R11 | Vite worker URL resolution across workspace symlinks may need explicit resolver config | MED | LOW | Test in Phase 1 with simple worker; configure Vite worker plugin if needed |

## 13. Success Criteria

The refactor is complete when ALL of the following hold:

| # | Criterion | Verification |
|---|---|---|
| C1 | All 10 capability packages exist and implement `PrismgbModule` | `npm run architecture:scorecard` reports 10/10 |
| C2 | All 5 platform packages exist with required test coverage | Vitest coverage reports |
| C3 | `src/main/`, `src/preload/`, `src/renderer/` (excluding `presentation/`) reduced to ≤200 LOC combined | `wc -l` |
| C4 | Zero `.js` files in `src/` or `packages/*/src/` | `find ... -name "*.js" \| wc -l` returns 0 |
| C5 | No usage of `awilix`, `eventemitter3`, `joi`, `winston`, custom `RendererLogger` | `grep -r` returns no results |
| C6 | All shaders exist in exactly one location (`packages/prismgb-gpu/src/worker/infrastructure/*/shaders/`) | `find` returns single-source for each shader |
| C7 | All IPC channels routed via `@Rpc`/`@Push`; no `ipcMain.handle`, `ipcRenderer.invoke`, custom postMessage | `grep -r` returns no results outside platform packages |
| C8 | `@prismgb/window`, `@prismgb/devices`, `@prismgb/streaming`, `@prismgb/capture`, `@prismgb/gpu` pass hardware tests on macOS, Windows, Linux | Hardware test reports |
| C9 | Frame-equivalence test passes for all 6 GPU presets | `npm run test:regression:gpu` green |
| C10 | All Playwright E2E tests pass | `npm run test:e2e` green per OS |
| C11 | License audit clean (no GPL-family licenses in production deps) | `license-checker` CI green |
| C12 | Architecture scorecard 100% conformance | `npm run architecture:scorecard` |
| C13 | Bundle size delta documented and within reasonable bounds (≤10% increase or net decrease) | `size-limit` report |
| C14 | All docs (`docs/feature-map.md`, `docs/architecture-diagrams.md`, etc.) updated to reflect new architecture | Manual review |
| C15 | All packages tagged `1.0.0`; app tagged `v2.0.0` | `git tag` |

## 14. Out of Scope

| # | Item | Rationale |
|---|---|---|
| OS1 | Internationalization | Single-language product; architectural future allows it |
| OS2 | Theming/visual customization expansion | Product decision, not architectural |
| OS3 | Plugin marketplace / package signing | Q7.2 = B; future feature |
| OS4 | Telemetry / analytics integration | Q7.3 = A+D; future opt-in capability |
| OS5 | Multi-window support | Out of current scope; could extend `@prismgb/window` later |
| OS6 | Cloud sync for notes/settings | Future `@prismgb/sync` capability |
| OS7 | Companion mobile app | Future use of `@prismgb/contracts` as shared types |
| OS8 | New device support beyond Chromatic | Architecture trivially supports it (drop in `@prismgb/devices-<name>`); no specific device targeted in this refactor |

## 15. Appendices

### A. File-level migration map (high-impact deletions)

This is a partial summary of what gets deleted from `src/`. Full per-capability migration template in Section 9.

| Source path | Disposition | LOC |
|---|---|---|
| `src/main/infrastructure/window/` | → `@prismgb/window/main/services/` | ~250 |
| `src/main/infrastructure/tray/` | → `@prismgb/window/main/services/tray.service.ts` | ~120 |
| `src/main/infrastructure/platform/` | → `@prismgb/window/main/services/{login-item,gpu-policy}.service.ts` | ~150 |
| `src/main/infrastructure/devices/` | → `@prismgb/devices/main/services/` | ~400 |
| `src/main/infrastructure/transcode/` | → `@prismgb/transcode/main/services/` | ~350 |
| `src/main/infrastructure/updates/` | → `@prismgb/updates/main/services/` | ~200 |
| `src/main/infrastructure/events/` | Deleted (replaced by `@prismgb/core` EventBus) | ~120 |
| `src/main/infrastructure/logging/` | Deleted (replaced by pino in `@prismgb/core` Logger interface) | ~210 |
| `src/main/ipc/` | Deleted (`@prismgb/transport` auto-assembles from `@Rpc`) | ~628 |
| `src/main/application/` | Deleted (Awilix container; replaced by tsyringe in runtime) | ~150 |
| `src/preload/apis/` | Deleted (`electron-trpc/preload` replaces all bridges) | ~600 |
| `src/preload/index.js` | Reduced to ~30 LOC | 178 → 30 |
| `src/renderer/application/di/` | Deleted (`@Module` decorators replace) | 932 |
| `src/renderer/application/orchestrators/` | → capability packages' `renderer/services/` | ~1500 |
| `src/renderer/infrastructure/services/` | → capability packages' `renderer/services/` | ~3000 |
| `src/renderer/infrastructure/adapters/` | → capability packages' `renderer/services/` (most eliminated as DI-resolved) | ~800 |
| `src/renderer/infrastructure/factories/` | Eliminated (DI handles selection) | ~100 |
| `src/renderer/infrastructure/rendering/` | → `@prismgb/gpu/{renderer,worker}/` | ~2,250 (most deleted as duplicate) |
| `src/renderer/infrastructure/events/` | Deleted | ~95 |
| `src/renderer/infrastructure/logging/` | Deleted (replaced by consola in `@prismgb/core`) | ~33 |
| `src/renderer/infrastructure/browser/` | → `@prismgb/streaming/renderer/` (browser-media), `@prismgb/settings/renderer/` (browser-storage) | ~80 |
| `src/renderer/infrastructure/streaming/` | → `@prismgb/streaming/renderer/` | ~600 |
| `src/renderer/infrastructure/di/` | Deleted (custom ServiceContainer; replaced by tsyringe) | ~169 |
| `src/shared/base/` | Deleted (`@prismgb/core` decorators replace base classes) | ~250 |
| `src/shared/features/devices/` | → `@prismgb/devices/shared/` | ~500 |
| `src/shared/features/transcode/` | → `@prismgb/transcode/shared/` | ~50 |
| `src/shared/events/event-channels.ts` | Deleted (typed augmentation per package replaces) | ~123 |
| `src/shared/ipc/` | → `@prismgb/contracts/` (types) + deleted (channels.json) | ~250 |
| `src/shared/interfaces/` | → `@prismgb/contracts/` | ~60 |
| `src/shared/lib/`, `src/shared/utils/`, `src/shared/config/` | Distributed: pure utils to relevant capability packages; cross-cutting types to `@prismgb/contracts` | ~700 |

**Approximate total**: ~14,000 LOC moved or deleted from `src/`. ~10,500 LOC redistributed into packages. **Net deletion ~3,500 LOC.**

### B. Memory entries to add after spec approval

```markdown
project_platform_refactor.md:
- Spec at docs/superpowers/specs/2026-04-17-prismgb-platform-refactor-design.md.
- Architecture: Tier 1 (core, transport, runtime, contracts, testing) + Tier 2 (gpu, devices, streaming, capture, transcode, notes, settings, updates, window, performance) + Tier 3 (src/ shell + presentation only).
- Stack: tsyringe (DI), electron-trpc (main↔renderer RPC), Comlink (renderer↔worker RPC), zod (validation), mitt (typed EventBus), pino (main logger), consola (renderer logger), Turborepo (orchestration), Changesets (versioning).
- Migration: 6 phases over 12-18 weeks; canary = @prismgb/window; gpu refactored last (Phase 4f).
- prismgb-chroma deleted; not used in this product.
- Plugin extensibility is future-proofing only — no plugin loader built.
- Error telemetry: local logs + manual support-bundle export; no third-party SDKs.

feedback_architecture_preferences.md:
- User prefers heavier refactor for long-term cleanness over incremental.
- User prefers leaning on common frameworks (tsyringe, tRPC, Comlink, Zod) over bespoke.
- User prefers full TS migration (achieved progressively during capability extraction).
- User prefers decorator-driven architecture over convention-based.
- User defers tactical decisions to assistant when criteria clearly given ("cleanest long-term future-first architecture").
```

### C. Glossary

| Term | Meaning |
|---|---|
| **Tier 1** | Platform packages (foundation): `@prismgb/core`, `@prismgb/transport`, `@prismgb/runtime`, `@prismgb/contracts`, `@prismgb/testing` |
| **Tier 2** | Capability packages (features): all `@prismgb/*` not in Tier 1 |
| **Tier 3** | App shell: `src/` directory after refactor |
| **Surface** | A side of a capability package (`shared`, `main`, `renderer`, `worker`) — exposed via subpath export |
| **Module** | A `@Module`-decorated class declaring providers and imports for a single process surface |
| **Manifest** | The `PrismgbModule` POJO exported from a package's `src/index.ts` describing surfaces and metadata |
| **Capability** | A self-contained product feature implemented as a Tier 2 package |
| **Canary** | The first capability migrated (Phase 2: `@prismgb/window`) used to validate the platform |
| **Coexistence shim** | The `bridge()` helper that lets old Awilix and new tsyringe interoperate during Phases 2–4; deleted in Phase 5 |
| **Frame-equivalence test** | RMSE-based pixel comparison between baseline (pre-migration) and migrated GPU output |

---

**End of spec.** Awaiting user review per `superpowers:brainstorming` workflow. After approval, transition to `superpowers:writing-plans` to author the executable implementation plan.
