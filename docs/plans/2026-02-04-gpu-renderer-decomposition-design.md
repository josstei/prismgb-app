# GPU Renderer Service Decomposition

**Date:** 2026-02-04
**Status:** Approved
**Goal:** Decompose the monolithic GPU Renderer Service to enable performance optimization, new shader presets, and future RetroArch shader support.

## Problem Statement

The `StreamingGpuRendererService` (839 lines) handles multiple concerns:
- Worker lifecycle management
- Frame buffering and submission throttling
- Uniform/preset caching
- Canvas transfer and recreation
- Performance stats aggregation

This makes it difficult to:
1. Modify frame buffering for performance optimization
2. Add new shader presets cleanly
3. Extend for future RetroArch shader support

## Design Goals

1. **Immediate:** Clean separation for performance work and new preset development
2. **Near-term:** Each component testable in isolation
3. **6-month:** RetroArch Slang shader support without architectural changes

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  GpuRendererService                     │
│                    (orchestrator)                       │
└──────────────┬────────────────────┬─────────────────────┘
               │                    │
    ┌──────────▼──────────┐  ┌──────▼──────────┐
    │  GpuWorkerManager   │  │  GpuFrameBuffer │
    │  (worker lifecycle) │  │ (triple buffer) │
    └─────────────────────┘  └─────────────────┘
               │
    ┌──────────▼──────────────────────────────┐
    │           IRenderPipeline               │
    ├─────────────────┬───────────────────────┤
    │ NativeRender    │ RetroArchRender       │
    │ Pipeline        │ Pipeline (future)     │
    └─────────────────┴───────────────────────┘
```

### Layer 1: Infrastructure

Concerns orthogonal to shader logic.

#### GpuWorkerManager

Responsibilities:
- Worker creation and termination
- Message routing (send commands, receive responses)
- Capability detection (WebGPU vs WebGL2 fallback)
- Error handling and recovery
- Canvas transfer to worker

```javascript
class GpuWorkerManager {
  constructor({ loggerFactory, eventBus }) { }

  async initialize(canvas)        // Transfer canvas, detect capabilities
  async sendCommand(type, data)   // Type-safe message sending
  onMessage(handler)              // Register response handlers
  getCapabilities()               // { api: 'webgpu'|'webgl2', features: [] }
  async terminate()               // Clean shutdown
}
```

#### GpuFrameBuffer

Responsibilities:
- Triple-buffer queue management
- Frame submission throttling
- Buffer overflow prevention
- Frame timing metrics

```javascript
class GpuFrameBuffer {
  constructor({ bufferSize = 3, loggerFactory }) { }

  enqueue(frame)          // Add frame to queue, returns drop status
  dequeue()               // Get next frame for rendering
  isFull()                // Check if accepting frames
  getMetrics()            // { queued, dropped, avgLatency }
  flush()                 // Clear buffer (for seek/reset)
}
```

### Layer 2: Pipeline Abstraction

Extension point for different shader systems.

#### IRenderPipeline Interface

```javascript
class IRenderPipeline {
  // Lifecycle
  async initialize(context)       // GPU context, capabilities
  async dispose()                 // Release resources

  // Configuration
  async loadPreset(preset)        // Load shader preset (built-in or file)
  setParameter(name, value)       // Runtime parameter adjustment
  getParameters()                 // { name, type, min, max, default, current }[]

  // Rendering
  render(frame, uniforms)         // Execute pipeline, return output texture

  // Metadata
  getPassCount()                  // Number of render passes
  getInfo()                       // { name, author, description, passes }
}
```

Design decisions:
- **Preset-based loading:** Pipelines load presets, not individual shaders
- **Parameter system:** Exposes tunable parameters for UI binding
- **Multi-pass aware:** `getPassCount()` enables pass chaining
- **Uniform separation:** Per-frame uniforms via `render()`, preset params via `setParameter()`

#### NativeRenderPipeline

Wraps current built-in shaders (Sharp, Soft, CRT variants).

```javascript
class NativeRenderPipeline extends IRenderPipeline {
  async initialize(context) {
    // Create shader modules from existing WGSL/GLSL
    // Set up single-pass render pipeline
  }

  async loadPreset(preset) {
    // preset = { id: 'crt-aperture', uniforms: {...} }
    // Apply uniform defaults from preset config
  }

  setParameter(name, value) {
    // Update uniform buffer
  }

  render(frame, uniforms) {
    // Execute current 4-pass pipeline
    // Return final texture
  }
}
```

Migration from current code:

| Current Location | New Location |
|-----------------|--------------|
| `createShaderModule()` | `NativeRenderPipeline.initialize()` |
| `updateUniforms()` | `NativeRenderPipeline.setParameter()` |
| `renderFrame()` | `NativeRenderPipeline.render()` |
| Preset configs | Unchanged, consumed by `loadPreset()` |

### Layer 3: Shader Loading (Future)

For user-imported RetroArch shaders.

#### Main Process Service

```javascript
class ShaderLoaderService {
  async loadSlangPreset(filePath) {
    // Read .slangp file
    // Resolve relative paths to .slang files
    // Read all shader sources
    // Read LUT textures as base64
    // Return complete preset bundle
  }

  async validatePreset(filePath) {
    // Check file exists, readable, valid structure
    // Return { valid, errors }
  }

  async listUserPresets(directory) {
    // Scan directory for .slangp files
    // Return metadata (name, path, pass count)
  }
}
```

#### IPC Channels

```json
{
  "shader": {
    "loadPreset": "shader:load-preset",
    "validatePreset": "shader:validate-preset",
    "listUserPresets": "shader:list-user-presets"
  }
}
```

#### Preload API

```javascript
window.shaderAPI.loadPreset(filePath)
window.shaderAPI.validatePreset(filePath)
window.shaderAPI.listUserPresets(dir)
```

### RetroArch Pipeline Architecture (Future)

```
src/renderer/features/streaming/rendering/pipelines/retroarch/
├── retroarch-render-pipeline.js      # IRenderPipeline implementation
├── parsers/
│   ├── slang-parser.js               # Parse .slang shader files
│   └── slangp-parser.js              # Parse .slangp preset chains
├── transpiler/
│   ├── slang-transpiler.js           # Slang → WGSL/GLSL
│   ├── slang-ast.js                  # Abstract syntax tree
│   └── glsl-emitter.js               # GLSL output for WebGL2 fallback
├── resources/
│   ├── lut-manager.js                # Lookup table texture loading
│   ├── history-buffer.js             # Previous frame storage
│   └── feedback-buffer.js            # Pass output → input looping
└── validation/
    └── shader-validator.js           # Compatibility checking
```

## Refactored GpuRendererService

Thin orchestrator (~200 lines) with pure delegation:

```javascript
class StreamingGpuRendererService extends BaseService {
  constructor({
    loggerFactory,
    eventBus,
    gpuWorkerManager,
    gpuFrameBuffer,
    renderPipelineFactory
  }) { }

  async initialize(canvas) {
    await this.workerManager.initialize(canvas);
    const capabilities = this.workerManager.getCapabilities();

    this.pipeline = this.pipelineFactory.create(capabilities);
    await this.pipeline.initialize(capabilities);
  }

  async loadPreset(preset) {
    await this.pipeline.loadPreset(preset);
  }

  submitFrame(frame) {
    if (this.frameBuffer.isFull()) return;
    this.frameBuffer.enqueue(frame);
    this.processNextFrame();
  }

  async processNextFrame() {
    const frame = this.frameBuffer.dequeue();
    const uniforms = this.buildUniforms();
    await this.workerManager.sendCommand('render', { frame, uniforms });
  }

  getStats() {
    return {
      buffer: this.frameBuffer.getMetrics(),
      pipeline: this.pipeline.getInfo()
    };
  }
}
```

## Directory Structure

```
src/renderer/features/streaming/rendering/
├── gpu/
│   ├── streaming-gpu-renderer.service.js    # Orchestrator (~200 lines)
│   │
│   ├── managers/
│   │   ├── gpu-worker-manager.class.js      # Worker lifecycle (~250 lines)
│   │   └── gpu-frame-buffer.class.js        # Triple buffering (~150 lines)
│   │
│   └── pipelines/
│       ├── interfaces/
│       │   └── render-pipeline.interface.js # IRenderPipeline contract
│       │
│       ├── render-pipeline.factory.js       # Creates appropriate pipeline
│       │
│       ├── native/
│       │   └── native-render-pipeline.js    # Built-in shaders (~300 lines)
│       │
│       └── retroarch/                       # Future implementation
│           ├── retroarch-render-pipeline.js
│           ├── parsers/
│           ├── transpiler/
│           ├── resources/
│           └── validation/
│
├── workers/
│   └── streaming-render.worker.js           # Slimmed down (~400 lines)
│
└── shaders/                                 # Existing, unchanged
    ├── webgpu/
    └── webgl2/

src/main/features/shaders/                   # New main process feature
├── shader-loader.service.js
└── shader-loader.ipc-handler.js
```

## Migration Plan

### Phase 1: Extract Infrastructure

Unblocks performance optimization work.

1. Extract `GpuFrameBuffer` class from current service
2. Extract `GpuWorkerManager` class from current service
3. Update `StreamingGpuRendererService` to use injected managers
4. Register new classes in DI container
5. **Validation:** All existing tests pass, streaming works

### Phase 2: Introduce Pipeline Abstraction

Unblocks new shader preset work.

1. Create `IRenderPipeline` interface
2. Create `NativeRenderPipeline` wrapping existing shader logic
3. Create `RenderPipelineFactory`
4. Update service to use pipeline abstraction
5. Slim down worker (move shader orchestration to pipeline)
6. **Validation:** All presets work, no visual regression

### Phase 3: Shader Loading Infrastructure

Prepares for RetroArch support.

1. Create `ShaderLoaderService` in main process
2. Add IPC channels and preload API
3. Stub `RetroArchRenderPipeline` (interface only)
4. **Validation:** Can load file metadata, pipeline interface ready

## Testing Strategy

### Unit Tests (New)

```
tests/unit/features/streaming/rendering/
├── managers/
│   ├── gpu-worker-manager.class.test.js
│   │   - Worker creation/termination
│   │   - Message routing
│   │   - Capability detection
│   │   - Error recovery
│   │
│   └── gpu-frame-buffer.class.test.js
│       - Queue operations (enqueue, dequeue, flush)
│       - Overflow behavior
│       - Metrics accuracy
│
└── pipelines/
    ├── render-pipeline.factory.test.js
    │   - Returns NativeRenderPipeline for valid context
    │   - Falls back appropriately
    │
    └── native/
        └── native-render-pipeline.test.js
            - Preset loading
            - Parameter get/set
            - Render call delegation
```

### Integration Tests

```
tests/integration/features/streaming/
└── gpu-renderer-integration.test.js
    - Full pipeline: frame in → render → frame out
    - Preset switching mid-stream
    - Worker recovery after error
```

### Existing Tests

Current tests for `StreamingGpuRendererService` become integration tests verifying orchestration still works after decomposition.

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Main service lines | 839 | ~200 |
| Largest file | 839 | ~300 |
| Testable units | 1 | 6 |
| Extension points | 0 | 1 (IRenderPipeline) |
