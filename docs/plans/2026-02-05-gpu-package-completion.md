# @prismgb/gpu Package Completion - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the @prismgb/gpu package's WebGL2 and WebGPU pipeline implementations with full 4-pass shader rendering, optimization utilities, and corrected domain types.

**Architecture:** The package provides standalone GPU pipeline implementations (WebGPU, WebGL2, Canvas2D) behind the `IPipeline` interface. Each pipeline accepts a `TexImageSource`, renders through a 4-pass shader pipeline (upscale → unsharp → color → CRT/LCD), and outputs to a canvas. Consumers (the app's worker or main thread) instantiate pipelines via `createPipeline()`. The existing renderer's worker (`render.worker.ts`) is the reference implementation being ported.

**Tech Stack:** TypeScript 5.x, WebGPU API, WebGL2 API, WGSL/GLSL shaders, Vitest 4.x

---

## Phase A: Fix Domain Types & Uniform Builder

The shader uniform types are missing `scaleFactor` in the unsharp and CRT stages, which the actual shaders require.

### Task A.1: Update Shader Uniform Types

**Files:**
- Modify: `packages/prismgb-gpu/src/domain/shaders/shader-uniforms.types.ts`

**Step 1: Add scaleFactor to UnsharpUniforms and CRTUniforms**

Replace the file contents:

```typescript
export interface UpscaleUniforms {
  inputSize: [number, number];
  outputSize: [number, number];
  scaleFactor: number;
}

export interface UnsharpUniforms {
  texelSize: [number, number];
  strength: number;
  scaleFactor: number;
}

export interface ColorUniforms {
  gamma: number;
  saturation: number;
  greenBias: number;
  brightness: number;
  contrast: number;
}

export interface CRTUniforms {
  resolution: [number, number];
  scaleFactor: number;
  scanlineStrength: number;
  pixelMaskStrength: number;
  bloomStrength: number;
  curvature: number;
  vignetteStrength: number;
}

export interface PipelineUniforms {
  upscale: UpscaleUniforms;
  unsharp: UnsharpUniforms;
  color: ColorUniforms;
  crt: CRTUniforms;
}
```

**Changes from current:**
- `UnsharpUniforms`: Added `scaleFactor`, reordered to match shader struct layout (texelSize, strength, scaleFactor)
- `CRTUniforms`: Renamed `outputSize` → `resolution`, added `scaleFactor`, reordered to match shader struct (resolution, scaleFactor, scanline..., vignette)

**Step 2: Verify no compilation errors**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`

---

### Task A.2: Update Uniform Builder

**Files:**
- Modify: `packages/prismgb-gpu/src/application/uniform-builder.ts`

**Step 1: Update buildUniforms to include scaleFactor**

Replace the `buildUniforms` function body:

```typescript
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
      texelSize: [1 / scaledWidth, 1 / scaledHeight],
      strength: preset.unsharp.enabled ? preset.unsharp.strength : 0,
      scaleFactor
    },
    color: {
      gamma: preset.color.enabled ? preset.color.gamma : 1.0,
      saturation: preset.color.enabled ? preset.color.saturation : 1.0,
      greenBias: preset.color.enabled ? preset.color.greenBias : 0,
      brightness: preset.color.enabled ? preset.color.brightness * brightness : brightness,
      contrast: preset.color.enabled ? preset.color.contrast : 1.0
    },
    crt: {
      resolution: [scaledWidth, scaledHeight],
      scaleFactor,
      scanlineStrength: preset.crt.enabled ? preset.crt.scanlineStrength : 0,
      pixelMaskStrength: preset.crt.enabled ? preset.crt.pixelMaskStrength : 0,
      bloomStrength: preset.crt.enabled ? preset.crt.bloomStrength : 0,
      curvature: preset.crt.enabled ? preset.crt.curvature : 0,
      vignetteStrength: preset.crt.enabled ? preset.crt.vignetteStrength : 0
    }
  };
}
```

**Changes from current:**
- `unsharp`: Added `scaleFactor`, reordered fields
- `crt`: Renamed `outputSize` → `resolution`, uses `scaledWidth/scaledHeight` instead of `outputWidth/outputHeight`, added `scaleFactor`

---

### Task A.3: Update Uniform Builder Tests

**Files:**
- Modify: `packages/prismgb-gpu/tests/unit/application/uniform-builder.test.ts`

**Step 1: Update tests for new fields**

Add test cases for scaleFactor in unsharp and CRT uniforms:

```typescript
it('should include scaleFactor in unsharp uniforms', () => {
  const preset = PresetRegistry.get('true-color')!;

  const uniforms = buildUniforms({
    preset,
    nativeWidth: 160,
    nativeHeight: 144,
    outputWidth: 640,
    outputHeight: 576,
    brightness: 1.0
  });

  expect(uniforms.unsharp.scaleFactor).toBe(4);
});

it('should include scaleFactor and resolution in crt uniforms', () => {
  const preset = PresetRegistry.get('vintage')!;

  const uniforms = buildUniforms({
    preset,
    nativeWidth: 160,
    nativeHeight: 144,
    outputWidth: 640,
    outputHeight: 576,
    brightness: 1.0
  });

  expect(uniforms.crt.scaleFactor).toBe(4);
  expect(uniforms.crt.resolution).toEqual([640, 576]);
});
```

Import `'@/domain/presets/presets/vintage.preset'` at the top if not already imported.

**Step 2: Run tests**

Run: `cd packages/prismgb-gpu && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/prismgb-gpu/src/domain/shaders/ packages/prismgb-gpu/src/application/ packages/prismgb-gpu/tests/
git commit -m "fix(gpu): add scaleFactor to unsharp and CRT uniform types"
```

---

## Phase B: Optimization Utilities

Port the performance optimization utilities from the renderer worker (`src/renderer/infrastructure/rendering/workers/optimization.utils.ts`) to the GPU package as proper TypeScript.

### Task B.1: Create ShaderProgram Utility

**Files:**
- Create: `packages/prismgb-gpu/src/infrastructure/webgl2/shader-program.ts`

**Step 1: Create ShaderProgram class**

This is a TypeScript port of the `ShaderProgram` class from `src/renderer/infrastructure/rendering/workers/optimization.utils.ts`, providing cached uniform locations to eliminate per-frame `getUniformLocation` string lookups.

```typescript
export class ShaderProgram {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null;
  private readonly uniformLocations: Map<string, WebGLUniformLocation | null>;

  constructor(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, label: string) {
    this.gl = gl;
    this.uniformLocations = new Map();
    this.program = this.compile(vertexSource, fragmentSource, label);
    this.cacheUniformLocations();
  }

  private compile(vertexSource: string, fragmentSource: string, label: string): WebGLProgram {
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource, label);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource, label);

    const program = this.gl.createProgram();
    if (!program) {
      throw new Error(`[${label}] Failed to create program`);
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error(`[${label}] Shader link error: ${error}`);
    }

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);
    return program;
  }

  private compileShader(type: number, source: string, label: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error(`[${label}] Failed to create shader`);
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`[${label}] Shader compile error: ${error}`);
    }

    return shader;
  }

  private cacheUniformLocations(): void {
    if (!this.program) return;

    const numUniforms = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = this.gl.getActiveUniform(this.program, i);
      if (info) {
        const location = this.gl.getUniformLocation(this.program, info.name);
        this.uniformLocations.set(info.name, location);
      }
    }
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  setUniform1i(name: string, value: number): void {
    const loc = this.uniformLocations.get(name) ?? null;
    if (loc !== null) this.gl.uniform1i(loc, value);
  }

  setUniform1f(name: string, value: number): void {
    const loc = this.uniformLocations.get(name) ?? null;
    if (loc !== null) this.gl.uniform1f(loc, value);
  }

  setUniform2f(name: string, x: number, y: number): void {
    const loc = this.uniformLocations.get(name) ?? null;
    if (loc !== null) this.gl.uniform2f(loc, x, y);
  }

  destroy(): void {
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
    this.uniformLocations.clear();
  }
}
```

---

### Task B.2: Create BindGroupCache Utility

**Files:**
- Create: `packages/prismgb-gpu/src/infrastructure/webgpu/bind-group-cache.ts`

**Step 1: Create BindGroupCache class**

TypeScript port for caching WebGPU bind groups to avoid per-frame GPU driver calls.

```typescript
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
```

---

### Task B.3: Create UniformTracker Utility

**Files:**
- Create: `packages/prismgb-gpu/src/infrastructure/webgpu/uniform-tracker.ts`

**Step 1: Create UniformTracker class**

FNV-1a hash-based change detection to avoid redundant GPU buffer writes.

```typescript
export class UniformTracker {
  private readonly hashes = new Map<string, number>();

  private hashFloat32Array(data: Float32Array): number {
    let hash = 2166136261; // FNV offset basis
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = Math.imul(hash, 16777619); // FNV prime
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
```

**Step 2: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/
git commit -m "feat(gpu): add optimization utilities (ShaderProgram, BindGroupCache, UniformTracker)"
```

---

## Phase C: Complete WebGL2 Pipeline

Rewrite the WebGL2 pipeline with full 4-pass multi-pass rendering, porting the proven implementation from `src/renderer/infrastructure/rendering/workers/render.worker.ts` (WebGL2Renderer class).

### Task C.1: Rewrite WebGL2 Pipeline

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/webgl2/webgl2-pipeline.ts`

**Step 1: Replace entire file**

Reference: The worker's `WebGL2Renderer` class at `src/renderer/infrastructure/rendering/workers/render.worker.ts:693-929`.

```typescript
import { BasePipeline } from '../base-pipeline';
import { loadShaders } from './webgl2-shader-loader';
import { ShaderProgram } from './shader-program';

interface ShaderPrograms {
  pixelUpscale: ShaderProgram;
  unsharpMask: ShaderProgram;
  colorElevation: ShaderProgram;
  crtLcd: ShaderProgram;
}

export class WebGL2Pipeline extends BasePipeline {
  private gl: WebGL2RenderingContext | null = null;
  private programs: ShaderPrograms | null = null;
  private sourceTexture: WebGLTexture | null = null;
  private intermediateTextures: WebGLTexture[] = [];
  private framebuffers: WebGLFramebuffer[] = [];
  private vao: WebGLVertexArrayObject | null = null;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    const baseAttributes: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    };

    this.gl = (this.canvas as HTMLCanvasElement).getContext('webgl2', baseAttributes)
      ?? (this.canvas as HTMLCanvasElement).getContext('webgl2', {
        ...baseAttributes,
        powerPreference: 'high-performance'
      });

    if (!this.gl) {
      throw new Error('WebGL2 context not available');
    }

    this.createPrograms();
    this.createVAO();
    this.createResources();

    this._isInitialized = true;
    this._isActive = true;
  }

  private createPrograms(): void {
    const gl = this.gl!;
    const shaders = loadShaders();

    this.programs = {
      pixelUpscale: new ShaderProgram(gl, shaders.vertex, shaders.pixelUpscale, 'PixelUpscale'),
      unsharpMask: new ShaderProgram(gl, shaders.vertex, shaders.unsharpMask, 'UnsharpMask'),
      colorElevation: new ShaderProgram(gl, shaders.vertex, shaders.colorElevation, 'ColorElevation'),
      crtLcd: new ShaderProgram(gl, shaders.vertex, shaders.crtLcd, 'CrtLcd')
    };
  }

  private createVAO(): void {
    const gl = this.gl!;
    this.vao = gl.createVertexArray();
    // Empty VAO - vertex shader generates full-screen triangle from gl_VertexID
  }

  private createResources(): void {
    const gl = this.gl!;
    const { upscale } = this.uniforms;
    const [targetWidth, targetHeight] = upscale.outputSize;

    this.sourceTexture = this.createTexture(this.nativeWidth, this.nativeHeight, gl.NEAREST);

    this.intermediateTextures = [];
    this.framebuffers = [];

    for (let i = 0; i < 2; i++) {
      const texture = this.createTexture(targetWidth, targetHeight, gl.LINEAR)!;
      this.intermediateTextures.push(texture);

      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.framebuffers.push(framebuffer);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private createTexture(width: number, height: number, filter: number): WebGLTexture | null {
    const gl = this.gl!;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    return texture;
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.gl || !this.sourceTexture || !this.programs) return;

    const startTime = performance.now();
    const gl = this.gl;
    const { upscale, unsharp, color, crt } = this.uniforms;
    const [targetWidth, targetHeight] = upscale.outputSize;

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindVertexArray(this.vao);

    let currentTexture = 0;

    // Pass 1: Pixel Upscale (source → intermediate[0])
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[0]);
    gl.viewport(0, 0, targetWidth, targetHeight);
    this.programs.pixelUpscale.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    this.programs.pixelUpscale.setUniform1i('uSourceTex', 0);
    this.programs.pixelUpscale.setUniform2f('uSourceSize', this.nativeWidth, this.nativeHeight);
    this.programs.pixelUpscale.setUniform2f('uTargetSize', targetWidth, targetHeight);
    this.programs.pixelUpscale.setUniform1f('uScaleFactor', upscale.scaleFactor);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    currentTexture = 0;

    // Pass 2: Unsharp Mask (if enabled)
    if (this.preset.unsharp.enabled && unsharp.strength > 0) {
      const nextTexture = (currentTexture + 1) % 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[nextTexture]);
      this.programs.unsharpMask.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.unsharpMask.setUniform1i('uInputTex', 0);
      this.programs.unsharpMask.setUniform2f('uTexelSize', unsharp.texelSize[0], unsharp.texelSize[1]);
      this.programs.unsharpMask.setUniform1f('uStrength', unsharp.strength);
      this.programs.unsharpMask.setUniform1f('uScaleFactor', unsharp.scaleFactor);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTexture = nextTexture;
    }

    // Pass 3: Color Elevation (if enabled)
    if (this.preset.color.enabled) {
      const nextTexture = (currentTexture + 1) % 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[nextTexture]);
      this.programs.colorElevation.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.colorElevation.setUniform1i('uInputTex', 0);
      this.programs.colorElevation.setUniform1f('uGamma', color.gamma);
      this.programs.colorElevation.setUniform1f('uSaturation', color.saturation);
      this.programs.colorElevation.setUniform1f('uGreenBias', color.greenBias);
      this.programs.colorElevation.setUniform1f('uBrightness', color.brightness);
      this.programs.colorElevation.setUniform1f('uContrast', color.contrast);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTexture = nextTexture;
    }

    // Pass 4: CRT/LCD → Canvas
    const crtEnabled = crt.scanlineStrength > 0 || crt.pixelMaskStrength > 0 ||
      crt.bloomStrength > 0 || crt.curvature > 0 || crt.vignetteStrength > 0;

    if (crtEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.programs.crtLcd.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.crtLcd.setUniform1i('uInputTex', 0);
      this.programs.crtLcd.setUniform2f('uResolution', crt.resolution[0], crt.resolution[1]);
      this.programs.crtLcd.setUniform1f('uScaleFactor', crt.scaleFactor);
      this.programs.crtLcd.setUniform1f('uScanlineStrength', crt.scanlineStrength);
      this.programs.crtLcd.setUniform1f('uPixelMaskStrength', crt.pixelMaskStrength);
      this.programs.crtLcd.setUniform1f('uBloomStrength', crt.bloomStrength);
      this.programs.crtLcd.setUniform1f('uCurvature', crt.curvature);
      this.programs.crtLcd.setUniform1f('uVignetteStrength', crt.vignetteStrength);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffers[currentTexture]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(
        0, 0, targetWidth, targetHeight,
        0, 0, this.canvas.width, this.canvas.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }

    gl.bindVertexArray(null);
    this.updateStats(performance.now() - startTime);
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  protected onUniformsChanged(): void {
    // WebGL2 uniforms are set per-frame in renderFrame() via setUniform calls.
    // No pre-upload needed.
  }

  protected onResize(): void {
    this.releaseResources();
    this.createResources();
  }

  releaseResources(): void {
    if (!this.gl) return;

    const gl = this.gl;
    if (this.sourceTexture) {
      gl.deleteTexture(this.sourceTexture);
      this.sourceTexture = null;
    }
    this.intermediateTextures.forEach(t => gl.deleteTexture(t));
    this.intermediateTextures = [];
    this.framebuffers.forEach(f => gl.deleteFramebuffer(f));
    this.framebuffers = [];
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();

    if (this.programs) {
      this.programs.pixelUpscale.destroy();
      this.programs.unsharpMask.destroy();
      this.programs.colorElevation.destroy();
      this.programs.crtLcd.destroy();
      this.programs = null;
    }

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

**Step 2: Update WebGL2 index barrel**

Modify `packages/prismgb-gpu/src/infrastructure/webgl2/index.ts`:

```typescript
export { WebGL2Pipeline } from './webgl2-pipeline';
export { ShaderProgram } from './shader-program';
export { loadShaders, type WebGL2Shaders } from './webgl2-shader-loader';
```

**Step 3: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/webgl2/
git commit -m "feat(gpu): complete WebGL2 4-pass rendering pipeline"
```

---

## Phase D: Complete WebGPU Pipeline

Rewrite the WebGPU pipeline with full 4-pass multi-pass rendering, porting the proven implementation from `src/renderer/infrastructure/rendering/workers/render.worker.ts` (WebGPURenderer class).

### Task D.1: Rewrite WebGPU Pipeline

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/webgpu/webgpu-pipeline.ts`

**Step 1: Replace entire file**

Reference: The worker's `WebGPURenderer` class at `src/renderer/infrastructure/rendering/workers/render.worker.ts:78-687`.

```typescript
import { BasePipeline } from '../base-pipeline';
import { loadShaders } from './webgpu-shader-loader';
import { BindGroupCache } from './bind-group-cache';
import { UniformTracker } from './uniform-tracker';

interface RenderPipelines {
  pixelUpscale: GPURenderPipeline;
  unsharpMask: GPURenderPipeline;
  colorElevation: GPURenderPipeline;
  crtLcd: GPURenderPipeline;
}

interface UniformBuffers {
  upscale: GPUBuffer;
  unsharp: GPUBuffer;
  color: GPUBuffer;
  crt: GPUBuffer;
}

interface ShaderModules {
  pixelUpscale: GPUShaderModule;
  unsharpMask: GPUShaderModule;
  colorElevation: GPUShaderModule;
  crtLcd: GPUShaderModule;
}

export class WebGPUPipeline extends BasePipeline {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat | null = null;

  private shaderModules: ShaderModules | null = null;
  private renderPipelines: RenderPipelines | null = null;
  private crtLcdBindGroupLayout: GPUBindGroupLayout | null = null;

  private sourceTexture: GPUTexture | null = null;
  private intermediateTextures: GPUTexture[] = [];
  private intermediateTextureViews: GPUTextureView[] = [];

  private nearestSampler: GPUSampler | null = null;
  private linearSampler: GPUSampler | null = null;

  private uniformBuffers: UniformBuffers | null = null;

  private bindGroupCache = new BindGroupCache();
  private uniformTracker = new UniformTracker();

  private hasError = false;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' })
      ?? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });

    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    this.device = await adapter.requestDevice();

    this.device.lost.then((info) => {
      this.hasError = true;
      this._isActive = false;
    });

    this.context = (this.canvas as HTMLCanvasElement).getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      throw new Error('WebGPU context not available');
    }

    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque'
    });

    await this.createShaderModules();
    this.createSamplers();
    this.createResources();
    await this.createPipelines();

    this._isInitialized = true;
    this._isActive = true;
  }

  private async createShaderModules(): Promise<void> {
    const device = this.device!;
    const shaders = loadShaders();

    const createAndValidate = async (label: string, code: string): Promise<GPUShaderModule> => {
      const module = device.createShaderModule({ label, code });
      const compilationInfo = await module.getCompilationInfo();
      const errors = compilationInfo.messages.filter(m => m.type === 'error');

      if (errors.length > 0) {
        const errorMsg = errors.map(e => `${e.message} at line ${e.lineNum}`).join('; ');
        throw new Error(`Shader compilation error in ${label}: ${errorMsg}`);
      }

      return module;
    };

    this.shaderModules = {
      pixelUpscale: await createAndValidate('Pixel Upscale Shader', shaders.pixelUpscale),
      unsharpMask: await createAndValidate('Unsharp Mask Shader', shaders.unsharpMask),
      colorElevation: await createAndValidate('Color Elevation Shader', shaders.colorElevation),
      crtLcd: await createAndValidate('CRT/LCD Shader', shaders.crtLcd)
    };
  }

  private createSamplers(): void {
    const device = this.device!;

    this.nearestSampler = device.createSampler({
      label: 'Nearest Sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    this.linearSampler = device.createSampler({
      label: 'Linear Sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
  }

  private createResources(): void {
    const device = this.device!;
    const { upscale } = this.uniforms;
    const [targetWidth, targetHeight] = upscale.outputSize;

    this.sourceTexture = device.createTexture({
      label: 'Source Texture',
      size: [this.nativeWidth, this.nativeHeight],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.intermediateTextures = [];
    this.intermediateTextureViews = [];
    for (let i = 0; i < 2; i++) {
      const texture = device.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [targetWidth, targetHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.intermediateTextures.push(texture);
      this.intermediateTextureViews.push(texture.createView());
    }

    this.uniformBuffers = {
      upscale: device.createBuffer({
        label: 'Upscale Uniforms',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      unsharp: device.createBuffer({
        label: 'Unsharp Uniforms',
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      color: device.createBuffer({
        label: 'Color Uniforms',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      crt: device.createBuffer({
        label: 'CRT Uniforms',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      })
    };
  }

  private async createPipelines(): Promise<void> {
    const device = this.device!;
    const modules = this.shaderModules!;

    const pipelineDescriptor = (
      label: string,
      module: GPUShaderModule,
      format: GPUTextureFormat
    ): GPURenderPipelineDescriptor => ({
      label,
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-strip' }
    });

    this.renderPipelines = {
      pixelUpscale: await device.createRenderPipelineAsync(
        pipelineDescriptor('Pixel Upscale Pipeline', modules.pixelUpscale, 'rgba8unorm')
      ),
      unsharpMask: await device.createRenderPipelineAsync(
        pipelineDescriptor('Unsharp Mask Pipeline', modules.unsharpMask, 'rgba8unorm')
      ),
      colorElevation: await device.createRenderPipelineAsync(
        pipelineDescriptor('Color Elevation Pipeline', modules.colorElevation, 'rgba8unorm')
      ),
      crtLcd: await device.createRenderPipelineAsync(
        pipelineDescriptor('CRT/LCD Pipeline', modules.crtLcd, this.canvasFormat!)
      )
    };

    this.crtLcdBindGroupLayout = this.renderPipelines.crtLcd.getBindGroupLayout(0);
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.device || !this.context || this.hasError) return;
    if (!this.renderPipelines || !this.uniformBuffers || !this.sourceTexture) return;

    const startTime = performance.now();

    try {
      this.device.queue.copyExternalImageToTexture(
        { source: source as ImageBitmap, flipY: true },
        { texture: this.sourceTexture },
        [this.nativeWidth, this.nativeHeight]
      );

      this.uploadUniforms();

      const commandEncoder = this.device.createCommandEncoder();
      let currentTexture = 0;

      // Pass 1: Pixel Upscale (source → intermediate[0])
      this.renderPass(
        commandEncoder,
        this.renderPipelines.pixelUpscale,
        this.sourceTexture,
        this.intermediateTextures[0],
        this.uniformBuffers.upscale,
        this.nearestSampler!
      );
      currentTexture = 0;

      // Pass 2: Unsharp Mask (if enabled)
      if (this.preset.unsharp.enabled && this.uniforms.unsharp.strength > 0) {
        const nextTexture = (currentTexture + 1) % 2;
        this.renderPass(
          commandEncoder,
          this.renderPipelines.unsharpMask,
          this.intermediateTextures[currentTexture],
          this.intermediateTextures[nextTexture],
          this.uniformBuffers.unsharp,
          this.linearSampler!
        );
        currentTexture = nextTexture;
      }

      // Pass 3: Color Elevation (if enabled)
      if (this.preset.color.enabled) {
        const nextTexture = (currentTexture + 1) % 2;
        this.renderPass(
          commandEncoder,
          this.renderPipelines.colorElevation,
          this.intermediateTextures[currentTexture],
          this.intermediateTextures[nextTexture],
          this.uniformBuffers.color,
          this.linearSampler!
        );
        currentTexture = nextTexture;
      }

      // Pass 4: CRT/LCD → Canvas
      const canvasTexture = this.context.getCurrentTexture();
      const { crt } = this.uniforms;
      const crtEnabled = crt.scanlineStrength > 0 || crt.pixelMaskStrength > 0 ||
        crt.bloomStrength > 0 || crt.curvature > 0 || crt.vignetteStrength > 0;

      if (crtEnabled) {
        this.renderPassToCanvas(
          commandEncoder,
          this.renderPipelines.crtLcd,
          this.intermediateTextures[currentTexture],
          canvasTexture,
          this.uniformBuffers.crt,
          this.linearSampler!
        );
      } else {
        this.copyToCanvas(
          commandEncoder,
          this.intermediateTextures[currentTexture],
          canvasTexture
        );
      }

      this.device.queue.submit([commandEncoder.finish()]);
      this.updateStats(performance.now() - startTime);
    } catch {
      this.hasError = true;
      this._isActive = false;
    }
  }

  private renderPass(
    commandEncoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    const bindGroup = this.bindGroupCache.getOrCreate(
      this.device!,
      pipeline,
      uniformBuffer,
      inputTexture,
      sampler
    );

    const outputIndex = this.intermediateTextures.indexOf(outputTexture);
    const outputView = outputIndex >= 0
      ? this.intermediateTextureViews[outputIndex]
      : outputTexture.createView();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: outputView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  private renderPassToCanvas(
    commandEncoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    const inputIndex = this.intermediateTextures.indexOf(inputTexture);
    const inputView = inputIndex >= 0
      ? this.intermediateTextureViews[inputIndex]
      : inputTexture.createView();

    const bindGroup = this.device!.createBindGroup({
      layout: this.crtLcdBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: sampler }
      ]
    });

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  private copyToCanvas(
    commandEncoder: GPUCommandEncoder,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture
  ): void {
    const inputIndex = this.intermediateTextures.indexOf(inputTexture);
    const inputView = inputIndex >= 0
      ? this.intermediateTextureViews[inputIndex]
      : inputTexture.createView();

    const bindGroup = this.device!.createBindGroup({
      layout: this.crtLcdBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffers!.crt } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: this.linearSampler! }
      ]
    });

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });

    passEncoder.setPipeline(this.renderPipelines!.crtLcd);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  private uploadUniforms(): void {
    const device = this.device!;
    const buffers = this.uniformBuffers!;
    const { upscale, unsharp, color, crt } = this.uniforms;

    const upscaleData = new Float32Array([
      upscale.inputSize[0], upscale.inputSize[1],
      upscale.outputSize[0], upscale.outputSize[1],
      upscale.scaleFactor,
      0 // padding
    ]);
    if (this.uniformTracker.hasChanged('upscale', upscaleData)) {
      device.queue.writeBuffer(buffers.upscale, 0, upscaleData);
    }

    const unsharpData = new Float32Array([
      unsharp.texelSize[0], unsharp.texelSize[1],
      unsharp.strength,
      unsharp.scaleFactor
    ]);
    if (this.uniformTracker.hasChanged('unsharp', unsharpData)) {
      device.queue.writeBuffer(buffers.unsharp, 0, unsharpData);
    }

    const colorData = new Float32Array([
      color.gamma,
      color.saturation,
      color.greenBias,
      color.brightness,
      color.contrast,
      0, 0, 0 // padding
    ]);
    if (this.uniformTracker.hasChanged('color', colorData)) {
      device.queue.writeBuffer(buffers.color, 0, colorData);
    }

    const crtData = new Float32Array([
      crt.resolution[0], crt.resolution[1],
      crt.scaleFactor,
      crt.scanlineStrength,
      crt.pixelMaskStrength,
      crt.bloomStrength,
      crt.curvature,
      crt.vignetteStrength
    ]);
    if (this.uniformTracker.hasChanged('crt', crtData)) {
      device.queue.writeBuffer(buffers.crt, 0, crtData);
    }
  }

  protected onUniformsChanged(): void {
    this.uniformTracker.invalidateAll();
  }

  protected onResize(): void {
    if (!this.device || !this.context) return;

    this.intermediateTextures.forEach(tex => tex.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    const { upscale } = this.uniforms;
    const [targetWidth, targetHeight] = upscale.outputSize;

    for (let i = 0; i < 2; i++) {
      const texture = this.device.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [targetWidth, targetHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.intermediateTextures.push(texture);
      this.intermediateTextureViews.push(texture.createView());
    }

    this.context.configure({
      device: this.device,
      format: this.canvasFormat!,
      alphaMode: 'opaque'
    });

    this.bindGroupCache.invalidate();
    this.uniformTracker.invalidateAll();
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  releaseResources(): void {
    this.sourceTexture?.destroy();
    this.sourceTexture = null;
    this.intermediateTextures.forEach(tex => tex.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    if (this.uniformBuffers) {
      Object.values(this.uniformBuffers).forEach(buf => buf.destroy());
      this.uniformBuffers = null;
    }

    this.bindGroupCache.invalidate();
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.renderPipelines = null;
    this.shaderModules = null;
    this.crtLcdBindGroupLayout = null;
    this.nearestSampler = null;
    this.linearSampler = null;
    this._isInitialized = false;
  }
}
```

**Step 2: Update WebGPU index barrel**

Modify `packages/prismgb-gpu/src/infrastructure/webgpu/index.ts`:

```typescript
export { WebGPUPipeline } from './webgpu-pipeline';
export { BindGroupCache } from './bind-group-cache';
export { UniformTracker } from './uniform-tracker';
export { loadShaders, type WebGPUShaders } from './webgpu-shader-loader';
```

**Step 3: Commit**

```bash
git add packages/prismgb-gpu/src/infrastructure/webgpu/
git commit -m "feat(gpu): complete WebGPU 4-pass rendering pipeline"
```

---

## Phase E: Update Exports & Build Verification

### Task E.1: Update Infrastructure Index

**Files:**
- Modify: `packages/prismgb-gpu/src/infrastructure/index.ts`

**Step 1: Update barrel export**

```typescript
export { BasePipeline, type BasePipelineConfig } from './base-pipeline';
export { Canvas2DPipeline } from './canvas2d';
export { WebGL2Pipeline, ShaderProgram } from './webgl2';
export { WebGPUPipeline, BindGroupCache, UniformTracker } from './webgpu';
```

---

### Task E.2: TypeScript Verification

**Step 1: Run typecheck**

Run: `cd packages/prismgb-gpu && npx tsc --noEmit`
Expected: Clean compilation, no errors

**Step 2: Fix any type errors**

If there are type errors related to WebGPU types, verify `@webgpu/types` is in devDependencies and `tsconfig.json` includes `"types": ["@webgpu/types"]`.

---

### Task E.3: Run Tests

**Step 1: Run all package tests**

Run: `cd packages/prismgb-gpu && npx vitest run`
Expected: All tests pass (domain + application layer tests)

**Note:** Pipeline implementation tests are excluded from the test suite since they require GPU contexts (WebGPU/WebGL2) not available in happy-dom. The pipeline implementations are verified by the app's existing integration tests and manual testing.

---

### Task E.4: Build Package

**Step 1: Build**

Run: `cd packages/prismgb-gpu && npx vite build`
Expected: Clean build output to `dist/`

**Step 2: Verify type declarations generate**

Run: `cd packages/prismgb-gpu && npx tsc --emitDeclarationOnly`
Expected: `.d.ts` files in `dist/`

---

### Task E.5: Verify App Still Passes

**Step 1: Run app tests**

Run: `cd /Users/josstei/Development/prismgb-workspace/prismgb-app && npm run test:run`
Expected: All 2836+ tests pass (no regressions)

**Step 2: Run linter**

Run: `cd /Users/josstei/Development/prismgb-workspace/prismgb-app && npm run lint`
Expected: Clean

---

### Task E.6: Final Commit

```bash
git add packages/prismgb-gpu/
git commit -m "feat(gpu): complete @prismgb/gpu package with full pipeline implementations"
```

---

## Appendix: Key Design Decisions

### Why no worker in the package?

The `IPipeline` interface is designed for synchronous on-context rendering. The app decides whether to run the pipeline in a worker (via `OffscreenCanvas` transfer) or on the main thread. This keeps the package simple and the worker orchestration (frame queuing, stats, capture) as an app concern.

### Why TexImageSource instead of ImageBitmap?

`TexImageSource` is the broader type that works for both WebGL2 (`texSubImage2D`) and allows direct `HTMLVideoElement` rendering without creating an `ImageBitmap` first. For WebGPU, `copyExternalImageToTexture` accepts a similar set of source types. The pipeline implementations cast as needed internally.

### Uniform buffer layouts (WebGPU)

Buffer sizes are aligned to 16-byte boundaries per WGSL struct layout rules:
- **Upscale**: 32 bytes (vec2f + vec2f + f32 + padding = 24 → 32)
- **Unsharp**: 16 bytes (vec2f + f32 + f32 = 16)
- **Color**: 32 bytes (5×f32 + 3×padding = 32)
- **CRT**: 32 bytes (vec2f + 6×f32 = 32)

### Ping-pong texture strategy

Both pipelines use 2 intermediate textures with alternating read/write roles (ping-pong). Passes that are disabled are skipped entirely, and the `currentTexture` index tracks which intermediate texture holds the latest result. The final pass renders to either the canvas (if CRT is enabled) or blits directly (if CRT is disabled).

---

## File Summary

### New Files

| Path | Purpose |
|------|---------|
| `packages/prismgb-gpu/src/infrastructure/webgl2/shader-program.ts` | WebGL2 cached uniform location wrapper |
| `packages/prismgb-gpu/src/infrastructure/webgpu/bind-group-cache.ts` | WebGPU bind group caching |
| `packages/prismgb-gpu/src/infrastructure/webgpu/uniform-tracker.ts` | FNV-1a hash change detection for uniform buffers |

### Modified Files

| Path | Change |
|------|--------|
| `packages/prismgb-gpu/src/domain/shaders/shader-uniforms.types.ts` | Add `scaleFactor` to unsharp/CRT, rename `outputSize` → `resolution` |
| `packages/prismgb-gpu/src/application/uniform-builder.ts` | Update `buildUniforms()` for new fields |
| `packages/prismgb-gpu/tests/unit/application/uniform-builder.test.ts` | Add tests for new uniform fields |
| `packages/prismgb-gpu/src/infrastructure/webgl2/webgl2-pipeline.ts` | Full 4-pass multi-pass rewrite |
| `packages/prismgb-gpu/src/infrastructure/webgl2/index.ts` | Add ShaderProgram export |
| `packages/prismgb-gpu/src/infrastructure/webgpu/webgpu-pipeline.ts` | Full 4-pass multi-pass rewrite |
| `packages/prismgb-gpu/src/infrastructure/webgpu/index.ts` | Add BindGroupCache, UniformTracker exports |
| `packages/prismgb-gpu/src/infrastructure/index.ts` | Update barrel exports |
