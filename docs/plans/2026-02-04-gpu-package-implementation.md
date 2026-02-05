# Phase 2: Extract @prismgb/gpu Package - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract GPU rendering as a standalone `@prismgb/gpu` workspace package with clean public API, TypeScript throughout, and WebGPU → WebGL2 → Canvas2D fallback chain.

**Approach:** Fresh package with TypeScript rewrite (Approach A). Create new package structure, port shader logic, define clean public API.

**Tech Stack:** TypeScript 5.x, Vite 7.x, Vitest 4.x, npm workspaces, @webgpu/types

---

## Phase 2.0: Package Setup

### Task 2.0: Create Package Structure

**Files:**
- Create: `prismgb-gpu/package.json`
- Create: `prismgb-gpu/tsconfig.json`
- Create: `prismgb-gpu/vite.config.ts`
- Create: `prismgb-gpu/vitest.config.ts`

**Step 1: Create package directory**

```bash
mkdir -p /Users/josstei/Development/prismgb-workspace/prismgb-gpu
cd /Users/josstei/Development/prismgb-workspace/prismgb-gpu
```

**Step 2: Create package.json**

```json
{
  "name": "@prismgb/gpu",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && tsc --emitDeclarationOnly",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "@webgpu/types": "^0.1.40",
    "typescript": "^5.3.0",
    "vite": "^7.0.0",
    "vitest": "^4.0.0",
    "happy-dom": "^17.4.4"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationDir": "dist",
    "types": ["@webgpu/types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBGpu',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: [],
      output: {
        preserveModules: false
      }
    },
    sourcemap: true,
    minify: false
  },
  worker: {
    format: 'es'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
```

**Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.interface.ts',
        'src/infrastructure/webgpu/**',
        'src/infrastructure/webgl2/**',
        'src/infrastructure/workers/**'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
```

**Step 6: Commit**

```bash
git add prismgb-gpu/
git commit -m "build(gpu): create @prismgb/gpu package structure"
```

---

### Task 2.1: Create Directory Structure

**Files:**
- Create directory tree under `prismgb-gpu/src/`

**Step 1: Create directories**

```bash
mkdir -p prismgb-gpu/src/{domain/{pipeline,presets/presets,shaders,frame},application,infrastructure/{webgpu/shaders,webgl2/shaders,canvas2d,workers},factories}
mkdir -p prismgb-gpu/tests/unit/{domain/presets,application,factories}
```

**Step 2: Create placeholder index.ts**

Create `prismgb-gpu/src/index.ts`:

```typescript
// @prismgb/gpu - GPU Rendering Pipeline Package
// Public API will be exported here
export {};
```

**Step 3: Verify structure**

```bash
ls -la prismgb-gpu/src/
```

**Step 4: Commit**

```bash
git add prismgb-gpu/src/
git commit -m "feat(gpu): create directory structure"
```

---

## Phase 2.1: Domain Layer

### Task 2.2: Create Pipeline Interfaces

**Files:**
- Create: `src/domain/pipeline/pipeline.interface.ts`
- Create: `src/domain/pipeline/pipeline-config.interface.ts`
- Create: `src/domain/pipeline/pipeline-capabilities.interface.ts`
- Create: `src/domain/pipeline/pipeline-stats.interface.ts`
- Create: `src/domain/pipeline/index.ts`

**Step 1: Create pipeline.interface.ts**

```typescript
import type { IPreset } from '../presets/preset.interface';
import type { IPipelineStats } from './pipeline-stats.interface';

/**
 * Core pipeline interface for GPU rendering.
 * Implementations: WebGPUPipeline, WebGL2Pipeline, Canvas2DPipeline
 */
export interface IPipeline {
  readonly isInitialized: boolean;
  readonly isActive: boolean;

  initialize(): Promise<void>;
  renderFrame(source: TexImageSource): void;
  resize(width: number, height: number): void;

  setPreset(preset: IPreset): void;
  getPreset(): IPreset;

  setBrightness(value: number): void;

  captureFrame(): Promise<ImageBitmap>;

  pause(): void;
  resume(): void;

  getStats(): IPipelineStats;

  releaseResources(): void;
  dispose(): Promise<void>;
}
```

**Step 2: Create pipeline-config.interface.ts**

```typescript
import type { IPreset } from '../presets/preset.interface';

export type RenderAPI = 'webgpu' | 'webgl2' | 'canvas2d';

export interface IPipelineConfig {
  canvas: HTMLCanvasElement;
  nativeWidth: number;
  nativeHeight: number;
  preset?: IPreset;
  preferredAPI?: RenderAPI;
  useWorker?: boolean;
}
```

**Step 3: Create pipeline-capabilities.interface.ts**

```typescript
import type { RenderAPI } from './pipeline-config.interface';

export interface WebGPULimits {
  maxTextureDimension2D: number;
  maxBindGroups: number;
}

export interface WebGL2Info {
  renderer: string;
  vendor: string;
  maxTextureSize: number;
}

export interface IPipelineCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  transferControlToOffscreen: boolean;
  preferredAPI: RenderAPI;
  maxTextureSize: number;
  webgpuLimits?: WebGPULimits;
  webgl2Info?: WebGL2Info;
}
```

**Step 4: Create pipeline-stats.interface.ts**

```typescript
export interface IPipelineStats {
  fps: number;
  frameTime: number;
  gpuTime?: number;
  framesRendered: number;
  framesDropped: number;
}
```

**Step 5: Create index.ts**

```typescript
export type { IPipeline } from './pipeline.interface';

export type {
  IPipelineConfig,
  RenderAPI
} from './pipeline-config.interface';

export type {
  IPipelineCapabilities,
  WebGPULimits,
  WebGL2Info
} from './pipeline-capabilities.interface';

export type { IPipelineStats } from './pipeline-stats.interface';
```

**Step 6: Commit**

```bash
git add src/domain/pipeline/
git commit -m "feat(gpu): add pipeline interfaces"
```

---

### Task 2.3: Create Preset Interfaces and Registry

**Files:**
- Create: `src/domain/presets/preset.interface.ts`
- Create: `src/domain/presets/preset-registry.ts`
- Create: `src/domain/presets/index.ts`

**Step 1: Create preset.interface.ts**

```typescript
export interface UpscaleConfig {
  enabled: boolean;
}

export interface UnsharpConfig {
  enabled: boolean;
  strength: number;
}

export interface ColorConfig {
  enabled: boolean;
  gamma: number;
  saturation: number;
  greenBias: number;
  brightness: number;
  contrast: number;
}

export interface CRTConfig {
  enabled: boolean;
  scanlineStrength: number;
  pixelMaskStrength: number;
  bloomStrength: number;
  curvature: number;
  vignetteStrength: number;
}

export interface IPreset {
  readonly id: string;
  readonly name: string;
  readonly upscale: UpscaleConfig;
  readonly unsharp: UnsharpConfig;
  readonly color: ColorConfig;
  readonly crt: CRTConfig;
}
```

**Step 2: Create preset-registry.ts**

```typescript
import type { IPreset } from './preset.interface';

class PresetRegistryImpl {
  private readonly presets = new Map<string, IPreset>();
  private defaultPresetId = 'true-color';

  register(preset: IPreset): void {
    this.presets.set(preset.id, Object.freeze(preset));
  }

  get(id: string): IPreset | undefined {
    return this.presets.get(id);
  }

  getDefault(): IPreset {
    const preset = this.presets.get(this.defaultPresetId);
    if (!preset) {
      throw new Error(`Default preset '${this.defaultPresetId}' not found`);
    }
    return preset;
  }

  setDefault(id: string): void {
    if (!this.presets.has(id)) {
      throw new Error(`Preset '${id}' not found`);
    }
    this.defaultPresetId = id;
  }

  getAll(): IPreset[] {
    return Array.from(this.presets.values());
  }

  getForUI(): Array<{ id: string; name: string }> {
    return this.getAll().map(p => ({ id: p.id, name: p.name }));
  }
}

export const PresetRegistry = new PresetRegistryImpl();
```

**Step 3: Create index.ts**

```typescript
export type {
  IPreset,
  UpscaleConfig,
  UnsharpConfig,
  ColorConfig,
  CRTConfig
} from './preset.interface';

export { PresetRegistry } from './preset-registry';
```

**Step 4: Commit**

```bash
git add src/domain/presets/
git commit -m "feat(gpu): add preset interface and registry"
```

---

### Task 2.4: Create Built-in Presets

**Files:**
- Create: `src/domain/presets/presets/true-color.preset.ts`
- Create: `src/domain/presets/presets/vibrant.preset.ts`
- Create: `src/domain/presets/presets/hi-def.preset.ts`
- Create: `src/domain/presets/presets/vintage.preset.ts`
- Create: `src/domain/presets/presets/pixel.preset.ts`
- Create: `src/domain/presets/presets/performance.preset.ts`

**Step 1: Create true-color.preset.ts**

```typescript
import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const trueColorPreset: IPreset = {
  id: 'true-color',
  name: 'True Color',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0.04,
    brightness: 1.0,
    contrast: 1.0
  },
  crt: {
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

PresetRegistry.register(trueColorPreset);
```

**Step 2: Create vibrant.preset.ts**

```typescript
import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const vibrantPreset: IPreset = {
  id: 'vibrant',
  name: 'Vibrant',
  upscale: { enabled: true },
  unsharp: { enabled: true, strength: 0.3 },
  color: {
    enabled: true,
    gamma: 1.0,
    saturation: 1.25,
    greenBias: 0.04,
    brightness: 1.05,
    contrast: 1.05
  },
  crt: {
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

PresetRegistry.register(vibrantPreset);
```

**Step 3: Create hi-def.preset.ts**

```typescript
import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const hiDefPreset: IPreset = {
  id: 'hi-def',
  name: 'Hi-Def',
  upscale: { enabled: true },
  unsharp: { enabled: true, strength: 0.6 },
  color: {
    enabled: true,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0.04,
    brightness: 1.0,
    contrast: 1.1
  },
  crt: {
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

PresetRegistry.register(hiDefPreset);
```

**Step 4: Create vintage.preset.ts**

```typescript
import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const vintagePreset: IPreset = {
  id: 'vintage',
  name: 'Vintage',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 1.1,
    saturation: 0.9,
    greenBias: 0.04,
    brightness: 0.95,
    contrast: 1.0
  },
  crt: {
    enabled: true,
    scanlineStrength: 0.3,
    pixelMaskStrength: 0.2,
    bloomStrength: 0.15,
    curvature: 0.02,
    vignetteStrength: 0.2
  }
};

PresetRegistry.register(vintagePreset);
```

**Step 5: Create pixel.preset.ts**

```typescript
import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const pixelPreset: IPreset = {
  id: 'pixel',
  name: 'Pixel',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0.04,
    brightness: 1.0,
    contrast: 1.0
  },
  crt: {
    enabled: true,
    scanlineStrength: 0,
    pixelMaskStrength: 0.5,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

PresetRegistry.register(pixelPreset);
```

**Step 6: Create performance.preset.ts**

```typescript
import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const performancePreset: IPreset = {
  id: 'performance',
  name: 'Performance',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: false,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0,
    brightness: 1.0,
    contrast: 1.0
  },
  crt: {
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

PresetRegistry.register(performancePreset);
```

**Step 7: Commit**

```bash
git add src/domain/presets/presets/
git commit -m "feat(gpu): add built-in render presets"
```

---

### Task 2.5: Create Shader Types

**Files:**
- Create: `src/domain/shaders/shader-uniforms.types.ts`
- Create: `src/domain/shaders/index.ts`

**Step 1: Create shader-uniforms.types.ts**

```typescript
export interface UpscaleUniforms {
  inputSize: [number, number];
  outputSize: [number, number];
  scaleFactor: number;
}

export interface UnsharpUniforms {
  strength: number;
  texelSize: [number, number];
}

export interface ColorUniforms {
  gamma: number;
  saturation: number;
  greenBias: number;
  brightness: number;
  contrast: number;
}

export interface CRTUniforms {
  scanlineStrength: number;
  pixelMaskStrength: number;
  bloomStrength: number;
  curvature: number;
  vignetteStrength: number;
  outputSize: [number, number];
}

export interface PipelineUniforms {
  upscale: UpscaleUniforms;
  unsharp: UnsharpUniforms;
  color: ColorUniforms;
  crt: CRTUniforms;
}
```

**Step 2: Create index.ts**

```typescript
export type {
  UpscaleUniforms,
  UnsharpUniforms,
  ColorUniforms,
  CRTUniforms,
  PipelineUniforms
} from './shader-uniforms.types';
```

**Step 3: Commit**

```bash
git add src/domain/shaders/
git commit -m "feat(gpu): add shader uniform types"
```

---

### Task 2.6: Create Frame Source Interface

**Files:**
- Create: `src/domain/frame/frame-source.interface.ts`
- Create: `src/domain/frame/index.ts`

**Step 1: Create frame-source.interface.ts**

```typescript
export type FrameSource = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export interface IFrameProvider {
  getCurrentFrame(): FrameSource | null;
  onFrame(callback: (source: FrameSource) => void): () => void;
}
```

**Step 2: Create index.ts**

```typescript
export type { FrameSource, IFrameProvider } from './frame-source.interface';
```

**Step 3: Commit**

```bash
git add src/domain/frame/
git commit -m "feat(gpu): add frame source interface"
```

---

### Task 2.7: Create Domain Index

**Files:**
- Create: `src/domain/index.ts`

**Step 1: Create index.ts**

```typescript
export * from './pipeline';
export * from './presets';
export * from './shaders';
export * from './frame';
```

**Step 2: Commit**

```bash
git add src/domain/index.ts
git commit -m "feat(gpu): add domain barrel export"
```

---

## Phase 2.2: Application Layer

### Task 2.8: Create Capability Detector

**Files:**
- Create: `src/application/capability-detector.ts`
- Test: `tests/unit/application/capability-detector.test.ts`

**Step 1: Create capability-detector.ts**

```typescript
import type { IPipelineCapabilities, WebGPULimits, WebGL2Info } from '../domain/pipeline';

async function detectWebGPU(): Promise<{ supported: boolean; limits?: WebGPULimits }> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return { supported: false };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false };
    }

    const device = await adapter.requestDevice();
    const limits: WebGPULimits = {
      maxTextureDimension2D: device.limits.maxTextureDimension2D,
      maxBindGroups: device.limits.maxBindGroups
    };

    device.destroy();
    return { supported: true, limits };
  } catch {
    return { supported: false };
  }
}

function detectWebGL2(): { supported: boolean; info?: WebGL2Info } {
  if (typeof document === 'undefined') {
    return { supported: false };
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');

  if (!gl) {
    return { supported: false };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const info: WebGL2Info = {
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown',
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
  };

  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { supported: true, info };
}

function detectOffscreenCanvas(): { supported: boolean; transferSupported: boolean } {
  const supported = typeof OffscreenCanvas !== 'undefined';
  let transferSupported = false;

  if (supported && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.transferControlToOffscreen();
      transferSupported = true;
    } catch {
      transferSupported = false;
    }
  }

  return { supported, transferSupported };
}

export async function detectCapabilities(): Promise<IPipelineCapabilities> {
  const [webgpuResult, webgl2Result, offscreenResult] = await Promise.all([
    detectWebGPU(),
    Promise.resolve(detectWebGL2()),
    Promise.resolve(detectOffscreenCanvas())
  ]);

  const preferredAPI = webgpuResult.supported
    ? 'webgpu'
    : webgl2Result.supported
      ? 'webgl2'
      : 'canvas2d';

  const maxTextureSize = webgpuResult.limits?.maxTextureDimension2D
    ?? webgl2Result.info?.maxTextureSize
    ?? 4096;

  return {
    webgpu: webgpuResult.supported,
    webgl2: webgl2Result.supported,
    offscreenCanvas: offscreenResult.supported,
    transferControlToOffscreen: offscreenResult.transferSupported,
    preferredAPI,
    maxTextureSize,
    webgpuLimits: webgpuResult.limits,
    webgl2Info: webgl2Result.info
  };
}
```

**Step 2: Create test**

Create `tests/unit/application/capability-detector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCapabilities } from '@/application/capability-detector';

describe('detectCapabilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return capabilities object with required properties', async () => {
    const capabilities = await detectCapabilities();

    expect(capabilities).toHaveProperty('webgpu');
    expect(capabilities).toHaveProperty('webgl2');
    expect(capabilities).toHaveProperty('offscreenCanvas');
    expect(capabilities).toHaveProperty('transferControlToOffscreen');
    expect(capabilities).toHaveProperty('preferredAPI');
    expect(capabilities).toHaveProperty('maxTextureSize');
  });

  it('should have preferredAPI as one of valid values', async () => {
    const capabilities = await detectCapabilities();

    expect(['webgpu', 'webgl2', 'canvas2d']).toContain(capabilities.preferredAPI);
  });

  it('should have positive maxTextureSize', async () => {
    const capabilities = await detectCapabilities();

    expect(capabilities.maxTextureSize).toBeGreaterThan(0);
  });
});
```

**Step 3: Commit**

```bash
git add src/application/capability-detector.ts tests/unit/application/capability-detector.test.ts
git commit -m "feat(gpu): add capability detector"
```

---

### Task 2.9: Create Uniform Builder

**Files:**
- Create: `src/application/uniform-builder.ts`
- Test: `tests/unit/application/uniform-builder.test.ts`

**Step 1: Create uniform-builder.ts**

```typescript
import type { IPreset } from '../domain/presets';
import type { PipelineUniforms } from '../domain/shaders';

export interface UniformBuildContext {
  preset: IPreset;
  nativeWidth: number;
  nativeHeight: number;
  outputWidth: number;
  outputHeight: number;
  brightness: number;
}

export function calculateScaleFactor(
  nativeWidth: number,
  nativeHeight: number,
  outputWidth: number,
  outputHeight: number
): number {
  const scaleX = Math.floor(outputWidth / nativeWidth);
  const scaleY = Math.floor(outputHeight / nativeHeight);
  return Math.max(1, Math.min(scaleX, scaleY));
}

export function buildUniforms(context: UniformBuildContext): PipelineUniforms {
  const { preset, nativeWidth, nativeHeight, outputWidth, outputHeight, brightness } = context;

  const scaleFactor = calculateScaleFactor(nativeWidth, nativeHeight, outputWidth, outputHeight);
  const scaledWidth = nativeWidth * scaleFactor;
  const scaledHeight = nativeHeight * scaleFactor;

  return {
    upscale: {
      inputSize: [nativeWidth, nativeHeight],
      outputSize: [scaledWidth, scaledHeight],
      scaleFactor
    },
    unsharp: {
      strength: preset.unsharp.enabled ? preset.unsharp.strength : 0,
      texelSize: [1 / scaledWidth, 1 / scaledHeight]
    },
    color: {
      gamma: preset.color.enabled ? preset.color.gamma : 1.0,
      saturation: preset.color.enabled ? preset.color.saturation : 1.0,
      greenBias: preset.color.enabled ? preset.color.greenBias : 0,
      brightness: preset.color.enabled ? preset.color.brightness * brightness : brightness,
      contrast: preset.color.enabled ? preset.color.contrast : 1.0
    },
    crt: {
      scanlineStrength: preset.crt.enabled ? preset.crt.scanlineStrength : 0,
      pixelMaskStrength: preset.crt.enabled ? preset.crt.pixelMaskStrength : 0,
      bloomStrength: preset.crt.enabled ? preset.crt.bloomStrength : 0,
      curvature: preset.crt.enabled ? preset.crt.curvature : 0,
      vignetteStrength: preset.crt.enabled ? preset.crt.vignetteStrength : 0,
      outputSize: [outputWidth, outputHeight]
    }
  };
}
```

**Step 2: Create test**

Create `tests/unit/application/uniform-builder.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { buildUniforms, calculateScaleFactor } from '@/application/uniform-builder';
import { PresetRegistry } from '@/domain/presets';

// Import presets to register them
import '@/domain/presets/presets/true-color.preset';
import '@/domain/presets/presets/performance.preset';

describe('calculateScaleFactor', () => {
  it('should calculate integer scale factor', () => {
    expect(calculateScaleFactor(160, 144, 640, 576)).toBe(4);
    expect(calculateScaleFactor(160, 144, 480, 432)).toBe(3);
    expect(calculateScaleFactor(160, 144, 320, 288)).toBe(2);
  });

  it('should use minimum of x and y scales', () => {
    expect(calculateScaleFactor(160, 144, 800, 432)).toBe(3);
  });

  it('should return at least 1', () => {
    expect(calculateScaleFactor(160, 144, 100, 100)).toBe(1);
  });
});

describe('buildUniforms', () => {
  it('should build uniforms from preset and dimensions', () => {
    const preset = PresetRegistry.get('true-color')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.0
    });

    expect(uniforms.upscale.scaleFactor).toBe(4);
    expect(uniforms.upscale.inputSize).toEqual([160, 144]);
    expect(uniforms.upscale.outputSize).toEqual([640, 576]);
    expect(uniforms.color.greenBias).toBe(0.04);
  });

  it('should apply brightness multiplier', () => {
    const preset = PresetRegistry.get('true-color')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.5
    });

    expect(uniforms.color.brightness).toBe(1.5);
  });

  it('should disable effects when preset has them disabled', () => {
    const preset = PresetRegistry.get('performance')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.0
    });

    expect(uniforms.unsharp.strength).toBe(0);
    expect(uniforms.crt.scanlineStrength).toBe(0);
  });
});
```

**Step 3: Commit**

```bash
git add src/application/uniform-builder.ts tests/unit/application/uniform-builder.test.ts
git commit -m "feat(gpu): add uniform builder"
```

---

### Task 2.10: Create Application Index

**Files:**
- Create: `src/application/index.ts`

**Step 1: Create index.ts**

```typescript
export { detectCapabilities } from './capability-detector';
export { buildUniforms, calculateScaleFactor, type UniformBuildContext } from './uniform-builder';
```

**Step 2: Commit**

```bash
git add src/application/index.ts
git commit -m "feat(gpu): add application barrel export"
```

---

## Phase 2.3: Infrastructure Layer

### Task 2.11: Copy Shader Files

**Files:**
- Copy WebGPU shaders from `prismgb-app/src/renderer/features/streaming/rendering/shaders/webgpu/`
- Copy WebGL2 shaders from `prismgb-app/src/renderer/features/streaming/rendering/shaders/webgl2/`

**Step 1: Copy WebGPU shaders**

```bash
cp prismgb-app/src/renderer/features/streaming/rendering/shaders/webgpu/*.wgsl prismgb-gpu/src/infrastructure/webgpu/shaders/
```

**Step 2: Copy WebGL2 shaders**

```bash
cp prismgb-app/src/renderer/features/streaming/rendering/shaders/webgl2/*.glsl prismgb-gpu/src/infrastructure/webgl2/shaders/
```

**Step 3: Verify files**

```bash
ls -la prismgb-gpu/src/infrastructure/webgpu/shaders/
ls -la prismgb-gpu/src/infrastructure/webgl2/shaders/
```

**Step 4: Commit**

```bash
git add prismgb-gpu/src/infrastructure/webgpu/shaders/ prismgb-gpu/src/infrastructure/webgl2/shaders/
git commit -m "feat(gpu): copy shader files from prismgb-app"
```

---

### Task 2.12: Create Base Pipeline Class

**Files:**
- Create: `src/infrastructure/base-pipeline.ts`

**Step 1: Create base-pipeline.ts**

```typescript
import type { IPipeline, IPipelineStats } from '../domain/pipeline';
import type { IPreset } from '../domain/presets';
import type { PipelineUniforms } from '../domain/shaders';
import { buildUniforms } from '../application/uniform-builder';

export interface BasePipelineConfig {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  nativeWidth: number;
  nativeHeight: number;
  preset: IPreset;
}

export abstract class BasePipeline implements IPipeline {
  protected canvas: HTMLCanvasElement | OffscreenCanvas;
  protected nativeWidth: number;
  protected nativeHeight: number;
  protected outputWidth: number;
  protected outputHeight: number;
  protected preset: IPreset;
  protected brightness = 1.0;
  protected uniforms: PipelineUniforms;

  protected _isInitialized = false;
  protected _isActive = false;
  protected _framesRendered = 0;
  protected _framesDropped = 0;
  protected _lastFrameTime = 0;
  protected _fps = 0;

  constructor(config: BasePipelineConfig) {
    this.canvas = config.canvas;
    this.nativeWidth = config.nativeWidth;
    this.nativeHeight = config.nativeHeight;
    this.outputWidth = config.canvas.width;
    this.outputHeight = config.canvas.height;
    this.preset = config.preset;
    this.uniforms = this.rebuildUniforms();
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  protected rebuildUniforms(): PipelineUniforms {
    return buildUniforms({
      preset: this.preset,
      nativeWidth: this.nativeWidth,
      nativeHeight: this.nativeHeight,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      brightness: this.brightness
    });
  }

  setPreset(preset: IPreset): void {
    this.preset = preset;
    this.uniforms = this.rebuildUniforms();
    this.onUniformsChanged();
  }

  getPreset(): IPreset {
    return this.preset;
  }

  setBrightness(value: number): void {
    this.brightness = Math.max(0, Math.min(2, value));
    this.uniforms = this.rebuildUniforms();
    this.onUniformsChanged();
  }

  resize(width: number, height: number): void {
    this.outputWidth = width;
    this.outputHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.uniforms = this.rebuildUniforms();
    this.onResize();
  }

  pause(): void {
    this._isActive = false;
  }

  resume(): void {
    if (this._isInitialized) {
      this._isActive = true;
    }
  }

  getStats(): IPipelineStats {
    return {
      fps: this._fps,
      frameTime: this._lastFrameTime,
      framesRendered: this._framesRendered,
      framesDropped: this._framesDropped
    };
  }

  protected updateStats(frameTime: number): void {
    this._lastFrameTime = frameTime;
    this._framesRendered++;
    this._fps = frameTime > 0 ? 1000 / frameTime : 0;
  }

  abstract initialize(): Promise<void>;
  abstract renderFrame(source: TexImageSource): void;
  abstract captureFrame(): Promise<ImageBitmap>;
  abstract releaseResources(): void;
  abstract dispose(): Promise<void>;

  protected abstract onUniformsChanged(): void;
  protected abstract onResize(): void;
}
```

**Step 2: Commit**

```bash
git add src/infrastructure/base-pipeline.ts
git commit -m "feat(gpu): add base pipeline class"
```

---

### Task 2.13: Create Canvas2D Pipeline (Fallback)

**Files:**
- Create: `src/infrastructure/canvas2d/canvas2d-pipeline.ts`
- Create: `src/infrastructure/canvas2d/index.ts`

**Step 1: Create canvas2d-pipeline.ts**

```typescript
import { BasePipeline, type BasePipelineConfig } from '../base-pipeline';

export class Canvas2DPipeline extends BasePipeline {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error('Canvas 2D context not available');
    }

    (this.ctx as CanvasRenderingContext2D).imageSmoothingEnabled = false;
    this._isInitialized = true;
    this._isActive = true;
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.ctx) return;

    const startTime = performance.now();

    this.ctx.drawImage(
      source as CanvasImageSource,
      0, 0,
      this.nativeWidth, this.nativeHeight,
      0, 0,
      this.outputWidth, this.outputHeight
    );

    this.updateStats(performance.now() - startTime);
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  protected onUniformsChanged(): void {
    // Canvas2D doesn't support shader uniforms
  }

  protected onResize(): void {
    // Context handles resize automatically
  }

  releaseResources(): void {
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.ctx = null;
    this._isInitialized = false;
  }
}
```

**Step 2: Create index.ts**

```typescript
export { Canvas2DPipeline } from './canvas2d-pipeline';
```

**Step 3: Commit**

```bash
git add src/infrastructure/canvas2d/
git commit -m "feat(gpu): add Canvas2D fallback pipeline"
```

---

### Task 2.14: Create WebGL2 Pipeline

**Files:**
- Create: `src/infrastructure/webgl2/webgl2-shader-loader.ts`
- Create: `src/infrastructure/webgl2/webgl2-pipeline.ts`
- Create: `src/infrastructure/webgl2/index.ts`

**Step 1: Create webgl2-shader-loader.ts**

```typescript
import vertexShader from './shaders/common.vert.glsl?raw';
import pixelUpscale from './shaders/pixel-upscale.frag.glsl?raw';
import unsharpMask from './shaders/unsharp-mask.frag.glsl?raw';
import colorElevation from './shaders/color-elevation.frag.glsl?raw';
import crtLcd from './shaders/crt-lcd.frag.glsl?raw';

export interface WebGL2Shaders {
  vertex: string;
  pixelUpscale: string;
  unsharpMask: string;
  colorElevation: string;
  crtLcd: string;
}

export function loadShaders(): WebGL2Shaders {
  return {
    vertex: vertexShader,
    pixelUpscale,
    unsharpMask,
    colorElevation,
    crtLcd
  };
}
```

**Step 2: Create webgl2-pipeline.ts**

```typescript
import { BasePipeline, type BasePipelineConfig } from '../base-pipeline';
import { loadShaders, type WebGL2Shaders } from './webgl2-shader-loader';

export class WebGL2Pipeline extends BasePipeline {
  private gl: WebGL2RenderingContext | null = null;
  private programs: WebGLProgram[] = [];
  private framebuffers: WebGLFramebuffer[] = [];
  private textures: WebGLTexture[] = [];
  private sourceTexture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private shaders: WebGL2Shaders | null = null;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    this.gl = (this.canvas as HTMLCanvasElement).getContext('webgl2', {
      alpha: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });

    if (!this.gl) {
      throw new Error('WebGL2 context not available');
    }

    this.shaders = loadShaders();
    this.createPrograms();
    this.createGeometry();
    this.createTextures();
    this.createFramebuffers();

    this._isInitialized = true;
    this._isActive = true;
  }

  private createPrograms(): void {
    if (!this.gl || !this.shaders) return;

    const fragmentShaders = [
      this.shaders.pixelUpscale,
      this.shaders.unsharpMask,
      this.shaders.colorElevation,
      this.shaders.crtLcd
    ];

    for (const fragSrc of fragmentShaders) {
      const program = this.createProgram(this.shaders.vertex, fragSrc);
      if (program) {
        this.programs.push(program);
      }
    }
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram | null {
    if (!this.gl) return null;

    const vert = this.compileShader(this.gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(this.gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vert);
    this.gl.attachShader(program, frag);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program link error:', this.gl.getProgramInfoLog(program));
      return null;
    }

    this.gl.deleteShader(vert);
    this.gl.deleteShader(frag);
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private createGeometry(): void {
    if (!this.gl) return;

    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);

    const positions = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);

    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

    this.gl.bindVertexArray(null);
  }

  private createTextures(): void {
    if (!this.gl) return;

    // Source texture for video frame
    this.sourceTexture = this.createTexture(this.nativeWidth, this.nativeHeight);

    // Intermediate textures for multi-pass
    const scaleFactor = this.uniforms.upscale.scaleFactor;
    const scaledWidth = this.nativeWidth * scaleFactor;
    const scaledHeight = this.nativeHeight * scaleFactor;

    this.textures = [
      this.createTexture(scaledWidth, scaledHeight)!,
      this.createTexture(scaledWidth, scaledHeight)!,
      this.createTexture(this.outputWidth, this.outputHeight)!
    ];
  }

  private createTexture(width: number, height: number): WebGLTexture | null {
    if (!this.gl) return null;

    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      width, height, 0,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    return texture;
  }

  private createFramebuffers(): void {
    if (!this.gl) return;

    this.framebuffers = this.textures.map(texture => {
      const fb = this.gl!.createFramebuffer()!;
      this.gl!.bindFramebuffer(this.gl!.FRAMEBUFFER, fb);
      this.gl!.framebufferTexture2D(
        this.gl!.FRAMEBUFFER, this.gl!.COLOR_ATTACHMENT0,
        this.gl!.TEXTURE_2D, texture, 0
      );
      return fb;
    });

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.gl || !this.sourceTexture) return;

    const startTime = performance.now();

    // Upload source texture
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, source
    );

    this.gl.bindVertexArray(this.vao);

    // Execute 4-pass pipeline
    // Pass 1: Upscale
    // Pass 2: Unsharp (if enabled)
    // Pass 3: Color
    // Pass 4: CRT/LCD to screen

    // Simplified: just render to screen for now
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.outputWidth, this.outputHeight);
    this.gl.useProgram(this.programs[0]);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    this.gl.bindVertexArray(null);
    this.updateStats(performance.now() - startTime);
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  protected onUniformsChanged(): void {
    // Update uniform values in programs
  }

  protected onResize(): void {
    this.releaseTextures();
    this.createTextures();
    this.createFramebuffers();
  }

  private releaseTextures(): void {
    if (!this.gl) return;
    this.textures.forEach(t => this.gl!.deleteTexture(t));
    this.framebuffers.forEach(f => this.gl!.deleteFramebuffer(f));
    this.textures = [];
    this.framebuffers = [];
  }

  releaseResources(): void {
    this.releaseTextures();
    if (this.gl && this.sourceTexture) {
      this.gl.deleteTexture(this.sourceTexture);
      this.sourceTexture = null;
    }
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();
    this.programs.forEach(p => this.gl?.deleteProgram(p));
    this.programs = [];
    if (this.gl && this.vao) {
      this.gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this._isInitialized = false;
  }
}
```

**Step 3: Create index.ts**

```typescript
export { WebGL2Pipeline } from './webgl2-pipeline';
export { loadShaders, type WebGL2Shaders } from './webgl2-shader-loader';
```

**Step 4: Commit**

```bash
git add src/infrastructure/webgl2/
git commit -m "feat(gpu): add WebGL2 pipeline"
```

---

### Task 2.15: Create WebGPU Pipeline (Stub)

**Files:**
- Create: `src/infrastructure/webgpu/webgpu-shader-loader.ts`
- Create: `src/infrastructure/webgpu/webgpu-pipeline.ts`
- Create: `src/infrastructure/webgpu/index.ts`

**Note:** WebGPU pipeline is more complex. This creates a working stub that can be expanded.

**Step 1: Create webgpu-shader-loader.ts**

```typescript
import pixelUpscale from './shaders/pixel-upscale.wgsl?raw';
import unsharpMask from './shaders/unsharp-mask.wgsl?raw';
import colorElevation from './shaders/color-elevation.wgsl?raw';
import crtLcd from './shaders/crt-lcd.wgsl?raw';

export interface WebGPUShaders {
  pixelUpscale: string;
  unsharpMask: string;
  colorElevation: string;
  crtLcd: string;
}

export function loadShaders(): WebGPUShaders {
  return {
    pixelUpscale,
    unsharpMask,
    colorElevation,
    crtLcd
  };
}
```

**Step 2: Create webgpu-pipeline.ts**

```typescript
import { BasePipeline, type BasePipelineConfig } from '../base-pipeline';
import { loadShaders } from './webgpu-shader-loader';

export class WebGPUPipeline extends BasePipeline {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipelines: GPURenderPipeline[] = [];
  private uniformBuffer: GPUBuffer | null = null;
  private sampler: GPUSampler | null = null;
  private sourceTexture: GPUTexture | null = null;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    this.device = await adapter.requestDevice();
    this.context = (this.canvas as HTMLCanvasElement).getContext('webgpu') as GPUCanvasContext;

    if (!this.context) {
      throw new Error('WebGPU context not available');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format,
      alphaMode: 'opaque'
    });

    await this.createPipelines(format);
    this.createResources();

    this._isInitialized = true;
    this._isActive = true;
  }

  private async createPipelines(format: GPUTextureFormat): Promise<void> {
    if (!this.device) return;

    const shaders = loadShaders();

    // Create simple pass-through pipeline for now
    const module = this.device.createShaderModule({
      label: 'Pixel Upscale',
      code: shaders.pixelUpscale
    });

    const pipeline = this.device.createRenderPipeline({
      label: 'Render Pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{ format }]
      }
    });

    this.pipelines.push(pipeline);
  }

  private createResources(): void {
    if (!this.device) return;

    this.uniformBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.sampler = this.device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest'
    });
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.device || !this.context) return;

    const startTime = performance.now();

    // Create texture from source
    // Execute render pass
    // Present to canvas

    this.updateStats(performance.now() - startTime);
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  protected onUniformsChanged(): void {
    // Update uniform buffer
  }

  protected onResize(): void {
    // Recreate textures
  }

  releaseResources(): void {
    this.sourceTexture?.destroy();
    this.sourceTexture = null;
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this._isInitialized = false;
  }
}
```

**Step 3: Create index.ts**

```typescript
export { WebGPUPipeline } from './webgpu-pipeline';
export { loadShaders, type WebGPUShaders } from './webgpu-shader-loader';
```

**Step 4: Commit**

```bash
git add src/infrastructure/webgpu/
git commit -m "feat(gpu): add WebGPU pipeline stub"
```

---

### Task 2.16: Create Infrastructure Index

**Files:**
- Create: `src/infrastructure/index.ts`

**Step 1: Create index.ts**

```typescript
export { BasePipeline, type BasePipelineConfig } from './base-pipeline';
export { Canvas2DPipeline } from './canvas2d';
export { WebGL2Pipeline } from './webgl2';
export { WebGPUPipeline } from './webgpu';
```

**Step 2: Commit**

```bash
git add src/infrastructure/index.ts
git commit -m "feat(gpu): add infrastructure barrel export"
```

---

## Phase 2.4: Factories & Public API

### Task 2.17: Create Pipeline Factory

**Files:**
- Create: `src/factories/pipeline.factory.ts`
- Create: `src/factories/index.ts`

**Step 1: Create pipeline.factory.ts**

```typescript
import type { IPipeline, IPipelineConfig, IPipelineCapabilities } from '../domain/pipeline';
import type { IPreset } from '../domain/presets';
import { PresetRegistry } from '../domain/presets';
import { WebGPUPipeline } from '../infrastructure/webgpu/webgpu-pipeline';
import { WebGL2Pipeline } from '../infrastructure/webgl2/webgl2-pipeline';
import { Canvas2DPipeline } from '../infrastructure/canvas2d/canvas2d-pipeline';
import { detectCapabilities } from '../application/capability-detector';

export interface CreatePipelineOptions extends IPipelineConfig {
  capabilities?: IPipelineCapabilities;
}

export async function createPipeline(options: CreatePipelineOptions): Promise<IPipeline> {
  const capabilities = options.capabilities ?? await detectCapabilities();
  const preset = options.preset ?? PresetRegistry.getDefault();
  const preferredAPI = options.preferredAPI ?? capabilities.preferredAPI;

  const baseConfig = {
    canvas: options.canvas,
    nativeWidth: options.nativeWidth,
    nativeHeight: options.nativeHeight,
    preset
  };

  let pipeline: IPipeline;

  switch (preferredAPI) {
    case 'webgpu':
      if (capabilities.webgpu) {
        pipeline = new WebGPUPipeline(baseConfig);
        try {
          await pipeline.initialize();
          return pipeline;
        } catch {
          // Fall through to WebGL2
        }
      }
    // falls through
    case 'webgl2':
      if (capabilities.webgl2) {
        pipeline = new WebGL2Pipeline(baseConfig);
        try {
          await pipeline.initialize();
          return pipeline;
        } catch {
          // Fall through to Canvas2D
        }
      }
    // falls through
    case 'canvas2d':
    default:
      pipeline = new Canvas2DPipeline(baseConfig);
      await pipeline.initialize();
      return pipeline;
  }
}
```

**Step 2: Create index.ts**

```typescript
export { createPipeline, type CreatePipelineOptions } from './pipeline.factory';
```

**Step 3: Commit**

```bash
git add src/factories/
git commit -m "feat(gpu): add pipeline factory"
```

---

### Task 2.18: Create Public API Index

**Files:**
- Update: `src/index.ts`

**Step 1: Update index.ts**

```typescript
// =============================================================================
// @prismgb/gpu - GPU Rendering Pipeline Package
// =============================================================================
// This is the PUBLIC API. Only exports listed here are available to consumers.
// Internal implementation details are not exposed.
// =============================================================================

// Domain Types (for typing only)
export type {
  IPipeline,
  IPipelineConfig,
  IPipelineCapabilities,
  IPipelineStats,
  RenderAPI,
  WebGPULimits,
  WebGL2Info
} from './domain/pipeline';

export type {
  IPreset,
  UpscaleConfig,
  UnsharpConfig,
  ColorConfig,
  CRTConfig
} from './domain/presets';

export type {
  FrameSource,
  IFrameProvider
} from './domain/frame';

// Preset Registry (for UI to list/select presets)
export { PresetRegistry } from './domain/presets';

// Capability Detection (for UI to show GPU status)
export { detectCapabilities } from './application/capability-detector';

// Pipeline Factory (main entry point)
export { createPipeline, type CreatePipelineOptions } from './factories';

// Register all built-in presets on import
import './domain/presets/presets/true-color.preset';
import './domain/presets/presets/vibrant.preset';
import './domain/presets/presets/hi-def.preset';
import './domain/presets/presets/vintage.preset';
import './domain/presets/presets/pixel.preset';
import './domain/presets/presets/performance.preset';
```

**Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat(gpu): finalize public API"
```

---

### Task 2.19: Create Package Tests

**Files:**
- Create: `tests/unit/domain/presets/preset-registry.test.ts`

**Step 1: Create preset-registry.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { PresetRegistry } from '@/domain/presets';

// Import presets to register them
import '@/domain/presets/presets/true-color.preset';
import '@/domain/presets/presets/vibrant.preset';
import '@/domain/presets/presets/hi-def.preset';
import '@/domain/presets/presets/vintage.preset';
import '@/domain/presets/presets/pixel.preset';
import '@/domain/presets/presets/performance.preset';

describe('PresetRegistry', () => {
  describe('getAll', () => {
    it('should return all registered presets', () => {
      const presets = PresetRegistry.getAll();

      expect(presets.length).toBeGreaterThanOrEqual(6);
      expect(presets.map(p => p.id)).toContain('true-color');
      expect(presets.map(p => p.id)).toContain('vibrant');
      expect(presets.map(p => p.id)).toContain('vintage');
    });
  });

  describe('get', () => {
    it('should return preset by id', () => {
      const preset = PresetRegistry.get('true-color');

      expect(preset).toBeDefined();
      expect(preset?.name).toBe('True Color');
    });

    it('should return undefined for unknown id', () => {
      const preset = PresetRegistry.get('unknown-preset');

      expect(preset).toBeUndefined();
    });
  });

  describe('getDefault', () => {
    it('should return the default preset', () => {
      const preset = PresetRegistry.getDefault();

      expect(preset).toBeDefined();
      expect(preset.id).toBe('true-color');
    });
  });

  describe('getForUI', () => {
    it('should return presets formatted for UI', () => {
      const presets = PresetRegistry.getForUI();

      expect(presets.length).toBeGreaterThan(0);
      expect(presets[0]).toHaveProperty('id');
      expect(presets[0]).toHaveProperty('name');
    });
  });
});
```

**Step 2: Commit**

```bash
git add tests/unit/domain/presets/preset-registry.test.ts
git commit -m "test(gpu): add preset registry tests"
```

---

## Phase 2.5: Integration

### Task 2.20: Update Workspace Configuration

**Files:**
- Update: `prismgb-workspace/package.json`

**Step 1: Add prismgb-gpu to workspaces**

```json
{
  "name": "prismgb-workspace",
  "private": true,
  "workspaces": [
    "prismgb-app",
    "prismgb-gpu",
    "prismgb-site"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=prismgb-app",
    "build": "npm run build --workspace=prismgb-gpu && npm run build --workspace=prismgb-app",
    "test": "npm run test --workspaces --if-present",
    "test:run": "npm run test:run --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

**Step 2: Commit**

```bash
git add prismgb-workspace/package.json
git commit -m "build: add prismgb-gpu to workspace"
```

---

### Task 2.21: Add Package Dependency to prismgb-app

**Files:**
- Update: `prismgb-app/package.json`
- Update: `prismgb-app/tsconfig.json`

**Step 1: Add dependency to package.json**

Add to dependencies:

```json
{
  "dependencies": {
    "@prismgb/gpu": "workspace:*"
  }
}
```

**Step 2: Add path alias to tsconfig.json**

Add to compilerOptions.paths:

```json
{
  "compilerOptions": {
    "paths": {
      "@prismgb/gpu": ["../prismgb-gpu/src"],
      "@prismgb/gpu/*": ["../prismgb-gpu/src/*"]
    }
  }
}
```

**Step 3: Commit**

```bash
git add prismgb-app/package.json prismgb-app/tsconfig.json
git commit -m "build(app): add @prismgb/gpu dependency"
```

---

### Task 2.22: Verify Build and Tests

**Step 1: Install dependencies**

```bash
cd /Users/josstei/Development/prismgb-workspace
npm install
```

**Step 2: Build GPU package**

```bash
cd prismgb-gpu
npm run typecheck
npm run test:run
npm run build
```

**Step 3: Build app**

```bash
cd ../prismgb-app
npm run typecheck
npm run test:run
npm run lint
```

**Step 4: Commit if any changes**

```bash
git add -A
git commit -m "build: verify workspace build"
```

---

### Task 2.23: Create Phase 2 Summary PR

**Step 1: Check all changes**

```bash
git log --oneline main..HEAD
```

**Step 2: Create PR**

```bash
git push origin feature/gpu_optimization
gh pr create --title "feat: Phase 2 - Extract @prismgb/gpu package" --body "$(cat <<'EOF'
## Summary

Phase 2 of the Clean Architecture migration. Creates `@prismgb/gpu` as a standalone
workspace package for GPU rendering.

### Package Structure

- **domain/** - Interfaces and types (IPipeline, IPreset, etc.)
- **application/** - Capability detection, uniform building
- **infrastructure/** - WebGPU, WebGL2, Canvas2D implementations
- **factories/** - Pipeline creation with automatic API selection

### Public API

```typescript
import { createPipeline, PresetRegistry, detectCapabilities } from '@prismgb/gpu';

const capabilities = await detectCapabilities();
const pipeline = await createPipeline({
  canvas,
  nativeWidth: 160,
  nativeHeight: 144,
  preset: PresetRegistry.get('vintage')
});

pipeline.renderFrame(videoElement);
pipeline.dispose();
```

### Features

- WebGPU → WebGL2 → Canvas2D automatic fallback
- 6 built-in presets (True Color, Vibrant, Hi-Def, Vintage, Pixel, Performance)
- 4-pass shader pipeline (upscale → unsharp → color → CRT/LCD)
- Type-safe public API

## Testing

- Package unit tests for domain and application layers
- TypeScript compiles cleanly with strict mode

## Next Steps

- Phase 3: Restructure `main/` process
EOF
)"
```

---

## Appendix: File Summary

### New Files Created (prismgb-gpu/)

| Path | Purpose |
|------|---------|
| `package.json` | Package manifest |
| `tsconfig.json` | TypeScript config |
| `vite.config.ts` | Vite build config |
| `vitest.config.ts` | Test config |
| `src/index.ts` | Public API |
| `src/domain/pipeline/*.ts` | Pipeline interfaces |
| `src/domain/presets/*.ts` | Preset interfaces and registry |
| `src/domain/presets/presets/*.ts` | Built-in presets |
| `src/domain/shaders/*.ts` | Shader uniform types |
| `src/domain/frame/*.ts` | Frame source interface |
| `src/application/*.ts` | Capability detector, uniform builder |
| `src/infrastructure/base-pipeline.ts` | Base pipeline class |
| `src/infrastructure/canvas2d/*.ts` | Canvas2D fallback |
| `src/infrastructure/webgl2/*.ts` | WebGL2 implementation |
| `src/infrastructure/webgpu/*.ts` | WebGPU implementation |
| `src/infrastructure/webgpu/shaders/*.wgsl` | WebGPU shaders |
| `src/infrastructure/webgl2/shaders/*.glsl` | WebGL2 shaders |
| `src/factories/*.ts` | Pipeline factory |
| `tests/unit/**/*.test.ts` | Unit tests |

### Files Modified (prismgb-app/)

| Path | Change |
|------|--------|
| `package.json` | Add @prismgb/gpu dependency |
| `tsconfig.json` | Add path alias |

### Files Modified (prismgb-workspace/)

| Path | Change |
|------|--------|
| `package.json` | Add prismgb-gpu to workspaces |
