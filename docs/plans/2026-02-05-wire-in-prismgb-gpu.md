# Wire In @prismgb/gpu Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the renderer's inline GPU rendering code with imports from `@prismgb/gpu`, making the package the single source of truth for presets, capabilities, uniforms, and shader types.

**Architecture:** The renderer currently has its own preset config, capability detector, and uniform builder scattered across `infrastructure/rendering/`. The `@prismgb/gpu` package already has equivalent, typed implementations. We replace renderer-side code with package imports, keeping the render worker and service layer intact since they handle worker messaging and app-specific concerns (EventBus, DI, brightness subscriptions) that don't belong in the package.

**Tech Stack:** TypeScript, Vite (workspace packages with `?raw` shader imports), Vitest

---

## Analysis: What @prismgb/gpu Provides vs What Renderer Uses

| Concern | Renderer (current) | @prismgb/gpu (replacement) |
|---|---|---|
| **Presets** | `render-presets.config.ts` — JS object with `getPresetById()`, `getPresetsForUI()`, `buildUniformsFromPreset()` | `PresetRegistry` singleton + `IPreset` type + typed presets + `buildUniforms()` |
| **Capability Detection** | `capability-detector.utils.ts` — `CapabilityDetector` namespace with `detect()`, helper methods | `detectCapabilities()` + `IPipelineCapabilities` type |
| **Uniform Types** | Implicit (untyped JS objects passed to worker) | `PipelineUniforms`, `UpscaleUniforms`, `UnsharpUniforms`, `ColorUniforms`, `CRTUniforms` |
| **Preset Types** | JSDoc `@typedef` in config file | `IPreset`, `UpscaleConfig`, `UnsharpConfig`, `ColorConfig`, `CRTConfig` |
| **Shaders** | Duplicated in `rendering/shaders/` and `packages/prismgb-gpu/` (byte-identical) | Canonical source with Vite `?raw` loaders |
| **Optimization Utils** | `optimization.utils.ts` in workers dir — `BindGroupCache`, `ShaderProgram`, `UniformTracker`, `TypedArrayPool`, `CaptureBufferManager` | Package has its own `BindGroupCache`, `ShaderProgram`, `UniformTracker` (typed) |

### What STAYS in the renderer (not in package):
- `gpu-renderer.service.ts` — app-specific service (EventBus, DI, brightness subscriptions, worker lifecycle)
- `render.worker.ts` — Web Worker with message protocol, performance tracking, capture management
- `render-pipeline.service.ts` — strategy selection and renderer lifecycle orchestration
- `gpu-render-loop.service.ts`, `gpu-frame-buffer.ts`, `gpu-worker-manager.ts` — app-specific worker coordination
- `optimization.utils.ts` — worker-specific utilities (`TypedArrayPool`, `CaptureBufferManager` not in package)
- Renderer adapters (`gpu-renderer.adapter.ts`, `canvas2d-renderer.adapter.ts`)
- All shader files in `rendering/shaders/` — the worker imports these directly via `?raw`

### What Gets Replaced:
1. **Preset config** → Import `PresetRegistry` + `IPreset` from `@prismgb/gpu`
2. **Capability detector** → Import `detectCapabilities` + `IPipelineCapabilities` from `@prismgb/gpu`
3. **Uniform building** → Import `buildUniforms` from `@prismgb/gpu`
4. **Types** → Import `IPreset`, `PipelineUniforms`, etc. from `@prismgb/gpu`

### Key Data Shape Differences

**Preset values**: The GPU package presets have slightly different tuning than the renderer presets (e.g., `true-color` gamma is 1.0 in package vs 0.92 in renderer). The **renderer values are the production-tuned ones**. The package preset values need to be updated to match.

**Uniform shape**: The package uses `buildUniforms()` which returns typed `PipelineUniforms` with structured arrays (e.g., `upscale.inputSize: [number, number]`). The renderer uses `buildUniformsFromPreset()` which returns a flat object (e.g., `upscale.sourceSize: [160, 144]`). The worker currently consumes the renderer's flat format. We need to either:
- (a) Update the worker to accept the package's typed format, OR
- (b) Keep a thin adapter in the service that maps package format → worker format

**Option (a)** is cleaner. The worker's `_updateUniforms()` method reads named properties from the object — switching from `uniforms.upscale.sourceSize` to `uniforms.upscale.inputSize` is a straightforward rename.

**Capability shape**: The renderer's `CapabilityDetector` returns extra fields (`gpuPolicyApplied`, `gpuPolicyReason`, `maxRenderbufferSize`, `maxViewportDims`, `version`, `shadingLanguageVersion`) that the package doesn't. The GPU policy check (ARM Linux detection via IPC) is renderer-specific. We'll keep a thin wrapper that calls the package's `detectCapabilities()` and enriches it with the GPU policy.

---

## Execution Strategy

### Dependency Graph

```
Task 1 (sync preset values) ──┐
                                ├── Task 3 (replace presets in service)
Task 2 (update uniform shape) ─┤
                                ├── Task 4 (replace presets in UI)
                                │
                                ├── Task 5 (replace capability detector)
                                │
                                └── Task 6 (replace types) ── Task 7 (cleanup) ── Task 8 (validation)
```

### Risk Classification

| Task | Risk | Rationale |
|------|------|-----------|
| 1: Sync preset values | LOW | Data-only changes in package, tests verify |
| 2: Update uniform shape in worker | MEDIUM | Worker protocol change, but uniform names only |
| 3: Replace presets in gpu-renderer.service | MEDIUM | Core service, multiple import sites |
| 4: Replace presets in UI | LOW | Single import site |
| 5: Replace capability detector | MEDIUM | Enrichment wrapper needed for GPU policy |
| 6: Replace types | LOW | Type-only imports |
| 7: Cleanup dead code | LOW | Delete files, update tests |
| 8: Final validation | LOW | Run full test suite + lint |

---

## Tasks

### Task 1: Sync @prismgb/gpu Preset Values to Match Renderer

The package presets have different tuning values than the renderer's production presets. Update the package presets to match the renderer's values exactly.

**Files:**
- Modify: `packages/prismgb-gpu/src/domain/presets/presets/true-color.preset.ts`
- Modify: `packages/prismgb-gpu/src/domain/presets/presets/vibrant.preset.ts`
- Modify: `packages/prismgb-gpu/src/domain/presets/presets/hi-def.preset.ts`
- Modify: `packages/prismgb-gpu/src/domain/presets/presets/vintage.preset.ts`
- Modify: `packages/prismgb-gpu/src/domain/presets/presets/pixel.preset.ts`
- Modify: `packages/prismgb-gpu/src/domain/presets/presets/performance.preset.ts`
- Reference: `src/renderer/infrastructure/rendering/presets/render-presets.config.ts` (source of truth values)

**Step 1: Update each preset file to match renderer values**

Use the renderer's `render-presets.config.ts` as the source of truth. Key differences to sync:

| Preset | Field | Package | Renderer (correct) |
|--------|-------|---------|-------------------|
| true-color | gamma | 1.0 | 0.92 |
| true-color | greenBias | 0.04 | 0.03 |
| vibrant | gamma | 0.90 | 0.88 |
| hi-def | greenBias | 0.02 | 0.01 |
| vintage | brightness | 1.0 | 0.95 |
| pixel | greenBias | 0.03 | 0.04 |

Also add the `description` field to the `IPreset` interface since the renderer presets include descriptions and the UI's `getPresetsForUI()` returns them.

**Step 2: Add `description` to IPreset interface**

Modify `packages/prismgb-gpu/src/domain/presets/preset.interface.ts`:
```typescript
export interface IPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;  // Add this
  readonly upscale: UpscaleConfig;
  // ...
}
```

Update `PresetRegistry.getForUI()` to include description:
```typescript
getForUI(): Array<{ id: string; name: string; description: string }> {
  return this.getAll().map(p => ({ id: p.id, name: p.name, description: p.description }));
}
```

**Step 3: Run package tests**

Run: `npx vitest run packages/prismgb-gpu`
Expected: All 3 test files pass

**Step 4: Commit**

```bash
git add packages/prismgb-gpu/src/domain/presets/
git commit -m "fix(gpu): sync preset values and add description to IPreset"
```

---

### Task 2: Update Worker Uniform Shape to Match Package Format

The render worker currently consumes the renderer's flat uniform format. Update it to accept the package's `PipelineUniforms` shape so the GPU service can pass package-built uniforms directly.

**Files:**
- Modify: `src/renderer/infrastructure/rendering/workers/render.worker.ts`
- Reference: `packages/prismgb-gpu/src/domain/shaders/shader-uniforms.types.ts` (target shape)

**Property renames in worker:**

| Pass | Current (renderer) | New (package) |
|------|--------------------|---------------|
| upscale | `sourceSize` | `inputSize` |
| upscale | `targetSize` | `outputSize` |
| upscale | (missing) | uses `scaleFactor` (already present) |
| unsharp | `texelSize` | `texelSize` (same) |
| unsharp | `strength` | `strength` (same) |
| unsharp | `scaleFactor` | `scaleFactor` (same) |
| color | all fields | same names |
| crt | `resolution` | `resolution` (same) |
| crt | all fields | same names |

Only the upscale pass property names differ. The worker also receives `nativeWidth`/`nativeHeight`/`targetWidth`/`targetHeight`/`scaleFactor` from `this.config` and uses them in `_updateUniforms()`, so the config-driven upscale uniforms won't change shape (they're built from config, not from the uniforms object). However, the flat `uniforms` object passed via `handleFrame` needs to match.

Actually, looking more closely: the worker's `_updateUniforms()` method in `WebGPURenderer` uses `this.config.nativeWidth/nativeHeight/targetWidth/targetHeight/scaleFactor` directly — it does NOT read from the `uniforms` parameter for the upscale pass. It only reads `uniforms.unsharp.*`, `uniforms.color.*`, and `uniforms.crt.*`. And those field names are identical between renderer and package formats.

The `WebGL2Renderer.render()` also uses `this.config.*` for upscale and reads `uniforms.unsharp/color/crt` for the remaining passes.

**Conclusion:** The worker doesn't need changes for uniform shapes — the fields it reads from the `uniforms` object already match the package's format for the passes that use it.

**Step 1: Verify no changes needed**

Read the worker carefully and confirm that `uniforms.unsharp.strength`, `uniforms.unsharp.enabled`, `uniforms.color.*`, and `uniforms.crt.*` are the same between the renderer's `buildUniformsFromPreset()` output and the package's `buildUniforms()` output.

Renderer format:
```js
{ unsharp: { enabled, strength, texelSize, scaleFactor },
  color: { enabled, gamma, saturation, greenBias, brightness, contrast },
  crt: { enabled, resolution, scanlineStrength, ..., scaleFactor } }
```

Package format:
```ts
{ unsharp: { texelSize, strength, scaleFactor },
  color: { gamma, saturation, greenBias, brightness, contrast },
  crt: { resolution, scaleFactor, scanlineStrength, ... } }
```

Key difference: The renderer includes `enabled` boolean in each pass, the package does not (it zeros disabled values instead). The worker reads `uniforms.unsharp.enabled` and `uniforms.color.enabled` to skip passes. Need to verify the package's `buildUniforms()` handles this — YES it does: when `preset.unsharp.enabled` is false, it sets `strength: 0`, and the worker checks `uniforms.unsharp.strength > 0`. When `preset.color.enabled` is false, it passes identity values (gamma=1, saturation=1, etc.).

**However**, the worker's `WebGPURenderer.render()` checks `uniforms.unsharp.enabled && uniforms.unsharp.strength > 0` and `uniforms.color.enabled`. Since the package format doesn't include `enabled`, we need to either:
- (a) Add `enabled` to the package's uniform types, or
- (b) Update the worker to only check the values (not `enabled`)

Option (b) is correct — the package already zeros values for disabled passes, so checking `strength > 0` is sufficient.

**Step 1: Update worker pass-skip conditions**

In `render.worker.ts`, `WebGPURenderer.render()`:
- Change `if (uniforms.unsharp.enabled && uniforms.unsharp.strength > 0)` → `if (uniforms.unsharp.strength > 0)`
- Change `if (uniforms.color.enabled)` → always run color pass (package sets identity values when disabled; the shader is a passthrough with identity values so there's no visual difference, but skipping it saves a draw call)

Actually, the better approach is: check meaningful values. For color, if gamma=1, saturation=1, greenBias=0, brightness=1, contrast=1, it's a no-op. But this check is expensive. Instead, let's add an `enabled` flag to the uniform types.

**Revised approach:** Add `enabled: boolean` to `UnsharpUniforms` and `ColorUniforms` in the package types, and have `buildUniforms()` include it. This is the cleanest solution — the worker's skip logic stays explicit.

**Step 2: Add `enabled` to uniform types**

Modify `packages/prismgb-gpu/src/domain/shaders/shader-uniforms.types.ts`:
```typescript
export interface UnsharpUniforms {
  enabled: boolean;  // Add
  texelSize: [number, number];
  strength: number;
  scaleFactor: number;
}

export interface ColorUniforms {
  enabled: boolean;  // Add
  gamma: number;
  // ...
}

export interface CRTUniforms {
  enabled: boolean;  // Add
  resolution: [number, number];
  // ...
}
```

**Step 3: Update `buildUniforms()` to include `enabled`**

Modify `packages/prismgb-gpu/src/application/uniform-builder.ts`:
```typescript
return {
  upscale: { ... },
  unsharp: {
    enabled: preset.unsharp.enabled,
    texelSize: [...],
    // ...
  },
  color: {
    enabled: preset.color.enabled,
    gamma: ...,
    // ...
  },
  crt: {
    enabled: preset.crt.enabled,
    resolution: [...],
    // ...
  }
};
```

**Step 4: Update uniform-builder test**

Modify `packages/prismgb-gpu/tests/unit/application/uniform-builder.test.ts` to assert `enabled` fields.

**Step 5: Run package tests**

Run: `npx vitest run packages/prismgb-gpu`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/prismgb-gpu/src/domain/shaders/ packages/prismgb-gpu/src/application/uniform-builder.ts packages/prismgb-gpu/tests/
git commit -m "feat(gpu): add enabled flags to uniform types for pass-skip logic"
```

---

### Task 3: Replace Preset Imports in GPU Renderer Service

Replace `render-presets.config.ts` imports in `gpu-renderer.service.ts` with `@prismgb/gpu` imports.

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`

**Step 1: Update imports**

Replace:
```typescript
import {
  DEFAULT_PRESET_ID,
  getPresetById,
  buildUniformsFromPreset
} from '@renderer/infrastructure/rendering/presets/render-presets.config.ts';
```

With:
```typescript
import {
  PresetRegistry,
  buildUniforms
} from '@prismgb/gpu';
import type { IPreset } from '@prismgb/gpu';
```

**Step 2: Update preset lookup calls**

Replace all `getPresetById(id)` calls with `PresetRegistry.get(id)`:
- Line 208: `PresetRegistry.get(savedPresetId) || PresetRegistry.getDefault()`
- Line 266: `PresetRegistry.get(savedPresetId) || PresetRegistry.getDefault()`
- Line 557: `PresetRegistry.get(presetId)`

Replace `DEFAULT_PRESET_ID` with `PresetRegistry.getDefault().id` or inline `'vibrant'` — actually, since `PresetRegistry.getDefault()` returns a preset, use `PresetRegistry.getDefault()` directly where a preset object is needed, and `PresetRegistry.getDefault().id` where an ID is needed.

Note: The package's default preset ID is `'true-color'` but the renderer uses `'vibrant'` as default. We need to call `PresetRegistry.setDefault('vibrant')` during app initialization (in the container or service init).

**Step 3: Update uniform building**

Replace `buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight)` with:
```typescript
buildUniforms({
  preset: this._currentPreset,
  nativeWidth: NATIVE_WIDTH,
  nativeHeight: NATIVE_HEIGHT,
  outputWidth: this._targetWidth,
  outputHeight: this._targetHeight,
  brightness: this._globalBrightness
});
```

This also simplifies `_getCachedUniforms()` since `buildUniforms()` already applies brightness multiplication.

**Step 4: Run tests**

Run: `npx vitest run tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts
git commit -m "refactor(streaming): replace preset config imports with @prismgb/gpu"
```

---

### Task 4: Replace Preset Imports in UI Component

Replace `render-presets.config.ts` import in the shader preset list UI component.

**Files:**
- Modify: `src/renderer/presentation/features/toolbar/components/shader-preset-list.component.js`

**Step 1: Update import**

Replace:
```javascript
import { getPresetsForUI } from '@renderer/infrastructure/rendering/presets/render-presets.config.ts';
```

With:
```javascript
import { PresetRegistry } from '@prismgb/gpu';
```

**Step 2: Update usage**

Replace `getPresetsForUI()` call with `PresetRegistry.getForUI()`.

**Step 3: Run tests**

Run: `npx vitest run tests/unit/ui/components/shader-selector.test.js tests/unit/ui/toolbar/shader-preset-list.component.test.js`
Expected: PASS (may need to update mock for `@prismgb/gpu`)

**Step 4: Commit**

```bash
git add src/renderer/presentation/features/toolbar/components/shader-preset-list.component.js
git commit -m "refactor(ui): replace preset config import with @prismgb/gpu PresetRegistry"
```

---

### Task 5: Replace Capability Detector with Package + Enrichment Wrapper

Replace the renderer's `CapabilityDetector` with the package's `detectCapabilities()`, keeping a thin wrapper for the renderer-specific GPU policy check.

**Files:**
- Modify: `src/renderer/infrastructure/rendering/capability-detector.utils.ts`
- Modify: `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`

**Step 1: Rewrite capability-detector.utils.ts as a thin wrapper**

The renderer's capability detector has extra functionality:
- GPU policy check via `window.gpuAPI.getPolicy()` (ARM Linux detection)
- Extra WebGL2 info fields (`maxRenderbufferSize`, `maxViewportDims`, `version`, `shadingLanguageVersion`)
- Helper methods: `isGPURenderingAvailable()`, `isWorkerRenderingAvailable()`, `describeCapabilities()`

Replace with:
```typescript
import { detectCapabilities as detectBase } from '@prismgb/gpu';
import type { IPipelineCapabilities } from '@prismgb/gpu';

export interface RendererCapabilities extends IPipelineCapabilities {
  gpuPolicyApplied: boolean;
  gpuPolicyReason: string | null;
}

async function getGpuPolicyWithFallback() {
  // Keep existing implementation
}

async function detectCapabilities(): Promise<RendererCapabilities> {
  const gpuPolicy = await getGpuPolicyWithFallback();

  if (gpuPolicy.skipWebGPU) {
    // Detect without WebGPU, then override
    const base = await detectBase();
    return {
      ...base,
      webgpu: false,
      preferredAPI: base.webgl2 ? 'webgl2' : 'canvas2d',
      gpuPolicyApplied: true,
      gpuPolicyReason: gpuPolicy.reason
    };
  }

  const base = await detectBase();
  return {
    ...base,
    gpuPolicyApplied: false,
    gpuPolicyReason: null
  };
}

function isGPURenderingAvailable(capabilities: RendererCapabilities): boolean {
  return capabilities.webgpu || capabilities.webgl2;
}

function isWorkerRenderingAvailable(capabilities: RendererCapabilities): boolean {
  return capabilities.transferControlToOffscreen && (capabilities.webgpu || capabilities.webgl2);
}

function describeCapabilities(capabilities: RendererCapabilities): string {
  // Keep existing implementation, adapted for new types
}

export const CapabilityDetector = {
  detect: detectCapabilities,
  isGPURenderingAvailable,
  isWorkerRenderingAvailable,
  describeCapabilities
};
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/infrastructure/rendering/capability-detector.utils.ts
git commit -m "refactor(rendering): replace capability detector internals with @prismgb/gpu"
```

---

### Task 6: Set Default Preset at App Initialization

The package defaults to `'true-color'` but the app defaults to `'vibrant'`. Set the default during container/app initialization.

**Files:**
- Modify: `src/renderer/application/container.ts`

**Step 1: Add preset default initialization**

Add to the container setup (after imports):
```typescript
import { PresetRegistry } from '@prismgb/gpu';
PresetRegistry.setDefault('vibrant');
```

This ensures the package's `PresetRegistry.getDefault()` returns the vibrant preset throughout the app.

**Step 2: Run tests**

Run: `npx vitest run tests/unit/app/renderer/container.test.js`
Expected: PASS (may need to mock `@prismgb/gpu`)

**Step 3: Commit**

```bash
git add src/renderer/application/container.ts
git commit -m "feat(renderer): set default preset to vibrant via @prismgb/gpu PresetRegistry"
```

---

### Task 7: Cleanup Dead Code

Remove the renderer's now-unused preset config file once all consumers have been migrated.

**Files:**
- Delete: `src/renderer/infrastructure/rendering/presets/render-presets.config.ts`
- Modify: any tests that import from the deleted file

**Step 1: Search for remaining references**

```bash
grep -r "render-presets.config" src/ tests/
```

If any references remain, update them first.

**Step 2: Delete the file**

```bash
rm src/renderer/infrastructure/rendering/presets/render-presets.config.ts
```

**Step 3: Update tests that mocked/imported the old file**

Check `tests/unit/features/streaming/rendering/presets/render-presets.test.js` — this tests the old config. Either:
- Delete it (the package has its own preset tests), or
- Redirect it to test `PresetRegistry` from `@prismgb/gpu`

**Step 4: Run full test suite**

Run: `npm run test:run`
Expected: All 129+ files pass, 2836+ tests pass

**Step 5: Run lint**

Run: `npm run lint`
Expected: Clean

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(rendering): remove legacy preset config (now in @prismgb/gpu)"
```

---

### Task 8: Final Validation

**Step 1: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: Clean

**Step 3: Verify no remaining old imports**

```bash
grep -r "render-presets.config" src/ tests/
grep -r "getPresetById\|getPresetsForUI\|buildUniformsFromPreset" src/
```

Expected: No matches

**Step 4: Verify @prismgb/gpu is imported**

```bash
grep -r "@prismgb/gpu" src/
```

Expected: Matches in gpu-renderer.service.ts, capability-detector.utils.ts, shader-preset-list.component.js, container.ts
